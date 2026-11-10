const express = require('express');
const service = require('./service');
const { requireSession } = require('../auth/middleware');
const authService = require('../auth/service');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();

router.post('/register', asyncHandler(async (req, res) => {
  const result = await service.register(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: result.conflict });

  const session = await authService.createSession(result.user);
  return res.status(201).json({
    client: { id: result.client_id, user_id: result.user.id, email: result.email, phone: result.phone },
    access_token: session.token,
    token_type: 'bearer',
    expires_at: session.expires_at,
    user: result.user
  });
}));

router.get('/me', requireSession, asyncHandler(async (req, res) => {
  const client = await service.getProfile(req.user.id);
  if (!client) return res.status(404).json({ error: 'Perfil de cliente no encontrado' });
  return res.json(client);
}));

router.patch('/me', requireSession, asyncHandler(async (req, res) => {
  const result = await service.updateProfile(req.user.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.conflict) return res.status(409).json({ error: result.conflict });
  if (result.notFound) return res.status(404).json({ error: 'Perfil de cliente no encontrado' });
  return res.json(result.client);
}));

module.exports = router;
