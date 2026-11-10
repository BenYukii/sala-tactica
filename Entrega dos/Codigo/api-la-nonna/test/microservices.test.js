const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { once } = require('node:events');
const { after, before, test } = require('node:test');

const projectRoot = path.join(__dirname, '..');
const names = ['gateway', 'auth', 'clients', 'inventory', 'orders', 'payments', 'reservations', 'graphql'];
const incomingByService = {
  auth: ['gateway', 'clients'],
  clients: ['gateway'],
  inventory: ['gateway', 'orders', 'graphql'],
  orders: ['gateway', 'payments', 'graphql'],
  payments: ['gateway', 'orders'],
  reservations: ['gateway'],
  graphql: ['gateway']
};
const outgoingByService = {
  gateway: ['auth', 'clients', 'inventory', 'orders', 'payments', 'reservations', 'graphql'],
  clients: ['auth'],
  orders: ['inventory', 'payments'],
  payments: ['orders'],
  graphql: ['inventory', 'orders']
};
const processHandles = [];
const serviceUrls = {};
let directory;
let secrets;
let gatewayUrl;

async function availablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startService(name, port, environment) {
  const child = spawn(process.execPath, [path.join(projectRoot, 'src', 'microservices', 'server.js')], {
    cwd: projectRoot,
    env: { ...process.env, ...environment, SERVICE_NAME: name, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { child.output += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { child.output += chunk; });
  processHandles.push(child);
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${name} exited before health check.\n${child.output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return baseUrl;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`${name} did not become healthy.\n${child.output}`);
}

async function api(pathname, options = {}) {
  return fetch(`${gatewayUrl}${pathname}`, options);
}

async function register(username, email) {
  const response = await api('/api/clients/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username,
      password: 'secure-password-2026',
      full_name: 'Cliente de prueba',
      email,
      phone: '+56912345678'
    })
  });
  assert.equal(response.status, 201, await response.clone().text());
  return response.json();
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

before(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'la-nonna-services-'));
  secrets = {
    identity: crypto.randomBytes(32).toString('hex'),
    webhook: crypto.randomBytes(32).toString('hex'),
    serviceTokens: {}
  };
  for (const [source, targets] of Object.entries(outgoingByService)) {
    for (const target of targets) secrets.serviceTokens[`${source}:${target}`] = crypto.randomBytes(32).toString('hex');
  }
  const ports = {};
  for (const name of names) ports[name] = await availablePort();
  for (const name of names) serviceUrls[name] = `http://127.0.0.1:${ports[name]}`;
  gatewayUrl = serviceUrls.gateway;
  const sharedEnvironment = {
    IDENTITY_SIGNING_SECRET: secrets.identity,
    WEBPAY_WEBHOOK_SECRET: secrets.webhook,
    AUTH_SERVICE_URL: serviceUrls.auth,
    CLIENTS_SERVICE_URL: serviceUrls.clients,
    INVENTORY_SERVICE_URL: serviceUrls.inventory,
    ORDERS_SERVICE_URL: serviceUrls.orders,
    PAYMENTS_SERVICE_URL: serviceUrls.payments,
    RESERVATIONS_SERVICE_URL: serviceUrls.reservations,
    GRAPHQL_SERVICE_URL: serviceUrls.graphql,
    PAYMENTS_PUBLIC_URL: serviceUrls.payments,
    RATE_LIMIT_MAX: '100',
    LOGIN_RATE_LIMIT_MAX: '4',
    GATEWAY_TIMEOUT_MS: '2500',
    SESSION_TTL_SECONDS: '3600',
    BOOTSTRAP_ADMIN_USERNAME: 'service-admin',
    BOOTSTRAP_ADMIN_PASSWORD: 'admin-password-2026',
    BOOTSTRAP_ADMIN_FULL_NAME: 'Administrador de prueba'
  };
  for (const name of names) {
    const port = ports[name];
    const incomingTokens = Object.fromEntries(
      (incomingByService[name] || []).map((source) => [source, secrets.serviceTokens[`${source}:${name}`]])
    );
    const outgoingTokens = Object.fromEntries(
      (outgoingByService[name] || []).map((target) => [
        `${name.toUpperCase()}_TO_${target.toUpperCase()}_TOKEN`,
        secrets.serviceTokens[`${name}:${target}`]
      ])
    );
    const environment = {
      ...sharedEnvironment,
      INBOUND_SERVICE_TOKENS: JSON.stringify(incomingTokens),
      ...outgoingTokens,
      ...(name === 'gateway' || name === 'graphql'
        ? {}
        : { DB_PATH: path.join(directory, `${name}.sqlite`) })
    };
    const url = await startService(name, port, environment);
    if (url !== serviceUrls[name]) throw new Error(`Puerto inesperado para ${name}`);
  }
});

