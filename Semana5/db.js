require('dotenv').config();
const mysql = require('mysql2/promise');

// Pool de conexiones a MySQL (XAMPP corre MySQL en el puerto 3306 por defecto)
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // XAMPP trae root sin contraseña por defecto
  database: process.env.DB_NAME || 'lanonna',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
