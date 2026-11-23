const repository = require('./repository');

function validate(reservation) {
  const { name, email, people, datetime } = reservation || {};
  if (!name || String(name).trim().length < 2) return 'El nombre es obligatorio';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'El correo no es valido';
  const count = Number(people);
  if (!Number.isInteger(count) || count < 1 || count > 12) {
    return 'La cantidad debe estar entre 1 y 12';
  }
  const date = new Date(datetime);
  if (!datetime || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return 'La fecha debe ser futura';
  }
  return null;
}

async function create(reservation) {
  const error = validate(reservation);
  if (error) return { error };

  const normalized = {
    name: String(reservation.name).trim(),
    email: String(reservation.email).trim(),
    people: Number(reservation.people),
    datetime: reservation.datetime,
    notes: String(reservation.notes || '').trim(),
    status: 'recibida'
  };
  const result = await repository.create(normalized);
  return { reservation: { id: result.id, ...normalized } };
}

function list() {
  return repository.findAll();
}

async function updateStatus(id, status) {
  const validStatuses = ['recibida', 'confirmada', 'cancelada', 'finalizada'];
  if (!validStatuses.includes(status)) return { error: 'Estado no valido' };
  const reservation = await repository.findById(id);
  if (!reservation) return { notFound: true };
  await repository.updateStatus(id, status);
  return { id: Number(id), status };
}

module.exports = { create, list, updateStatus };
