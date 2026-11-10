const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const products = require('../../data/productos');

const schemas = {
  auth: [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      full_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`
  ],
  clients: [
    `CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      username TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ],
  inventory: [
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      precio REAL NOT NULL,
      categoria TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      actor_user_id INTEGER,
      quantity_delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stock_reservations (
      reference TEXT PRIMARY KEY,
      items_json TEXT NOT NULL,
      products_json TEXT NOT NULL,
      actor_user_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('reserved', 'released')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ],
  orders: [
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      total REAL NOT NULL,
      inventory_reference TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      product_name TEXT NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    )`
  ],
  payments: [
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CLP',
      status TEXT NOT NULL DEFAULT 'pending',
      provider TEXT NOT NULL DEFAULT 'webpay-simulated',
      provider_reference TEXT NOT NULL UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS webhook_events (
      event_id TEXT PRIMARY KEY,
      payment_id INTEGER NOT NULL,
      payload_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending', 'processed')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_active_per_order
     ON payments(order_id) WHERE status IN ('pending', 'succeeded')`
  ],
  reservations: [
    `CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      people INTEGER NOT NULL,
      datetime TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'recibida',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ]
};

function createDatabase(service, dbPath) {
  if (!schemas[service]) throw new Error(`No existe esquema para el servicio ${service}`);
  const resolvedPath = dbPath || process.env.DB_PATH || path.resolve('storage', `${service}.sqlite`);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new sqlite3.Database(resolvedPath);
  database.configure('busyTimeout', 5000);
  database.run('PRAGMA foreign_keys = ON');

  const rawRun = (sql, params = []) => new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      return resolve({ id: this.lastID, changes: this.changes });
    });
  });
  const rawGet = (sql, params = []) => new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
  });
  const rawAll = (sql, params = []) => new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });

  let queue = Promise.resolve();
  async function locked(operation) {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  const db = {
    run: (sql, params) => locked(() => rawRun(sql, params)),
    get: (sql, params) => locked(() => rawGet(sql, params)),
    all: (sql, params) => locked(() => rawAll(sql, params)),
    transaction: (callback) => locked(async () => {
      await rawRun('BEGIN IMMEDIATE');
      try {
        const result = await callback({ run: rawRun, get: rawGet, all: rawAll });
        await rawRun('COMMIT');
        return result;
      } catch (error) {
        await rawRun('ROLLBACK');
        throw error;
      }
    }),
    initialize: async () => {
      for (const statement of schemas[service]) await db.run(statement);
      if (service === 'inventory') {
        const count = await db.get('SELECT COUNT(*) AS count FROM products');
        if (count.count === 0) {
          await db.transaction(async (tx) => {
            for (const product of products) {
              await tx.run(
                `INSERT INTO products (id, nombre, descripcion, precio, categoria, stock)
                 VALUES (?, ?, ?, ?, ?, 20)`,
                [product.id, product.nombre, product.descripcion, product.precio, product.categoria]
              );
            }
          });
        }
      }
      if (service === 'auth') await bootstrapAdmin(db);
      return db;
    },
    close: () => new Promise((resolve, reject) => database.close((error) => error ? reject(error) : resolve()))
  };
  return db;
}

async function bootstrapAdmin(db) {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const fullName = process.env.BOOTSTRAP_ADMIN_FULL_NAME;
  if (![username, password, fullName].some(Boolean)) return;
  if (![username, password, fullName].every(Boolean) || password.length < 12 || password.length > 128) {
    throw new Error('Las variables de bootstrap admin deben definirse juntas; contraseña de 12 a 128 caracteres');
  }
  const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  if (existing) return;
  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt, 50000, 64, 'sha512').toString('hex');
  await db.run(
    `INSERT INTO users (username, password_hash, password_salt, role, full_name)
     VALUES (?, ?, ?, 'admin', ?)`,
    [username.trim().toLowerCase(), passwordHash, salt, fullName.trim()]
  );
}

module.exports = { createDatabase };
