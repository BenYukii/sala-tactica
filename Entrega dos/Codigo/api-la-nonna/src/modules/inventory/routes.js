const express = require('express');
const service = require('./service');
const { requireRole, requireSession } = require('../auth/middleware');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();
router.use(requireSession, requireRole('admin'));

router.get('/movements', asyncHandler(async (req, res) => {
  return res.json(await service.listMovements(req.query.limit));
}));

router.post('/products', asyncHandler(async (req, res) => {
  const result = await service.createProduct(req.user.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  return res.status(201).json(result.product);
}));

router.patch('/products/:id', asyncHandler(async (req, res) => {
  const result = await service.updateProduct(req.params.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Producto no encontrado' });
  return res.json(result.product);
}));

router.post('/products/:id/stock', asyncHandler(async (req, res) => {
  const result = await service.adjustStock(req.user.id, req.params.id, req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  if (result.notFound) return res.status(404).json({ error: 'Producto no encontrado' });
  if (result.insufficientStock) return res.status(409).json({ error: 'El ajuste dejaría el inventario bajo cero' });
  return res.status(201).json(result);
}));

module.exports = router;
