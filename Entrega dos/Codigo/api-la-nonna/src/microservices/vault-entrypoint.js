const fs = require('fs/promises');
const { spawn } = require('child_process');

const serviceName = process.env.SERVICE_NAME;
const vaultAddress = process.env.VAULT_ADDR;
const tokenFile = process.env.VAULT_TOKEN_FILE || '/run/vault-token/token';
const command = process.argv[2];
const args = process.argv.slice(3);

if (!serviceName || !vaultAddress || !command) {
  throw new Error('SERVICE_NAME, VAULT_ADDR y el comando del proceso son obligatorios');
}

async function readSecret() {
  const token = (await fs.readFile(tokenFile, 'utf8')).trim();
  if (!token) throw new Error(`El archivo de token de Vault está vacío: ${tokenFile}`);

  const response = await fetch(new URL(`/v1/secret/data/la-nonna/services/${serviceName}`, vaultAddress), {
    headers: { 'X-Vault-Token': token },
    signal: AbortSignal.timeout(5000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Vault no autorizó la lectura de secretos para ${serviceName} (HTTP ${response.status})`);
  }
  const secret = body?.data?.data;
  if (!secret || typeof secret !== 'object' || Array.isArray(secret)) {
    throw new Error(`Vault devolvió un secreto inválido para ${serviceName}`);
  }
  for (const [name, value] of Object.entries(secret)) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`El secreto ${name} de ${serviceName} no es válido`);
    }
    process.env[name] = value;
  }
}

async function main() {
  await readSecret();
  const child = spawn(process.execPath, [command, ...args], { env: process.env, stdio: 'inherit' });
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      stopping = true;
      child.kill(signal);
    });
  }
  child.once('error', (error) => {
    console.error(`No fue posible iniciar ${serviceName}:`, error.message);
    process.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (stopping ? 0 : 1);
    if (signal && !stopping) console.error(`${serviceName} terminó por señal ${signal}`);
  });
}

main().catch((error) => {
  console.error(`No fue posible obtener secretos de Vault para ${serviceName}:`, error.message);
  process.exitCode = 1;
});
