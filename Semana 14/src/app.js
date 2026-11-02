const express = require('express');
const { authenticate } = require('./users');
const { SessionStore } = require('./sessions');
const { createRequireInternalSecret } = require('./internalSecret');
const { getAuthIntrospectionSecret } = require('./vault');

function createApp(options = {}) {
  const app = express();
  const sessions = options.sessions || new SessionStore();
  const requireInternalSecret = createRequireInternalSecret(
    options.getSecret || getAuthIntrospectionSecret
  );

  app.disable('x-powered-by');
  app.use(express.json({ limit: '20kb' }));

  app.get('/health', (req, res) => {
    res.json({ service: 'auth-service', status: 'ok' });
  });

  app.post('/login', (req, res) => {
    const identity = authenticate(req.body?.username, req.body?.password);
    if (!identity) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const session = sessions.create(identity);
    return res.json({
      access_token: session.token,
      token_type: 'bearer',
      expires_in: session.expiresIn
    });
  });

  app.post('/introspect', requireInternalSecret, (req, res) => {
    const session = sessions.introspect(req.body?.token);
    if (!session) return res.json({ active: false });

    return res.json({
      active: true,
      user_id: session.user_id,
      username: session.username,
      roles: session.roles,
      expires_at: new Date(session.expires_at).toISOString()
    });
  });

  app.post('/logout', requireInternalSecret, (req, res) => {
    sessions.revoke(req.body?.token);
    return res.json({ message: 'Sesion cerrada' });
  });

  app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

  app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'El cuerpo JSON no es valido' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Error interno del Auth Service' });
  });

  return app;
}

module.exports = { createApp };
