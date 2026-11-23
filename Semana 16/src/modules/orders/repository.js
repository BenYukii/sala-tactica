const database = require('../../infrastructure/database');

function appendLimit(sql, limit) {
  return Number.isInteger(limit) ? `${sql} LIMIT ?` : sql;
}

function findOrdersForAdmin(limit) {
  const sql = appendLimit(`
    SELECT o.*, u.username, u.full_name
    FROM orders o
    JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `, limit);
  return database.all(sql, Number.isInteger(limit) ? [limit] : []);
}

function findOrdersForUser(userId, limit) {
  const sql = appendLimit(
    'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    limit
  );
  return database.all(sql, Number.isInteger(limit) ? [userId, limit] : [userId]);
}

function findById(id) {
  return database.get('SELECT * FROM orders WHERE id = ?', [id]);
}

function findItems(orderId) {
  return database.all(
    `SELECT product_id, quantity, unit_price, product_name AS nombre
     FROM order_items WHERE order_id = ?`,
    [orderId]
  );
}

function findItemsForOrders(orderIds) {
  if (!orderIds.length) return Promise.resolve([]);
  const placeholders = orderIds.map(() => '?').join(', ');
  return database.all(
    `SELECT order_id, product_id, product_name AS nombre, quantity, unit_price
     FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`,
    orderIds
  );
}

function createOrderTransaction(userId, items) {
  return database.transaction(async (transaction) => {
    const products = [];
    for (const item of items) {
      const product = await transaction.get(
        'SELECT id, nombre, precio, stock FROM products WHERE id = ?',
        [item.productId]
      );
      if (!product) {
        return { error: `Producto ${item.productId} no encontrado`, status: 404 };
      }
      if (product.stock < item.quantity) {
        return { error: `No hay stock suficiente para ${product.nombre}`, status: 409 };
      }
      products.push({ ...item, unitPrice: Number(product.precio), productName: product.nombre });
    }

    const total = Number(products.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0
    ).toFixed(2));
    const order = await transaction.run(
      'INSERT INTO orders (user_id, status, total) VALUES (?, ?, ?)',
      [userId, 'pending', total]
    );

    for (const item of products) {
      await transaction.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, product_name)
         VALUES (?, ?, ?, ?, ?)`,
        [order.id, item.productId, item.quantity, item.unitPrice, item.productName]
      );
      const stockUpdate = await transaction.run(
        'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
        [item.quantity, item.productId, item.quantity]
      );
      if (stockUpdate.changes !== 1) {
        throw new Error(`El stock del producto ${item.productId} cambió durante la operación`);
      }
      await transaction.run(
        `INSERT INTO inventory_movements
         (product_id, actor_user_id, quantity_delta, reason)
         VALUES (?, ?, ?, 'order_created')`,
        [item.productId, userId, -item.quantity]
      );
    }

    return {
      id: order.id,
      user_id: userId,
      status: 'pending',
      total,
      items: products.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        nombre: item.productName
      }))
    };
  });
}

function updateOrderStatusTransaction(id, status) {
  return database.transaction(async (transaction) => {
    const order = await transaction.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return { notFound: true };

    const allowedTransitions = {
      pending: ['cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['completed'],
      cancelled: [],
      completed: []
    };

    if (!allowedTransitions[order.status]?.includes(status)) {
      return { invalidTransition: true, currentStatus: order.status };
    }

    if (status === 'cancelled') {
      await transaction.run(
        `UPDATE payments
         SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = ? AND status = 'succeeded'`,
        [order.id]
      );
      const items = await transaction.all(
        `SELECT product_id, SUM(quantity) AS quantity
         FROM order_items WHERE order_id = ? GROUP BY product_id`,
        [order.id]
      );
      for (const item of items) {
        await transaction.run(
          'UPDATE products SET stock = stock + ? WHERE id = ?',
          [item.quantity, item.product_id]
        );
        await transaction.run(
          `INSERT INTO inventory_movements
           (product_id, actor_user_id, quantity_delta, reason)
           VALUES (?, ?, ?, 'order_cancelled')`,
          [item.product_id, order.user_id, item.quantity]
        );
      }
    }

    await transaction.run(
      'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, order.id]
    );
    return { orderId: order.id, status };
  });
}

module.exports = {
  createOrderTransaction,
  findById,
  findItems,
  findItemsForOrders,
  findOrdersForAdmin,
  findOrdersForUser,
  updateOrderStatusTransaction
};
