const express = require('express');
const service = require('./service');
const { requireSession } = require('../auth/middleware');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();
router.use(requireSession);

router.post('/', asyncHandler(async (req, res) => {
  const result = await service.create(req.user, req.body?.order_id, req.get('Idempotency-Key'));
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (result.forbidden) return res.status(403).json({ error: 'No puedes pagar un pedido de otro cliente' });
  if (result.invalidOrderState) {
    return res.status(409).json({ error: `El pedido no admite pago en estado ${result.invalidOrderState}` });
  }
  if (result.conflict) return res.status(409).json({ error: result.conflict });
  if (result.alreadyPaid) return res.status(409).json({ error: 'El pedido ya tiene un pago aprobado' });
  if (result.amountMismatch) return res.status(409).json({ error: 'El monto del pedido cambió; vuelve a consultar el pedido' });
  if (result.declined) return res.status(402).json({ error: 'El pago de prueba fue rechazado' });
  return res.status(result.replayed ? 200 : 201).json({
    payment: result.payment,
    idempotent_replay: result.replayed
  });
}));

router.get('/', asyncHandler(async (req, res) => res.json(await service.list(req.user))));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await service.get(req.user, req.params.id);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Pago no encontrado' });
  return res.json(result.payment);
}));

module.exports = router;
