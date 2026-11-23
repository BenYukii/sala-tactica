const {
  GraphQLError,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString
} = require('graphql');
const catalogService = require('../catalog/service');
const ordersService = require('../orders/service');

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
    items: {
      type: new GraphQLList(OrderItemType),
      resolve: (order) => order.items || []
    }
  }
});

const DashboardType = new GraphQLObjectType({
  name: 'Dashboard',
  fields: {
    menu: { type: new GraphQLList(ProductType) },
    orders: { type: new GraphQLList(OrderType) }
  }
});

function requireAuthenticatedUser(user) {
  if (!user) {
    throw new GraphQLError('Se requiere una sesion valida para consultar esta informacion', {
      extensions: { code: 'UNAUTHENTICATED' }
    });
  }
}

const QueryType = new GraphQLObjectType({
  name: 'Query',
  fields: {
    menu: {
      type: new GraphQLList(ProductType),
      args: {
        categoria: { type: GraphQLString },
        limit: { type: GraphQLInt }
      },
      resolve: (_source, args) => catalogService.listProducts(args.categoria, args.limit)
    },
    orders: {
      type: new GraphQLList(OrderType),
      args: { limit: { type: GraphQLInt } },
      resolve: (_source, args, context) => {
        requireAuthenticatedUser(context.user);
        return ordersService.listWithItems(context.user, Math.min(args.limit || 20, 20));
      }
    },
    dashboard: {
      type: DashboardType,
      args: { limit: { type: GraphQLInt } },
      resolve: async (_source, args, context) => {
        requireAuthenticatedUser(context.user);
        const [menu, orders] = await Promise.all([
          catalogService.listProducts('', Math.min(args.limit || 20, 20)),
          ordersService.listWithItems(context.user, Math.min(args.limit || 20, 20))
        ]);
        return { menu, orders };
      }
    }
  }
});

const schema = new GraphQLSchema({ query: QueryType });

module.exports = schema;
