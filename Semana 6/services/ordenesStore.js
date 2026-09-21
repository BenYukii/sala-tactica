const Producto = require('../Producto');

const ESTADOS = ['recibida', 'en_preparacion', 'lista', 'entregada', 'cancelada'];

let siguienteId = 1;
const ordenes = [];

function listar() {
  return ordenes;
}

function buscar(id) {
  return ordenes.find((o) => String(o.id) === String(id)) || null;
}

async function crear({ items, mesa, cliente }) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('La orden necesita al menos un item');
  }
  const lineas = [];
  for (const it of items) {
    const cantidad = Number(it.cantidad);
    if (!it.productoId || !Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error('Cada item necesita productoId y cantidad entera mayor a 0');
    }
    const producto = await Producto.obtenerPorId(it.productoId);
    if (!producto) throw new Error(`Producto ${it.productoId} no existe`);
    lineas.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precioUnitario: Number(producto.precio),
      cantidad
    });
  }
  const total = lineas.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0);
  const orden = {
    id: siguienteId++,
    items: lineas,
    total,
    mesa: mesa || null,
    cliente: cliente || null,
    estado: 'recibida',
    pagada: false,
    creadaEn: new Date().toISOString()
  };
  ordenes.push(orden);
  return orden;
}

function cambiarEstado(id, estado) {
  const orden = buscar(id);
  if (!orden) return null;
  if (!ESTADOS.includes(estado)) {
    throw new Error(`Estado invalido. Usa: ${ESTADOS.join(', ')}`);
  }
  orden.estado = estado;
  return orden;
}

function eliminar(id) {
  const i = ordenes.findIndex((o) => String(o.id) === String(id));
  if (i === -1) return null;
  if (ordenes[i].estado === 'entregada') {
    throw new Error('No se puede anular una orden entregada');
  }
  const [borrada] = ordenes.splice(i, 1);
  return borrada;
}

function marcarPagada(id) {
  const orden = buscar(id);
  if (orden) orden.pagada = true;
  return orden;
}

module.exports = { ESTADOS, listar, buscar, crear, cambiarEstado, eliminar, marcarPagada };
