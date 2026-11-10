const crypto = require('crypto');
const express = require('express');
const webpaySimulator = require('../modules/payments/webpaySimulator');
const {
  requireIdentity,
  requireRole,
  requireServiceToken,
  safeEqual,
  serviceRequest
} = require('./security');

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const jsonError = (res, status, error) => res.status(status).json({ error });
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://auth:4101',
  clients: process.env.CLIENTS_SERVICE_URL || 'http://clients:4102',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://inventory:4103',
  orders: process.env.ORDERS_SERVICE_URL || 'http://orders:4104',
  payments: process.env.PAYMENTS_SERVICE_URL || 'http://payments:4105',
  reservations: process.env.RESERVATIONS_SERVICE_URL || 'http://reservations:4106'
};

function installCommonRoutes(app, serviceName, db) {
  app.get('/health', asyncRoute(async (_req, res) => {
    await db.get('SELECT 1 AS available');
    res.json({ service: serviceName, status: 'ok', dependencies: { database: 'ok' } });
  }));
}

function createAuthApp(db) {
  const app = express();
  installCommonRoutes(app, 'auth', db);

  app.post('/api/login', asyncRoute(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = req.body?.password;
    if (!username || typeof password !== 'string' || !password) return jsonError(res, 400, 'Se requieren usuario y contraseña');
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return jsonError(res, 401, 'Credenciales incorrectas');
    const candidate = crypto.pbkdf2Sync(password, user.password_salt, 50000, 64, 'sha512');
    const expected = Buffer.from(user.password_hash, 'hex');
    if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
      return jsonError(res, 401, 'Credenciales incorrectas');
    }
    const session = await createSession(db, user);
    return res.json({
      access_token: session.token,
      token_type: 'bearer',
      expires_at: session.expires_at,
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name }
    });
  }));

  app.post('/internal/register', requireServiceToken, asyncRoute(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = req.body?.password;
    const fullName = String(req.body?.full_name || '').trim();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)
      || typeof password !== 'string' || password.length < 12 || password.length > 128
      || !fullName || fullName.length > 100) {
      return jsonError(res, 400, 'Los datos de registro no son válidos');
    }
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return jsonError(res, 409, 'Ese nombre de usuario ya está registrado');
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync(password, salt, 50000, 64, 'sha512').toString('hex');
    const account = await db.transaction(async (tx) => {
      if (await tx.get('SELECT id FROM users WHERE username = ?', [username])) return null;
      const inserted = await tx.run(
        `INSERT INTO users (username, password_hash, password_salt, role, full_name)
         VALUES (?, ?, ?, 'user', ?)`,
        [username, passwordHash, salt, fullName]
      );
      const user = { id: inserted.id, username, role: 'user', full_name: fullName };
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_SECONDS || 86400) * 1000).toISOString();
      await tx.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, expiresAt]);
      return { user, token, expires_at: expiresAt };
    });
    if (!account) return jsonError(res, 409, 'Ese nombre de usuario ya está registrado');
    res.status(201).json(account);
  }));

  app.post('/internal/introspect', requireServiceToken, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (!token) return res.json({ active: false });
    const session = await db.get(
      `SELECT s.token, s.user_id, s.expires_at, u.username, u.full_name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      [token]
    );
    if (!session) return res.json({ active: false });
    if (Date.parse(session.expires_at) <= Date.now()) {
      await db.run('DELETE FROM sessions WHERE token = ?', [token]);
      return res.json({ active: false });
    }
    res.json({
      active: true,
      user: {
        id: session.user_id,
        username: session.username,
        full_name: session.full_name,
        role: session.role,
        expires_at: session.expires_at
      }
    });
  }));

  app.post('/internal/revoke', requireServiceToken, asyncRoute(async (req, res) => {
    const token = String(req.body?.token || '');
    if (token) await db.run('DELETE FROM sessions WHERE token = ?', [token]);
    res.json({ revoked: Boolean(token) });
  }));

  app.post('/internal/delete-user', requireServiceToken, asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id);
    if (!Number.isInteger(userId) || userId < 1) return jsonError(res, 400, 'Identificador inválido');
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM sessions WHERE user_id = ?', [userId]);
      await tx.run("DELETE FROM users WHERE id = ? AND role = 'user'", [userId]);
    });
    res.json({ deleted: true });
  }));
  return app;
}

async function createSession(db, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_SECONDS || 86400) * 1000).toISOString();
  await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, user.id, expiresAt]);
  return { token, expires_at: expiresAt };
}

function createClientsApp(db) {
  const app = express();
  installCommonRoutes(app, 'clients', db);
  app.post('/api/clients/register', asyncRoute(async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const fullName = String(req.body?.full_name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim() || null;
    const password = req.body?.password;
    if (!/^[a-z0-9._-]{3,32}$/.test(username)
      || typeof password !== 'string' || password.length < 12 || password.length > 128
      || !fullName || fullName.length > 100
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || (phone && phone.length > 32)) {
      return jsonError(res, 400, 'Los datos del perfil no son válidos');
    }
    if (await db.get('SELECT id FROM clients WHERE email = ?', [email])) {
      return jsonError(res, 409, 'Ese correo ya está registrado');
    }
    const created = await serviceRequest(services.auth, '/internal/register', {
      target: 'auth',
      method: 'POST',
      body: { username, password, full_name: fullName }
    });
    if (created.status !== 201) return res.status(created.status).json(created.body || { error: 'No se pudo crear la identidad' });
    try {
      const client = await db.run(
        'INSERT INTO clients (user_id, username, full_name, email, phone) VALUES (?, ?, ?, ?, ?)',
        [created.body.user.id, username, fullName, email, phone]
      );
      return res.status(201).json({
        client: { id: client.id, user_id: created.body.user.id, email, phone },
        access_token: created.body.token,
        token_type: 'bearer',
        expires_at: created.body.expires_at,
        user: created.body.user
      });
    } catch (error) {
      await serviceRequest(services.auth, '/internal/delete-user', {
        target: 'auth',
        method: 'POST',
        body: { user_id: created.body.user.id }
      });
      if (error.code === 'SQLITE_CONSTRAINT') return jsonError(res, 409, 'Ese correo ya está registrado');
      throw error;
    }
  }));

  app.get('/api/clients/me', requireIdentity, asyncRoute(async (req, res) => {
    const client = await db.get(
      `SELECT id, user_id, username, full_name, email, phone, created_at, updated_at
       FROM clients WHERE user_id = ?`,
      [req.user.id]
    );
    return client ? res.json(client) : jsonError(res, 404, 'Perfil de cliente no encontrado');
  }));
  app.patch('/api/clients/me', requireIdentity, asyncRoute(async (req, res) => {
    const current = await db.get('SELECT * FROM clients WHERE user_id = ?', [req.user.id]);
    if (!current) return jsonError(res, 404, 'Perfil de cliente no encontrado');
    const fullName = String(req.body?.full_name ?? current.full_name).trim();
    const email = String(req.body?.email ?? current.email).trim().toLowerCase();
    const phone = String(req.body?.phone ?? current.phone ?? '').trim() || null;
    if (!fullName || fullName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || email.length > 254 || (phone && phone.length > 32)) {
      return jsonError(res, 400, 'Los datos del perfil no son válidos');
    }
    const duplicate = await db.get('SELECT id FROM clients WHERE email = ? AND user_id != ?', [email, req.user.id]);
    if (duplicate) return jsonError(res, 409, 'Ese correo ya está registrado');
    await db.run(
      `UPDATE clients SET full_name = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [fullName, email, phone, req.user.id]
    );
    return res.json(await db.get(
      `SELECT id, user_id, username, full_name, email, phone, created_at, updated_at
       FROM clients WHERE user_id = ?`,
      [req.user.id]
    ));
  }));
  return app;
}

