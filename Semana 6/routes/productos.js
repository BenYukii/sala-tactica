// REST del gateway. Usa el MISMO modelo MySQL que GraphQL (Producto.js),
// asi ambas puertas leen/escriben los mismos datos.
//
// PUBLICO (sin clave): GET lista y GET por id — lo que usa el frontend.
// PRIVADO (con x-api-key): POST, PUT y DELETE — administracion del menu.

const express = require('express');
const Producto = require('../Producto');
const { requireApiKey } = require('../middleware/auth');

const router = express.Router();

// --- PUBLICO ---

// GET /api/productos?limit=6&categoria=Pasta%20fresca
router.get('/productos', async (req, res) => {
  try {
    const productos = await Producto.obtenerTodos(req.query.categoria, req.query.limit);
    res.json(productos);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar el menu' });
  }
});

// GET /api/productos/:id
router.get('/productos/:id', async (req, res) => {
  try {
    const producto = await Producto.obtenerPorId(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Plato no encontrado' });
    res.json(producto);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo cargar el plato' });
  }
});

// --- PRIVADO ---

function validarEntrada(body) {
  const { nombre, descripcion, precio, categoria } = body || {};
  if (!nombre || !descripcion || !categoria) {
    return 'Faltan campos: nombre, descripcion y categoria son obligatorios';
  }
  if (precio === undefined || Number.isNaN(Number(precio))) {
    return 'El precio debe ser un numero';
  }
  if (Number(precio) < 0) return 'El precio no puede ser negativo';
  return null;
}

// POST /api/productos
router.post('/productos', requireApiKey, async (req, res) => {
  const error = validarEntrada(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const creado = await Producto.crear({ ...req.body, precio: Number(req.body.precio) });
    res.status(201).json(creado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/productos/:id
router.put('/productos/:id', requireApiKey, async (req, res) => {
  const error = validarEntrada(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const actual = await Producto.obtenerPorId(req.params.id);
    if (!actual) return res.status(404).json({ error: 'Plato no encontrado' });
    const actualizado = await Producto.actualizar(req.params.id, { ...req.body, precio: Number(req.body.precio) });
    res.json(actualizado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/productos/:id
router.delete('/productos/:id', requireApiKey, async (req, res) => {
  try {
    const actual = await Producto.obtenerPorId(req.params.id);
    if (!actual) return res.status(404).json({ error: 'Plato no encontrado' });
    const resultado = await Producto.eliminar(req.params.id);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'No se pudo eliminar el plato' });
  }
});

module.exports = router;
