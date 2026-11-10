const crypto = require('crypto');

async function charge({ amount }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('El adaptador de prueba recibió un monto inválido');
  }
  return {
    approved: true,
    provider_reference: `webpay_sim_${crypto.randomUUID()}`
  };
}

module.exports = { charge };
