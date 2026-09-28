require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const apiRouter = require('./routes');

const app = express();
const frontendPath = path.join(__dirname, 'frontend');

// API Gateway: punto unico de entrada para el frontend y las rutas REST.
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use('/api', apiRouter);

// El mismo gateway entrega los archivos HTML, CSS y JavaScript.
app.use(express.static(frontendPath));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

// Manejador comun para errores no controlados en los routers.
app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Ocurrio un error interno' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`La Nonna disponible en http://localhost:${port}`);
  console.log(`API Gateway disponible en http://localhost:${port}/api`);
});
