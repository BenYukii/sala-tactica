# Referencia MySQL — prototipo de productos

Este código se conserva como evidencia de un prototipo previo de persistencia del catálogo. **No está conectado a `api-la-nonna` y no hace persistentes las reservas ni implementa `orders`, `clients` o `payments`.**

Configurar un usuario MySQL local de mínimo privilegio y copiar `.env.example` a `.env` con valores locales. No usar `root`, no reutilizar credenciales reales y no subir `.env`. Aplicar `schema.sql` y luego `npm run seed`.

El código fuente original asumía `root` y contraseña vacía si faltaba configuración. Para no conservar ese fallback inseguro en el paquete, esta copia exige configurar todas las variables de conexión.
