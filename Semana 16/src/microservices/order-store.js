const express = require('express');
const { requireServiceToken, serviceRequest } = require('./security');
const { audit } = require('./trace');

async function presentOrder(db, order) {
  return {
    id: order.id,
    user_id: order.user_id,
    status: order.status,
    total: order.total,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: await db.all(
      `SELECT product_id, quantity, unit_price, product_name AS nombre
       FROM order_items WHERE order_id = ? ORDER BY id`,
      [order.id]
    )
  };
}

function createOrderStore(db) {
  return {
    async create({ userId, lines, total, reference }) {
      return db.transaction(async (tx) => {
        if (await tx.get('SELECT reference FROM cancelled_order_creates WHERE reference = ?', [reference])) {
          throw new Error('Reserva de inventario cancelada');
        }
        const inserted = await tx.run(
          'INSERT INTO orders (user_id, status, total, inventory_reference) VALUES (?, ?, ?, ?)',
          [userId, 'pending', total, reference]
        );
        for (const item of lines) {
          await tx.run(
            `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_name)
             VALUES (?, ?, ?, ?, ?)`,
            [inserted.id, item.product_id, item.quantity, item.unit_price, item.product_name]
          );
        }
        return {
          id: inserted.id,
          user_id: userId,
          status: 'pending',
          total,
          items: lines.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            nombre: item.product_name
          }))
        };
      });
    },
    async resolveCreate({ reference }) {
      // Serializa la reconciliacion con cualquier creacion que siga en curso.
      return db.transaction(async (tx) => {
        const order = await tx.get('SELECT * FROM orders WHERE inventory_reference = ?', [reference]);
        if (order) return presentOrder(tx, order);
        await tx.run('INSERT OR IGNORE INTO cancelled_order_creates (reference) VALUES (?)', [reference]);
        return null;
      });
    },
    async list({ admin, userId, limit }) {
      const rows = await db.all(
        `SELECT * FROM orders ${admin ? '' : 'WHERE user_id = ?'}
         ORDER BY created_at DESC LIMIT ?`,
        admin ? [limit] : [userId, limit]
      );
      return Promise.all(rows.map((order) => presentOrder(db, order)));
    },
    async header({ id }) {
      return db.get('SELECT * FROM orders WHERE id = ?', [id]);
    },
    async find({ id }) {
      const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
      return order && presentOrder(db, order);
    },
    async changeStatus({ id, status }) {
      await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
      return { id };
    },
    async confirm({ id, userId, amount }) {
      return db.transaction(async (tx) => {
        const order = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
        if (!order) return { notFound: true };
        if (order.user_id !== userId) return { forbidden: true };
        if (Number(order.total) !== amount) return { amountMismatch: true };
        if (order.status === 'confirmed') return { replayed: true };
        if (order.status !== 'pending') return { conflict: true };
        await tx.run("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
        return { replayed: false };
      });
    }
  };
}

function persistenceApp(db) {
  const app = express();
  app.get('/health', async (_req, res, next) => {
    try {
      await db.get('SELECT 1');
      res.json({ service: 'persistence', status: 'ok' });
    } catch (error) { next(error); }
  });
  const store = createOrderStore(db);
  for (const [operation, execute] of Object.entries(store)) {
    app.post('/internal/orders/' + operation, requireServiceToken, async (req, res, next) => {
      try {
        const result = await execute(req.body);
        audit('sqlite_operacion_completada', { operation, database: 'orders.sqlite', orderId: result?.id });
        res.json(result);
      } catch (error) { next(error); }
    });
  }
  return app;
}

async function requestStore(operation, body) {
  const response = await serviceRequest(process.env.PERSISTENCE_SERVICE_URL || 'http://persistence:4108', '/internal/orders/' + operation, {
    target: 'persistence', method: 'POST', body
  });
  if (response.status !== 200) throw new Error('Persistencia rechazo la operacion ' + operation);
  return response.body;
}

module.exports = { persistenceApp, requestStore };
