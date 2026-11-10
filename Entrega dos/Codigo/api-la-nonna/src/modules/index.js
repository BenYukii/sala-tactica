const express = require('express');
const authRoutes = require('./auth/routes');
const catalogRoutes = require('./catalog/routes');
const reservationRoutes = require('./reservations/routes');
const orderRoutes = require('./orders/routes');
const clientRoutes = require('./clients/routes');
const inventoryRoutes = require('./inventory/routes');
const paymentRoutes = require('./payments/routes');
const observabilityRoutes = require('./observability/routes');
const graphqlRoutes = require('./graphql/routes');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    nombre: 'API Gateway La Nonna',
    estado: 'disponible',
    rutas: [
      '/api/login', '/api/me', '/api/clients/register', '/api/clients/me',
      '/api/productos', '/api/productos/:id', '/api/reservas', '/api/orders',
      '/api/payments', '/api/inventory/products', '/api/graphql', '/api/metrics'
    ]
  });
});

router.use(authRoutes);
router.use('/productos', catalogRoutes);
router.use('/reservas', reservationRoutes);
router.use('/orders', orderRoutes);
router.use('/clients', clientRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/payments', paymentRoutes);
router.use('/metrics', observabilityRoutes);
router.use('/graphql', graphqlRoutes);
router.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));

module.exports = router;
