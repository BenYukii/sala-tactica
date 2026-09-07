# Frontend La Nonna (Clase 10: GraphQL como frontend agregador)

Frontend estructurado a partir de `La-Nonna.html`: misma identidad visual,
pero separada en `index.html` + `css/styles.css` + `js/app.js`.

## Relacion con la clase

- **BFF / frontend agregador:** el frontend no habla a MySQL directo, habla a
  la API GraphQL (`http://localhost:4000/graphql`), igual que la Figura 1.
- **Pide solo lo necesario:** `getProductos { id nombre descripcion precio categoria }`
  e `getProductoById` para el detalle. Evita *overfetching*.
- **Paginacion y limites:** usa `limit` (backend acepta 1–50, defecto 20) y el
  boton "Ver mas platos" lo aumenta de 6 en 6. El filtro usa `categoria`.
- **Nulos y errores:** si un id no existe se muestra "Plato no encontrado";
  si la API esta apagada se muestra la carta estatica de respaldo.
- **GraphQL vs gRPC:** GraphQL porque hay un solo frontend publico con poco
  trafico pidiendo datos flexibles. gRPC seria para servicios internos en alto
  volumen (p. ej. reservas consultando mesas miles de veces por segundo).

## Como correrlo

1. Levanta MySQL en XAMPP y la API (carpeta `semana 5`):
   ```bash
   npm install
   npm run seed
   npm run dev
   ```
2. Abre `frontend/index.html` en el navegador (doble clic basta, no necesita build).
3. La linea bajo los filtros dice si ves datos en vivo o respaldo.

## Probar la API (Apollo Sandbox)

Abre `http://localhost:4000/graphql`:

```graphql
query {
  getProductos(limit: 6) { id nombre descripcion precio categoria }
}
```

```graphql
query {
  getProductoById(id: 1) { id nombre descripcion precio categoria }
}
```
