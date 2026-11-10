# Registro de evidencias

## Resultados automatizados

Verificación realizada el **9 de noviembre de 2026**, Windows, Node.js v24.20.0, desde `Codigo/api-la-nonna`.

| Comprobación | Resultado comprobado | Alcance/límite |
|---|---|---|
| `npm run check` | Aprobado; sintaxis de servidor, módulos, pruebas y frontend. | No valida comportamiento por sí sola. |
| `npm test` | **10/10 aprobadas.** Nueve pruebas legacy y una prueba integrada que levanta ocho procesos independientes; cubre gateway, claims firmados, tokens internos válidos/incorrectos/emisor desconocido, stock, propiedad, GraphQL, rate limit, webhook y cancelación. | Usa procesos y SQLite temporales; no valida el aislamiento real de la red Docker ni proveedor financiero. |
| `npm run loadtest` | 100 solicitudes, concurrencia 10, 0 errores HTTP, 1258.05 req/s; p50 5.94 ms, p95 17.53 ms, máximo 24.51 ms. CPU user/system +63,000/+16,000 µs; RSS 64,966,656 -> 74,149,888 bytes; heap final 20,184,304 bytes. | Una ejecución local corta; no es prueba de capacidad de producción. Procedimiento en [ADR-001](../ADR/ADR-001-analitica-grpc.md). |
| Flujo en navegador | Capturas guardadas: menú, registro, selección de platos y compra; el equipo confirmó que el correo de prueba es ficticio. | Webpay sigue siendo ficticio/simulado. No se conectó a Webpay/Transbank. |
| Migración SQLite heredada | Verificación manual con esquema previo: `product_name` se agregó y se rellenó para un pedido existente. | Instancia temporal; cubre la migración del snapshot, no toda combinación de esquema histórica. |
| Bootstrap admin de producción | Verificación manual con `NODE_ENV=production`: creó administrador y perfil desde variables; no se sembraron cuentas demo. | Credenciales ficticias y base temporal; valores reales deben inyectarse fuera del repositorio. |
| Docker Compose + Vault | `config --quiet`, build y `up --wait` aprobados; bootstrap Vault completado y ocho servicios healthy. | Solo Gateway publica `4000`; Vault no publica puerto. Para los ocho tokens, lectura del path propio = 200 y del path ajeno = 403. Se confirmó que Auth lee el bootstrap admin desde Vault y que registro, pedido, pago simulado y GraphQL funcionan. El secreto raíz fue aleatorio, temporal y no se registró en el repositorio. Vault modo dev es volátil y solo para evaluación local. |

El benchmark es reproducible con `npm run loadtest`; usa cuentas demo solo en la base temporal, recolecta CPU/memoria del proceso API y no modifica `data/la-nonna.db`.

## Matriz de pruebas y brechas

| ID | Escenario | Estado |
|---|---|---|
| T01 | Health `/health` y `/api/health`, incluyendo SQLite | Automatizado: 200 y JSON de dependencia. |
| T02 | GraphQL agrega catálogo y pedidos del usuario autenticado | Automatizado y flujo conectado al frontend. |
| T03 | GraphQL anónimo, introspección, límites de campos | Automatizado: pedidos anónimos rechazados por GraphQL; introspección y exceso de campos responden 400. |
| T04 | Usuario no dueño consulta/paga pedido ajeno | Automatizado: 403. |
| T05 | Usuario intenta administrar inventario/métricas | Automatizado: 403; admin puede gestionar y consultar movimientos. |
| T06 | Duplicación de artículos, sobreventa, reposición y snapshot del pedido | Automatizado con SQLite y transacciones. |
| T07 | Registro, perfil propio y actualización | Automatizado; datos y sesión persistidos. |
| T08 | Pago con monto del servidor, replay de Idempotency-Key y cancelación | Automatizado: mismo pago en replay, pedido confirmado, pago de prueba reembolsado al cancelar. |
| T09 | Benchmark REST/GraphQL y decisión analítica/gRPC | Ejecución local documentada en ADR-001; no prueba carga de producción. |
| T10 | Build/ejecución de Docker Compose y aislamiento de red | Verificado localmente: ocho servicios healthy; solo Gateway publica puerto; `docker compose ps` confirma que los puertos de Auth, Clients, Inventory, Orders, Payments, Reservations y GraphQL no se publican. |
| T11 | Token interno incorrecto o emisor no permitido | Automatizado: el servicio privado responde 401 al token de otro enlace y a un emisor desconocido. |
| T12 | Firma HMAC, rechazo de firma inválida, repetición y alteración de `event_id` | Automatizado en la prueba de procesos locales; el proveedor Webpay sigue siendo ficticio. |
| T13 | Vault KV v2, secretos de runtime y permisos por servicio | Verificado bajo Compose: cada servicio lee solo su path; lectura de path ajeno devuelve 403. El token raíz se reserva al bootstrap y los logs del contenedor Vault están desactivados para evitar que el modo dev lo exponga. |
| T14 | Vault productivo, almacenamiento persistente, TLS y rotación | No implementado; la instancia Compose usa `-dev` y no representa un despliegue productivo. |
| T15 | Evidencia visual formal con capturas | Menú, registro, pedido y compra guardados en `capturas/` e integrados en el informe principal. El equipo confirmó que el correo visible en la captura de registro es ficticio. |

## Dependencias

Se actualizó SQLite a 6.0.1 y se aplicaron actualizaciones compatibles de transitivas; `npm ci` completó y `npm audit` informó **0 vulnerabilidades**. Las 9 alertas anteriores incluyeron dependencias vulnerables de la versión antigua de SQLite; `npm run check` y `npm test` se volvieron a ejecutar tras el cambio. SQLite 6 y el lockfile deben volver a verificarse en cada instalación.

## Organización de evidencia visual

El informe principal muestra en contexto las capturas `menu.png`, `registro.png`, `pedido.png` y `compra.png`, además de los diagramas C1/C2.

Si reemplazas las capturas, inicia el stack siguiendo los comandos de Vault del informe, usa datos ficticios y captura con `Win + Shift + S`. No incluyas contraseñas, tokens, cookies, correos reales ni el token raíz de Vault. Una pantalla que oculte un botón no sustituye una denegación de autorización del servidor.
