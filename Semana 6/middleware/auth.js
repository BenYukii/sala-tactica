// Separa lo PUBLICO de lo PRIVADO en el gateway.
// Las rutas de administracion exigen la clave de .env (ADMIN_API_KEY)
// enviada en el header x-api-key. Sin clave -> 401.

function claveAdmin() {
  return process.env.ADMIN_API_KEY || 'lanonna-admin-123';
}

function requireApiKey(req, res, next) {
  const enviada = req.headers['x-api-key'];
  if (enviada && enviada === claveAdmin()) return next();
  res.status(401).json({ error: 'No autorizado: esta operacion es privada (envia el header x-api-key)' });
}

module.exports = { requireApiKey, claveAdmin };
