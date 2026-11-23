const crypto = require('crypto');
const repository = require('./repository');

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_SECONDS || 86400) * 1000;

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 50000, 64, 'sha512').toString('hex');
}

async function authenticate(username, password) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername || typeof password !== 'string') return null;

  const user = await repository.findUserByUsername(normalizedUsername);
  if (!user) return null;

  const candidate = Buffer.from(hashPassword(password, user.password_salt), 'hex');
  const expected = Buffer.from(user.password_hash, 'hex');
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    full_name: user.full_name
  };
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  await repository.createSession({ token, userId: user.id, role: user.role, expiresAt });
  return { token, expires_at: expiresAt, user };
}

async function getSession(token) {
  if (!token) return null;

  const session = await repository.findSession(token);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await repository.deleteSession(token);
    return null;
  }

  return {
    id: session.id,
    token,
    user_id: session.user_id,
    username: session.username,
    full_name: session.full_name,
    role: session.user_role,
    expires_at: session.expires_at
  };
}

function revokeSession(token) {
  return repository.deleteSession(token);
}

module.exports = { authenticate, createSession, getSession, revokeSession };
