require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const apiRouter = require('./src/modules');
const { get, initialize } = require('./src/infrastructure/database');

const app = express();
const frontendPath = path.join(__dirname, 'frontend');

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '100kb' }));
async function healthCheck(req, res) {
  try {
    await get('SELECT 1 AS available');
    return res.json({
      service: 'la-nonna-api',
      status: 'ok',
      dependencies: { database: 'ok' }
    });
  } catch (error) {
    console.error('Health check de base de datos falló', error.message);
    return res.status(503).json({
      service: 'la-nonna-api',
      status: 'unavailable',
      dependencies: { database: 'unavailable' }
    });
  }
}

app.get('/health', healthCheck);
app.get('/api/health', healthCheck);
app.use('/api', apiRouter);
app.use(express.static(frontendPath));
app.get('*', (req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'El cuerpo JSON no es valido' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Ocurrio un error interno' });
});

const port = Number(process.env.PORT) || 4000;

(async () => {
  try {
    await initialize();
    app.listen(port, () => {
      console.log(`La Nonna disponible en http://localhost:${port}`);
      console.log(`API Gateway disponible en http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error('Fallo al inicializar la base de datos', error);
    process.exit(1);
  }
})();
