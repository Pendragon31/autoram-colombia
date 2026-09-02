# Autoram — guía para publicar en Netlify

Este ZIP contiene el código fuente completo de Autoram, preparado para que Netlify lo compile como una aplicación Next.js.

## Importante

No uses la opción **Deploy manually / arrastrar y soltar**. Esa opción sirve para páginas estáticas y no instalará las APIs protegidas de Autoram.

## Antes de publicar v1.8: base de datos

En Supabase → SQL Editor, ejecuta en orden los tres archivos nuevos de `supabase/migrations/`:

1. `20260902120000_vehicle_documents_and_rls.sql`
2. `20260902120100_trips_route_offline_realtime.sql`
3. `20260902120200_views_and_dashboard_rpc.sql`

Son idempotentes. Si no los ejecutas, la app sigue funcionando pero sin ruta guardada, sin modo offline confiable y con los cálculos del panel hechos en el navegador.

Verifica: `select tablename, rowsecurity from pg_tables where schemaname = 'public';` — todo en `true`.

## Opción recomendada: Netlify CLI

Necesitas tener Node.js 22 instalado en el computador.

1. Descomprime el ZIP.
2. Abre una terminal dentro de la carpeta `autoram-netlify`.
3. Ejecuta:

```bash
npm install
npx netlify login
npx netlify link --id 15af3446-32e9-46d8-bd93-0d97d2a5ea97
npx netlify env:set NEXT_PUBLIC_SUPABASE_URL https://icgvbjtkzsjsctvhasid.supabase.co
npx netlify env:set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY sb_publishable_avqtTMy9GYw5ZVqawBZw1A_urWJUKE0
npx netlify deploy --build --prod
```

Netlify utilizará automáticamente `netlify.toml`, compilará Next.js y publicará la función que atiende las rutas `/api`.

## Verificación

Al terminar, la terminal debe mostrar `Deploy is live` y la dirección pública del proyecto.

## Nota sobre el teléfono

Volver a subir el proyecto no cambia el dominio `netlify.app`. Si ese dominio continúa bloqueado por el DNS o la red del teléfono, hay que usar el dominio alternativo de Autoram o conectar un dominio propio.
