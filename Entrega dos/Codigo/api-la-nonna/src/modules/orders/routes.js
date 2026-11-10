const express = require('express');
const service = require('./service');
const { requireRole, requireSession } = require('../auth/middleware');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();

router.post('/', requireSession, asyncHandler(async (req, res) => {
  const result = await service.create(req.user.id, req.body?.items);
  if (result.error) return res.status(result.status).json({ error: result.error });
  return res.status(201).json({ message: 'Pedido creado', order: result });
}));

router.get('/', requireSession, asyncHandler(async (req, res) => res.json(await service.list(req.user))));

router.get('/:id', requireSession, asyncHandler(async (req, res) => {
  const result = await service.get(req.user, req.params.id);
  if (result.notFound) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (result.forbidden) return res.status(403).json({ error: 'No tienes permiso para consultar este pedido' });
  return res.json(result.order);
}));

router.patch('/:id/status', requireSession, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await service.updateStatus(req.params.id, String(req.body?.status || '').trim());
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (result.invalidTransition) {
    return res.status(409).json({
      error: `No se puede cambiar el pedido de ${result.currentStatus} al estado solicitado`
    });
  }
  return res.json({
    message: 'Estado del pedido actualizado',
    order_id: result.orderId,
    status: result.status
  });
}));

module.exports = router;
