const express = require('express');
const {
  GraphQLError,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  execute,
  parse,
  validate
} = require('graphql');
const { requireServiceToken, serviceRequest, verifyIdentity } = require('./security');

const inventoryUrl = process.env.INVENTORY_SERVICE_URL || 'http://inventory:4103';
const ordersUrl = process.env.ORDERS_SERVICE_URL || 'http://orders:4104';

const ProductType = new GraphQLObjectType({
  name: 'Product',
  fields: {
    id: { type: GraphQLInt },
    nombre: { type: GraphQLString },
    descripcion: { type: GraphQLString },
    precio: { type: GraphQLFloat },
    categoria: { type: GraphQLString },
    stock: { type: GraphQLInt }
  }
});

const OrderItemType = new GraphQLObjectType({
  name: 'OrderItem',
  fields: {
    product_id: { type: GraphQLInt },
    nombre: { type: GraphQLString },
    quantity: { type: GraphQLInt },
    unit_price: { type: GraphQLFloat }
  }
});

const OrderType = new GraphQLObjectType({
  name: 'Order',
  fields: {
    id: { type: GraphQLInt },
    status: { type: GraphQLString },
    total: { type: GraphQLFloat },
    created_at: { type: GraphQLString },
    items: { type: new GraphQLList(OrderItemType) }
  }
});

const DashboardType = new GraphQLObjectType({
  name: 'Dashboard',
  fields: {
    menu: { type: new GraphQLList(ProductType) },
    orders: { type: new GraphQLList(OrderType) }
  }
});

function requireUser(context) {
  if (!context.user) {
    throw new GraphQLError('Se requiere una sesión válida para consultar pedidos', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
}

async function fetchMenu(limit, category) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (category) query.set('categoria', category);
  const result = await serviceRequest(inventoryUrl, `/api/productos?${query}`, { target: 'inventory' });
  if (result.status !== 200) throw new GraphQLError('El catálogo no está disponible');
  return result.body;
}

async function fetchOrders(limit, context) {
  requireUser(context);
  const result = await serviceRequest(ordersUrl, `/api/orders?limit=${limit}`, {
    target: 'orders',
    identity: context.user.signed
  });
  if (result.status !== 200) throw new GraphQLError('Los pedidos no están disponibles');
  return result.body;
}

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      menu: {
        type: new GraphQLList(ProductType),
        args: { categoria: { type: GraphQLString }, limit: { type: GraphQLInt } },
        resolve: (_source, args) => fetchMenu(clampLimit(args.limit), args.categoria || '')
      },
      orders: {
        type: new GraphQLList(OrderType),
        args: { limit: { type: GraphQLInt } },
        resolve: (_source, args, context) => fetchOrders(clampLimit(args.limit), context)
      },
      dashboard: {
        type: DashboardType,
        args: { limit: { type: GraphQLInt } },
        resolve: async (_source, args, context) => {
          const limit = clampLimit(args.limit);
          const [menu, orders] = await Promise.all([
            fetchMenu(limit, ''),
            fetchOrders(limit, context)
          ]);
          return { menu, orders };
        }
      }
    }
  })
});

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || 20, 1), 20);
}

function queryComplexity(document) {
  let fields = 0;
  let maxDepth = 0;
  let rootFields = 0;
  function visit(selectionSet, depth) {
    if (!selectionSet) return;
    maxDepth = Math.max(maxDepth, depth);
    for (const selection of selectionSet.selections) {
      if (selection.kind === 'Field') fields += 1;
      if (selection.selectionSet) visit(selection.selectionSet, depth + 1);
    }
  }
  for (const definition of document.definitions) {
    if (definition.kind === 'OperationDefinition') {
      rootFields = Math.max(rootFields, definition.selectionSet.selections.length);
    }
    visit(definition.selectionSet, 1);
  }
  return { fields, maxDepth, rootFields };
}

function createGraphqlApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', (_req, res) => res.json({ service: 'graphql-gateway', status: 'ok' }));
  app.post('/api/graphql', requireServiceToken, async (req, res, next) => {
    try {
      const source = req.body?.query;
      if (typeof source !== 'string' || source.length > 10000) {
        return res.status(400).json({ errors: [{ message: 'La consulta GraphQL no es válida o supera el límite' }] });
      }
      if (/__schema|__type/.test(source)) {
        return res.status(400).json({ errors: [{ message: 'La introspección GraphQL está deshabilitada' }] });
      }
      const document = parse(source);
      if (document.definitions.some((definition) => definition.kind === 'FragmentDefinition')) {
        return res.status(400).json({ errors: [{ message: 'No se permiten fragmentos GraphQL en esta API' }] });
      }
      const validationErrors = validate(schema, document);
      if (validationErrors.length) return res.status(400).json({ errors: validationErrors });
      const complexity = queryComplexity(document);
      if (complexity.fields > 40 || complexity.maxDepth > 6 || complexity.rootFields > 5) {
        return res.status(400).json({ errors: [{ message: 'La consulta GraphQL supera los límites permitidos' }] });
      }
      const signedIdentity = req.get('x-verified-identity') || '';
      const user = signedIdentity ? verifyIdentity(signedIdentity) : null;
      if (signedIdentity && !user) return res.status(401).json({ errors: [{ message: 'Identidad de usuario inválida' }] });
      const result = await execute({
        schema,
        document,
        variableValues: req.body.variables || {},
        operationName: req.body.operationName,
        contextValue: { user: user ? { ...user, signed: signedIdentity } : null }
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof GraphQLError) {
        return res.status(400).json({ errors: [{ message: 'La consulta GraphQL no es válida' }] });
      }
      return next(error);
    }
  });
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ errors: [{ message: 'El cuerpo JSON no es válido' }] });
    }
    console.error('[graphql] Error de solicitud', error.message);
    if (!res.headersSent) {
      const status = error.name === 'TimeoutError' || error.name === 'AbortError' ? 504
        : error.name === 'ServiceProtocolError' ? 502
          : error.name === 'ServiceUnavailableError' ? 503 : 500;
      res.status(status).json({ errors: [{ message: status === 504 ? 'Tiempo de espera agotado'
        : status === 502 ? 'Respuesta no válida de servicio interno'
          : status === 503 ? 'Servicio interno no disponible' : 'Error interno de GraphQL' }] });
    }
  });
  return app;
}

module.exports = { createGraphqlApp };
