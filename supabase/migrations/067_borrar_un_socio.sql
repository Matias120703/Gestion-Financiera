-- ============================================================
-- 067 · BORRAR UN SOCIO
--
-- Hasta ahora un socio se podía crear y desactivar, pero nunca sacar. En
-- la práctica quedó a la vista el 2026-09-16: había una fila de alguien
-- cuya cuenta ya no existía, no servía para nada y no se podía quitar. La
-- única salida a mano era desactivarlo —que es otra cosa: desactivado
-- sigue en la lista, solo que no suma negocios nuevos— así que la lista
-- se iba a ir llenando de gente que ya no está.
--
-- QUÉ NO SE BORRA
--
-- `referidos.socio_id` y `comisiones.socio_id` son `on delete restrict`
-- (060), o sea que la base ya frenaba el borrado. Eso está bien y no se
-- toca: lo que faltaba era decirlo con palabras en vez de un error de
-- llave foránea.
--
--   · Con comisiones anotadas NO se borra, ni pagadas ni anuladas. Una
--     comisión es plata que se movió; sacar al socio dejaría el historial
--     de Orden hablando de alguien que no existe.
--   · Con negocios traídos NO se borra. Ese vínculo es lo que hace nacer
--     la comisión cuando el cliente paga: borrarlo en silencio sería
--     regalarse a sí mismo la comisión del mes que viene. Primero hay que
--     sacarle el referido a cada cuenta, una por una y a conciencia.
--
-- Queda entonces para lo que de verdad sobra: el socio cargado por error,
-- el que se probó una vez, el que nunca trajo a nadie.
--
-- SE ESCRIBE EL NOMBRE
--
-- Igual que `borrar_cuenta` (022): hay que escribir el nombre exacto. Es
-- la misma idea de siempre —que borrar cueste un segundo más que tocar un
-- botón— y de paso obliga a mirar a quién se está borrando.
-- ============================================================

create or replace function public.borrar_socio(
  p_socio       uuid,
  p_confirmacion text default ''
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_socio      public.socios;
  v_traidos    integer;
  v_comisiones integer;
begin
  if not public.es_superadmin() then
    raise exception 'Esto es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select * into v_socio from public.socios where id = p_socio;
  if v_socio.id is null then
    raise exception 'Ese socio no existe.' using errcode = 'P0002';
  end if;

  if trim(coalesce(p_confirmacion, '')) <> v_socio.nombre then
    raise exception 'Para borrar hay que escribir el nombre exacto: %', v_socio.nombre
      using errcode = '22023';
  end if;

  select count(*) into v_traidos    from public.referidos  where socio_id = p_socio;
  select count(*) into v_comisiones from public.comisiones where socio_id = p_socio;

  -- Las dos puertas, en orden de gravedad. Se cuentan antes de intentar el
  -- delete para poder decir cuántos son: «tiene 3 cuentas anotadas» ayuda
  -- mucho más que «no se puede».
  if v_comisiones > 0 then
    raise exception
      'Tiene % comisión(es) en el historial de Orden, así que no se puede borrar. Si ya no trabaja con nosotros, desactivalo: desactivado no recibe negocios nuevos y el historial queda entero.',
      v_comisiones using errcode = '22023';
  end if;

  if v_traidos > 0 then
    raise exception
      'Trajo % cuenta(s). Sacale el referido a esas cuentas primero, desde la ficha de cada una, y después borralo.',
      v_traidos using errcode = '22023';
  end if;

  -- Constancia antes de borrar: después la fila ya no existe y el nombre
  -- se pierde. Esto es lo único que va a quedar de este socio.
  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), null, 'borrar_socio', jsonb_build_object(
    'socio_id', v_socio.id,
    'nombre',   v_socio.nombre,
    'codigo',   v_socio.codigo,
    'email',    v_socio.email,
    'tenia_cuenta', v_socio.user_id is not null
  ));

  delete from public.socios where id = p_socio;

  return jsonb_build_object('ok', true, 'nombre', v_socio.nombre);
end $fn$;

revoke all on function public.borrar_socio(uuid, text) from public, anon;
grant execute on function public.borrar_socio(uuid, text) to authenticated;
