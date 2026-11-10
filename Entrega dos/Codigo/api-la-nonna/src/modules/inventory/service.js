const database = require('../../infrastructure/database');
const repository = require('./repository');

function validateProduct(input) {
  const nombre = String(input?.nombre || '').trim();
  const descripcion = String(input?.descripcion || '').trim();
  const categoria = String(input?.categoria || '').trim();
  const precio = Number(input?.precio);
  const stock = Number(input?.stock);

  if (!nombre || nombre.length > 120) return { error: 'El nombre debe tener entre 1 y 120 caracteres' };
  if (descripcion.length > 1000) return { error: 'La descripcion supera el limite permitido' };
  if (!categoria || categoria.length > 80) return { error: 'La categoria debe tener entre 1 y 80 caracteres' };
  if (!Number.isFinite(precio) || precio <= 0 || precio > 100000000) {
    return { error: 'El precio debe ser positivo y estar dentro del limite permitido' };
  }
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
    return { error: 'El stock debe ser un entero entre 0 y 1000000' };
  }
  return { nombre, descripcion, categoria, precio, stock };
}

async function createProduct(adminUserId, input) {
  const product = validateProduct(input);
  if (product.error) return product;
  return { product: await repository.createProduct(adminUserId, product) };
}

async function updateProduct(id, input) {
  const productId = Number(id);
  if (!Number.isSafeInteger(productId) || productId <= 0) return { error: 'Id de producto no valido' };
  const product = validateProduct({ ...input, stock: 0 });
  if (product.error) return product;
  const result = await repository.updateProduct(productId, product);
  if (!result.changes) return { notFound: true };
  return { product: await database.get('SELECT * FROM products WHERE id = ?', [productId]) };
}

async function adjustStock(adminUserId, id, input) {
  const productId = Number(id);
  const quantityDelta = Number(input?.quantity_delta);
  const reason = String(input?.reason || '').trim();
  if (!Number.isSafeInteger(productId) || productId <= 0) return { error: 'Id de producto no valido' };
  if (!Number.isSafeInteger(quantityDelta) || quantityDelta === 0 || Math.abs(quantityDelta) > 1000000) {
    return { error: 'quantity_delta debe ser un entero distinto de cero dentro del limite permitido' };
  }
  if (!reason || reason.length > 160) return { error: 'El motivo debe tener entre 1 y 160 caracteres' };
  return repository.adjustStock(adminUserId, productId, quantityDelta, reason);
}

async function listMovements(requestedLimit) {
  const limit = Number.isInteger(Number(requestedLimit))
    ? Math.min(Math.max(Number(requestedLimit), 1), 100)
    : 50;
  return repository.listMovements(limit);
}

module.exports = { adjustStock, createProduct, listMovements, updateProduct };
