require('dotenv').config();
const pool = require('./db');

const productos = [
  { nombre: 'Lasagna alla Nonna', descripcion: 'Ragú lento, bechamel, doce capas, horneada hasta dorar los bordes.', precio: 18, categoria: 'Horneado' },
  { nombre: 'Tagliatelle al Ragù', descripcion: 'Cintas hechas a mano con un ragú de cinco horas.', precio: 16, categoria: 'Pasta fresca' },
  { nombre: 'Ravioli di Zucca', descripcion: 'Zapallo asado, mantequilla dorada, salvia y parmesano.', precio: 17, categoria: 'Pasta fresca' },
  { nombre: 'Cannelloni Spinaci', descripcion: 'Ricotta y espinaca enrolladas, horneadas en tomate y crema.', precio: 16, categoria: 'Horneado' },
  { nombre: 'Fettuccine Alfredo', descripcion: 'Mantequilla, parmesano y pimienta recién molida.', precio: 15, categoria: 'Clasico' },
  { nombre: 'Pan de Ajo al Horno', descripcion: 'Horneado hasta dorar, pincelado con mantequilla de hierbas.', precio: 7, categoria: 'Para compartir' }
];

async function seed() {
  await pool.query('DELETE FROM productos');
  for (const p of productos) {
    await pool.execute(
      'INSERT INTO productos (nombre, descripcion, precio, categoria) VALUES (?, ?, ?, ?)',
      [p.nombre, p.descripcion, p.precio, p.categoria]
    );
  }
  console.log('Productos de La Nonna cargados en MySQL.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Error al cargar los productos:', err);
  process.exit(1);
});
