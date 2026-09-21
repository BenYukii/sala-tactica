const express = require('express');
const productos = require('../data/productos');

const router = express.Router();

// GET /api/productos?categoria=Postre&limit=6
router.get('/', (req, res) => {
  const categoria = String(req.query.categoria || '').trim().toLowerCase();
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 20;

  const filtrados = categoria
    ? productos.filter((producto) => producto.categoria.toLowerCase() === categoria)
    : productos;

  res.json(filtrados.slice(0, limit));
});

// GET /api/productos/:id
router.get('/:id', (req, res) => {
  const producto = productos.find((item) => item.id === Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Plato no encontrado' });
  return res.json(producto);
});

module.exports = router;