function createInventoryApp(db) {
  const app = express();
  installCommonRoutes(app, 'inventory', db);
  app.get('/api/productos', asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const category = String(req.query.categoria || '');
    const rows = await db.all(
      `SELECT id, nombre, descripcion, precio, categoria, stock
       FROM products WHERE (? = '' OR categoria = ?) ORDER BY id LIMIT ?`,
      [category, category, limit]
    );
    res.json(rows);
  }));
  app.get('/api/productos/:id', asyncRoute(async (req, res) => {
    const product = await db.get(
      'SELECT id, nombre, descripcion, precio, categoria, stock FROM products WHERE id = ?',
      [Number(req.params.id)]
    );
    return product ? res.json(product) : jsonError(res, 404, 'Producto no encontrado');
  }));
  app.get('/internal/products', requireServiceToken, asyncRoute(async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length > 50) return jsonError(res, 400, 'Máximo 50 productos por consulta');
    if (!ids.length) return res.json(await db.all('SELECT id, nombre, precio, stock FROM products ORDER BY id'));
    const placeholders = ids.map(() => '?').join(', ');
    res.json(await db.all(
      `SELECT id, nombre, precio, stock FROM products WHERE id IN (${placeholders})`,
      ids
    ));
  }));
  app.post('/internal/stock-reservations', requireServiceToken, asyncRoute(async (req, res) => {
    const reference = String(req.body?.reference || '');
    const items = req.body?.items;
    const actorUserId = Number(req.body?.actor_user_id);
    if (!/^[a-f0-9-]{36}$/i.test(reference) || !Array.isArray(items) || !items.length
      || items.length > 50 || !Number.isInteger(actorUserId)) {
      return jsonError(res, 400, 'Datos de reserva de inventario no válidos');
    }
    const normalized = normalizeItems(items);
    if (!normalized) return jsonError(res, 400, 'Los productos o cantidades no son válidos');
    const result = await db.transaction(async (tx) => {
      const existing = await tx.get(
        'SELECT status, items_json, products_json FROM stock_reservations WHERE reference = ?',
        [reference]
      );
      if (existing) {
        if (existing.status !== 'reserved' || existing.items_json !== JSON.stringify(normalized)) return { conflict: true };
        return { replayed: true, products: JSON.parse(existing.products_json) };
      }
      const productsSnapshot = [];
      for (const item of normalized) {
        const product = await tx.get('SELECT id, nombre, precio, stock FROM products WHERE id = ?', [item.product_id]);
        if (!product) return { missing: item.product_id };
        if (product.stock < item.quantity) return { insufficient: product.nombre };
        productsSnapshot.push({
          product_id: product.id,
          nombre: product.nombre,
          precio: Number(product.precio),
          quantity: item.quantity
        });
      }
      for (const item of normalized) {
        const updated = await tx.run(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [item.quantity, item.product_id, item.quantity]
        );
        if (updated.changes !== 1) throw new Error('El inventario cambió durante la reserva');
      }
      await tx.run(
        `INSERT INTO stock_reservations (reference, items_json, products_json, actor_user_id, status)
         VALUES (?, ?, ?, ?, 'reserved')`,
        [reference, JSON.stringify(normalized), JSON.stringify(productsSnapshot), actorUserId]
      );
      for (const item of normalized) {
        await tx.run(
          `INSERT INTO inventory_movements (product_id, actor_user_id, quantity_delta, reason)
           VALUES (?, ?, ?, 'order_created')`,
          [item.product_id, actorUserId, -item.quantity]
        );
      }
      return { replayed: false, products: productsSnapshot };
    });
    if (result.missing) return jsonError(res, 404, `Producto ${result.missing} no encontrado`);
    if (result.insufficient) return jsonError(res, 409, `No hay stock suficiente para ${result.insufficient}`);
    if (result.conflict) return jsonError(res, 409, 'La referencia de reserva ya fue utilizada');
    res.status(result.replayed ? 200 : 201).json({
      reserved: true,
      idempotent_replay: result.replayed,
      products: result.products
    });
  }));
  app.post('/internal/stock-releases', requireServiceToken, asyncRoute(async (req, res) => {
    const reference = String(req.body?.reference || '');
    const result = await db.transaction(async (tx) => {
      const reservation = await tx.get('SELECT * FROM stock_reservations WHERE reference = ?', [reference]);
      if (!reservation) return { notFound: true };
      if (reservation.status === 'released') return { replayed: true };
      const items = JSON.parse(reservation.items_json);
      for (const item of items) {
        await tx.run('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
        await tx.run(
          `INSERT INTO inventory_movements (product_id, actor_user_id, quantity_delta, reason)
           VALUES (?, ?, ?, 'order_cancelled')`,
          [item.product_id, reservation.actor_user_id, item.quantity]
        );
      }
      await tx.run(
        `UPDATE stock_reservations SET status = 'released', updated_at = CURRENT_TIMESTAMP
         WHERE reference = ?`,
        [reference]
      );
      return { replayed: false };
    });
    if (result.notFound) return jsonError(res, 404, 'Reserva de inventario no encontrada');
    res.json({ released: true, idempotent_replay: result.replayed });
  }));
  app.get('/api/inventory/movements', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    res.json(await db.all(
      'SELECT id, product_id, actor_user_id, quantity_delta, reason, created_at FROM inventory_movements ORDER BY id DESC LIMIT ?',
      [limit]
    ));
  }));
  app.post('/api/inventory/products', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const product = validateProduct(req.body);
    if (!product) return jsonError(res, 400, 'Datos de producto no válidos');
    const inserted = await db.run(
      `INSERT INTO products (nombre, descripcion, precio, categoria, stock)
       VALUES (?, ?, ?, ?, ?)`,
      [product.nombre, product.descripcion, product.precio, product.categoria, product.stock]
    );
    res.status(201).json({ id: inserted.id, ...product });
  }));
  app.patch('/api/inventory/products/:id', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const current = await db.get('SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);
    if (!current) return jsonError(res, 404, 'Producto no encontrado');
    const product = validateProduct({ ...current, ...req.body, stock: current.stock });
    if (!product) return jsonError(res, 400, 'Datos de producto no válidos');
    await db.run(
      `UPDATE products SET nombre = ?, descripcion = ?, precio = ?, categoria = ? WHERE id = ?`,
      [product.nombre, product.descripcion, product.precio, product.categoria, Number(req.params.id)]
    );
    res.json({ id: Number(req.params.id), ...product, stock: current.stock });
  }));
  app.post('/api/inventory/products/:id/stock', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const delta = Number(req.body?.quantity_delta);
    const reason = String(req.body?.reason || '').trim();
    if (!Number.isInteger(delta) || delta === 0 || !reason || reason.length > 120) {
      return jsonError(res, 400, 'El ajuste de stock no es válido');
    }
    const result = await db.transaction(async (tx) => {
      const product = await tx.get('SELECT id, stock FROM products WHERE id = ?', [id]);
      if (!product) return { notFound: true };
      const update = await tx.run(
        'UPDATE products SET stock = stock + ? WHERE id = ? AND stock + ? >= 0',
        [delta, id, delta]
      );
      if (!update.changes) return { insufficient: true };
      await tx.run(
        `INSERT INTO inventory_movements (product_id, actor_user_id, quantity_delta, reason)
         VALUES (?, ?, ?, ?)`,
        [id, req.user.id, delta, reason]
      );
      return { stock: product.stock + delta };
    });
    if (result.notFound) return jsonError(res, 404, 'Producto no encontrado');
    if (result.insufficient) return jsonError(res, 409, 'El ajuste dejaría el inventario bajo cero');
    res.status(201).json({ product_id: id, quantity_delta: delta, stock: result.stock });
  }));
  return app;
}

