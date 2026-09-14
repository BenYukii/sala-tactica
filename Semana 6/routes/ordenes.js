const express = require('express');
const { requireApiKey } = require('../middleware/auth');
const tienda = require('../services/ordenesStore');

const router = express.Router();
router.use(requireApiKey);

router.get('/ordenes', (req, res) => {
  res.json(tienda.listar());
});

router.get('/ordenes/:id', (req, res) => {
  const orden = tienda.buscar(req.params.id);
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
  res.json(orden);
});

router.post('/ordenes', async (req, res) => {
  try {
    const orden = await tienda.crear(req.body || {});
    res.status(201).json(orden);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/ordenes/:id/estado', (req, res) => {
  try {
    const orden = tienda.cambiarEstado(req.params.id, (req.body || {}).estado);
    if (!orden) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json(orden);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/ordenes/:id', (req, res) => {
  try {
    const borrada = tienda.eliminar(req.params.id);
    if (!borrada) return res.status(404).json({ error: 'Orden no encontrada' });
    res.json({ message: `Orden ${borrada.id} anulada` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
