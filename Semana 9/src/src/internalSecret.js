const crypto = require('crypto');
const { getAuthIntrospectionSecret } = require('./vault');

function secretsMatch(received, expected) {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function createRequireInternalSecret(getSecret = getAuthIntrospectionSecret) {
  return async function requireInternalSecret(req, res, next) {
    const received = req.get('x-internal-secret') || '';
    if (!received) {
      return res.status(403).json({ error: 'Falta el secreto interno del servicio' });
    }

    try {
      const expected = await getSecret();
      if (!secretsMatch(received, expected)) {
        return res.status(403).json({ error: 'Secreto interno incorrecto' });
      }
      return next();
    } catch (error) {
      console.error(`No fue posible consultar Vault: ${error.message}`);
      return res.status(503).json({ error: 'Vault no esta disponible' });
    }
  };
}

module.exports = { createRequireInternalSecret };
