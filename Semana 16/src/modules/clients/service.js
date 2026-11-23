const repository = require('./repository');

function validateProfile(input, partial = false) {
  const username = String(input?.username || '').trim().toLowerCase();
  const fullName = String(input?.full_name || '').trim();
  const email = String(input?.email || '').trim().toLowerCase();
  const password = input?.password;
  const phone = String(input?.phone || '').trim();

  if (!partial && !/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { error: 'El usuario debe tener entre 3 y 32 caracteres alfanumericos' };
  }
  if (!partial && (typeof password !== 'string' || password.length < 12 || password.length > 128)) {
    return { error: 'La contraseña debe tener entre 12 y 128 caracteres' };
  }
  if (!fullName || fullName.length > 100) {
    return { error: 'El nombre debe tener entre 1 y 100 caracteres' };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'El correo no tiene un formato valido' };
  }
  if (phone.length > 32) return { error: 'El telefono supera el limite permitido' };

  return { username, fullName, email, password, phone: phone || null };
}

async function register(input) {
  const validated = validateProfile(input);
  if (validated.error) return validated;
  return repository.register(validated);
}

function getProfile(userId) {
  return repository.findByUserId(userId);
}

async function updateProfile(userId, input) {
  const current = await repository.findByUserId(userId);
  if (!current) return { notFound: true };
  const validated = validateProfile({
    full_name: input?.full_name ?? current.full_name,
    email: input?.email ?? current.email,
    phone: input?.phone ?? current.phone
  }, true);
  if (validated.error) return validated;
  const client = await repository.updateProfile(userId, validated);
  if (!client) return { notFound: true };
  return { client };
}

module.exports = { getProfile, register, updateProfile };
