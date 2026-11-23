const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const context = new AsyncLocalStorage();

function trace(req, res, next) {
  const incoming = req.get('x-request-id') || '';
  const id = process.env.SERVICE_NAME !== 'gateway' && /^[a-f0-9-]{36}$/i.test(incoming)
    ? incoming : randomUUID();
  res.set('X-Request-ID', id);
  context.run(id, next);
}

function traceHeaders() {
  const id = context.getStore();
  return id ? { 'x-request-id': id } : {};
}

function audit(event, details = {}) {
  console.log(JSON.stringify({ requestId: context.getStore(), service: process.env.SERVICE_NAME, event, ...details }));
}

module.exports = { trace, traceHeaders, audit };
