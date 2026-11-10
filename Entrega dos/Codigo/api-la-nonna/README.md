# API REST y frontend — La Nonna

## Ejecución local

Desde esta carpeta, en PowerShell, para validar el código y ejecutar pruebas:

```powershell
Copy-Item .env.example .env
npm ci
npm run check
npm test
npm start
```

`npm start` conserva el servidor monolítico anterior para compatibilidad con los ejercicios históricos; no representa la topología de despliegue actual. La arquitectura de servicios se inicia mediante Docker Compose y publica `http://localhost:4000/`.

## Topología de servicios

`src/microservices/server.js` inicia un proceso por `SERVICE_NAME`: `gateway`, `auth`, `clients`, `inventory`, `orders`, `payments`, `reservations` o `graphql`. `compose.yaml` los ejecuta como contenedores distintos. Solo `gateway` tiene `ports`; todos están en una red privada interna. Cada servicio de dominio tiene su propio archivo SQLite y volumen:

| Servicio | Datos propios | Colaboraciones HTTP internas |
|---|---|---|
| Auth | usuarios y sesiones | introspección, registro y revocación solicitados por gateway/clients |
| Clients | perfiles | creación de identidad en Auth |
| Inventory | menú, stock, movimientos y reservas idempotentes | Orders reserva/libera stock; GraphQL consulta menú |
| Orders | pedidos y líneas snapshot | Inventory reserva; Payments/GraphQL consultan pedidos; Payments confirma pedido |
| Payments | pagos y eventos de webhook | Orders valida monto/propietario y recibe confirmación |
| Reservations | solicitudes | Gateway |
| GraphQL | sin base de datos | Inventory y Orders |

El servidor raíz `server.js` sigue disponible para compatibilidad, pero `npm test` también levanta los procesos separados y prueba el recorrido real del Gateway.

## Contratos REST

| Ruta | Acceso | Comportamiento |
|---|---|---|
| `GET /api/productos?categoria=&limit=` | Público | Gateway → Inventory; lee el catálogo propio del servicio. |
| `GET /api/productos/:id` | Público | Consulta un producto. |
| `POST /api/login`, `GET /api/me`, `POST /api/logout` | Sesión | Login, identidad y revocación. Enviar `Authorization: Bearer <access_token>`. |
| `POST /api/clients/register` | Público | Clients crea identidad en Auth y perfil en su DB; responde con la sesión. |
| `GET/PATCH /api/clients/me` | Cliente autenticado | Lee o actualiza solo el propio perfil. |
| `POST /api/reservas` | Público | Valida y persiste solicitud de reserva. |
| `GET /api/reservas`, `PATCH /api/reservas/:id/status` | Administrador | Consulta y administra reservas. |
| `POST /api/orders` | Cliente autenticado | Orders solicita a Inventory reserva atómica con snapshot de precios, luego persiste en su DB; libera stock si falla. Acepta `{ "items": [{ "product_id": 1, "quantity": 2 }] }`. |
| `GET /api/orders`, `GET /api/orders/:id` | Propietario; admin con alcance administrativo | Lista limitada o consulta pedidos. |
| `PATCH /api/orders/:id/status` | Administrador | Aplica transición permitida. Cancelar solicita a Inventory liberar la reserva de forma idempotente y actualiza el pago. |
| `POST /api/payments` | Dueño del pedido | Requiere `Idempotency-Key` (8–128 caracteres) y `{ "order_id": 1 }`; consulta el monto en Orders por HTTP interno, nunca del cliente. |
| `POST /api/payments/webhooks/webpay` | Callback | Acepta firma HMAC válida de `WEBPAY_WEBHOOK_SECRET`, timestamp dentro de 5 minutos y evento no alterado/reprocesado. |
| `GET /api/payments`, `GET /api/payments/:id` | Propietario; admin | Consulta pagos; nunca devuelve la clave de idempotencia. |
| `POST/PATCH /api/inventory/products`, `POST /api/inventory/products/:id/stock`, `GET /api/inventory/movements` | Administrador | Administra catálogo, stock y su libro de movimientos. |
| `GET /health`, `GET /api/health` | Público | Health del proceso/Gateway; cada servicio privado prueba su propia DB en su `/health`. |
| `GET /api/metrics` | Administrador | Devuelve memoria/CPU del proceso; requiere sesión y rol admin. |

Los servicios escriben exclusivamente su base. La colaboración entre Inventory, Orders y Payments es HTTP y usa reservas/compensaciones idempotentes: no es una transacción distribuida ACID. Las líneas de pedido conservan snapshots de nombre/precio.

`GET /health` en cada proceso comprueba su proceso/base propia; `/api/health` comprueba el Gateway. La identidad de `/api/me` se obtiene de la sesión validada por Auth y `POST /api/logout` la revoca.

## Adaptador de pagos

`src/modules/payments/webpaySimulator.js` es un proveedor **ficticio** que usa el nombre Webpay únicamente como escenario simulado de la entrega. No es software, sandbox, API ni integración oficial de Webpay/Transbank. Aprueba pagos localmente sin tarjeta ni comunicación financiera. El monto proviene de Orders; se conserva una referencia `webpay_sim_` y una clave idempotente única.

