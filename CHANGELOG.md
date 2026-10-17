# Changelog

## fase3-completo v2 — 2026-10-17

Reconstruida sobre el ZIP de `main` (que no tenía la última tanda) y la base de producción. Verificada: `check:migraciones` (26), `typecheck`, `npm test` y todos los tests SQL de `supabase/tests`.

### Agregado
- `supabase/migrations/0026_fuga_semanal.sql`: tabla `avisos_fuga`, `fuga_conteo_semanal()` y `fuga_avisos_semanales()` (solo service role). Deja el repo igual que producción, donde ya estaba aplicada. Segura de volver a correr.
- `app/api/cron/fuga/route.ts` + entrada en `vercel.json` (lunes 09:05 AR): aviso "Clientes que dejaron de venir" con link a Radar. Idempotente por kiosco y semana.
- `lib/fuga.ts` y `tests/fuga.test.mjs`.
- `components/ProductosModificados.tsx`, `lib/modificados.ts` y `tests/modificados.test.mjs` (plan 2.6): cambios de stock por producto en hoy / 7 / 30 días, con diferencia neta y último movimiento. Oculta ventas, pedidos y devoluciones salvo que se tilde.
- Resumen: tarjeta "Dinero parado en mercadería" (usa `plata_en_stock`, que ya calculaba `reposicion_resumen`).
- `supabase/tests/etapa21_test.py`: 4 chequeos nuevos de la 0026 (33 en total).
- `CHANGELOG.md`.

### Cambiado
- `.github/workflows/restore-to-test.yml`: borra el esquema `public` del destino antes de restaurar y omite triggers y claves foráneas. Corrige los tres errores de las corridas anteriores (esquema duplicado, `supabase_functions` inexistente, clave foránea contra `auth.users`).
- `app/panel/page.tsx`: los avisos push abren `fiado`, `radar` o `reponer` (antes solo `reponer`; el de fiado ya apuntaba a una pestaña que no se abría).
- `package.json`: scripts `test:fuga` y `test:modificados` dentro de `npm test`.
- `README.md`: documenta todo lo anterior y los pendientes.

### Sin cambios / no incluido
- Prueba en navegador de Radar, Resumen y el cron: requiere sesión iniciada.
- Rotar `PUSH_WEBHOOK_SECRET` (quedó expuesto en un log).
- Revisión del PR #9: lo que hay en la rama `fase3-operacion` de GitHub no se pudo comparar; esta versión se rehízo desde `main`.
