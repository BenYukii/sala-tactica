const crypto = require('crypto');

class SessionStore {
  constructor({ ttlSeconds, now } = {}) {
    const configuredTtl = Number(ttlSeconds ?? process.env.SESSION_TTL_SECONDS);
    this.ttlSeconds = Number.isFinite(configuredTtl) && configuredTtl > 0
      ? configuredTtl
      : 900;
    this.now = now || (() => Date.now());
    this.sessions = new Map();
  }

  create(identity) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(token, {
      ...identity,
      expires_at: this.now() + this.ttlSeconds * 1000
    });
    return { token, expiresIn: this.ttlSeconds };
  }

  introspect(token) {
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expires_at <= this.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { ...session };
  }

  revoke(token) {
    return this.sessions.delete(token);
  }
}

module.exports = { SessionStore };
