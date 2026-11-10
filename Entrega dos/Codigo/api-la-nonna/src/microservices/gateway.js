const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { serviceRequest, signIdentity } = require('./security');

const targets = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth:4101',
  clients: process.env.CLIENTS_SERVICE_URL || 'http://clients:4102',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://inventory:4103',
  orders: process.env.ORDERS_SERVICE_URL || 'http://orders:4104',
  payments: process.env.PAYMENTS_SERVICE_URL || 'http://payments:4105',
  reservations: process.env.RESERVATIONS_SERVICE_URL || 'http://reservations:4106',
  graphql: process.env.GRAPHQL_SERVICE_URL || 'http://graphql:4107'
};

const routes = [
  { method: 'GET', path: /^\/api\/health$/, target: null, access: 'public' },
  { method: 'GET', path: /^\/api\/?$/, target: null, access: 'public' },
  { method: 'POST', path: /^\/api\/login$/, target: 'auth', access: 'public' },
  { method: 'POST', path: /^\/api\/logout$/, target: null, access: 'user' },
  { method: 'GET', path: /^\/api\/me$/, target: null, access: 'user' },
  { method: 'POST', path: /^\/api\/clients\/register$/, target: 'clients', access: 'public' },
  { method: 'GET', path: /^\/api\/clients\/me$/, target: 'clients', access: 'user' },
  { method: 'PATCH', path: /^\/api\/clients\/me$/, target: 'clients', access: 'user' },
  { method: 'GET', path: /^\/api\/productos$/, target: 'inventory', access: 'public' },
  { method: 'GET', path: /^\/api\/productos\/\d+$/, target: 'inventory', access: 'public' },
  { method: 'POST', path: /^\/api\/reservas$/, target: 'reservations', access: 'public' },
  { method: 'GET', path: /^\/api\/reservas$/, target: 'reservations', access: 'admin' },
  { method: 'PATCH', path: /^\/api\/reservas\/\d+\/status$/, target: 'reservations', access: 'admin' },
  { method: 'POST', path: /^\/api\/orders$/, target: 'orders', access: 'user' },
  { method: 'GET', path: /^\/api\/orders$/, target: 'orders', access: 'user' },
  { method: 'GET', path: /^\/api\/orders\/\d+$/, target: 'orders', access: 'user' },
  { method: 'PATCH', path: /^\/api\/orders\/\d+\/status$/, target: 'orders', access: 'admin' },
  { method: 'GET', path: /^\/api\/inventory\/movements$/, target: 'inventory', access: 'admin' },
  { method: 'POST', path: /^\/api\/inventory\/products$/, target: 'inventory', access: 'admin' },
  { method: 'PATCH', path: /^\/api\/inventory\/products\/\d+$/, target: 'inventory', access: 'admin' },
  { method: 'POST', path: /^\/api\/inventory\/products\/\d+\/stock$/, target: 'inventory', access: 'admin' },
  { method: 'POST', path: /^\/api\/payments\/webhooks\/webpay$/, target: 'payments', access: 'webhook' },
  { method: 'POST', path: /^\/api\/payments$/, target: 'payments', access: 'user' },
  { method: 'GET', path: /^\/api\/payments$/, target: 'payments', access: 'user' },
  { method: 'GET', path: /^\/api\/payments\/\d+$/, target: 'payments', access: 'user' },
  { method: 'POST', path: /^\/api\/graphql$/, target: 'graphql', access: 'optional' },
  { method: 'GET', path: /^\/api\/metrics$/, target: null, access: 'admin' }
];

