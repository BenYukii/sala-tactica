const express = require('express');
const service = require('./service');
const { requireRole, requireSession } = require('../auth/middleware');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const result = await service.create(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json({
    message: 'Solicitud de reserva recibida',
    reserva: result.reservation
  });
}));

router.get('/', requireSession, requireRole('admin'), asyncHandler(async (req, res) => {
  return res.json(await service.list());
}));

router.patch('/:id/status', requireSession, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await service.updateStatus(req.params.id, String(req.body?.status || '').trim());
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Reserva no encontrada' });
  return res.json({ message: 'Estado actualizado', ...result });
}));

module.exports = router;
