const DEFAULT_VAULT_ADDRESS = 'http://127.0.0.1:8200';
const DEFAULT_SECRET_PATH = 'secret/data/gateway';
const DEFAULT_SECRET_KEY = 'auth_introspection_secret';
const REQUEST_TIMEOUT_MS = 3000;

function buildSecretUrl() {
  const address = (process.env.VAULT_ADDR || DEFAULT_VAULT_ADDRESS).replace(/\/$/, '');
  const secretPath = (process.env.VAULT_SECRET_PATH || DEFAULT_SECRET_PATH).replace(/^\/+/, '');
  return `${address}/v1/${secretPath}`;
}

async function getAuthIntrospectionSecret() {
  const vaultToken = process.env.VAULT_TOKEN;
  if (!vaultToken) throw new Error('VAULT_TOKEN no esta configurado');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildSecretUrl(), {
      headers: { 'X-Vault-Token': vaultToken },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Vault respondio con estado ${response.status}`);

    const payload = await response.json();
    const secretKey = process.env.VAULT_AUTH_SECRET_KEY || DEFAULT_SECRET_KEY;
    const secret = payload?.data?.data?.[secretKey];
    if (typeof secret !== 'string' || !secret) {
      throw new Error(`El secreto ${secretKey} no existe en Vault`);
    }
    return secret;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getAuthIntrospectionSecret };
