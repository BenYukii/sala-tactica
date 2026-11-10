const crypto = require('crypto');
const database = require('../../infrastructure/database');

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 50000, 64, 'sha512').toString('hex');
}

async function register({ username, password, fullName, email, phone }) {
  return database.transaction(async (transaction) => {
    const usernameExists = await transaction.get(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );
    if (usernameExists) return { conflict: 'Ese nombre de usuario ya está registrado' };

    const emailExists = await transaction.get(
      'SELECT id FROM clients WHERE email = ?',
      [email]
    );
    if (emailExists) return { conflict: 'Ese correo ya está registrado' };

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user = await transaction.run(
      `INSERT INTO users (username, password_hash, password_salt, role, full_name)
       VALUES (?, ?, ?, 'user', ?)`,
      [username, passwordHash, salt, fullName]
    );
    const client = await transaction.run(
      'INSERT INTO clients (user_id, email, phone) VALUES (?, ?, ?)',
      [user.id, email, phone || null]
    );
    return {
      user: { id: user.id, username, role: 'user', full_name: fullName },
      client_id: client.id,
      email,
      phone: phone || null
    };
  });
}

function findByUserId(userId) {
  return database.get(
    `SELECT c.id, c.user_id, c.email, c.phone, c.created_at, c.updated_at, u.username, u.full_name
     FROM clients c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?`,
    [userId]
  );
}

function updateProfile(userId, { fullName, email, phone }) {
  return database.transaction(async (transaction) => {
    const client = await transaction.get('SELECT id FROM clients WHERE user_id = ?', [userId]);
    if (!client) return null;

    const duplicateEmail = await transaction.get(
      'SELECT id FROM clients WHERE email = ? AND user_id != ?',
      [email, userId]
    );
    if (duplicateEmail) return { conflict: 'Ese correo ya está registrado' };

    await transaction.run(
      'UPDATE users SET full_name = ? WHERE id = ?',
      [fullName, userId]
    );
    await transaction.run(
      `UPDATE clients SET email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = ?`,
      [email, phone || null, userId]
    );
    return { updated: true };
  }).then((result) => {
    if (!result || result.conflict) return result;
    return findByUserId(userId);
  });
}

module.exports = { findByUserId, register, updateProfile };
