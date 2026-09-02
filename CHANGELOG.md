# Historial de cambios

## v1.8 — 2026-09-02

- Mapa real con MapLibre GL en Navegar: la ruta completa se dibuja en vivo y queda guardada (`trips.route_points`).
- Historial de recorridos con mapa, velocidad promedio y máxima.
- Modo sin señal: tanqueos, mantenimientos, recorridos, cotizaciones, documentos y cierre de jornada se guardan en el teléfono (IndexedDB) y se envían solos al recuperar conexión. Sin duplicados gracias a `client_id`.
- La app abre sin señal con la última copia de la cuenta.
- Recorrido en curso sobrevive si la app se cierra: se puede retomar o descartar.
- Pantalla encendida durante el recorrido (Wake Lock).
- Panel que se actualiza solo (Supabase Realtime) e indicador de registros pendientes.
- Cotizador: mapa interactivo para elegir destino (tocar o arrastrar), ruta real por carretera dibujada desde OSRM.
- Búsqueda de direcciones con espera, caché de 7 días y límite de una petición por segundo (Photon + Nominatim de respaldo). Evita bloqueos.
- Cálculos en la base de datos: `vehicle_fuel_stats`, `work_session_profitability` y `dashboard_summary()`.
- Migración de `vehicle_documents` (faltaba) y RLS forzado en todas las tablas.
- Metadatos corregidos: `og:image` propio y optimizado (152 KB, WhatsApp lo muestra), favicons, manifest PWA, robots y sitemap.

## v1.7 — 2026-09-02

- Tarifas mínimas configurables de $1.500/km urbano y $2.000/km rural.
- Selector visual de zona urbana o rural.
- Protección contra cotizaciones inferiores al mínimo comercial.
- Peajes, comisión y otros costos integrados al precio recomendado.
- Mapa de destino con OpenStreetMap, búsqueda cercana y selección manual.
- Seguimiento GPS mejorado en la sección Navegar.
- Identidad de Autoram con detalles de la bandera de Colombia.
- Configuración corregida para publicación estática en Netlify.
