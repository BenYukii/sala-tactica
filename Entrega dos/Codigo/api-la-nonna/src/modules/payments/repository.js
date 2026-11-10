const database = require('../../infrastructure/database');

function findIdempotent(userId, orderId, idempotencyKey) {
  return database.get(
    `SELECT id, order_id, user_id, amount, currency, status, provider, provider_reference, created_at
     FROM payments WHERE idempotency_key = ? AND user_id = ? AND order_id = ?`,
    [idempotencyKey, userId, orderId]
  );
}

async function createSuccessfulPayment({ orderId, userId, amount, idempotencyKey, providerReference }) {
  return database.transaction(async (transaction) => {
    const previous = await transaction.get(
      'SELECT id, order_id, user_id, amount, currency, status, provider, provider_reference, created_at FROM payments WHERE idempotency_key = ?',
      [idempotencyKey]
    );
    if (previous) {
      if (previous.user_id !== userId || previous.order_id !== orderId) {
        return { conflict: 'La clave de idempotencia ya se utilizó para otra operación' };
      }
      return { payment: previous, replayed: true };
    }

    const order = await transaction.get('SELECT id, user_id, status, total FROM orders WHERE id = ?', [orderId]);
    if (!order) return { notFound: true };
    if (order.user_id !== userId) return { forbidden: true };
    if (order.status !== 'pending') return { invalidOrderState: order.status };
    if (Number(order.total) !== amount) {
      return { amountMismatch: true };
    }

    const paid = await transaction.get(
      "SELECT id FROM payments WHERE order_id = ? AND status = 'succeeded'",
      [orderId]
    );
    if (paid) return { alreadyPaid: true };

    const payment = await transaction.run(
      `INSERT INTO payments
       (order_id, user_id, amount, currency, status, provider, provider_reference, idempotency_key)
       VALUES (?, ?, ?, 'CLP', 'succeeded', 'webpay-simulated', ?, ?)`,
      [orderId, userId, amount, providerReference, idempotencyKey]
    );
    await transaction.run(
      "UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [orderId]
    );
    return {
      payment: await transaction.get(
        `SELECT id, order_id, user_id, amount, currency, status, provider, provider_reference, created_at
         FROM payments WHERE id = ?`,
        [payment.id]
      ),
      replayed: false
    };
  });
}

function findForUser(userId, role, id) {
  return database.get(
    `SELECT id, order_id, user_id, amount, currency, status, provider, provider_reference,
            created_at, updated_at
     FROM payments WHERE id = ?${role === 'admin' ? '' : ' AND user_id = ?'}`,
    role === 'admin' ? [id] : [id, userId]
  );
}

function listForUser(userId, role) {
  return database.all(
    `SELECT id, order_id, user_id, amount, currency, status, provider, provider_reference,
            created_at, updated_at
     FROM payments${role === 'admin' ? '' : ' WHERE user_id = ?'} ORDER BY id DESC LIMIT 50`,
    role === 'admin' ? [] : [userId]
  );
}

async function refundSuccessfulPayment(transaction, orderId) {
  const payment = await transaction.get(
    "SELECT id FROM payments WHERE order_id = ? AND status = 'succeeded'",
    [orderId]
  );
  if (!payment) return null;
  await transaction.run(
    "UPDATE payments SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [payment.id]
  );
  return payment.id;
}

module.exports = {
  createSuccessfulPayment,
  findIdempotent,
  findForUser,
  listForUser,
  refundSuccessfulPayment
};
