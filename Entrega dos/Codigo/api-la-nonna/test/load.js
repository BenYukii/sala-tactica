const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const net = require('node:net');

const projectRoot = path.join(__dirname, '..');
const sampleCount = Number(process.env.LOAD_SAMPLES || 100);
const concurrency = Number(process.env.LOAD_CONCURRENCY || 10);
const dashboardQuery = '{ dashboard(limit: 5) { menu { id } orders { id status total } } }';

if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 10000) {
  throw new Error('LOAD_SAMPLES debe ser un entero entre 1 y 10000');
}
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 100) {
  throw new Error('LOAD_CONCURRENCY debe ser un entero entre 1 y 100');
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const { port } = listener.address();
      listener.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForHealth(api, server, output) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API terminó antes de iniciar.\n${output()}`);
    try {
      const response = await fetch(`${api}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API no inició dentro del plazo.\n${output()}`);
}

async function readMetrics(api, token) {
  const response = await fetch(`${api}/api/metrics`, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!response.ok) throw new Error(`No se pudieron leer métricas: HTTP ${response.status}`);
  return response.json();
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

async function main() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'la-nonna-load-'));
  const port = await availablePort();
  const api = `http://127.0.0.1:${port}`;
  let serverOutput = '';
  const server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_PATH: path.join(temporaryDirectory, 'load.sqlite')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });

  try {
    await waitForHealth(api, server, () => serverOutput);
    const [userResponse, adminResponse] = await Promise.all([
      fetch(`${api}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ana', password: 'anita123' })
      }),
      fetch(`${api}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ernesto', password: 'admin123' })
      })
    ]);
    if (!userResponse.ok || !adminResponse.ok) throw new Error('No fue posible iniciar las cuentas de prueba');
    const [user, admin] = await Promise.all([userResponse.json(), adminResponse.json()]);
    const before = await readMetrics(api, admin.access_token);
    const workloads = [
      () => fetch(`${api}/health`),
      () => fetch(`${api}/api/productos?limit=20`),
      () => fetch(`${api}/api/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + user.access_token
        },
        body: JSON.stringify({ query: dashboardQuery })
      })
    ];
    const latencies = [];
    const statuses = {};
    let nextRequest = 0;
    const startedAt = performance.now();
    await Promise.all(Array.from({ length: Math.min(concurrency, sampleCount) }, async () => {
      while (true) {
        const index = nextRequest;
        nextRequest += 1;
        if (index >= sampleCount) return;
        const requestStartedAt = performance.now();
        try {
          const response = await workloads[index % workloads.length]();
          latencies.push(performance.now() - requestStartedAt);
          statuses[response.status] = (statuses[response.status] || 0) + 1;
          await response.arrayBuffer();
        } catch {
          latencies.push(performance.now() - requestStartedAt);
          statuses.network_error = (statuses.network_error || 0) + 1;
        }
      }
    }));
    const elapsedMs = performance.now() - startedAt;
    const after = await readMetrics(api, admin.access_token);
    const failedRequests = Object.entries(statuses)
      .filter(([status]) => status === 'network_error' || Number(status) >= 400)
      .reduce((sum, [, count]) => sum + count, 0);

    console.log(JSON.stringify({
      environment: { node: process.version, samples: sampleCount, concurrency },
      workload: { endpoints: ['GET /health', 'GET /api/productos?limit=20', 'POST /api/graphql dashboard'] },
      results: {
        requests: latencies.length,
        errors: failedRequests,
        status_counts: statuses,
        elapsed_ms: Number(elapsedMs.toFixed(2)),
        throughput_requests_per_second: Number((latencies.length / (elapsedMs / 1000)).toFixed(2)),
        latency_ms: {
          p50: Number(percentile(latencies, 0.5).toFixed(2)),
          p95: Number(percentile(latencies, 0.95).toFixed(2)),
          max: Number(Math.max(...latencies).toFixed(2))
        },
        api_process: {
          rss_before_bytes: before.memory_bytes.rss,
          rss_after_bytes: after.memory_bytes.rss,
          heap_used_after_bytes: after.memory_bytes.heap_used,
          cpu_user_delta_microseconds: Math.max(0, after.cpu_microseconds.user - before.cpu_microseconds.user),
          cpu_system_delta_microseconds: Math.max(0, after.cpu_microseconds.system - before.cpu_microseconds.system)
        }
      }
    }, null, 2));
    if (failedRequests) process.exitCode = 1;
  } finally {
    if (server.exitCode === null) {
      server.kill();
      await Promise.race([
        once(server, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ]);
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
