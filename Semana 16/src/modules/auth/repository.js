const database = require('../../infrastructure/database');

function findUserByUsername(username) {
  return database.get('SELECT * FROM users WHERE username = ?', [username]);
}

function createSession({ token, userId, role, expiresAt }) {
  return database.run(
    'INSERT INTO sessions (token, user_id, role, expires_at) VALUES (?, ?, ?, ?)',
    [token, userId, role, expiresAt]
  );
}

function findSession(token) {
  return database.get(
    `SELECT s.*, u.username, u.full_name, u.role AS user_role
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    [token]
  );
}

function deleteSession(token) {
  return database.run('DELETE FROM sessions WHERE token = ?', [token]);
}

module.exports = { createSession, deleteSession, findSession, findUserByUsername };
