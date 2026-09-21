# La Nonna — Frontend y API REST

La Nonna es una aplicación web para consultar la carta de un restaurante y
enviar solicitudes de reserva. Utiliza HTML5, CSS y JavaScript en el frontend,
y Node.js con Express para implementar un API Gateway, routing y una API REST.

No requiere base de datos: los platos se encuentran en un módulo local y las
reservas se mantienen temporalmente en memoria mientras el servidor está activo.

## Requisitos

- Node.js 18 o superior.
- npm.

## Instalación y ejecución

Desde la carpeta `Semana 7`:

```powershell
npm install
npm start
```

Abre en el navegador:

```text
http://localhost:4000
```

Para desarrollo con reinicio automático:

```powershell
npm run dev
```

No es necesario utilizar XAMPP, MySQL ni Uvicorn.

## Arquitectura

```text
Navegador
   │
   ├── GET /                  → frontend HTML/CSS/JavaScript
   │
   └── /api                   → API Gateway (server.js)
          ├── /productos      → router de productos
          └── /reservas       → router de reservas
```

`server.js` funciona como puerta única de entrada. El gateway aplica middleware,
recibe las solicitudes bajo `/api` y utiliza `routes/index.js` para dirigirlas al
router correspondiente.

## Rutas de la API

### Estado del gateway

```http
GET /api
```

### Productos

```http
GET /api/productos
GET /api/productos?categoria=Postre&limit=6
GET /api/productos/:id
```

### Reservas

```http
POST /api/reservas
GET /api/reservas
```

El listado de reservas es privado y requiere el encabezado:

```text
x-api-key: valor-de-ADMIN_API_KEY
```

Ejemplo de una reserva:

```json
{
  "name": "Ejemplo",
  "email": "ejemplo@correo.cl",
  "people": "4",
  "datetime": "2026-12-10T19:30",
  "notes": "Mesa junto a la ventana"
}
```

## Funciones del frontend

- Página principal con navegación semántica.
- Interfaz modular cargada desde componentes HTML reutilizables.
- Carta de doce platos.
- Filtros por categoría y botón para mostrar más.
- Detalle de cada plato mediante un modal accesible.
- Formulario de reserva con validaciones en JavaScript.
- Validación adicional de datos en la API.
- Mensajes de error y confirmación.
- Diseño responsive para computador y dispositivos móviles.
- Respaldo local de productos si la interfaz se sirve sin la API.

## Organización

```text
Semana 7/
├── server.js                 # API Gateway
├── package.json
├── .gitignore
├── .env.example
├── data/
│   └── productos.js
├── middleware/
│   └── apiKey.js
├── routes/
│   ├── index.js              # Router principal
│   ├── productos.js          # API REST de productos
│   └── reservas.js           # API REST de reservas
└── frontend/
    ├── index.html
    ├── components/
    │   ├── header.html
    │   ├── hero.html
    │   ├── menu.html
    │   ├── modal.html
    │   ├── story.html
    │   ├── reservation.html
    │   └── footer.html
    ├── css/styles.css
    └── js/
        ├── components.js     # Carga los componentes HTML
        └── app.js            # Interacción y conexión con la API
```
