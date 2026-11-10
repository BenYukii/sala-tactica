const crypto = require('crypto');

// Solo se guardan salts y hashes. Las claves de demostracion estan documentadas
// en el README para poder probar el laboratorio.
const USERS = {
  ana: {
    user_id: 'USR-001',
    salt: '61110b456d54b4ca442d116bcd3ec377',
    password_hash: 'a8dc7576ad067df5d3a98d7ec6b9ffe57f43f46bd0fe5dab44e2068326b5e301cd38a15b8bd0a4ba589eb1fbfac5b91418935c3cb650b982c7524ebf7272ef22',
    roles: ['user']
  },
  ernesto: {
    user_id: 'USR-003',
    salt: 'd2015b8c91fac6210464921e7d0d667a',
    password_hash: '293d0b7f8720a3b0375c15962cc049bc6ecd0b7c78336789d8931520f87a0dda3bddf1f36def5819f049cbbbc264c3a72d0b20973a8a856938e4feb455032589',
    roles: ['user', 'admin']
  }
};

function safeEqualHex(received, expected) {
  const receivedBuffer = Buffer.from(received, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function authenticate(username, password) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const user = USERS[normalizedUsername];
  if (!user || typeof password !== 'string') return null;

  const candidateHash = crypto.scryptSync(password, user.salt, 64).toString('hex');
  if (!safeEqualHex(candidateHash, user.password_hash)) return null;

  return {
    user_id: user.user_id,
    username: normalizedUsername,
    roles: [...user.roles]
  };
}

module.exports = { authenticate };
