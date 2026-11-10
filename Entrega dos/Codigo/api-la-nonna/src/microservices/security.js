const crypto = require('crypto');

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireServiceToken(req, res, next) {
  const source = req.get('x-service-name') || '';
  let allowedTokens;
  try {
    allowedTokens = JSON.parse(process.env.INBOUND_SERVICE_TOKENS || '{}');
  } catch (error) {
    return next(new Error(`INBOUND_SERVICE_TOKENS no contiene JSON válido: ${error.message}`));
  }
  const expected = allowedTokens[source];
  if (!source || typeof expected !== 'string' || !safeEqual(req.get('x-service-token'), expected)) {
    return res.status(401).json({ error: 'Identidad de servicio no autorizada' });
  }
  return next();
}

function signIdentity(user) {
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.IDENTITY_SIGNING_SECRET || '')
    .update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifyIdentity(value) {
  if (!process.env.IDENTITY_SIGNING_SECRET || typeof value !== 'string') return null;
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', process.env.IDENTITY_SIGNING_SECRET)
    .update(payload).digest('hex');
  if (!safeEqual(signature, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isInteger(user.id) || !['user', 'admin'].includes(user.role)) return null;
    const expiresAt = Date.parse(user.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function requireIdentity(req, res, next) {
  const user = verifyIdentity(req.get('x-verified-identity'));
  if (!user) return res.status(401).json({ error: 'Se requiere una identidad validada por el gateway' });
  req.user = user;
  return next();
}

function requireRole(role) {
  return (req, res, next) => req.user?.role === role
    ? next()
    : res.status(403).json({ error: 'No tienes permiso para esta operación' });
}

async function serviceRequest(baseUrl, route, options = {}) {
  const source = process.env.SERVICE_NAME;
  const target = options.target;
  if (!source || !target) throw new Error('Las llamadas internas requieren SERVICE_NAME y target');
  const credentialName = `${source.toUpperCase()}_TO_${target.toUpperCase()}_TOKEN`;
  const serviceToken = process.env[credentialName];
  if (!serviceToken) throw new Error(`Falta la credencial interna ${credentialName}`);
  let response;
  try {
    response = await fetch(new URL(route, baseUrl), {
      method: options.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-service-name': source,
        'x-service-token': serviceToken,
        ...(options.identity ? { 'x-verified-identity': options.identity } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeout || 3000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
    const unavailable = new Error('No fue posible conectar con el servicio interno');
    unavailable.name = 'ServiceUnavailableError';
    throw unavailable;
  }
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      const invalidResponse = new Error('El servicio interno respondió un formato no válido');
      invalidResponse.name = 'ServiceProtocolError';
      throw invalidResponse;
    }
  }
  return { status: response.status, body };
}

module.exports = {
  requireIdentity,
  requireRole,
  requireServiceToken,
  safeEqual,
  serviceRequest,
  signIdentity,
  verifyIdentity
};