function createGatewayApp() {
  const app = express();
  const frontend = path.resolve(__dirname, '..', '..', 'frontend');
  const limiters = new Map();
  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
  const generalLimit = Number(process.env.RATE_LIMIT_MAX || 120);
  const loginLimit = Number(process.env.LOGIN_RATE_LIMIT_MAX || 10);

  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({
    limit: '100kb',
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); }
  }));
  app.get('/health', (_req, res) => res.json({ service: 'api-gateway', status: 'ok' }));
  app.use('/api', async (req, res, next) => {
    const now = Date.now();
    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    const bucket = `${req.ip}:${req.method === 'POST' && pathname === '/api/login' ? 'login' : 'general'}`;
    const maximum = bucket.endsWith(':login') ? loginLimit : generalLimit;
    let entry = limiters.get(bucket);
    if (!entry || entry.expiresAt <= now) entry = { count: 0, expiresAt: now + windowMs };
    entry.count += 1;
    limiters.set(bucket, entry);
    if (limiters.size > 10000) {
      for (const [key, value] of limiters) if (value.expiresAt <= now) limiters.delete(key);
    }
    res.set('RateLimit-Limit', String(maximum));
    res.set('RateLimit-Remaining', String(Math.max(0, maximum - entry.count)));
    if (entry.count > maximum) return res.status(429).json({ error: 'Límite de solicitudes excedido' });
    return next();
  });
  app.use('/api', async (req, res, next) => {
    const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
    const definition = routes.find((route) => route.method === req.method && route.path.test(pathname));
    if (!definition) return res.status(404).json({ error: 'Ruta o método no permitido por el API Gateway' });
    try {
      if (definition.access === 'public' || definition.access === 'webhook') return dispatch(req, res, definition);
      const authorization = req.get('authorization') || '';
      const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
      if (!match && definition.access !== 'optional') return res.status(401).json({ error: 'Autenticación requerida' });
      let user = null;
      if (match) {
        const introspection = await serviceRequest(targets.auth, '/internal/introspect', {
          target: 'auth',
          method: 'POST',
          body: { token: match[1] }
        });
        if (introspection.status !== 200 || !introspection.body?.active) {
          return res.status(401).json({ error: 'Sesión inválida o expirada' });
        }
        user = introspection.body.user;
      }
      if (definition.access === 'user' && !user) return res.status(401).json({ error: 'Autenticación requerida' });
      if (definition.access === 'admin' && user?.role !== 'admin') {
        return res.status(user ? 403 : 401).json({ error: 'No tienes permiso para esta operación' });
      }
      if (pathname === '/api/me' && req.method === 'GET') return res.json(publicUser(user));
      if (pathname === '/api/logout' && req.method === 'POST') {
        await serviceRequest(targets.auth, '/internal/revoke', {
          target: 'auth',
          method: 'POST',
          body: { token: match[1] }
        });
        return res.json({ message: 'Sesión cerrada' });
      }
      if (pathname === '/api/metrics' && req.method === 'GET') {
        const memory = process.memoryUsage();
        return res.json({
          uptime_seconds: process.uptime(),
          memory: { rss_bytes: memory.rss, heap_used_bytes: memory.heapUsed, heap_total_bytes: memory.heapTotal },
          cpu: process.cpuUsage(),
          load_average: os.loadavg()
        });
      }
      req.gatewayIdentity = user ? signIdentity(user) : '';
      return dispatch(req, res, definition);
    } catch (error) {
      console.error('Fallo al autenticar o enrutar solicitud', error.message);
      if (error.name === 'TimeoutError' || error.name === 'AbortError') return res.status(504).json({ error: 'Tiempo de espera agotado al consultar un servicio interno' });
      if (error.name === 'ServiceUnavailableError') return res.status(503).json({ error: 'El servicio interno no está disponible' });
      if (error.name === 'ServiceProtocolError') return res.status(502).json({ error: 'Respuesta no válida de un servicio interno' });
      return next(error);
    }
  });
  app.use(express.static(frontend));
  app.get('*', (_req, res) => res.sendFile(path.join(frontend, 'index.html')));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'El cuerpo JSON no es válido' });
    console.error('[gateway] Error de solicitud', error.message);
    if (!res.headersSent) res.status(500).json({ error: 'Ocurrió un error interno' });
  });
  return app;
}

function publicUser(user) {
  return { id: user.id, username: user.username, role: user.role, full_name: user.full_name };
}

async function dispatch(req, res, route) {
  const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
  if (!route.target) {
    if (pathname === '/api/health') return res.json({ service: 'api-gateway', status: 'ok' });
    if (pathname === '/api' || pathname === '/api/') {
      return res.json({
        nombre: 'API Gateway La Nonna',
        estado: 'disponible',
        rutas: routes.map((item) => `${item.method} ${item.path.source}`)
      });
    }
    return res.status(404).json({ error: 'Ruta no encontrada' });
  }
  const targetUrl = new URL(req.originalUrl, targets[route.target]);
  const headers = {
    'x-service-name': process.env.SERVICE_NAME || '',
    'x-service-token': process.env[`${process.env.SERVICE_NAME?.toUpperCase()}_TO_${route.target.toUpperCase()}_TOKEN`] || '',
    ...(req.gatewayIdentity ? { 'x-verified-identity': req.gatewayIdentity } : {}),
    ...(req.get('content-type') ? { 'content-type': req.get('content-type') } : {}),
    ...(req.get('idempotency-key') ? { 'idempotency-key': req.get('idempotency-key') } : {}),
    ...(route.access === 'webhook' && req.get('x-webpay-signature')
      ? { 'x-webpay-signature': req.get('x-webpay-signature'), 'x-webpay-timestamp': req.get('x-webpay-timestamp') }
      : {})
  };
  const payload = req.method === 'GET' || req.method === 'HEAD'
    ? undefined
    : route.access === 'webhook' ? req.rawBody : JSON.stringify(req.body || {});
  let response;
  try {
    response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: payload,
      signal: AbortSignal.timeout(Number(process.env.GATEWAY_TIMEOUT_MS || 3000))
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    const unavailable = new Error('No fue posible conectar con el servicio interno');
    unavailable.name = 'ServiceUnavailableError';
    throw unavailable;
  }
  res.status(response.status);
  const contentType = response.headers.get('content-type');
  if (contentType) res.set('content-type', contentType);
  return res.send(Buffer.from(await response.arrayBuffer()));
}

module.exports = { createGatewayApp };
