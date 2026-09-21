function requireApiKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY || 'lanonna-clase-2026';
  if (req.headers['x-api-key'] === expected) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

module.exports = requireApiKey;
