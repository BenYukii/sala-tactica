const express = require('express');
const { requireApiKey } = require('../middleware/auth');
const tienda = require('../services/ordenesStore');

const METODOS = ['efectivo', 'tarjeta', 'transferencia'];

let siguienteId = 1;
const pagos = [];

const router = express.Router();
router.use(requireApiKey);

router.get('/pagos', (req, res) => {
  res.json(pagos);
});

router.get('/pagos/:id', (req, res) => {
  const pago = pagos.find((p) => String(p.id) === String(req.params.id));
  if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
  res.json(pago);
});

router.post('/pagos', (req, res) => {
  const { ordenId, monto, metodo } = req.body || {};
  const orden = tienda.buscar(ordenId);
  if (!orden) return res.status(404).json({ error: 'La orden no existe' });
  if (orden.pagada) return res.status(400).json({ error: 'La orden ya esta pagada' });
  if (!METODOS.includes(metodo)) {
    return res.status(400).json({ error: `Metodo invalido. Usa: ${METODOS.join(', ')}` });
  }
  if (monto === undefined || Number.isNaN(Number(monto))) {
    return res.status(400).json({ error: 'El monto debe ser un numero' });
  }
  if (Number(monto) < orden.total) {
    return res.status(400).json({ error: `Monto insuficiente: la orden totaliza $${orden.total}` });
  }
  const pago = {
    id: siguienteId++,
    ordenId: orden.id,
    monto: Number(monto),
    metodo,
    estado: 'aprobado',
    transaccion: `TX-${Date.now()}`,
    fecha: new Date().toISOString()
  };
  pagos.push(pago);
  tienda.marcarPagada(orden.id);
  res.status(201).json(pago);
});

module.exports = router;
