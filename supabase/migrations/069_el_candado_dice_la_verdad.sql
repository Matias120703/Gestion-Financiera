-- ============================================================
-- 069 · EL MENSAJE DE CUENTA VENCIDA DICE LO QUE PASA DE VERDAD
--
-- `exigir_cuenta_activa` (018) frena cualquier escritura de una cuenta con
-- la prueba o el plan vencidos, y lo explicaba así:
--
--   «Se te terminó la prueba. Podés seguir viendo todo y bajando tu Excel,
--    pero para cargar hay que activar el plan.»
--
-- Era cierto cuando se escribió: la 018 decidió a propósito que una cuenta
-- vencida siguiera mirando. El 2026-09-15 Matías lo decidió al revés —vencida
-- la cuenta, Orden se cierra entero hasta que se pague (ver CandadoCuenta)—,
-- y este mensaje quedó prometiendo algo que ya no existe.
--
-- Solo cambia el texto. La regla —qué se frena y qué no— es exactamente la
-- misma de la 018.
-- ============================================================

create or replace function public.exigir_cuenta_activa()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.puede_cargar(new.empresa_id) then
    raise exception 'Se te terminó la prueba. Para seguir usando Orden hace falta activar tu plan.'
      using errcode = '42501';
  end if;

  return new;
end $fn$;

revoke all on function public.exigir_cuenta_activa() from public, anon, authenticated;
