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
- `crear_pedido` es pública y ya tiene límite anti-spam (3 pedidos por teléfono y 30 por local cada 10 min, desde `0004`). Lo que queda es que el tope por teléfono se esquiva cambiando de número.
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
- `0010_caja.sql`: caja diaria. `caja_abrir_turno` (fondo inicial), `caja_registrar_movimiento` (sangría / refuerzo / retiro final), `caja_resumen` y `caja_cerrar_turno` (arqueo). El efectivo esperado = fondo + ventas en efectivo entregadas durante el turno (sin los anotados en fiado) + refuerzos − sangrías − retiros. Un turno abierto por kiosco. Test: `supabase/tests/etapa9_test.py` (sobre 0001–0010). Portado de distrib (turnos_caja / movimientos_caja); ver nota en el archivo sobre la fórmula.
- `0009_stock.sql`: stock numérico opcional por producto (`stock_controlado`, `stock`). Se descuenta al confirmar o entregar y se repone al cancelar. Al llegar a 0 el producto deja de estar disponible. `crear_pedido` y la confirmación rechazan con `sin_stock`. La tienda pública no puede leer la columna `stock`. Test: `supabase/tests/etapa8_test.py` (sobre 0001–0009).
- `0008_push.sql`: tabla `push_suscripciones` (un registro por celular del dueño). Solo el dueño la ve.
- `0007_borrar_cliente.sql`: `borrar_cliente(cliente)` para quitar un cliente de la libreta (solo el dueño; borra su fiado, sellos y canjes en cascada, y conserva los pedidos). Test: `supabase/tests/etapa6_test.py` (10, sobre 0001–0007).
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

## Avisos push con la app cerrada (Web Push)
Cómo funciona: el panel registra `public/sw.js` y guarda la suscripción del celular en `push_suscripciones`. Cuando se inserta un pedido, un **Database Webhook** de Supabase llama a `/api/push/pedido`, que envía la notificación a los celulares de ese kiosco.

Pasos para activarlo (una sola vez):
1. Generar las claves: `npx web-push generate-vapid-keys`.
2. En Vercel (Preview y Producción) cargar: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:…), `SUPABASE_SERVICE_ROLE_KEY` (solo servidor) y `PUSH_WEBHOOK_SECRET` (un texto largo al azar).
3. En Supabase: Database → Webhooks → crear uno sobre la tabla `pedidos`, evento **Insert**, método POST, URL `https://<tu-dominio>/api/push/pedido`, y el header `x-webhook-secret` con el mismo valor de `PUSH_WEBHOOK_SECRET`.
4. Redeploy. En el panel, tocar **Activar avisos** (en iPhone, primero agregar la app a la pantalla de inicio: Safari no envía push fuera de una app instalada).

Límites: el aviso llega si el navegador o la app instalada siguen con permiso; si el navegador revoca la suscripción, se borra sola. Probado en `npm test` solo la lógica del mensaje; el envío real (celular, service worker y webhook) hay que probarlo en el preview.
