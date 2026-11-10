# ADR-001: No incorporar analítica de alto volumen ni gRPC

- **Estado:** Aceptado para la entrega académica; revisar si cambian los requisitos.
- **Fecha:** 2026-11-09.
- **Contexto:** La Nonna opera solicitudes transaccionales (reservas, clientes, inventario, pedidos y pagos) y consultas acotadas de catálogo/pedidos. Los dominios se ejecutan como procesos separados y colaboran por HTTP REST interno; GraphQL agrega mediante contratos HTTP. La prueba disponible valida funcionalidad, no demuestra que otro protocolo mejore latencia/costo para esta carga.

## Decisión

Mantener REST para las operaciones públicas e internas, y GraphQL para lectura agregada. No añadir una plataforma de analítica ni gRPC mientras no existan requisitos de volumen, streaming, latencia, tipado/protocolo o retención que lo justifiquen. Esta decisión no declara que los sistemas sean innecesarios en general; limita el alcance de esta entrega al caso observado.

## Evidencia reproducible

Comando: `npm run loadtest` en `Codigo/api-la-nonna`.

El benchmark existente crea una instancia monolítica legacy y una SQLite temporal, autentica cuentas ficticias y distribuye solicitudes concurrentes entre `GET /health`, `GET /api/productos?limit=20` y `POST /api/graphql` con `dashboard`. No mide la nueva topología multiproceso; debe repetirse con Compose antes de extraer conclusiones operativas sobre ella.

| Métrica | Ejecución local |
|---|---:|
| Entorno | Windows, Node.js v24.20.0 |
| Solicitudes / concurrencia | 100 / 10 |
| Respuestas HTTP de error | 0/100 |
| Throughput observado | 1258.05 solicitudes/s |
| Latencia p50 / p95 / máxima | 5.94 / 17.53 / 24.51 ms |
| RSS antes / después | 64,966,656 / 74,149,888 bytes |
| Heap usado al final | 20,184,304 bytes |
| Delta CPU user / system | 63,000 / 16,000 microsegundos |

Es una medición corta en un único entorno local, sin carga de producción, sin rampa/soak ni umbral de aceptación acordado. No debe interpretarse como capacidad garantizada ni como una comparación de REST contra gRPC. El benchmark registra métricas del proceso y estado de respuesta para ser repetido después de cambios.

## Consecuencias y revisión

- Se evita añadir broker, almacén analítico y contratos RPC que no resuelven un problema medido.
- Se mantiene agregación GraphQL y contratos HTTP REST entre procesos; cada dominio conserva almacenamiento propio.
- Revisar esta decisión si la guía establece un volumen o SLO, si se requiere streaming/reportes históricos, o si mediciones representativas de la topología distribuida muestran que REST/GraphQL no cumple.
- Para una decisión de capacidad antes de producción se necesita dataset representativo, ramp-up, varias duraciones/concurrencias, repetición en hardware objetivo y umbrales de p95/error acordados.
