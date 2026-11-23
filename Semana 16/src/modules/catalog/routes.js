const express = require('express');
const service = require('./service');
const asyncHandler = require('../../infrastructure/asyncHandler');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  return res.json(await service.listProducts(req.query.categoria, req.query.limit));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const product = await service.getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: 'Plato no encontrado' });
  return res.json(product);
}));

module.exports = router;