function createOrdersApp(db) {
  const app = express();
  installCommonRoutes(app, 'orders', db);
  app.post('/api/orders', requireIdentity, asyncRoute(async (req, res) => {
    const normalized = normalizeItems(req.body?.items);
    if (!normalized) return jsonError(res, 400, 'Los artículos del pedido no son válidos');
    const reference = crypto.randomUUID();
    let reservation;
    try {
      reservation = await serviceRequest(services.inventory, '/internal/stock-reservations', {
        target: 'inventory',
        method: 'POST',
        body: { reference, items: normalized, actor_user_id: req.user.id }
      });
    } catch (error) {
      try {
        const compensation = await serviceRequest(services.inventory, '/internal/stock-releases', {
          target: 'inventory',
          method: 'POST',
          body: { reference }
        });
        if (![200, 404].includes(compensation.status)) {
          console.error('No se pudo compensar la reserva de inventario', reference, compensation.status);
        }
      } catch (compensationError) {
        console.error('Falló la compensación de inventario', reference, compensationError.message);
      }
      throw error;
    }
    if (![200, 201].includes(reservation.status)) return res.status(reservation.status).json(reservation.body);
    const lines = reservation.body.products.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      product_name: item.nombre,
      unit_price: Number(item.precio)
    }));
    const total = Number(lines.reduce((sum, item) => sum + item.unit_price * item.quantity, 0).toFixed(2));
    try {
      const order = await db.transaction(async (tx) => {
        const inserted = await tx.run(
          'INSERT INTO orders (user_id, status, total, inventory_reference) VALUES (?, ?, ?, ?)',
          [req.user.id, 'pending', total, reference]
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
          user_id: req.user.id,
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
      return res.status(201).json({ message: 'Pedido creado', order });
    } catch (error) {
      const release = await serviceRequest(services.inventory, '/internal/stock-releases', {
        target: 'inventory',
        method: 'POST',
        body: { reference }
      });
      if (release.status !== 200) console.error('No se pudo compensar la reserva de inventario', reference, release.status);
      throw error;
    }
  }));

  app.get('/api/orders', requireIdentity, asyncRoute(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const rows = await db.all(
      `SELECT * FROM orders ${req.user.role === 'admin' ? '' : 'WHERE user_id = ?'}
       ORDER BY created_at DESC LIMIT ?`,
      req.user.role === 'admin' ? [limit] : [req.user.id, limit]
    );
    res.json(await Promise.all(rows.map((order) => presentOrder(db, order))));
  }));
  app.get('/api/orders/:id', requireIdentity, asyncRoute(async (req, res) => {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [Number(req.params.id)]);
    if (!order) return jsonError(res, 404, 'Pedido no encontrado');
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) return jsonError(res, 403, 'No tienes permiso para consultar este pedido');
    res.json(await presentOrder(db, order));
  }));
  app.patch('/api/orders/:id/status', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim();
    const allowed = {
      pending: ['cancelled'],
      confirmed: ['preparing', 'cancelled'],
      preparing: ['ready', 'cancelled'],
      ready: ['completed'],
      cancelled: [],
      completed: []
    };
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) return jsonError(res, 404, 'Pedido no encontrado');
    if (!allowed[order.status]?.includes(status)) {
      return res.status(409).json({ error: `No se puede cambiar el pedido de ${order.status} al estado solicitado` });
    }
    if (status === 'cancelled') {
      const released = await serviceRequest(services.inventory, '/internal/stock-releases', {
        target: 'inventory',
        method: 'POST',
        body: { reference: order.inventory_reference }
      });
      if (released.status !== 200) return res.status(503).json({ error: 'No se pudo liberar el inventario del pedido' });
      const paymentUpdate = await serviceRequest(services.payments, `/internal/orders/${id}/cancel-payment`, {
        target: 'payments',
        method: 'POST'
      });
      if (paymentUpdate.status !== 200) return res.status(503).json({ error: 'No se pudo actualizar el estado del pago del pedido' });
    }
    await db.run('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, id]);
    res.json({ message: 'Estado del pedido actualizado', order_id: id, status });
  }));
  app.get('/internal/orders/:id', requireServiceToken, asyncRoute(async (req, res) => {
    const order = await db.get('SELECT * FROM orders WHERE id = ?', [Number(req.params.id)]);
    if (!order) return jsonError(res, 404, 'Pedido no encontrado');
    res.json(await presentOrder(db, order));
  }));
  app.post('/internal/orders/:id/confirm-payment', requireServiceToken, asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const userId = Number(req.body?.user_id);
    const amount = Number(req.body?.amount);
    const result = await db.transaction(async (tx) => {
      const order = await tx.get('SELECT * FROM orders WHERE id = ?', [id]);
      if (!order) return { notFound: true };
      if (order.user_id !== userId) return { forbidden: true };
      if (Number(order.total) !== amount) return { amountMismatch: true };
      if (order.status === 'confirmed') return { replayed: true };
      if (order.status !== 'pending') return { conflict: true };
      await tx.run("UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);
      return { replayed: false };
    });
    if (result.notFound) return jsonError(res, 404, 'Pedido no encontrado');
    if (result.forbidden) return jsonError(res, 403, 'El pedido pertenece a otro cliente');
    if (result.amountMismatch) return jsonError(res, 409, 'El monto no coincide con el pedido');
    if (result.conflict) return jsonError(res, 409, 'El pedido no admite confirmación de pago');
    res.json({ confirmed: true, idempotent_replay: result.replayed });
  }));
  return app;
}

