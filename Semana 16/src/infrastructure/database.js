const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'la-nonna.db');

function ensureDataDir() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

let database;
let readyPromise;

function getDatabase() {
  if (database) return database;
  ensureDataDir();

  database = new sqlite3.Database(DB_PATH, (error) => {
    if (error) console.error('No fue posible abrir la base de datos', error.message);
  });
  database.configure('busyTimeout', 5000);
  database.run('PRAGMA foreign_keys = ON');

  readyPromise = new Promise((resolve, reject) => {
    database.serialize(() => {
      database.run(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY,
          nombre TEXT NOT NULL,
          descripcion TEXT NOT NULL,
          precio REAL NOT NULL,
          categoria TEXT NOT NULL,
          stock INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `, (error) => {
        if (error) return reject(error);

        database.run(`
          CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            people INTEGER NOT NULL,
            datetime TEXT NOT NULL,
            notes TEXT,
            status TEXT NOT NULL DEFAULT 'recibida',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER
          )
        `, (error) => {
          if (error) return reject(error);

          database.run(`
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              password_hash TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'user',
              full_name TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `, (error) => {
            if (error) return reject(error);

            database.run(`
              CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL,
                role TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id)
              )
            `, (error) => {
              if (error) return reject(error);

              database.run(`
                CREATE TABLE IF NOT EXISTS orders (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER NOT NULL,
                  status TEXT NOT NULL DEFAULT 'pending',
                  total REAL NOT NULL,
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(user_id) REFERENCES users(id)
                )
              `, (error) => {
                if (error) return reject(error);

                database.run(`
                  CREATE TABLE IF NOT EXISTS order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    quantity INTEGER NOT NULL,
                    unit_price REAL NOT NULL,
                    product_name TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(order_id) REFERENCES orders(id),
                    FOREIGN KEY(product_id) REFERENCES products(id)
                  )
                `, (error) => {
                  if (error) return reject(error);
                  database.all('PRAGMA table_info(order_items)', (error, columns) => {
                    if (error) return reject(error);
                    const hasProductName = columns.some((column) => column.name === 'product_name');
                    const createClientSchema = () => {
                      database.run(`
                        CREATE TABLE IF NOT EXISTS clients (
                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                          user_id INTEGER NOT NULL UNIQUE,
                          email TEXT NOT NULL UNIQUE,
                          phone TEXT,
                          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                          FOREIGN KEY(user_id) REFERENCES users(id)
                        )
                      `, (error) => {
                        if (error) return reject(error);
                        database.run(`
                          CREATE TABLE IF NOT EXISTS inventory_movements (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            product_id INTEGER NOT NULL,
                            actor_user_id INTEGER NOT NULL,
                            quantity_delta INTEGER NOT NULL,
                            reason TEXT NOT NULL,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY(product_id) REFERENCES products(id),
                            FOREIGN KEY(actor_user_id) REFERENCES users(id)
                          )
                        `, (error) => {
                          if (error) return reject(error);
                          database.run(`
                            CREATE TABLE IF NOT EXISTS payments (
                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                              order_id INTEGER NOT NULL,
                              user_id INTEGER NOT NULL,
                              amount REAL NOT NULL,
                              currency TEXT NOT NULL DEFAULT 'CLP',
                              status TEXT NOT NULL,
                              provider TEXT NOT NULL,
                              provider_reference TEXT NOT NULL UNIQUE,
                              idempotency_key TEXT NOT NULL UNIQUE,
                              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                              FOREIGN KEY(order_id) REFERENCES orders(id),
                              FOREIGN KEY(user_id) REFERENCES users(id)
                            )
                          `, (error) => {
                            if (error) return reject(error);
                            database.run(
                              'CREATE INDEX IF NOT EXISTS idx_payments_order_user ON payments(order_id, user_id)',
                              (error) => {
                                if (error) return reject(error);
                                resolve();
                              }
                            );
                          });
                        });
                      });
                    };
                    if (hasProductName) return createClientSchema();
                    database.run(
                      "ALTER TABLE order_items ADD COLUMN product_name TEXT NOT NULL DEFAULT ''",
                      (error) => {
                        if (error) return reject(error);
                        database.run(
                          `UPDATE order_items SET product_name = (
                             SELECT nombre FROM products WHERE products.id = order_items.product_id
                           ) WHERE product_name = ''`,
                          (error) => {
                            if (error) return reject(error);
                            createClientSchema();
                          }
                        );
                      }
                    );
                  });
                });
              });
            });
          });
        });
      });
    });
  });

  return database;
}

function getReadyDatabase() {
  getDatabase();
  return readyPromise || Promise.resolve();
}

function run(sql, params = []) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      return resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      return resolve(rows);
    });
  });
}

function get(sql, params = []) {
  const db = getDatabase();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) return reject(error);
      return resolve(row || null);
    });
  });
}

function transaction(callback) {
  ensureDataDir();
  const connection = new sqlite3.Database(DB_PATH);
  connection.configure('busyTimeout', 5000);

  const execute = (sql, params = []) => new Promise((resolve, reject) => {
    connection.run(sql, params, function onRun(error) {
      if (error) return reject(error);
      return resolve({ id: this.lastID, changes: this.changes });
    });
  });
  const select = (sql, params = []) => new Promise((resolve, reject) => {
    connection.get(sql, params, (error, row) => {
      if (error) return reject(error);
      return resolve(row || null);
    });
  });
  const selectAll = (sql, params = []) => new Promise((resolve, reject) => {
    connection.all(sql, params, (error, rows) => {
      if (error) return reject(error);
      return resolve(rows);
    });
  });
  const finish = (sql) => new Promise((resolve, reject) => {
    connection.run(sql, (error) => {
      if (error) return reject(error);
      return resolve();
    });
  });

  return new Promise((resolve, reject) => {
    connection.serialize(async () => {
      try {
        await finish('PRAGMA foreign_keys = ON');
        await finish('BEGIN IMMEDIATE');
        const result = await callback({ all: selectAll, get: select, run: execute });
        await finish('COMMIT');
        connection.close((error) => {
          if (error) return reject(error);
          return resolve(result);
        });
      } catch (error) {
        try {
          await finish('ROLLBACK');
        } catch (rollbackError) {
          console.error('No fue posible revertir la transaccion SQLite', rollbackError.message);
        }
        connection.close(() => reject(error));
      }
    });
  });
}

async function seedProducts() {
  const products = require('../../data/productos');
  for (const product of products) {
    await run(
      `INSERT OR IGNORE INTO products (id, nombre, descripcion, precio, categoria, stock)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [product.id, product.nombre, product.descripcion, product.precio, product.categoria, Math.max(product.stock || 20, 0)]
    );
  }
}

