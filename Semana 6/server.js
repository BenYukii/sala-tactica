require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApolloServer, gql } = require('apollo-server-express');
const Producto = require('./Producto');
const productosRouter = require('./routes/productos');
const ordenesRouter = require('./routes/ordenes');
const pagosRouter = require('./routes/pagos');
const { claveAdmin } = require('./middleware/auth');

// --- Schema GraphQL: types, input, Query, Mutation ---
const typeDefs = gql`
  type Producto {
    id: ID!
    nombre: String!
    descripcion: String!
    precio: Float!
    categoria: String!
    imagen: String
  }

  input ProductoInput {
    nombre: String!
    descripcion: String!
    precio: Float!
    categoria: String!
    imagen: String
  }

  type Alert {
    message: String!
  }

  type Query {
    "limit evita traer demasiados resultados de una sola vez (paginacion simple)"
    getProductos(limit: Int, categoria: String): [Producto]
    getProductoById(id: ID!): Producto
  }

  type Mutation {
    addProducto(input: ProductoInput!): Producto
    updProducto(id: ID!, input: ProductoInput!): Producto
    delProducto(id: ID!): Alert
  }
`;

// Las mutations son PRIVADAS: exigen la clave de .env (ADMIN_API_KEY)
// en el header x-api-key. Las queries son publicas.
function exigirAdmin(ctx) {
  if (!ctx || ctx.apiKey !== claveAdmin()) {
    throw new Error('No autorizado: las mutations son privadas (envia el header x-api-key)');
  }
}

// --- Resolvers: conectan el schema con el modelo (que habla con MySQL) ---
const resolvers = {
  Query: {
    getProductos: async (_, { limit, categoria }) => {
      return await Producto.obtenerTodos(categoria, limit);
    },
    getProductoById: async (_, { id }) => {
      return await Producto.obtenerPorId(id);
    }
  },
  Mutation: {
    addProducto: async (_, { input }, ctx) => {
      exigirAdmin(ctx);
      return await Producto.crear(input);
    },
    updProducto: async (_, { id, input }, ctx) => {
      exigirAdmin(ctx);
      return await Producto.actualizar(id, input);
    },
    delProducto: async (_, { id }, ctx) => {
      exigirAdmin(ctx);
      return await Producto.eliminar(id);
    }
  }
};

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json()); // necesario para POST/PUT con JSON en REST

  // Tres microservicios detras del gateway: Productos (MySQL),
  // Ordenes y Pagos (simulados en memoria). Ordenes y Pagos son
  // 100% privados; Productos mezcla GET publicos + escritura privada.
  app.use('/api', productosRouter);
  app.use('/api', ordenesRouter);
  app.use('/api', pagosRouter);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    // La clave viaja en el header y llega a las mutations como ctx.apiKey
    context: ({ req }) => ({ apiKey: req.headers['x-api-key'] })
  });
  await server.start();
  server.applyMiddleware({ app });

  // Frontend estatico en el mismo origen (evita bloqueo file:// y CORS).
  app.use(express.static(path.join(__dirname, 'frontend')));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Graphql Iniciado en http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`Frontend La Nonna en http://localhost:${PORT}/`);
    console.log('Microservicios tras el gateway (todos autorizados con x-api-key,');
    console.log('salvo los GET de productos que son publicos):');
    console.log(`  API Productos: http://localhost:${PORT}/api/productos`);
    console.log(`  API Ordenes:   http://localhost:${PORT}/api/ordenes`);
    console.log(`  API Pagos:     http://localhost:${PORT}/api/pagos`);
  });
}

main().catch((err) => console.error('Error al iniciar el servidor:', err));
