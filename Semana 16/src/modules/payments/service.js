const ordersService = require('../orders/service');
const repository = require('./repository');
const webpaySimulator = require('./webpaySimulator');

async function create(user, orderIdInput, idempotencyKeyInput) {
  const orderId = Number(orderIdInput);
  const idempotencyKey = String(idempotencyKeyInput || '').trim();
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return { error: 'Id de pedido no valido' };
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return { error: 'Se requiere una clave Idempotency-Key de 8 a 128 caracteres' };
  }

  const result = await ordersService.get(user, orderId);
  if (result.notFound) return { notFound: true };
  if (result.forbidden || result.order.user_id !== user.id) return { forbidden: true };
  const previous = await repository.findIdempotent(user.id, orderId, idempotencyKey);
  if (previous) return { payment: previous, replayed: true };
  if (result.order.status !== 'pending') return { invalidOrderState: result.order.status };

  const charge = await webpaySimulator.charge({ amount: Number(result.order.total) });
  if (!charge.approved) return { declined: true };
  const payment = await repository.createSuccessfulPayment({
    orderId,
    userId: user.id,
    amount: Number(result.order.total),
    idempotencyKey,
    providerReference: charge.provider_reference
  });
  return payment;
}

function list(user) {
  return repository.listForUser(user.id, user.role);
}

async function get(user, idInput) {
  const id = Number(idInput);
  if (!Number.isSafeInteger(id) || id <= 0) return { error: 'Id de pago no valido' };
  const payment = await repository.findForUser(user.id, user.role, id);
  if (!payment) return { notFound: true };
  return { payment };
}

module.exports = { create, get, list };
