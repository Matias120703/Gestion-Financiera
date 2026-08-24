-- ============================================================
-- ORDEN · Migración 011 · Dar de baja a alguien del equipo
--
-- La policy `miembros_delete` de la 002 ya dejaba a un administrador borrar
-- filas de `miembros`, pero por la puerta cruda: sin mensajes claros, sin
-- impedir que alguien se borre a sí mismo y sin jerarquía entre roles.
-- Esta migración pone la puerta oficial.
--
-- QUÉ PASA CON LO QUE ESA PERSONA CARGÓ: nada. Sus ventas y gastos quedan
-- exactamente donde están, con su nombre. `movimientos.creado_por` apunta a
-- `auth.users`, no a `miembros`, así que sacarla del equipo no toca ni un
-- número. Borrar el historial de alguien porque dejó de trabajar ahí sería
-- destruir la contabilidad del negocio.
--
-- Y SE ROTA EL CÓDIGO. Sacar a alguien que puede volver a entrar con el
-- mismo código de invitación es media baja. Por eso va también
-- `rotar_codigo_acceso()`: el propietario genera uno nuevo y el viejo deja
-- de servir para siempre.
--
-- Idempotente. No toca datos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUITAR A ALGUIEN DEL EQUIPO
--
--    Jerarquía, de arriba abajo:
--      · el propietario puede sacar a cualquiera menos a sí mismo;
--      · un administrador solo puede sacar vendedores;
--      · nadie puede sacarse a sí mismo (no existe "irse" y hacerlo por
--        accidente dejaría al negocio sin dueño).
--
--    Devuelve el nombre de quien salió, para poder confirmarlo en pantalla
--    sin tener que volver a consultar.
-- ------------------------------------------------------------
create or replace function public.quitar_miembro(p_empresa uuid, p_user uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_fila     public.miembros;
  v_mi_rol   rol_miembro;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el propietario o un administrador puede sacar gente del equipo.' using errcode = '42501';
  end if;

  select * into v_fila
  from public.miembros where empresa_id = p_empresa and user_id = p_user;

  if v_fila.id is null then
    raise exception 'Esa persona no está en el equipo.' using errcode = 'P0002';
  end if;

  if v_fila.user_id = auth.uid() then
    raise exception 'No podés sacarte a vos mismo del equipo.' using errcode = '42501';
  end if;

  if v_fila.rol = 'propietario' then
    raise exception 'Al propietario del negocio no se lo puede sacar.' using errcode = '42501';
  end if;

  select rol into v_mi_rol
  from public.miembros where empresa_id = p_empresa and user_id = auth.uid();

  if v_mi_rol = 'admin' and v_fila.rol = 'admin' then
    raise exception 'Un administrador no puede sacar a otro administrador. Pedíselo al propietario.'
      using errcode = '42501';
  end if;

  -- Solo se borra la membresía. Los movimientos que cargó quedan intactos.
  delete from public.miembros where id = v_fila.id;

  return v_fila.nombre;
end $fn$;

-- ------------------------------------------------------------
-- 2. ROTAR EL CÓDIGO DE INVITACIÓN
--
--    Solo el propietario. Un administrador puede VER el código para pasarlo,
--    pero cambiarlo deja afuera a todo el que lo tuviera anotado, y esa es
--    una decisión del dueño del negocio.
-- ------------------------------------------------------------
create or replace function public.rotar_codigo_acceso(p_empresa uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_codigo   text;
  v_intentos int := 0;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.miembros
    where empresa_id = p_empresa and user_id = auth.uid() and rol = 'propietario'
  ) then
    raise exception 'Solo el propietario puede cambiar el código de invitación.' using errcode = '42501';
  end if;

  loop
    v_codigo := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.empresa_accesos where codigo = v_codigo);
    v_intentos := v_intentos + 1;
    if v_intentos > 12 then
      raise exception 'No se pudo generar un código nuevo.' using errcode = '55000';
    end if;
  end loop;

  update public.empresa_accesos
  set codigo = v_codigo, updated_at = now()
  where empresa_id = p_empresa;

  return v_codigo;
end $fn$;

-- ------------------------------------------------------------
-- 3. CERRAR LA PUERTA CRUDA
--
--    La policy de la 002 permitía a un administrador borrar cualquier fila
--    que no fuera del propietario, incluida la suya. Se le agrega la misma
--    guarda que tiene la función: nadie se borra a sí mismo por accidente
--    desde la consola del navegador.
-- ------------------------------------------------------------
drop policy if exists miembros_delete on public.miembros;
create policy miembros_delete on public.miembros
  for delete using (
    public.es_admin(empresa_id)
    and rol <> 'propietario'
    and user_id <> auth.uid()
  );

revoke all on function public.quitar_miembro(uuid, uuid)   from public, anon;
revoke all on function public.rotar_codigo_acceso(uuid)    from public, anon;
grant execute on function public.quitar_miembro(uuid, uuid) to authenticated;
grant execute on function public.rotar_codigo_acceso(uuid)  to authenticated;
