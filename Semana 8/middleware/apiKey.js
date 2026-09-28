const crypto = require('crypto');
const { getAdminApiKey } = require('../services/vault');

function getCredential(req) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || req.get('x-api-key') || '';
}

function credentialsMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function requireApiKey(req, res, next) {
  const received = getCredential(req);
  if (!received) {
    return res.status(401).json({ error: 'Se requiere un token de acceso' });
  }

  try {
    const expected = await getAdminApiKey();
    if (!credentialsMatch(received, expected)) {
      return res.status(403).json({ error: 'Token de acceso incorrecto' });
    }
    return next();
  } catch (error) {
    console.error(`No fue posible consultar el secreto en Vault: ${error.message}`);
    return res.status(503).json({ error: 'Servicio de autenticacion no disponible' });
  }
}

module.exports = requireApiKey;
