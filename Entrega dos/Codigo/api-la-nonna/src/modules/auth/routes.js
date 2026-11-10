const express = require('express');
const service = require('./service');
const { requireSession } = require('./middleware');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) {
    return res.status(400).json({ error: 'Se requieren usuario y contraseña' });
  }

  const user = await service.authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });

  const session = await service.createSession(user);
  return res.json({
    access_token: session.token,
    token_type: 'bearer',
    expires_at: session.expires_at,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name
    }
  });
}));

router.get('/me', requireSession, (req, res) => res.json({
  id: req.user.id,
  username: req.user.username,
  role: req.user.role,
  full_name: req.user.full_name
}));

router.post('/logout', requireSession, asyncHandler(async (req, res) => {
  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (token) await service.revokeSession(token);
  return res.json({ message: 'Sesion cerrada' });
}));

router.post('/introspect', requireSession, asyncHandler(async (req, res) => {
  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  const session = await service.getSession(match?.[1]?.trim() || '');
  if (!session) return res.json({ active: false });

  return res.json({
    active: true,
    user_id: session.user_id,
    username: session.username,
    full_name: session.full_name,
    role: session.role,
    expires_at: session.expires_at
  });
}));

module.exports = router;
