const database = require('../../infrastructure/database');

function findAll({ category, limit }) {
  let sql = 'SELECT * FROM products';
  const params = [];
  if (category) {
    sql += ' WHERE LOWER(categoria) = ?';
    params.push(category);
  }
  sql += ' ORDER BY id ASC LIMIT ?';
  params.push(limit);
  return database.all(sql, params);
}

function findById(id) {
  return database.get('SELECT * FROM products WHERE id = ?', [id]);
}

module.exports = { findAll, findById };
