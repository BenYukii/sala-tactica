const database = require('../../infrastructure/database');

function create(reservation) {
  return database.run(
    `INSERT INTO reservations (name, email, people, datetime, notes, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      reservation.name,
      reservation.email,
      reservation.people,
      reservation.datetime,
      reservation.notes,
      reservation.status
    ]
  );
}

function findAll() {
  return database.all('SELECT * FROM reservations ORDER BY created_at DESC');
}

function findById(id) {
  return database.get('SELECT * FROM reservations WHERE id = ?', [id]);
}

function updateStatus(id, status) {
  return database.run('UPDATE reservations SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { create, findAll, findById, updateStatus };
