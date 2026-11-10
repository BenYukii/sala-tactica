const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const serviceNames = ['gateway', 'auth', 'clients', 'inventory', 'orders', 'payments', 'reservations', 'graphql'];
const links = [
  ['gateway', 'auth'],
  ['gateway', 'clients'],
  ['gateway', 'inventory'],
  ['gateway', 'orders'],
  ['gateway', 'payments'],
  ['gateway', 'reservations'],
  ['gateway', 'graphql'],
  ['clients', 'auth'],
  ['orders', 'inventory'],
  ['orders', 'payments'],
  ['payments', 'orders'],
  ['graphql', 'inventory'],
  ['graphql', 'orders']
];

const vaultAddress = process.env.VAULT_ADDR;
const rootToken = process.env.VAULT_TOKEN;
if (!vaultAddress || !rootToken) throw new Error('VAULT_ADDR y VAULT_TOKEN deben configurarse para inicializar Vault');

async function vaultRequest(route, { method = 'GET', body } = {}) {
  const response = await fetch(new URL(route, vaultAddress), {
    method,
    headers: {
      'X-Vault-Token': rootToken,
      ...(body === undefined ? {} : { 'content-type': 'application/json' })
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const details = Array.isArray(responseBody?.errors) ? responseBody.errors.join('; ') : 'respuesta no válida';
    throw new Error(`Vault ${method} ${route} respondió ${response.status}: ${details}`);
  }
  return responseBody;
}

async function waitForVault() {
  const deadline = Date.now() + 60000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await vaultRequest('/v1/sys/health');
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Vault no estuvo disponible antes del timeout: ${lastError?.message || 'sin respuesta'}`);
}

async function writeServiceSecret(serviceName, values) {
  const secretPath = `la-nonna/services/${serviceName}`;
  await vaultRequest(`/v1/secret/data/${secretPath}`, {
    method: 'POST',
    body: { data: values }
  });
  const policyName = `la-nonna-${serviceName}`;
  await vaultRequest(`/v1/sys/policies/acl/${policyName}`, {
    method: 'PUT',
    body: {
      policy: `path "secret/data/${secretPath}" {\n  capabilities = ["read"]\n}\n`
    }
  });
  const tokenResponse = await vaultRequest('/v1/auth/token/create', {
    method: 'POST',
    body: {
      policies: [policyName],
      no_default_policy: true,
      ttl: '8760h',
      renewable: false
    }
  });
  const token = tokenResponse?.auth?.client_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error(`Vault no entregó un token para ${serviceName}`);
  }

  const tokenDirectory = path.join('/run/vault-tokens', serviceName);
  const tokenFile = path.join(tokenDirectory, 'token');
  await fs.mkdir(tokenDirectory, { recursive: true });
  await fs.rm(tokenFile, { force: true });
  await fs.writeFile(tokenFile, `${token}\n`, { encoding: 'utf8', mode: 0o400 });
  console.log(`Credencial de lectura creada para ${serviceName}`);
}

async function main() {
  await waitForVault();
  const identitySecret = crypto.randomBytes(32).toString('hex');
  const serviceSecrets = Object.fromEntries(serviceNames.map((name) => [
    name,
    { IDENTITY_SIGNING_SECRET: identitySecret }
  ]));
  const adminValues = {
    BOOTSTRAP_ADMIN_USERNAME: process.env.BOOTSTRAP_ADMIN_USERNAME || '',
    BOOTSTRAP_ADMIN_PASSWORD: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
    BOOTSTRAP_ADMIN_FULL_NAME: process.env.BOOTSTRAP_ADMIN_FULL_NAME || ''
  };
  if (Object.values(adminValues).some(Boolean) && !Object.values(adminValues).every(Boolean)) {
    throw new Error('Las tres variables de bootstrap admin deben definirse juntas');
  }
  if (Object.values(adminValues).every(Boolean)) {
    Object.assign(serviceSecrets.auth, adminValues);
  }
  const incomingTokens = Object.fromEntries(serviceNames.map((name) => [name, {}]));

  for (const [source, target] of links) {
    const variable = `${source.toUpperCase()}_TO_${target.toUpperCase()}_TOKEN`;
    const token = crypto.randomBytes(32).toString('hex');
    serviceSecrets[source][variable] = token;
    incomingTokens[target][source] = token;
  }

  for (const serviceName of serviceNames) {
    serviceSecrets[serviceName].INBOUND_SERVICE_TOKENS = JSON.stringify(incomingTokens[serviceName]);
  }
  serviceSecrets.payments.WEBPAY_WEBHOOK_SECRET = crypto.randomBytes(32).toString('hex');

  for (const serviceName of serviceNames) {
    await writeServiceSecret(serviceName, serviceSecrets[serviceName]);
  }
  console.log('Vault quedó configurado con secretos por servicio y políticas de solo lectura.');
}

main().catch((error) => {
  console.error('No fue posible inicializar los secretos en Vault:', error.message);
  process.exitCode = 1;
});
