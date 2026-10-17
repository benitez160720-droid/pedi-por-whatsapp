# Pedí por WhatsApp

Next.js 14 + Supabase. Catálogo con QR y pedidos por WhatsApp (wa.me) para kioscos y almacenes.

## Arranque
1. Crear proyecto Supabase y aplicar `supabase/migrations/0001_init.sql`.
2. Activar Google como proveedor en Auth y agregar `https://<tu-dominio>/panel` a las redirect URLs.
3. `cp .env.example .env.local` y completar URL + anon key.
4. `npm install && npm run dev`.

## Estado
- v0.1: schema + RLS, RPC `crear_pedido` (precios calculados en servidor), tienda pública `/[slug]`, panel (login, alta de kiosco, productos, pedidos).
- v0.2 (Semana 4): escaneo de códigos con la cámara (zxing), búsqueda en base global + Open Food Facts, aporte a la base de la red, modo ráfaga, QR descargable y manifest PWA.
- Etapa 2 (fiado, sellos, ajuste de precios) va en `0002_*.sql`.
- v0.3 (Semana 6): panel de pedidos con detalle de ítems, resumen del día, filtros (Hoy/Abiertos/Todos), cancelar, mensaje de aviso según estado, vibración y contador en el título con pedidos nuevos. Test de RLS/RPC contra Postgres real en `supabase/tests/rls_test.py` (21 chequeos).

## Pendiente conocido
- La RPC `crear_pedido` es pública: antes de salir a vender hay que agregarle límite de frecuencia (por teléfono/IP) contra spam.
- `kioscos` es de lectura pública (incluye `whatsapp`, necesario para la tienda).
- v0.4 (Etapa 2): `0002_fiado_sellos_precios.sql` + pestañas Fiado, Sellos, Precios y Resumen.
  - Fiado: libreta por cliente (fiado/pago), saldo, total adeudado, botón "Recordar" por WhatsApp (lo envía el dueño a mano).
  - Sellos: uno automático por pedido entregado (trigger idempotente), +1 en mostrador por teléfono, anular/restaurar, premio configurable, canje atómico por RPC, aviso de premio.
  - Precios: % con rango -50..200, por categoría, redondeo, vista previa, historial y deshacer (no pisa cambios manuales posteriores).
  - Resumen semanal + aviso para revisar precios si pasaron 7 días.
  - Teléfonos en formato canónico `549…` (SQL `normalizar_tel_ar` espejo de `lib/whatsapp.ts`) para que un vecino sea siempre el mismo cliente.
  - Tests: `supabase/tests/etapa2_test.py` (45 chequeos sobre 0001+0002). Aplicar las migraciones en orden.

## Base de datos (aplicada)
Proyecto Supabase `pedi-por-whatsapp` (ref `ydhdbkkubllfdksusyil`, sa-east-1). Migraciones 0001, 0002 y 0003 aplicadas; RLS activo en las 11 tablas.
`.env.local` ya trae URL + anon key (la anon key es pública por diseño; la seguridad la da RLS). **No commitear `.env.local`** (está en `.gitignore`).

### Falta configurar a mano (Dashboard de Supabase)
1. Authentication → Providers → Google: activar con tu Client ID/Secret de Google Cloud.
2. Authentication → URL Configuration: Site URL = tu dominio de Vercel; Redirect URLs: `http://localhost:3000/panel` y `https://<tu-dominio>/panel`.
3. En Vercel: cargar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## v0.5 (Etapa 3) — operación diaria
- `0004_operacion_kiosco.sql`: tienda abierta/cerrada, horario, pedido mínimo, costo de envío, medios de pago; `crear_pedido` con límite anti-spam (3 pedidos/teléfono y 30/local cada 10 min) y devuelve el número de pedido. **Aplicar en el SQL Editor de Supabase ANTES de subir el código nuevo.**
- `0005_pedido_a_fiado.sql`: `pasar_a_fiado(pedido)` anota el total del pedido en la libreta del cliente (una sola vez por pedido) y lo deja entregado. **Aplicar en el SQL Editor de Supabase ANTES de subir el código nuevo.**
- `0006_cierre_etapa3.sql` (cierre de la etapa; **aplicar ANTES de subir el código**, todo junto en el SQL Editor):
  - **Horario automático:** `horario_auto` + `horarios` (hasta 2 tramos por día, admite cruzar la medianoche, hora de Argentina). `crear_pedido` rechaza con `fuera_de_horario`; el interruptor manual funciona como pausa. Espejo en `lib/horario.ts`.
  - **Moderación de la base global:** nadie escribe directo en `productos_globales`; cada usuario aporta con `aportar_global` y el nombre se publica a la red cuando **2 usuarios distintos coinciden**. Lo que ya existía queda como verificado.
  - **Fotos de producto:** bucket público `productos` (máx. 512 KB, jpeg/webp/png); solo el dueño escribe en `<kiosco_id>/…`. La app las reduce a ≤ 400 KB antes de subir.
  - **Realtime:** `pedidos` entra en la publicación `supabase_realtime`; el panel recibe los pedidos al instante (con consulta de respaldo).
  - Slugs reservados (`panel`, `terminos`, `privacidad`, `api`).
- Páginas `/terminos` y `/privacidad` (borrador): se muestran con aviso hasta que `NEXT_PUBLIC_LEGAL_REVISADO=1`; el email se configura con `NEXT_PUBLIC_CONTACTO_EMAIL`.
- Tests de base (Postgres embebido: `pip install pgserver psycopg2-binary`): `supabase/tests/etapa3_test.py` (15, sobre 0001–0004), `etapa4_test.py` (22, sobre 0001–0005) y `etapa5_test.py` (61, sobre 0001–0006).
- Tests de la app: `npm test` (importación de planillas, horario, rutas de fotos).
- Límite: el tope por teléfono se esquiva cambiando de número; el tope por local acota el daño (30 cada 10 min).