after(async () => {
  for (const child of processHandles) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  await Promise.all(processHandles.map(async (child) => {
    if (child.exitCode !== null) return;
    await Promise.race([
      once(child, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  }));
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

test('private services, gateway policies and signed payment webhook work end to end', async () => {
  const healthResponses = await Promise.all(names.map((name) => fetch(`${serviceUrls[name]}/health`)));
  assert.ok(healthResponses.every((response) => response.ok));
  assert.equal(fs.readdirSync(directory).filter((file) => file.endsWith('.sqlite')).length, 6);

  const menuResponse = await api('/api/productos?limit=1');
  assert.equal(menuResponse.status, 200);
  const [product] = await menuResponse.json();
  const initialStock = product.stock;
  assert.equal(initialStock, 20);

  const unauthorizedInternal = await fetch(`${serviceUrls.inventory}/internal/products`);
  assert.equal(unauthorizedInternal.status, 401);
  const mismatchedServiceToken = await fetch(`${serviceUrls.inventory}/internal/products`, {
    headers: {
      'x-service-name': 'orders',
      'x-service-token': secrets.serviceTokens['gateway:inventory']
    }
  });
  assert.equal(mismatchedServiceToken.status, 401);
  const unknownService = await fetch(`${serviceUrls.inventory}/internal/products`, {
    headers: {
      'x-service-name': 'unknown',
      'x-service-token': secrets.serviceTokens['orders:inventory']
    }
  });
  assert.equal(unknownService.status, 401);
  const spoofedAdmin = await api('/api/inventory/movements', {
    headers: { 'x-verified-identity': 'forged-admin-identity' }
  });
  assert.equal(spoofedAdmin.status, 401);
  const hiddenRoute = await api('/api/internal/products');
  assert.equal(hiddenRoute.status, 404);

  const registration = await register('cliente-uno', 'uno@example.com');
  const token = registration.access_token;
  const profile = await api('/api/clients/me', { headers: bearer(token) });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).email, 'uno@example.com');

  const secondRegistration = await register('cliente-dos', 'dos@example.com');
  const rejectedOrder = await api('/api/orders', {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [
        { product_id: 1, quantity: 1 },
        { product_id: 2, quantity: 50 }
      ]
    })
  });
  assert.equal(rejectedOrder.status, 409);
  assert.equal((await (await api('/api/productos/1')).json()).stock, initialStock);

  const orderResponse = await api('/api/orders', {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      items: [
        { product_id: product.id, quantity: 1 },
        { product_id: product.id, quantity: 1 }
      ]
    })
  });
  assert.equal(orderResponse.status, 201, await orderResponse.clone().text());
  const { order } = await orderResponse.json();
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 2);
  assert.equal(order.total, product.precio * 2);

  const forbiddenOrder = await api(`/api/orders/${order.id}`, {
    headers: bearer(secondRegistration.access_token)
  });
  assert.equal(forbiddenOrder.status, 403);

  const paymentResponse = await api('/api/payments', {
    method: 'POST',
    headers: {
      ...bearer(token),
      'content-type': 'application/json',
      'idempotency-key': 'microservice-payment-001'
    },
    body: JSON.stringify({ order_id: order.id })
  });
  assert.equal(paymentResponse.status, 201, await paymentResponse.clone().text());
  const payment = (await paymentResponse.json()).payment;
  assert.equal(payment.status, 'succeeded');
  assert.equal(payment.provider, 'webpay-simulated');
  const paymentReplay = await api('/api/payments', {
    method: 'POST',
    headers: {
      ...bearer(token),
      'content-type': 'application/json',
      'idempotency-key': 'microservice-payment-001'
    },
    body: JSON.stringify({ order_id: order.id })
  });
  assert.equal(paymentReplay.status, 200);
  assert.equal((await paymentReplay.json()).payment.id, payment.id);

  const orderAfterPaymentResponse = await api(`/api/orders/${order.id}`, { headers: bearer(token) });
  assert.equal((await orderAfterPaymentResponse.json()).status, 'confirmed');

  const event = JSON.stringify({
    event_id: `webpay_event_${payment.id}`,
    payment_id: payment.id,
    provider_reference: payment.provider_reference,
    amount: payment.amount,
    result: 'approved'
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secrets.webhook)
    .update(`${timestamp}.${event}`).digest('hex');
  const duplicateWebhook = await api('/api/payments/webhooks/webpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webpay-timestamp': timestamp,
      'x-webpay-signature': signature
    },
    body: event
  });
  assert.equal(duplicateWebhook.status, 200);
  assert.deepEqual(await duplicateWebhook.json(), { received: true, duplicate: true });

  const alteredEvent = JSON.stringify({
    ...JSON.parse(event),
    amount: payment.amount + 1
  });
  const alteredSignature = crypto.createHmac('sha256', secrets.webhook)
    .update(`${timestamp}.${alteredEvent}`).digest('hex');
  const alteredWebhook = await api('/api/payments/webhooks/webpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webpay-timestamp': timestamp,
      'x-webpay-signature': alteredSignature
    },
    body: alteredEvent
  });
  assert.equal(alteredWebhook.status, 409);

  const invalidWebhook = await api('/api/payments/webhooks/webpay', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webpay-timestamp': timestamp,
      'x-webpay-signature': 'invalid'
    },
    body: event
  });
  assert.equal(invalidWebhook.status, 401);

  const dashboard = await api('/api/graphql', {
    method: 'POST',
    headers: { ...bearer(token), 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'query Dashboard { dashboard(limit: 3) { menu { id nombre } orders { id status items { quantity } } } }'
    })
  });
  assert.equal(dashboard.status, 200);
  const dashboardBody = await dashboard.json();
  assert.equal(dashboardBody.data.dashboard.orders[0].id, order.id);
  assert.equal(dashboardBody.data.dashboard.menu.length, 3);

  const unauthenticatedGraphqlOrders = await api('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ orders { id } }' })
  });
  assert.equal(unauthenticatedGraphqlOrders.status, 200);
  assert.ok((await unauthenticatedGraphqlOrders.json()).errors);

  const adminLogin = await api('/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'service-admin', password: 'admin-password-2026' })
  });
  assert.equal(adminLogin.status, 200);
  const admin = await adminLogin.json();
  const cancellation = await api(`/api/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: { ...bearer(admin.access_token), 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(cancellation.status, 200, await cancellation.clone().text());
  const inventoryAfter = await api(`/api/productos/${product.id}`);
  assert.equal((await inventoryAfter.json()).stock, initialStock);
  const payments = await api('/api/payments', { headers: bearer(token) });
  assert.equal((await payments.json())[0].status, 'refunded');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const limited = await api('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'unknown', password: 'wrong-password' })
    });
    if (attempt < 3) assert.equal(limited.status, 401);
    else assert.equal(limited.status, 429);
  }
});
