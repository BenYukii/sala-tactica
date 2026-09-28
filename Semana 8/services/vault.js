const DEFAULT_VAULT_ADDRESS = 'http://127.0.0.1:8200';
const DEFAULT_SECRET_PATH = 'secret/data/sala-tactica';
const REQUEST_TIMEOUT_MS = 3000;

function buildSecretUrl() {
  const address = (process.env.VAULT_ADDR || DEFAULT_VAULT_ADDRESS).replace(/\/$/, '');
  const path = (process.env.VAULT_SECRET_PATH || DEFAULT_SECRET_PATH).replace(/^\/+/, '');
  return `${address}/v1/${path}`;
}

async function getAdminApiKey() {
  const vaultToken = process.env.VAULT_TOKEN;
  if (!vaultToken) throw new Error('VAULT_TOKEN no esta configurado');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildSecretUrl(), {
      headers: { 'X-Vault-Token': vaultToken },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Vault respondio con estado ${response.status}`);
    }

    const payload = await response.json();
    const apiKey = payload?.data?.data?.ADMIN_API_KEY;
    if (typeof apiKey !== 'string' || !apiKey) {
      throw new Error('El secreto ADMIN_API_KEY no existe en Vault');
    }

    return apiKey;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { getAdminApiKey };
