-- 0027 (Fase 3, plan 3.3): aviso semanal de clientes en fuga, idempotente por kiosco y semana.
-- Aplicar DESPUÉS de 0026. Sin DROP. Mismo patrón que avisos_fiado (0023): si el cron se dispara dos veces
-- en la misma semana, la segunda corrida no devuelve el kiosco y no se repite el aviso.

create table public.avisos_fuga (
  id uuid primary key default gen_random_uuid(),
  kiosco_id uuid not null references public.kioscos(id) on delete cascade,
  semana date not null,
  clientes int not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (kiosco_id, semana)
);
alter table public.avisos_fuga enable row level security;
revoke all on public.avisos_fuga from anon, authenticated;

create or replace function public.fuga_avisos_semanales()
returns table (kiosco uuid, clientes int)
language plpgsql security definer set search_path = public as $$
declare f record; v_ins uuid;
  v_semana date := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  for f in select * from public.fuga_conteo_semanal() loop
    insert into public.avisos_fuga (kiosco_id, semana, clientes)
      values (f.kiosco, v_semana, f.clientes) on conflict (kiosco_id, semana) do nothing returning id into v_ins;
    if v_ins is not null then
      kiosco := f.kiosco; clientes := f.clientes; return next;
    end if;
  end loop;
end $$;
revoke all on function public.fuga_avisos_semanales() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.fuga_avisos_semanales() to service_role;
  end if;
end $$;
