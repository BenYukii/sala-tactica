const repository = require('./repository');

function normalizeLimit(value) {
  const requestedLimit = Number.parseInt(value, 10);
  return Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
}

function listProducts(category, limit) {
  return repository.findAll({
    category: String(category || '').trim().toLowerCase(),
    limit: normalizeLimit(limit)
  });
}

function getProduct(id) {
  return repository.findById(Number(id));
}

module.exports = { getProduct, listProducts };
