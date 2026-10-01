-- ============================================================
-- 118 · UNA CUENTA ARCHIVADA NO RECIBE PLATA
-- ============================================================
--
-- Revisión del 01/10/2026: «Ya lo cobré» del Presupuesto mandaba la cuenta
-- guardada del sueldo sin mirar si seguía activa. Si esa cuenta se había
-- quitado de la billetera (quitar_cuenta_dinero la archiva cuando tiene
-- movimientos), el sueldo entraba igual en ella: el saldo de la archivada
-- subía, la billetera no la muestra, y «Plata sin cuenta» tampoco lo listaba
-- porque cuenta_id no estaba vacío. Tres millones que no se veían en ningún
-- lado. La pantalla ya no la manda (PantallaOrganizacion), pero el agujero
-- era de la base: cualquier insert directo en movimientos (Gastos, la
-- captura) con una lista vieja, de una cuenta archivada en otra pestaña,
-- caía en ella.
--
-- Todas las funciones (registrar_venta, registrar_pago_deuda, las de la 117…)
-- ya la rechazan con «Esa cuenta no existe.». Faltaba el disparador.
--
-- LO QUE CAMBIA
--
--   anotar_en_su_cuenta (074): COPIA EXACTA con un solo cambio. En la rama
--   INSERT, la cuenta que viene tiene que existir en ESTE negocio Y estar
--   activa (`and c.activa`). Una archivada se trata igual que la de otro
--   negocio: se descarta y la cuenta sale de la forma de pago
--   (cuenta_de_metodo, que ya mira solo las activas). La plata queda a la
--   vista en una cuenta de la billetera, o en «Plata sin cuenta» si ninguna
--   reclama esa forma de pago.
--
-- QUÉ NO CAMBIA
--
--   · La rama UPDATE: corregir un movimiento viejo de una cuenta archivada
--     no lo muda de cuenta.
--   · Ningún dato existente se toca, ni el disparador (sigue apuntando a la
--     misma función). Mismos permisos: nadie la ejecuta a mano.
-- ============================================================

create or replace function public.anotar_en_su_cuenta()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if tg_op = 'UPDATE' and new.metodo_pago is distinct from old.metodo_pago then
    -- Si se corrige la forma de pago, el movimiento se muda de cuenta.
    new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
  elsif tg_op = 'UPDATE' and new.cuenta_id is distinct from old.cuenta_id
        and new.cuenta_id is not null
        and not exists (select 1 from public.cuentas_dinero c
                        where c.id = new.cuenta_id and c.empresa_id = new.empresa_id) then
    new.cuenta_id := old.cuenta_id;
  elsif tg_op = 'INSERT' then
    -- Una cuenta de OTRO negocio no se acepta aunque alguien arme el pedido a
    -- mano: sería meterle plata en el saldo de un desconocido. Una ARCHIVADA
    -- tampoco (118): la billetera no la muestra y la plata se perdía de vista.
    if new.cuenta_id is not null
       and not exists (select 1 from public.cuentas_dinero c
                       where c.id = new.cuenta_id and c.empresa_id = new.empresa_id and c.activa) then
      new.cuenta_id := null;
    end if;
    if new.cuenta_id is null then
      new.cuenta_id := public.cuenta_de_metodo(new.empresa_id, new.metodo_pago);
    end if;
  end if;
  return new;
end $fn$;

revoke all on function public.anotar_en_su_cuenta() from public, anon, authenticated;
