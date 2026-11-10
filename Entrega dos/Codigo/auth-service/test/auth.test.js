const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

const INTERNAL_SECRET = 'gateway-auth-secret-789';

async function startTestServer(t) {
  const app = createApp({ getSecret: async () => INTERNAL_SECRET });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function post(baseUrl, path, body, secret) {
  const headers = { 'content-type': 'application/json' };
  if (secret) headers['x-internal-secret'] = secret;
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

test('login correcto crea un token e introspection devuelve la identidad', async (t) => {
  const baseUrl = await startTestServer(t);
  const loginResponse = await post(baseUrl, '/login', { username: 'ana', password: '1234' });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.ok(login.access_token);

  const introspectResponse = await post(
    baseUrl,
    '/introspect',
    { token: login.access_token },
    INTERNAL_SECRET
  );
  assert.equal(introspectResponse.status, 200);
  const identity = await introspectResponse.json();
  assert.equal(identity.active, true);
  assert.equal(identity.username, 'ana');
  assert.deepEqual(identity.roles, ['user']);
});

test('login incorrecto responde 401', async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await post(baseUrl, '/login', { username: 'ana', password: 'incorrecta' });
  assert.equal(response.status, 401);
});

test('introspection exige el secreto interno', async (t) => {
  const baseUrl = await startTestServer(t);
  const response = await post(baseUrl, '/introspect', { token: 'cualquiera' });
  assert.equal(response.status, 403);
});

test('logout revoca el token', async (t) => {
  const baseUrl = await startTestServer(t);
  const loginResponse = await post(baseUrl, '/login', { username: 'ernesto', password: 'admin123' });
  const { access_token: token } = await loginResponse.json();

  const logoutResponse = await post(baseUrl, '/logout', { token }, INTERNAL_SECRET);
  assert.equal(logoutResponse.status, 200);

  const introspectResponse = await post(baseUrl, '/introspect', { token }, INTERNAL_SECRET);
  assert.deepEqual(await introspectResponse.json(), { active: false });
});
