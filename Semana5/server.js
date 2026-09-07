require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApolloServer, gql } = require('apollo-server-express');
const Producto = require('./Producto');

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
    addProducto: async (_, { input }) => {
      return await Producto.crear(input);
    },
    updProducto: async (_, { id, input }) => {
      return await Producto.actualizar(id, input);
    },
    delProducto: async (_, { id }) => {
      return await Producto.eliminar(id);
    }
  }
};

async function main() {
  const app = express();
  app.use(cors());

  const server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
  server.applyMiddleware({ app });

  // Frontend estatico en el mismo origen (evita bloqueo file:// y CORS).
  app.use(express.static(path.join(__dirname, 'frontend')));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Graphql Iniciado en http://localhost:${PORT}${server.graphqlPath}`);
    console.log(`Frontend La Nonna en http://localhost:${PORT}/`);
  });
}

main().catch((err) => console.error('Error al iniciar el servidor:', err));
