# La Nonna — Carta digital y solicitudes de reserva

**Proyecto de desarrollo web · Entrega de la semana 7**

🌐 **Demostración en línea:** [https://benyukii.github.io/sala-tactica/](https://benyukii.github.io/sala-tactica/)

La Nonna es una aplicación web ambientada en un restaurante familiar de cocina italiana. Permite conocer su propuesta gastronómica, explorar una carta de platos y enviar solicitudes de reserva desde una misma interfaz.

Esta entrega integra un frontend desarrollado con HTML, CSS y JavaScript con un backend en Node.js y Express. El servidor entrega la página y expone una API REST para consultar productos y registrar solicitudes. El propósito académico es demostrar la comunicación entre cliente y servidor, la organización del código en módulos, el uso de rutas y la validación de datos.

El repositorio conserva entregas en carpetas organizadas por semana. **Este documento describe la implementación de `Semana 7`**; los comandos de la aplicación se ejecutan dentro de esa carpeta.

## Contenido

- [Objetivos](#objetivos)
- [Funcionalidades](#funcionalidades)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Arquitectura y funcionamiento](#arquitectura-y-funcionamiento)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Instalación y configuración](#instalación-y-configuración)
- [Guía de uso](#guía-de-uso)
- [Referencia de la API REST](#referencia-de-la-api-rest)
- [Verificación del proyecto](#verificación-del-proyecto)
- [Alcance y limitaciones](#alcance-y-limitaciones)
- [Posibles mejoras](#posibles-mejoras)
- [Solución de problemas](#solución-de-problemas)

## Objetivos

### Objetivo general

Desarrollar una aplicación web que reúna la presentación de un restaurante, la consulta de su carta y la recepción de solicitudes de reserva, conectando una interfaz interactiva con una API REST.

### Objetivos específicos

- Construir una interfaz adaptable a pantallas de escritorio y dispositivos móviles.
- Separar la presentación, la interacción del usuario y el procesamiento de solicitudes.
- Reutilizar secciones de la página mediante componentes HTML.
- Consultar y presentar datos del servidor mediante `fetch`.
- Implementar rutas para productos y reservas con Express Router.
- Validar los datos del formulario en el navegador y en el servidor.
- Proteger la consulta de reservas con una clave de API.
- Mostrar mensajes de carga, validación, error y confirmación.

## Funcionalidades

| Área | Comportamiento implementado |
| --- | --- |
| Presentación | Portada, navegación por secciones, historia del restaurante e información de visita. |
| Carta digital | Catálogo de 12 platos con nombre, descripción, precio y categoría. |
| Filtros | Selección entre pasta fresca, horneados, clásicos, platos para compartir y postres. |
| Carga progresiva | Se muestran inicialmente 6 platos; «Ver más platos» amplía el listado en grupos de 6. |
| Detalle del plato | Ventana modal con la información del producto seleccionado. |
| Solicitud de reserva | Formulario con nombre, correo, cantidad de personas, fecha, hora y notas opcionales. |
| Validaciones | Campos obligatorios, formato de correo, grupos de 1 a 12 personas y fecha futura. |
| API REST | Consulta de productos, recepción de reservas y listado de reservas protegido. |
| Respaldo local | Si falla la consulta del catálogo, se utiliza una lista de productos incluida en JavaScript. |

La interfaz incorpora HTML semántico, etiquetas para los campos, atributos ARIA y avisos de estado. El modal permite cerrar con Escape y devuelve el foco al botón que lo abrió. El diseño también contempla la preferencia de movimiento reducido. Estas medidas no equivalen a una auditoría completa de accesibilidad.

## Tecnologías utilizadas

| Tecnología | Uso en el proyecto |
| --- | --- |
| HTML5 | Estructura de la página y componentes de cada sección. |
| CSS3 | Identidad visual, distribución y adaptación a distintas pantallas. |
| JavaScript | Componentes, filtros, modal, validaciones y comunicación con la API. |
| Node.js | Ejecución del servidor. |
| Express 4 | Servidor HTTP, archivos estáticos, middleware y rutas REST. |
| CORS | Middleware para habilitar solicitudes entre orígenes. |
| dotenv | Lectura de configuración desde `.env`. |
| npm | Instalación de dependencias y ejecución de scripts. |
| Google Fonts | Tipografías Fraunces y Work Sans utilizadas en la interfaz. |

El frontend no utiliza un framework ni requiere un proceso de compilación. Los productos se definen en un módulo JavaScript y las reservas se almacenan en memoria; esta entrega no necesita una base de datos.

## Arquitectura y funcionamiento

La aplicación utiliza una arquitectura cliente-servidor. `server.js` cumple el papel de **API Gateway dentro de esta entrega**: entrega los archivos del frontend y dirige las solicitudes de `/api` hacia los routers correspondientes. Todo se ejecuta en una sola aplicación Express; no hay microservicios independientes.

```text
Navegador
   |
   +-- GET / ----------------------> Frontend: HTML, CSS y JavaScript
   |
   +-- /api -----------------------> server.js + routes/index.js
                                        |
                                        +-- /productos --> data/productos.js
                                        |
                                        +-- /reservas ---> almacenamiento en memoria
                                                |
                                                +-- GET: validación de x-api-key
```

### Carga de la carta

1. El navegador solicita la página al servidor.
2. `components.js` carga los fragmentos HTML y emite el evento `components:loaded`.
3. `app.js` inicializa los controles y solicita `GET /api/productos?limit=50`.
4. La respuesta se guarda como catálogo en el navegador. Los filtros, el botón para ver más y el modal trabajan sobre ese catálogo, sin nuevas solicitudes por cada interacción.
5. Si la API no responde correctamente, se utiliza el catálogo de respaldo local.

### Envío de una solicitud de reserva

1. El usuario completa el formulario.
2. El navegador valida los campos y muestra los errores junto a cada uno.
3. Si la API se detectó como disponible al cargar el catálogo, se envían los datos en JSON a `POST /api/reservas`.
4. El servidor vuelve a validar los datos y almacena la solicitud con el estado `recibida`.
5. La interfaz presenta el resultado. Si opera en modo local, indica que la solicitud no se guardó en un servidor.

**Una solicitud recibida no representa una mesa confirmada.** Esta versión no comprueba disponibilidad ni envía correos, aunque el texto de la interfaz anuncie una futura confirmación por correo.

## Estructura del proyecto

```text
Semana 7/
├── README.md                 # Documentación de esta entrega
├── package.json              # Dependencias y scripts
├── .env.example              # Ejemplo de configuración
├── .gitignore                # Excluye .env y node_modules
├── server.js                 # Servidor, gateway y archivos estáticos
├── data/
│   └── productos.js          # Catálogo de 12 platos
├── middleware/
│   └── apiKey.js             # Protección del listado de reservas
├── routes/
│   ├── index.js              # Estado de la API y distribución de rutas
│   ├── productos.js          # Consulta y filtrado de productos
│   └── reservas.js           # Validación, creación y listado de reservas
└── frontend/
    ├── index.html            # Página base y espacios para componentes
    ├── components/
    │   ├── header.html       # Identidad y navegación
    │   ├── hero.html         # Presentación principal
    │   ├── menu.html         # Carta y filtros
    │   ├── modal.html        # Ventana de detalle
    │   ├── story.html        # Historia del restaurante
    │   ├── reservation.html  # Información de visita y formulario
    │   └── footer.html       # Pie de página
    ├── css/
    │   └── styles.css        # Estilos y reglas responsive
    └── js/
        ├── components.js    # Carga de fragmentos HTML
        └── app.js           # Interacciones y conexión con la API
```

## Instalación y configuración

### Requisitos

- Node.js 18 o superior como requisito mínimo de esta entrega.
- npm disponible en la terminal.
- Un navegador con JavaScript habilitado.
- Conexión a internet para instalar dependencias y cargar las fuentes externas.

Puedes comprobar la instalación con:

```powershell
node --version
npm --version
```

### 1. Instalar las dependencias

Desde la raíz del repositorio:

```powershell
cd "Semana 7"
npm install
```

Si ya estás dentro de `Semana 7`, ejecuta únicamente `npm install`.

### 2. Configurar el entorno

Crea un archivo `.env` a partir de [.env.example](.env.example). En PowerShell, si todavía no tienes un `.env`:

```powershell
Copy-Item .env.example .env
```

Edita el archivo para definir el puerto y una clave propia:

```dotenv
PORT=4000
ADMIN_API_KEY=coloca-aqui-tu-clave
```

| Variable | Función | Comportamiento si no se configura |
| --- | --- | --- |
| `PORT` | Puerto HTTP del servidor. | Utiliza `4000`. |
| `ADMIN_API_KEY` | Clave para consultar las reservas. | Utiliza la clave de demostración `lanonna-clase-2026`. |

El archivo `.env` está excluido del repositorio. La clave se utiliza desde un cliente de API o una terminal para consultar reservas; no se introduce en el formulario público.

### 3. Iniciar la aplicación

```powershell
npm start
```

Abre [La Nonna en localhost](http://localhost:4000). También puedes consultar el [estado de la API](http://localhost:4000/api). Si cambiaste el puerto, ajusta ambas direcciones.

Mantén la terminal abierta mientras utilizas la aplicación. Para detener el servidor, presiona `Ctrl+C`.

### Scripts disponibles

| Comando | Función |
| --- | --- |
| `npm start` | Inicia el servidor con Node.js. |
| `npm run dev` | Inicia el servidor con vigilancia de cambios mediante `node --watch`. |
| `npm run check` | Revisa la sintaxis de `server.js`, `components.js` y `app.js`. |

No se necesita XAMPP, MySQL ni Uvicorn. Abre la aplicación mediante HTTP: abrir `index.html` directamente con doble clic puede impedir que `fetch` cargue los componentes.

## Guía de uso

1. **Explorar la página:** utiliza la navegación para visitar la carta, la historia y la sección de reservas.
2. **Consultar platos:** selecciona una categoría o utiliza «Todos». Pulsa «Ver más platos» para ampliar la selección visible.
3. **Ver detalles:** pulsa «Ver detalle» en una tarjeta. Cierra el modal con su botón, con Escape o haciendo clic fuera de la ventana.
4. **Solicitar una mesa:** ingresa nombre, correo, cantidad de personas y una fecha y hora futuras. Añade notas si lo necesitas.
5. **Revisar el resultado:** corrige los campos indicados o comprueba si la solicitud fue registrada por la API. Puedes iniciar otra solicitud desde la confirmación.

La consulta administrativa de reservas se realiza a través de la API; no existe un panel de administración en la interfaz.

## Referencia de la API REST

**URL base local:** `http://localhost:4000/api`.

Las respuestas de estas rutas utilizan JSON. Para enviar una reserva, incluye `Content-Type: application/json`.

| Método | Ruta | Descripción | Acceso |
| --- | --- | --- | --- |
| `GET` | `/api` | Informa el estado del gateway y sus rutas. | Público |
| `GET` | `/api/productos` | Devuelve productos, con filtro y límite opcionales. | Público |
| `GET` | `/api/productos/:id` | Devuelve un producto por su identificador. | Público |
| `POST` | `/api/reservas` | Valida y registra una solicitud de reserva. | Público |
| `GET` | `/api/reservas` | Devuelve las solicitudes guardadas en memoria. | Requiere `x-api-key` |

### Consultar productos

```http
GET /api/productos?categoria=Postre&limit=6
```

| Parámetro | Descripción |
| --- | --- |
| `categoria` | Opcional. Coincidencia por categoría sin distinguir mayúsculas y minúsculas. Sin filtro devuelve todas las categorías. |
| `limit` | Opcional. Se interpreta como entero y se ajusta al rango de 1 a 50. Si no se proporciona o no se puede interpretar, utiliza 20. |

Los valores de categoría son `Pasta fresca`, `Horneado`, `Clasico`, `Para compartir` y `Postre`. En las solicitudes utiliza `Clasico` sin tilde. Una categoría sin coincidencias devuelve `[]`.

Ejemplo de respuesta a `GET /api/productos/1`:

```json
{
  "id": 1,
  "nombre": "Lasagna alla Nonna",
  "descripcion": "Ragú lento, bechamel, doce capas y bordes dorados.",
  "precio": 18,
  "categoria": "Horneado"
}
```

### Crear una solicitud de reserva

```http
POST /api/reservas
Content-Type: application/json
```

Ejemplo de cuerpo; sustituye la fecha por una futura al realizar la prueba:

```json
{
  "name": "Persona de ejemplo",
  "email": "ejemplo@correo.cl",
  "people": 4,
  "datetime": "2026-12-10T19:30",
  "notes": "Mesa junto a la ventana"
}
```

| Campo | Obligatorio | Regla aplicada por la API |
| --- | --- | --- |
| `name` | Sí | Al menos 2 caracteres después de quitar espacios exteriores. |
| `email` | Sí | Formato de correo comprobado mediante una expresión regular. |
| `people` | Sí | Valor convertible a un número entero entre 1 y 12. |
| `datetime` | Sí | Fecha interpretable y posterior al momento de la solicitud. |
| `notes` | No | Se guarda como texto sin espacios exteriores; por defecto es una cadena vacía. |

La respuesta exitosa tiene código `201`. Ejemplo para la primera reserva tras iniciar el servidor:

```json
{
  "message": "Solicitud de reserva recibida",
  "reserva": {
    "id": 1,
    "name": "Persona de ejemplo",
    "email": "ejemplo@correo.cl",
    "people": 4,
    "datetime": "2026-12-10T19:30",
    "notes": "Mesa junto a la ventana",
    "estado": "recibida"
  }
}
```

### Consultar reservas desde PowerShell

Con el servidor activo, abre una segunda terminal. Reemplaza el valor del encabezado por la clave de tu `.env`:

```powershell
$headers = @{ "x-api-key" = "coloca-aqui-tu-clave" }
Invoke-RestMethod -Uri "http://localhost:4000/api/reservas" -Headers $headers
```

La respuesta es un arreglo de reservas. Si todavía no hay solicitudes, la API devuelve `[]`.

### Códigos de respuesta

| Código | Situación |
| --- | --- |
| `200` | Consulta completada correctamente. |
| `201` | Solicitud de reserva creada. |
| `400` | Algún dato de la reserva no supera la validación. |
| `401` | Falta la clave de API o es incorrecta al consultar reservas. |
| `404` | Producto inexistente o ruta desconocida dentro de `/api`. |
| `500` | Error capturado por el manejador general del servidor. |

Ejemplo de error de validación:

```json
{
  "error": "La cantidad debe estar entre 1 y 12"
}
```

## Verificación del proyecto

Desde `Semana 7`, ejecuta:

```powershell
npm run check
```

Este comando comprueba la sintaxis de tres archivos principales. **No ejecuta pruebas funcionales ni revisa todos los módulos del backend.**

Para revisar manualmente el funcionamiento con el servidor activo:

| Comprobación | Resultado esperado |
| --- | --- |
| Abrir `/` | Se cargan las secciones y los primeros 6 platos. |
| Seleccionar «Postre» | Se muestran Tiramisú y Panna Cotta. |
| Seleccionar «Todos» y luego «Ver más platos» | Se muestran los 12 productos. |
| Abrir un detalle y cerrarlo con Escape | El modal se cierra y el foco vuelve al botón de origen. |
| Enviar el formulario vacío o con una fecha pasada | Se muestran errores y no se envía la solicitud. |
| Enviar una reserva válida | La interfaz indica que la API registró la solicitud. |
| Consultar `/api/reservas` con la clave configurada | Aparece la solicitud registrada. |
| Consultar `/api/reservas` sin clave | La API responde `401`. |
| Consultar `/api/productos/999` | La API responde `404`. |
| Reiniciar el servidor y consultar reservas | El listado vuelve a estar vacío. |
| Reducir el ancho del navegador | La distribución se adapta al tamaño de la pantalla. |

Esta tabla es una guía de revisión; no constituye un registro de pruebas ejecutadas.

## Alcance y limitaciones

- **Persistencia temporal:** las reservas se guardan en memoria y se pierden al reiniciar el servidor. Los identificadores también comienzan nuevamente desde 1.
- **Sin gestión de disponibilidad:** no se asignan mesas, no se controlan cupos ni se confirman o cancelan reservas.
- **Sin envío de correos:** el correo se recopila como dato de contacto. No hay integración con un servicio de mensajería.
- **Sin cuentas de usuario:** el listado de reservas usa una clave compartida como mecanismo de demostración; no existen sesiones ni roles.
- **Catálogo de demostración:** los productos se editan en `data/productos.js`. Los precios se muestran con `$`, sin una moneda especificada en el modelo de datos.
- **Modo local limitado:** el respaldo permite consultar platos cuando falla la API, siempre que los componentes HTML puedan cargarse desde un servidor HTTP. Las solicitudes del modo local no se guardan.
- **Configuración horaria:** el formulario envía fecha y hora sin zona horaria explícita. No hay normalización entre navegador y servidor en zonas diferentes.
- **Configuración para demostración:** CORS está habilitado de forma general y existe una clave predeterminada. La entrega no implementa todas las medidas necesarias para un servicio público de producción.
