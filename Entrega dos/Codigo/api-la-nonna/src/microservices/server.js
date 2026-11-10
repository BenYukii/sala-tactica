require('dotenv').config();

const http = require('http');
const { createDatabase } = require('./database');
const { createServiceApp } = require('./apps');
const { createGatewayApp } = require('./gateway');
const { createGraphqlApp } = require('./graphql');

const services = {
  gateway: {
    port: 4100,
    outgoing: ['auth', 'clients', 'inventory', 'orders', 'payments', 'reservations', 'graphql'],
    factory: () => createGatewayApp()
  },
  auth: { port: 4101, incoming: ['gateway', 'clients'], outgoing: [], factory: (db) => createServiceApp('auth', db), database: true },
  clients: { port: 4102, incoming: ['gateway'], outgoing: ['auth'], factory: (db) => createServiceApp('clients', db), database: true },
  inventory: { port: 4103, incoming: ['gateway', 'orders', 'graphql'], outgoing: [], factory: (db) => createServiceApp('inventory', db), database: true },
  orders: { port: 4104, incoming: ['gateway', 'payments', 'graphql'], outgoing: ['inventory', 'payments'], factory: (db) => createServiceApp('orders', db), database: true },
  payments: { port: 4105, incoming: ['gateway', 'orders'], outgoing: ['orders'], factory: (db) => createServiceApp('payments', db), database: true },
  reservations: { port: 4106, incoming: ['gateway'], outgoing: [], factory: (db) => createServiceApp('reservations', db), database: true },
  graphql: { port: 4107, incoming: ['gateway'], outgoing: ['inventory', 'orders'], factory: () => createGraphqlApp() }
};

function validateCredentials(serviceName, service) {
  const identitySecret = process.env.IDENTITY_SIGNING_SECRET;
  if (!identitySecret || identitySecret.length < 32) {
    throw new Error('IDENTITY_SIGNING_SECRET debe tener al menos 32 caracteres y configurarse fuera del código');
  }
  let incoming;
  try {
    incoming = JSON.parse(process.env.INBOUND_SERVICE_TOKENS || '{}');
  } catch (error) {
    throw new Error(`INBOUND_SERVICE_TOKENS debe ser JSON válido: ${error.message}`);
  }
  const incomingNames = Object.keys(incoming).sort();
  const expectedIncoming = [...(service.incoming || [])].sort();
  if (JSON.stringify(incomingNames) !== JSON.stringify(expectedIncoming)) {
    throw new Error(`${serviceName} requiere tokens entrantes para: ${expectedIncoming.join(', ') || 'ningún servicio'}`);
  }
  for (const [source, token] of Object.entries(incoming)) {
    if (typeof token !== 'string' || token.length < 32) {
      throw new Error(`El token de ${source} hacia ${serviceName} debe tener al menos 32 caracteres`);
    }
  }
  for (const target of service.outgoing || []) {
    const name = `${serviceName.toUpperCase()}_TO_${target.toUpperCase()}_TOKEN`;
    if (!process.env[name] || process.env[name].length < 32) {
      throw new Error(`${name} debe tener al menos 32 caracteres y configurarse fuera del código`);
    }
  }
}

async function start() {
  const serviceName = process.env.SERVICE_NAME;
  const service = services[serviceName];
  if (!service) throw new Error('SERVICE_NAME debe identificar un servicio configurado');
  validateCredentials(serviceName, service);
  if (serviceName === 'payments' && !process.env.WEBPAY_WEBHOOK_SECRET) {
    throw new Error('WEBPAY_WEBHOOK_SECRET debe configurarse fuera del código');
  }
  const database = service.database
    ? await createDatabase(serviceName, process.env.DB_PATH).initialize()
    : null;
  const app = service.factory(database);
  const port = Number(process.env.PORT) || service.port;
  const server = http.createServer(app);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', resolve);
  });
  console.log(`${serviceName} iniciado en el puerto ${port}`);

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(async (error) => {
      if (database) await database.close();
      if (error) {
        console.error(`Error al cerrar ${serviceName}`, error.message);
        process.exitCode = 1;
      }
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((error) => {
  console.error('No fue posible iniciar el servicio', error.message);
  process.exitCode = 1;
});