La notificación simulada firma `timestamp + "." + raw_body` con HMAC-SHA256. Payments usa comparación de tiempo constante, rechaza timestamps fuera de 300 segundos, guarda un hash del payload por `event_id` único y solo procesa el mismo aviso una vez. Si Orders no está disponible, el evento queda pendiente y puede reintentarse. El endpoint de webhook está en la allowlist del Gateway; el proveedor real no está conectado.

No usar este simulador para cobrar en producción. No hay integración oficial con Webpay/Transbank, PAN/CVV, conciliación, liquidación ni Vault.

## GraphQL Gateway

`POST /api/graphql` se enruta desde Gateway al proceso privado GraphQL y agrega Inventory/Orders por HTTP interno. Las operaciones de pedidos requieren bearer token; el catálogo es público. La respuesta de Orders se limita al usuario autenticado salvo que sea administrador.

Se rechaza introspección/fragmentos y se aplican máximos de 10.000 caracteres, 40 campos, profundidad 6 y 3 segundos por llamada interna. Los listados GraphQL se limitan a 20 elementos.

```graphql
query {
  dashboard(limit: 5) {
    menu { id nombre precio }
    orders { id status total items { product_id nombre quantity unit_price } }
  }
}
```

Envíala como JSON con `POST /api/graphql`. Para `orders`/`dashboard`, incluye `Authorization: Bearer <access_token>`. La sección “Mi cuenta” ofrece registro/login, creación de pedido desde los platos añadidos y pago de prueba.

## Pruebas y medición

```powershell
npm run check
npm test
npm run loadtest
```

`npm test` corre nueve pruebas del servidor legacy y una prueba integrada que levanta ocho procesos independientes con bases temporales; comprueba contratos, identidad, allowlist, stock, propiedad, GraphQL, rate limit, webhook inválido/duplicado y cancelación. `npm run loadtest` todavía mide el servidor legacy, no los microservicios; no es una prueba de capacidad de producción.

## Docker Compose y Vault

Requiere Docker Engine y Compose. La configuración de ejemplo está en `.env.example`; los comandos siguientes copian esa plantilla a un archivo temporal y guardan allí el token raíz local, fuera del repositorio. El bootstrap genera las credenciales de runtime, habilita políticas de lectura por servicio en KV v2 y entrega a cada contenedor un token Vault de solo lectura para su propio secreto.

```powershell
$vaultEnv = Join-Path $env:TEMP 'la-nonna-vault.env'
Copy-Item .env.example $vaultEnv -Force
$vaultRoot = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
(Get-Content $vaultEnv) -replace '^VAULT_DEV_ROOT_TOKEN=.*$', "VAULT_DEV_ROOT_TOKEN=$vaultRoot" | Set-Content $vaultEnv
docker compose --env-file $vaultEnv config --quiet
docker compose --env-file $vaultEnv up --build -d --wait
docker compose --env-file $vaultEnv ps
docker compose --env-file $vaultEnv logs -f gateway
```

El archivo de entorno temporal queda fuera del repositorio sincronizado; usa el mismo `--env-file $vaultEnv` para los comandos Compose posteriores. Solo el puerto del Gateway se publica; Auth, Vault y los demás servicios solo son accesibles en la red privada Docker. Cada servicio de datos tiene un volumen independiente. `docker compose --env-file $vaultEnv down` conserva los volúmenes de datos, pero Vault dev es volátil: al levantar de nuevo, el bootstrap genera secretos nuevos y reemplaza los tokens de lectura. En la validación local, `config --quiet`, build, `up --wait` y los ocho healthchecks pasaron; se confirmó que solo Gateway publica `4000`, y registro, pedido, pago simulado y GraphQL funcionaron a través de la topología protegida por Vault. La primera imagen falló porque el binario precompilado de SQLite requería glibc 2.38; el Dockerfile se corrigió a compilación desde fuente en etapa builder Bookworm y la pila quedó saludable.

`vault-bootstrap` debe finalizar correctamente antes de iniciar cualquier servicio. Revisa `docker compose logs vault-bootstrap` y confirma que no haya mostrado errores. No imprimas ni compartas valores secretos o tokens en logs/capturas. Vault no publica puerto al host.

## Límites de seguridad conocidos

- El monolito legacy `server.js` no es el despliegue objetivo; Compose usa los procesos de `src/microservices/`.
- Vault Compose utiliza `-dev`: almacenamiento en memoria, token raíz local, sin TLS ni persistencia. Es solo para desarrollo/entrega; no usar en producción.
- El token raíz se usa únicamente por Vault y el inicializador; cada microservicio recibe un token Vault de lectura limitado a su propio path. Los secretos de negocio se generan en el bootstrap y no se guardan en `.env`.
- Los tokens de lectura de Vault son de larga duración en este prototipo local y no se rotan automáticamente. Producción requiere auth de workload, TTL corto/renovación, TLS, almacenamiento persistente y auditoría.
- El contenedor Vault usa logging desactivado porque el modo dev imprime el token raíz durante el arranque. No habilites sus logs ni compartas el token raíz.
- Webpay es ficticio; la firma es un contrato académico probado localmente, no una integración oficial.
- La red Docker se declara privada, pero su aislamiento requiere ejecución de Compose en un host con Docker.
- Las métricas se exponen solo a administradores; el health check público revela estado de dependencia, no valores sensibles.
- El servicio `auth` de `src/microservices/` es el que integra el despliegue. El proyecto antiguo `Codigo/auth-service` es independiente y no participa en el flujo actual.
- Mantén `.env`, la base local y tokens fuera de Git y de logs.
