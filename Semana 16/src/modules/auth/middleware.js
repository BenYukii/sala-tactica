const service = require('./service');

function requireSession(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim() || req.headers['x-access-token'] || '';

  if (!token) return res.status(401).json({ error: 'Se requiere un token de acceso' });

  return service.getSession(token).then((session) => {
    if (!session) return res.status(401).json({ error: 'Token invalido o expirado' });

    req.user = {
      id: session.user_id,
      username: session.username,
      full_name: session.full_name,
      role: session.role
    };
    return next();
  }).catch((error) => {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo validar la sesion' });
  });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Se requiere autenticacion' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'No tiene permisos suficientes para esta operacion' });
    }
    return next();
  };
}

module.exports = { requireRole, requireSession };
