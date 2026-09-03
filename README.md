# Autoram Colombia

Aplicación web móvil para administrar uno o varios vehículos, registrar combustible y mantenimiento, seguir recorridos por GPS y calcular tarifas de trabajo con costos reales.

## Estado actual

Versión actual: **v1.9**.

- Registro e inicio de sesión con Supabase.
- Parque automotor con varios vehículos por conductor.
- Tanqueos, mantenimientos, documentos y diagnósticos.
- Recorridos con ubicación del teléfono, mapa MapLibre y trazado de ruta en vivo.
- Búsqueda de destinos con Photon/Nominatim y cálculo de ruta con OSRM.
- Funcionamiento sin señal con cola local y sincronización automática.
- Recuperación de recorridos en curso si la aplicación se cierra.
- Actualización de datos mediante Supabase Realtime.
- Cotizador de trabajos con combustible, desgaste, tiempo, peajes, comisión y utilidad.
- Tarifas mínimas editables: $1.500 COP/km urbano y $2.000 COP/km rural.
- Exportación estática preparada para Netlify.

## Tecnologías

- Next.js 16 y React 19.
- TypeScript.
- Supabase Auth y PostgreSQL.
- MapLibre, OpenStreetMap, Photon, Nominatim y OSRM.
- Netlify para alojamiento.

## Configuración local

Requisitos: Node.js 22 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completa estas variables en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=tu-clave-publicable
```

La clave `service_role` de Supabase nunca debe guardarse en este repositorio ni exponerse en el navegador.

## Compilación de producción

```bash
npm run build
```

Next.js genera la aplicación estática dentro de `out/`. Esa es la carpeta que Netlify debe publicar.

## Conexión con Netlify

Al importar este repositorio en Netlify usa:

- Build command: `npm run build`
- Publish directory: `out`
- Node.js: `22`
- Variables: las dos variables públicas de Supabase indicadas arriba.

El archivo `netlify.toml` ya contiene la configuración de compilación y los permisos necesarios para geolocalización.

## Cálculo de trabajos

El precio sugerido toma el valor mayor entre:

1. El costo real del servicio, incluyendo combustible, desgaste, tiempo, peajes, otros gastos, margen y comisión.
2. La tarifa mínima comercial según el tipo de recorrido: urbano o rural.

El conductor puede editar las tarifas mínimas y el valor final antes de guardar o compartir la cotización.

## Carpetas principales

- `app/`: interfaz, navegación y lógica de Autoram.
- `lib/`: conexión con Supabase y utilidades.
- `public/`: marca, iconos y recursos públicos.
- `drizzle/`: migraciones disponibles.
- `tests/`: verificaciones automatizadas.

## Próximas mejoras

- Separar la interfaz principal en componentes más pequeños.
- Mejorar la clasificación automática entre trayecto urbano y rural.
- Agregar recordatorios reales de vencimiento de documentos.
- Preparar la futura aplicación paralela para clientes y reservas.
