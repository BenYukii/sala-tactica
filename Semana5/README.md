# API de La Nonna — GraphQL + Express + MySQL (XAMPP)

Misma API GraphQL de antes, pero ahora los datos se guardan en MySQL en vez de MongoDB.

## 1. Requisitos

- Node.js instalado
- XAMPP instalado (Apache no es necesario para esto, solo el módulo **MySQL**)

## 2. Levantar MySQL con XAMPP

1. Abre el Panel de Control de XAMPP.
2. Dale **Start** al módulo **MySQL** (Apache no lo necesitas para esta API).
3. Abre `http://localhost/phpmyadmin` en el navegador.

## 3. Crear la base de datos

En phpMyAdmin, ve a la pestaña **SQL** y pega el contenido de `schema.sql` (o impórtalo directamente
desde la pestaña **Importar**). Esto crea la base `lanonna` y la tabla `productos`.

## 4. Instalar dependencias

```bash
cd la-nonna-api-mysql
npm install
```

## 5. Configurar la conexión

```bash
cp .env.example .env
```

Por defecto, XAMPP usa el usuario `root` sin contraseña, así que normalmente no necesitas cambiar nada.

## 6. Cargar el menú

```bash
npm run seed
```

## 7. Levantar el servidor

```bash
npm run dev
```

Deberías ver:
```
Graphql Iniciado en http://localhost:4000/graphql
```

## 8. Probar en Apollo Sandbox

Abre `http://localhost:4000/graphql` y prueba las mismas queries y mutations de siempre:

```graphql
query {
  getProductos(limit: 6) {
    id
    nombre
    precio
    categoria
  }
}
```

```graphql
mutation {
  addProducto(input: {
    nombre: "Tiramisú"
    descripcion: "Café, mascarpone y cacao."
    precio: 8
    categoria: "Postre"
  }) {
    id
    nombre
  }
}
```

## 9. Conectar con el sitio web

Igual que antes: con el servidor corriendo, abre `la-nonna-sketch.html`. El menú se carga
automáticamente desde MySQL a través de la API. Si el servidor no está corriendo, se ve el
menú estático de respaldo.

## 10. ¿Por qué MySQL en vez de MongoDB aquí?

Con MySQL, cada producto vive en una tabla con columnas fijas — útil porque el menú siempre
tiene la misma forma (nombre, descripción, precio, categoría). La diferencia frente a Mongoose
está en el modelo (`models/Producto.js`): en vez de un *schema* de documentos, ahora son funciones
que ejecutan SQL directo contra la tabla `productos`. El schema GraphQL y los resolvers de arriba
no cambiaron en su forma — solo cambió qué hay detrás.

## 11. ¿GraphQL o gRPC para este proyecto?

Igual que antes: GraphQL es la elección correcta porque hay un solo frontend público pidiendo
datos flexibles con bajo volumen de tráfico. gRPC tendría sentido si La Nonna tuviera varios
servicios internos de backend hablando entre sí en alto volumen (por ejemplo, un servicio de
reservas consultando disponibilidad de mesas miles de veces por segundo) — no es el caso aquí.
