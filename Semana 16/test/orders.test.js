const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const net = require('node:net');

const projectRoot = path.join(__dirname, '..');
let server;
let baseUrl;
let temporaryDirectory;
let serverOutput = '';

async function getAvailablePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`API exited before becoming healthy.\n${serverOutput}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`API did not become healthy.\n${serverOutput}`);
}

async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function getProduct(id) {
  const response = await fetch(`${baseUrl}/api/productos/${id}`);
  assert.equal(response.status, 200);
  return response.json();
}

before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'la-nonna-tests-'));
  const port = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: path.join(temporaryDirectory, 'test.sqlite')
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  server.stderr.setEncoding('utf8').on('data', (chunk) => { serverOutput += chunk; });
  await waitForHealth();
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5000))
    ]);
  }
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('health checks report API and database status', async () => {
  for (const endpoint of ['/health', '/api/health']) {
    const response = await fetch(`${baseUrl}${endpoint}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.deepEqual(await response.json(), {
      service: 'la-nonna-api',
      status: 'ok',
      dependencies: { database: 'ok' }
    });
  }
});

test('GraphQL aggregates catalog and owner orders and enforces authentication', async () => {
  const user = await login('ana', 'anita123');
  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: [{ product_id: 1, quantity: 1 }] })
  });
  assert.equal(orderResponse.status, 201);
  const { order } = await orderResponse.json();

  const query = `
    query Dashboard($limit: Int!) {
      dashboard(limit: $limit) {
        menu { id nombre precio }
        orders { id status total items { product_id quantity } }
      }
    }
  `;
  const response = await fetch(`${baseUrl}/api/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { limit: 3 } })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.errors, undefined);
  assert.equal(result.data.dashboard.menu.length, 3);
  assert.ok(result.data.dashboard.orders.some((item) => item.id === order.id));

  const anonymousResponse = await fetch(`${baseUrl}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ orders { id } }' })
  });
  const anonymousResult = await anonymousResponse.json();
  assert.equal(anonymousResponse.status, 200);
  assert.equal(anonymousResult.errors[0].extensions.code, 'UNAUTHENTICATED');
});

test('GraphQL rejects introspection and queries above configured limits', async () => {
  const introspectionResponse = await fetch(`${baseUrl}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: '{ __schema { types { name } }' })
  });
  assert.equal(introspectionResponse.status, 400);

  const excessiveFields = `{ menu(limit: 1) { ${Array(41).fill('id').join(' ')} } }`;
  const limitResponse = await fetch(`${baseUrl}/api/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: excessiveFields })
  });
  assert.equal(limitResponse.status, 400);
});

test('duplicate order lines aggregate and cancellation restores stock only once', async () => {
  const user = await login('ana', 'anita123');
  const beforeProduct = await getProduct(1);
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: [
        { product_id: 1, quantity: 2 },
        { product_id: 1, quantity: 2 }
      ]
    })
  });
  assert.equal(response.status, 201);

  const { order } = await response.json();
  assert.equal(order.total, 72);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 4);
  assert.equal((await getProduct(1)).stock, beforeProduct.stock - 4);

  const admin = await login('ernesto', 'admin123');
  const cancelResponse = await fetch(`${baseUrl}/api/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${admin.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(cancelResponse.status, 200);
  assert.equal((await getProduct(1)).stock, beforeProduct.stock);

  const repeatedCancel = await fetch(`${baseUrl}/api/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${admin.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(repeatedCancel.status, 409);
  assert.equal((await getProduct(1)).stock, beforeProduct.stock);
});

test('duplicate lines exceeding stock are rejected without partial writes', async () => {
  const user = await login('ana', 'anita123');
  const beforeProduct = await getProduct(12);
  const beforeOrdersResponse = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${user.access_token}` }
  });
  const beforeOrders = await beforeOrdersResponse.json();

  const response = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: [
        { product_id: 12, quantity: 12 },
        { product_id: 12, quantity: 12 }
      ]
    })
  });
  assert.equal(response.status, 409);
  assert.equal((await getProduct(12)).stock, beforeProduct.stock);

  const afterOrdersResponse = await fetch(`${baseUrl}/api/orders`, {
    headers: { Authorization: `Bearer ${user.access_token}` }
  });
  assert.equal((await afterOrdersResponse.json()).length, beforeOrders.length);
});

test('concurrent orders cannot oversell the same stock', async () => {
  const user = await login('ana', 'anita123');
  const beforeProduct = await getProduct(2);
  assert.ok(beforeProduct.stock >= 15);

  const submitOrder = () => fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: [{ product_id: 2, quantity: 15 }] })
  });
  const responses = await Promise.all([submitOrder(), submitOrder()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal((await getProduct(2)).stock, beforeProduct.stock - 15);
});

test('clients can register, read and update only their own profile', async () => {
  const suffix = Date.now().toString();
  const registrationResponse = await fetch(`${baseUrl}/api/clients/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `client${suffix}`,
      password: 'secure-password-123',
      full_name: 'Cliente de Prueba',
      email: `client${suffix}@example.test`,
      phone: '+56912345678'
    })
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json();
  const headers = { Authorization: 'Bearer ' + registration.access_token };

  const profileResponse = await fetch(`${baseUrl}/api/clients/me`, { headers });
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  assert.equal(profile.user_id, registration.user.id);
  assert.equal(profile.email, `client${suffix}@example.test`);

  const updateResponse = await fetch(`${baseUrl}/api/clients/me`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name: 'Cliente Actualizado', phone: '+56987654321' })
  });
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(updated.full_name, 'Cliente Actualizado');
  assert.equal(updated.email, profile.email);
  assert.equal(updated.phone, '+56987654321');
});

