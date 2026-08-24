-- ============================================================
-- ORDEN · Migración 013 · Que se pueda borrar un usuario
--
-- EL PROBLEMA, tal como apareció en producción:
--
--   ERROR: update or delete on table "users" violates foreign key constraint
--   "empresas_creada_por_fkey" on table "empresas"
--
-- `empresas.creada_por` apuntaba a `auth.users` con ON DELETE RESTRICT. La
-- intención era buena —no perder el registro de quién fundó el negocio— pero
-- el efecto era que **una persona que creó una empresa no se podía borrar
-- nunca**. Ni para limpiar una cuenta de prueba, ni el día que alguien pida
-- que se borren sus datos.
--
-- LA SOLUCIÓN: ON DELETE SET NULL. Si se borra la persona, la empresa sigue
-- entera —con sus ventas, su stock y su equipo— y lo único que se pierde es
-- el dato de quién la creó. Borrar el negocio de un local que sigue
-- funcionando porque se dio de baja una cuenta sería mucho peor.
--
-- LA TRAMPA: `ON DELETE SET NULL` ejecuta un UPDATE sobre `empresas`, y el
-- trigger `proteger_empresa` bloquea cualquier cambio de `creada_por`. O sea
-- que sin tocar el trigger, cambiar la clave foránea no arregla nada: el
-- borrado seguiría fallando, ahora con otro mensaje. Por eso van las dos
-- cosas juntas en esta migración.
--
-- Idempotente. No toca datos.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LA COLUMNA ADMITE NULL Y LA CLAVE PASA A SET NULL
-- ------------------------------------------------------------
alter table public.empresas alter column creada_por drop not null;

alter table public.empresas drop constraint if exists empresas_creada_por_fkey;

alter table public.empresas
  add constraint empresas_creada_por_fkey
  foreign key (creada_por) references auth.users (id) on delete set null;

comment on column public.empresas.creada_por is
  'Quién fundó el negocio. Queda en null si esa cuenta se borra: la empresa y toda su contabilidad sobreviven.';

-- ------------------------------------------------------------
-- 2. EL TRIGGER DEJA PASAR EL BORRADO, PERO NADA MÁS
--
--    Se permite exactamente una transición: de "alguien" a "nadie", que es
--    la que hace la clave foránea al borrarse la cuenta.
--
--    Lo que se sigue bloqueando es lo que importaba: **apropiarse** de una
--    empresa poniéndose como creador. De null a alguien, o de una persona a
--    otra, sigue siendo imposible.
-- ------------------------------------------------------------
create or replace function public.proteger_empresa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.id is distinct from old.id then
    raise exception 'No se pueden cambiar los datos de identidad de la empresa.' using errcode = '42501';
  end if;

  if new.creada_por is distinct from old.creada_por
     and not (new.creada_por is null and old.creada_por is not null) then
    raise exception 'No se puede cambiar quién creó la empresa.' using errcode = '42501';
  end if;

  if new.plan is distinct from old.plan
     and coalesce(current_setting('orden.suscripcion_confiable', true), '') <> '1' then
    raise exception 'El plan solo lo puede cambiar el sistema de suscripciones.' using errcode = '42501';
  end if;

  return new;
end $fn$;
