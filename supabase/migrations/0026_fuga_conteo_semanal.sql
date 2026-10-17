-- 0026 (Fase 3, plan 3.3): conteo semanal de clientes en fuga para el cron del lunes.
-- Aplicar DESPUÉS de 0025. Sin DROP. Mismos criterios que clientes_en_fuga (3 compras o más, sin comprar hace 45 días),
-- pero sin chequeo de dueño porque lo llama el cron con service role. Solo ese rol puede ejecutarla.

create or replace function public.fuga_conteo_semanal()
returns table (kiosco uuid, clientes int)
language sql stable security definer set search_path = public as $$
  with v as (
    select vm.kiosco_id, vm.cliente_id, count(*)::int as compras, max(vm.created_at) as ultima
      from public.ventas_mostrador vm
     where vm.cliente_id is not null and not vm.anulada
       and vm.created_at >= now() - interval '1 year'
     group by vm.kiosco_id, vm.cliente_id
  )
  select v.kiosco_id, count(*)::int
    from v
    join public.clientes c on c.id = v.cliente_id and c.kiosco_id = v.kiosco_id
   where v.compras >= 3
     and v.ultima < now() - interval '45 days'
   group by v.kiosco_id;
$$;
revoke all on function public.fuga_conteo_semanal() from public, anon, authenticated;
