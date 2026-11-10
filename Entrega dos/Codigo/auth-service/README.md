# Auth Service — Semana 14

## Ejecución local

1. Crear `.env` desde `.env.example` y configurar un token local de Vault con acceso mínimo al secreto de introspección.
2. Desde esta carpeta:

   ```powershell
   Copy-Item .env.example .env
   npm ci
   npm run check
   npm test
   npm start
   ```

Por defecto escucha en el puerto `8100`. `/health` y `/login` son rutas locales del servicio; `/introspect` y `/logout` requieren el secreto interno configurado en Vault. Auth Service **no está integrado** con la API REST ni con la interfaz de La Nonna. Las cuentas/roles de demostración están en `src/users.js` y no constituyen un sistema persistente de clientes.

Las sesiones son opacas, almacenadas en memoria y expiran según `SESSION_TTL_SECONDS`; al reiniciar el proceso se pierden. La suite `test/auth.test.js` usa un secreto de prueba inyectado y no requiere Vault.
