const database = require('../../infrastructure/database');

async function createProduct(adminUserId, product) {
  return database.transaction(async (transaction) => {
    const result = await transaction.run(
      `INSERT INTO products (nombre, descripcion, precio, categoria, stock)
       VALUES (?, ?, ?, ?, ?)`,
      [product.nombre, product.descripcion, product.precio, product.categoria, product.stock]
    );
    if (product.stock > 0) {
      await transaction.run(
        `INSERT INTO inventory_movements
         (product_id, actor_user_id, quantity_delta, reason)
         VALUES (?, ?, ?, ?)`,
        [result.id, adminUserId, product.stock, 'initial_stock']
      );
    }
    return transaction.get('SELECT * FROM products WHERE id = ?', [result.id]);
  });
}

function updateProduct(id, product) {
  return database.run(
    `UPDATE products
     SET nombre = ?, descripcion = ?, precio = ?, categoria = ?
     WHERE id = ?`,
    [product.nombre, product.descripcion, product.precio, product.categoria, id]
  );
}

async function adjustStock(adminUserId, productId, quantityDelta, reason) {
  return database.transaction(async (transaction) => {
    const product = await transaction.get(
      'SELECT id, stock FROM products WHERE id = ?',
      [productId]
    );
    if (!product) return { notFound: true };
    if (product.stock + quantityDelta < 0) return { insufficientStock: true };

    await transaction.run(
      'UPDATE products SET stock = stock + ? WHERE id = ?',
      [quantityDelta, productId]
    );
    const movement = await transaction.run(
      `INSERT INTO inventory_movements
       (product_id, actor_user_id, quantity_delta, reason)
       VALUES (?, ?, ?, ?)`,
      [productId, adminUserId, quantityDelta, reason]
    );
    return { movement_id: movement.id, product_id: productId, stock: product.stock + quantityDelta };
  });
}

function listMovements(limit) {
  return database.all(
    `SELECT m.id, m.product_id, p.nombre AS product_name, m.actor_user_id,
            u.username AS actor_username, m.quantity_delta, m.reason, m.created_at
     FROM inventory_movements m
     JOIN products p ON p.id = m.product_id
     JOIN users u ON u.id = m.actor_user_id
     ORDER BY m.id DESC LIMIT ?`,
    [limit]
  );
}

module.exports = { adjustStock, createProduct, listMovements, updateProduct };