function createPaymentsApp(db) {
  const app = express();
  installCommonRoutes(app, 'payments', db);
  app.post('/api/payments', requireIdentity, asyncRoute(async (req, res) => {
    const orderId = Number(req.body?.order_id);
    const key = String(req.get('idempotency-key') || '');
    if (!Number.isInteger(orderId) || orderId < 1) return jsonError(res, 400, 'Pedido no válido');
    if (key.length < 8 || key.length > 128) return jsonError(res, 400, 'Idempotency-Key debe tener entre 8 y 128 caracteres');
    const orderResult = await serviceRequest(services.orders, `/internal/orders/${orderId}`, { target: 'orders' });
    if (orderResult.status === 404) return jsonError(res, 404, 'Pedido no encontrado');
    if (orderResult.status !== 200) return jsonError(res, 503, 'No se pudo validar el pedido');
    const order = orderResult.body;
    if (order.user_id !== req.user.id) return jsonError(res, 403, 'No puedes pagar un pedido de otro cliente');

    const creation = await db.transaction(async (tx) => {
      const previous = await tx.get('SELECT * FROM payments WHERE idempotency_key = ?', [key]);
      if (previous) {
        if (previous.user_id !== req.user.id || previous.order_id !== orderId) return { conflict: true };
        return { payment: previous, replayed: true };
      }
      if (order.status !== 'pending') return { invalidOrderState: order.status };
      const active = await tx.get(
        "SELECT id FROM payments WHERE order_id = ? AND status IN ('pending', 'succeeded')",
        [orderId]
      );
      if (active) return { inProgress: true };
      const simulatedCharge = await webpaySimulator.charge({ amount: Number(order.total) });
      if (!simulatedCharge.approved) return { declined: true };
      const inserted = await tx.run(
        `INSERT INTO payments (order_id, user_id, amount, status, provider_reference, idempotency_key)
         VALUES (?, ?, ?, 'pending', ?, ?)`,
        [orderId, req.user.id, Number(order.total), simulatedCharge.provider_reference, key]
      );
      return {
        payment: await tx.get('SELECT * FROM payments WHERE id = ?', [inserted.id]),
        replayed: false
      };
    });
    if (creation.conflict) return jsonError(res, 409, 'La clave de idempotencia ya se utilizó para otra operación');
    if (creation.invalidOrderState) {
      return res.status(409).json({ error: `El pedido no admite pago en estado ${creation.invalidOrderState}` });
    }
    if (creation.inProgress) return jsonError(res, 409, 'El pedido ya tiene un pago en curso o aprobado');
    if (creation.declined) return res.status(402).json({ error: 'El pago de prueba fue rechazado' });
    let payment = creation.payment;
    const replayed = creation.replayed;
    if (payment && payment.status === 'succeeded') {
      const pendingEvent = await db.get(
        `SELECT event_id FROM webhook_events WHERE payment_id = ? AND status = 'pending'`,
        [payment.id]
      );
      if (pendingEvent) {
        const callback = await deliverSimulatedWebhook(payment);
        if (!callback.ok) return res.status(503).json({ error: 'El aviso firmado del proveedor no pudo procesarse; reintenta con la misma Idempotency-Key' });
        payment = await db.get('SELECT * FROM payments WHERE id = ?', [payment.id]);
      }
      return res.json({ payment: presentPayment(payment), idempotent_replay: true });
    }
    if (payment && payment.status === 'failed') {
      return res.status(402).json({ error: 'El pago de prueba fue rechazado' });
    }
    if (payment && payment.status === 'refunded') {
      return jsonError(res, 409, 'El pago ya fue reembolsado');
    }
    const callback = await deliverSimulatedWebhook(payment);
    if (!callback.ok) return res.status(503).json({ error: 'El aviso firmado del proveedor no pudo procesarse; reintenta con la misma Idempotency-Key' });
    payment = await db.get('SELECT * FROM payments WHERE id = ?', [payment.id]);
    return res.status(replayed ? 200 : 201).json({
      payment: presentPayment(payment),
      idempotent_replay: replayed
    });
  }));

  app.post('/api/payments/webhooks/webpay', asyncRoute(async (req, res) => {
    const secret = process.env.WEBPAY_WEBHOOK_SECRET;
    const timestamp = req.get('x-webpay-timestamp') || '';
    const signature = req.get('x-webpay-signature') || '';
    const timestampNumber = Number(timestamp);
    if (!secret || !Number.isInteger(timestampNumber)
      || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
      return jsonError(res, 401, 'Firma o fecha del webhook inválida');
    }
    const rawBody = req.rawBody || Buffer.alloc(0);
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const expected = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
    if (!safeEqual(signature, expected)) return jsonError(res, 401, 'Firma o fecha del webhook inválida');
    const event = req.body;
    if (!event || typeof event.event_id !== 'string' || !event.event_id
      || !Number.isInteger(Number(event.payment_id)) || !['approved', 'declined'].includes(event.result)) {
      return jsonError(res, 400, 'Aviso de pago no válido');
    }
    const paymentId = Number(event.payment_id);
    const stored = await db.transaction(async (tx) => {
      const previous = await tx.get('SELECT * FROM webhook_events WHERE event_id = ?', [event.event_id]);
      if (previous && (previous.payment_id !== paymentId || !safeEqual(previous.payload_hash, payloadHash))) {
        return { conflict: true };
      }
      const payment = await tx.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
      if (!payment) return { notFound: true };
      if (event.provider_reference !== payment.provider_reference || Number(event.amount) !== Number(payment.amount)) {
        return { conflict: true };
      }
      if (!previous) {
        await tx.run(
          `INSERT INTO webhook_events (event_id, payment_id, payload_hash, status)
           VALUES (?, ?, ?, 'pending')`,
          [event.event_id, paymentId, payloadHash]
        );
        if (payment.status === 'pending') {
          await tx.run(
            `UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [event.result === 'approved' ? 'succeeded' : 'failed', paymentId]
          );
        }
      }
      return { payment, processed: previous?.status === 'processed', paymentStatus: payment.status };
    });
    if (stored.conflict) return jsonError(res, 409, 'El identificador del evento ya fue utilizado');
    if (stored.notFound) return jsonError(res, 404, 'Pago no encontrado');
    if (stored.processed) return res.json({ received: true, duplicate: true });

    const payment = await db.get('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (event.result === 'approved' && payment.status === 'succeeded') {
      const confirmed = await serviceRequest(services.orders, `/internal/orders/${payment.order_id}/confirm-payment`, {
        target: 'orders',
        method: 'POST',
        body: { user_id: payment.user_id, amount: payment.amount }
      });
      if (![200].includes(confirmed.status)) {
        return res.status(503).json({ error: 'El pago se registró, pero el pedido no pudo confirmarse; reintenta el webhook' });
      }
    }
    await db.run(
      `UPDATE webhook_events SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE event_id = ?`,
      [event.event_id]
    );
    res.json({ received: true, duplicate: false });
  }));
  app.get('/api/payments', requireIdentity, asyncRoute(async (req, res) => {
    const rows = await db.all(
      `SELECT * FROM payments ${req.user.role === 'admin' ? '' : 'WHERE user_id = ?'}
       ORDER BY id DESC LIMIT 50`,
      req.user.role === 'admin' ? [] : [req.user.id]
    );
    res.json(rows.map(presentPayment));
  }));
  app.get('/api/payments/:id', requireIdentity, asyncRoute(async (req, res) => {
    const payment = await db.get('SELECT * FROM payments WHERE id = ?', [Number(req.params.id)]);
    if (!payment || (req.user.role !== 'admin' && payment.user_id !== req.user.id)) {
      return jsonError(res, 404, 'Pago no encontrado');
    }
    res.json(presentPayment(payment));
  }));
  app.post('/internal/orders/:id/cancel-payment', requireServiceToken, asyncRoute(async (req, res) => {
    await db.run(
      `UPDATE payments SET status = 'refunded', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ? AND status = 'succeeded'`,
      [Number(req.params.id)]
    );
    res.json({ updated: true });
  }));
  return app;
}

async function deliverSimulatedWebhook(payment) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const event = JSON.stringify({
    event_id: `webpay_event_${payment.id}`,
    payment_id: payment.id,
    provider_reference: payment.provider_reference,
    amount: Number(payment.amount),
    result: 'approved'
  });
  const signature = crypto.createHmac('sha256', process.env.WEBPAY_WEBHOOK_SECRET || '')
    .update(`${timestamp}.${event}`).digest('hex');
  const baseUrl = process.env.PAYMENTS_PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 4105}`;
  let response;
  try {
    response = await fetch(new URL('/api/payments/webhooks/webpay', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webpay-timestamp': timestamp,
        'x-webpay-signature': signature
      },
      body: event,
      signal: AbortSignal.timeout(3000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError' || error.name === 'TypeError') {
      return { ok: false };
    }
    throw error;
  }
  return { ok: response.ok };
}

function createReservationsApp(db) {
  const app = express();
  installCommonRoutes(app, 'reservations', db);
  app.post('/api/reservas', asyncRoute(async (req, res) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const people = Number(req.body?.people);
    const datetime = String(req.body?.datetime || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !Number.isInteger(people) || people < 1 || people > 20 || !Number.isFinite(Date.parse(datetime))
      || notes.length > 500) {
      return jsonError(res, 400, 'Datos de reserva no válidos');
    }
    const inserted = await db.run(
      `INSERT INTO reservations (user_id, name, email, people, datetime, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user?.id || null, name, email, people, new Date(datetime).toISOString(), notes || null]
    );
    res.status(201).json({ id: inserted.id, name, email, people, datetime, notes: notes || null, status: 'recibida' });
  }));
  app.get('/api/reservas', requireIdentity, requireRole('admin'), asyncRoute(async (_req, res) => {
    res.json(await db.all('SELECT * FROM reservations ORDER BY created_at DESC LIMIT 100'));
  }));
  app.patch('/api/reservas/:id/status', requireIdentity, requireRole('admin'), asyncRoute(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!['recibida', 'confirmada', 'cancelada', 'completada'].includes(status)) {
      return jsonError(res, 400, 'Estado de reserva no válido');
    }
    const update = await db.run('UPDATE reservations SET status = ? WHERE id = ?', [status, Number(req.params.id)]);
    return update.changes ? res.json({ id: Number(req.params.id), status }) : jsonError(res, 404, 'Reserva no encontrada');
  }));
  return app;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) return null;
  const merged = new Map();
  for (const item of items) {
    const productId = Number(item?.product_id);
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) return null;
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  if ([...merged.values()].some((quantity) => quantity > 50)) return null;
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }));
}

function validateProduct(input) {
  const nombre = String(input?.nombre || '').trim();
  const descripcion = String(input?.descripcion || '').trim();
  const categoria = String(input?.categoria || '').trim();
  const precio = Number(input?.precio);
  const stock = Number(input?.stock);
  if (!nombre || nombre.length > 120 || descripcion.length > 1000 || !categoria || categoria.length > 80
    || !Number.isFinite(precio) || precio <= 0 || !Number.isInteger(stock) || stock < 0) return null;
  return { nombre, descripcion, categoria, precio, stock };
}

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

function presentPayment(payment) {
  return {
    id: payment.id,
    order_id: payment.order_id,
    user_id: payment.user_id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    provider_reference: payment.provider_reference,
    created_at: payment.created_at,
    updated_at: payment.updated_at
  };
}

function createServiceApp(serviceName, db) {
  const factories = {
    auth: createAuthApp,
    clients: createClientsApp,
    inventory: createInventoryApp,
    orders: createOrdersApp,
    payments: createPaymentsApp,
    reservations: createReservationsApp
  };
  if (!factories[serviceName]) throw new Error(`Servicio desconocido: ${serviceName}`);
  const app = express();
  app.use(express.json({
    limit: '100kb',
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); }
  }));
  const serviceApp = factories[serviceName](db);
  app.use(serviceApp);
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'El cuerpo JSON no es válido' });
    }
    console.error(`[${serviceName}] Error de solicitud`, error.message);
    if (res.headersSent) return;
    const status = error.name === 'TimeoutError' || error.name === 'AbortError' ? 504
      : error.name === 'ServiceProtocolError' ? 502
        : error.name === 'ServiceUnavailableError' ? 503 : 500;
    res.status(status).json({
      error: status === 504 ? 'Tiempo de espera agotado al consultar un servicio interno'
        : status === 502 ? 'Respuesta no válida de un servicio interno'
          : status === 503 ? 'El servicio interno no está disponible'
            : 'Ocurrió un error interno'
    });
  });
  return app;
}

module.exports = { createServiceApp };
