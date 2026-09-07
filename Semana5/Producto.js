const pool = require('./db');

// "Modelo" Producto: funciones que envuelven las consultas SQL a la tabla productos

async function obtenerTodos(categoria, limit) {
  // limite de paginacion: entre 1 y 50, por defecto 20
  const tope = Math.min(Math.max(parseInt(limit) || 20, 1), 50);
  let sql = 'SELECT * FROM productos';
  const params = [];
  if (categoria) {
    sql += ' WHERE categoria = ?';
    params.push(categoria);
  }
  sql += ` LIMIT ${tope}`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function obtenerPorId(id) {
  const [rows] = await pool.execute('SELECT * FROM productos WHERE id = ?', [id]);
  return rows[0] || null;
}

async function crear(datos) {
  if (datos.precio < 0) {
    throw new Error('El precio no puede ser negativo');
  }
  const sql = 'INSERT INTO productos (nombre, descripcion, precio, categoria, imagen) VALUES (?, ?, ?, ?, ?)';
  const params = [datos.nombre, datos.descripcion, datos.precio, datos.categoria, datos.imagen || null];
  const [resultado] = await pool.execute(sql, params);
  return obtenerPorId(resultado.insertId);
}

async function actualizar(id, datos) {
  const sql = 'UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, categoria = ?, imagen = ? WHERE id = ?';
  const params = [datos.nombre, datos.descripcion, datos.precio, datos.categoria, datos.imagen || null, id];
  await pool.execute(sql, params);
  return obtenerPorId(id);
}

async function eliminar(id) {
  await pool.execute('DELETE FROM productos WHERE id = ?', [id]);
  return { message: `Producto ${id} eliminado` };
}

module.exports = { obtenerTodos, obtenerPorId, crear, actualizar, eliminar };