test('inventory management is admin-only and records stock movements transactionally', async () => {
  const user = await login('ana', 'anita123');
  const denied = await fetch(`${baseUrl}/api/inventory/products`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + user.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ nombre: 'Producto no autorizado', precio: 10, categoria: 'Prueba', stock: 5 })
  });
  assert.equal(denied.status, 403);
  const metricsDenied = await fetch(`${baseUrl}/api/metrics`, {
    headers: { Authorization: 'Bearer ' + user.access_token }
  });
  assert.equal(metricsDenied.status, 403);

  const admin = await login('ernesto', 'admin123');
  const headers = {
    Authorization: 'Bearer ' + admin.access_token,
    'Content-Type': 'application/json'
  };
  const createdResponse = await fetch(`${baseUrl}/api/inventory/products`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      nombre: 'Producto de inventario',
      descripcion: 'Creado por prueba',
      precio: 12.5,
      categoria: 'Prueba',
      stock: 4
    })
  });
  assert.equal(createdResponse.status, 201);
  const product = await createdResponse.json();

  const adjustmentResponse = await fetch(`${baseUrl}/api/inventory/products/${product.id}/stock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quantity_delta: 3, reason: 'recepcion de prueba' })
  });
  assert.equal(adjustmentResponse.status, 201);
  assert.equal((await adjustmentResponse.json()).stock, 7);

  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + user.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: [{ product_id: product.id, quantity: 1 }] })
  });
  assert.equal(orderResponse.status, 201);
  const { order } = await orderResponse.json();
  const renameResponse = await fetch(`${baseUrl}/api/inventory/products/${product.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      nombre: 'Producto de inventario renombrado',
      descripcion: 'Creado por prueba',
      precio: 12.5,
      categoria: 'Prueba'
    })
  });
  assert.equal(renameResponse.status, 200);
  const orderDetailsResponse = await fetch(`${baseUrl}/api/orders/${order.id}`, {
    headers: { Authorization: 'Bearer ' + user.access_token }
  });
  const orderDetails = await orderDetailsResponse.json();
  assert.equal(orderDetails.items[0].nombre, 'Producto de inventario');

  const invalidAdjustment = await fetch(`${baseUrl}/api/inventory/products/${product.id}/stock`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ quantity_delta: -8, reason: 'no debe dejar stock negativo' })
  });
  assert.equal(invalidAdjustment.status, 409);

  const movementsResponse = await fetch(`${baseUrl}/api/inventory/movements?limit=10`, {
    headers: { Authorization: 'Bearer ' + admin.access_token }
  });
  assert.equal(movementsResponse.status, 200);
  const movements = await movementsResponse.json();
  assert.ok(movements.some((movement) => movement.product_id === product.id && movement.reason === 'recepcion de prueba'));
});

test('simulated Webpay payments are owner-bound, idempotent and refunded on cancellation', async () => {
  const user = await login('ana', 'anita123');
  const orderResponse = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + user.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: [{ product_id: 3, quantity: 1 }] })
  });
  assert.equal(orderResponse.status, 201);
  const { order } = await orderResponse.json();
  const admin = await login('ernesto', 'admin123');
  const unpaidConfirmation = await fetch(`${baseUrl}/api/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + admin.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'confirmed' })
  });
  assert.equal(unpaidConfirmation.status, 409);
  const idempotencyKey = `payment-test-${order.id}`;
  const suffix = Date.now().toString();
  const otherClientResponse = await fetch(`${baseUrl}/api/clients/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `other${suffix}`,
      password: 'secure-password-123',
      full_name: 'Otro Cliente',
      email: `other${suffix}@example.test`
    })
  });
  assert.equal(otherClientResponse.status, 201);
  const otherClient = await otherClientResponse.json();
  const privateOrderResponse = await fetch(`${baseUrl}/api/orders/${order.id}`, {
    headers: { Authorization: 'Bearer ' + otherClient.access_token }
  });
  assert.equal(privateOrderResponse.status, 403);
  const unauthorizedPayment = await fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + otherClient.access_token,
      'Content-Type': 'application/json',
      'Idempotency-Key': `foreign-payment-${order.id}`
    },
    body: JSON.stringify({ order_id: order.id })
  });
  assert.equal(unauthorizedPayment.status, 403);

  const submitPayment = () => fetch(`${baseUrl}/api/payments`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + user.access_token,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify({ order_id: order.id })
  });
  const paymentResponse = await submitPayment();
  assert.equal(paymentResponse.status, 201);
  const paymentResult = await paymentResponse.json();
  assert.equal(paymentResult.payment.status, 'succeeded');
  assert.equal(paymentResult.payment.provider, 'webpay-simulated');
  assert.match(paymentResult.payment.provider_reference, /^webpay_sim_/);
  assert.equal(paymentResult.payment.amount, order.total);

  const replayResponse = await submitPayment();
  assert.equal(replayResponse.status, 200);
  const replayResult = await replayResponse.json();
  assert.equal(replayResult.idempotent_replay, true);
  assert.equal(replayResult.payment.id, paymentResult.payment.id);

  const confirmedOrderResponse = await fetch(`${baseUrl}/api/orders/${order.id}`, {
    headers: { Authorization: 'Bearer ' + user.access_token }
  });
  assert.equal((await confirmedOrderResponse.json()).status, 'confirmed');

  const cancelResponse = await fetch(`${baseUrl}/api/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + admin.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'cancelled' })
  });
  assert.equal(cancelResponse.status, 200);
  const finalPaymentResponse = await fetch(`${baseUrl}/api/payments/${paymentResult.payment.id}`, {
    headers: { Authorization: 'Bearer ' + user.access_token }
  });
  assert.equal((await finalPaymentResponse.json()).status, 'refunded');
});
