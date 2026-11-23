const repository = require('./repository');

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function create(userId, items) {
  if (!Array.isArray(items) || !items.length) {
    return { error: 'Debes incluir al menos un producto en el pedido', status: 400 };
  }

  const quantitiesByProduct = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Cada producto debe incluir un id y una cantidad validos', status: 400 };
    }

    const productId = positiveInteger(item.product_id ?? item.id);
    const quantity = positiveInteger(item.quantity);
    if (!productId || !quantity) {
      return { error: 'Cada producto debe incluir un id y una cantidad validos', status: 400 };
    }
    const combinedQuantity = (quantitiesByProduct.get(productId) || 0) + quantity;
    if (!Number.isSafeInteger(combinedQuantity)) {
      return { error: 'La cantidad total del producto excede el limite permitido', status: 400 };
    }
    quantitiesByProduct.set(productId, combinedQuantity);
  }

  const itemsToCreate = Array.from(quantitiesByProduct, ([productId, quantity]) => ({
    productId,
    quantity
  }));
  try {
    return await repository.createOrderTransaction(userId, itemsToCreate);
  } catch (error) {
    console.error('No fue posible crear el pedido', error);
    throw error;
  }
}

function list(user, requestedLimit) {
  const parsedLimit = Number(requestedLimit);
  const limit = Number.isSafeInteger(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 50;
  return user.role === 'admin'
    ? repository.findOrdersForAdmin(limit)
    : repository.findOrdersForUser(user.id, limit);
}

async function listWithItems(user, requestedLimit) {
  const orders = await list(user, requestedLimit);
  const items = await repository.findItemsForOrders(orders.map((order) => order.id));
  const itemsByOrder = new Map(orders.map((order) => [order.id, []]));
  for (const item of items) itemsByOrder.get(item.order_id)?.push(item);
  return orders.map((order) => ({ ...order, items: itemsByOrder.get(order.id) }));
}

async function get(user, id) {
  const order = await repository.findById(id);
  if (!order) return { notFound: true };
  if (user.role !== 'admin' && order.user_id !== user.id) return { forbidden: true };
  return { order: { ...order, items: await repository.findItems(order.id) } };
}

async function updateStatus(id, status) {
  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'cancelled', 'completed'];
  if (!validStatuses.includes(status)) return { error: 'Estado no valido' };
  return repository.updateOrderStatusTransaction(id, status);
}

module.exports = { create, get, list, listWithItems, updateStatus };