async function seedDemoUsers() {
  const users = [
    { username: 'ana', password: 'anita123', role: 'user', full_name: 'Ana García' },
    { username: 'ernesto', password: 'admin123', role: 'admin', full_name: 'Ernesto Rojas' }
  ];

  for (const user of users) {
    const exists = await get('SELECT id FROM users WHERE username = ?', [user.username]);
    let userId = exists?.id;
    if (!exists) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.pbkdf2Sync(user.password, salt, 50000, 64, 'sha512').toString('hex');
      const result = await run(
        'INSERT INTO users (username, password_hash, password_salt, role, full_name) VALUES (?, ?, ?, ?, ?)',
        [user.username, passwordHash, salt, user.role, user.full_name]
      );
      userId = result.id;
    }

    await run(
      'INSERT OR IGNORE INTO clients (user_id, email) VALUES (?, ?)',
      [userId, `${user.username}@example.test`]
    );
  }
}

async function seedBootstrapAdmin() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  const fullName = String(process.env.BOOTSTRAP_ADMIN_FULL_NAME || '').trim();
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const values = [username, password, fullName, email];
  if (values.every((value) => !value)) return;
  if (values.some((value) => !value)) {
    throw new Error('Configura BOOTSTRAP_ADMIN_USERNAME, PASSWORD, FULL_NAME y EMAIL en conjunto');
  }
  if (!/^[a-z0-9._-]{3,32}$/.test(username) || password.length < 12 || password.length > 128) {
    throw new Error('Las credenciales de administrador inicial no cumplen los limites de seguridad');
  }
  if (fullName.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error('El nombre o correo del administrador inicial no es valido');
  }

  const exists = await get('SELECT id, role FROM users WHERE username = ?', [username]);
  if (exists) {
    if (exists.role !== 'admin') {
      throw new Error('La cuenta inicial configurada ya existe y no tiene rol administrador');
    }
    return;
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.pbkdf2Sync(password, salt, 50000, 64, 'sha512').toString('hex');
  const user = await run(
    'INSERT INTO users (username, password_hash, password_salt, role, full_name) VALUES (?, ?, ?, ?, ?)',
    [username, passwordHash, salt, 'admin', fullName]
  );
  await run('INSERT OR IGNORE INTO clients (user_id, email) VALUES (?, ?)', [user.id, email]);
}

async function initialize() {
  await getReadyDatabase();
  const productCount = await get('SELECT COUNT(*) AS total FROM products');
  if (!productCount || Number(productCount.total) === 0) await seedProducts();
  if (process.env.NODE_ENV !== 'production') await seedDemoUsers();
  await seedBootstrapAdmin();
  return getDatabase();
}

module.exports = { all, get, getDatabase, initialize, run, transaction };
