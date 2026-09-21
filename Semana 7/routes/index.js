const express = require('express');
const productosRouter = require('./productos');
const reservasRouter = require('./reservas');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    nombre: 'API Gateway La Nonna',
    estado: 'disponible',
    rutas: ['/api/productos', '/api/productos/:id', '/api/reservas']
  });
});

// Routing: el gateway deriva cada recurso a su router especializado.
router.use('/productos', productosRouter);
router.use('/reservas', reservasRouter);

router.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));

module.exports = router;
