const express = require('express');
const requireApiKey = require('../middleware/apiKey');

const router = express.Router();
const reservas = [];

function validarReserva(body) {
  const { name, email, people, datetime } = body || {};
  if (!name || String(name).trim().length < 2) return 'El nombre es obligatorio';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'El correo no es valido';
  const cantidad = Number(people);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 12) return 'La cantidad debe estar entre 1 y 12';
  const fecha = new Date(datetime);
  if (!datetime || Number.isNaN(fecha.getTime()) || fecha.getTime() <= Date.now()) return 'La fecha debe ser futura';
  return null;
}

// POST /api/reservas: recibe datos desde el formulario publico.
router.post('/', (req, res) => {
  const error = validarReserva(req.body);
  if (error) return res.status(400).json({ error });

  const reserva = {
    id: reservas.length + 1,
    name: String(req.body.name).trim(),
    email: String(req.body.email).trim(),
    people: Number(req.body.people),
    datetime: req.body.datetime,
    notes: String(req.body.notes || '').trim(),
    estado: 'recibida'
  };
  reservas.push(reserva);
  return res.status(201).json({ message: 'Solicitud de reserva recibida', reserva });
});

// GET /api/reservas: ejemplo de ruta privada del gateway.
router.get('/', requireApiKey, (req, res) => res.json(reservas));

module.exports = router;
