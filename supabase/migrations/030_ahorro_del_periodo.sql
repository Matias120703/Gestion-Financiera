-- ORDEN · Migración 030 · El ahorro dentro de un período elegido
--
-- `resumen_personal` ya cuenta el ahorro, pero siempre del CICLO en curso: de
-- cobro a cobro. El reporte y el Excel trabajan con otro recorte —el rango de
-- fechas que la persona elige— y ahí ese número no sirve.
--
-- Mezclar los dos sería el peor error posible en una planilla: mostrar «entró
-- y salió» de enero a marzo junto a un ahorro que en realidad es el de los
-- últimos veinte días. Dos períodos distintos en la misma hoja, sin que nada
-- lo diga.
--
-- POR QUÉ ES UNA FUNCIÓN Y NO UNA CONSULTA DESDE EL SERVIDOR
--
-- Por lo mismo que los otros agregados: sumar en el servidor obliga a traerse
-- las filas, y una lista traída puede venir recortada por el tope de la Data
-- API sin avisar. Un total que se calcula sobre una lista incompleta no se
-- ve mal: se ve como un total más chico. Sumar acá adentro no puede recortar.

create or replace function public.resumen_ahorro_periodo(
  p_empresa uuid,
  p_desde   date,
  p_hasta   date
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_aportado numeric := 0;
  v_retirado numeric := 0;
  v_fondos   jsonb;
begin
  -- Se lee con `es_admin` y no con `es_miembro`, igual que las tablas de
  -- ahorro desde la 026: cuánto guarda alguien no lo ve un vendedor.
  if not public.es_admin(p_empresa) then
    raise exception 'No tenés acceso a esta cuenta.' using errcode = '42501';
  end if;

  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'El rango de fechas no es válido.' using errcode = '22007';
  end if;

  select
    coalesce(sum(ma.monto) filter (where ma.tipo = 'aporte'), 0),
    coalesce(sum(ma.monto) filter (where ma.tipo = 'retiro'), 0)
  into v_aportado, v_retirado
  from public.movimientos_ahorro ma
  where ma.empresa_id = p_empresa
    and ma.fecha between p_desde and p_hasta;

  -- Solo los fondos que se movieron en el período. Listar los quietos en cero
  -- alargaría la hoja sin decir nada: que un fondo no se haya tocado en marzo
  -- no es información, es ruido.
  select coalesce(jsonb_agg(x order by (x->>'neto')::numeric desc), '[]'::jsonb)
  into v_fondos
  from (
    select jsonb_build_object(
      'nombre',   a.nombre,
      'aportado', coalesce(sum(ma.monto) filter (where ma.tipo = 'aporte'), 0),
      'retirado', coalesce(sum(ma.monto) filter (where ma.tipo = 'retiro'), 0),
      'neto',     coalesce(sum(case when ma.tipo = 'aporte' then ma.monto else -ma.monto end), 0),
      -- El saldo del fondo a hoy, que es de otro recorte y por eso va con su
      -- propio nombre: la hoja lo rotula aparte para que nadie lo sume con
      -- las columnas del período.
      'saldo_hoy', public.saldo_ahorro(a.id)
    ) as x
    from public.movimientos_ahorro ma
    join public.ahorros a on a.id = ma.ahorro_id
    where ma.empresa_id = p_empresa
      and ma.fecha between p_desde and p_hasta
    group by a.id, a.nombre
  ) t;

  return jsonb_build_object(
    'aportado', v_aportado,
    'retirado', v_retirado,
    'neto',     v_aportado - v_retirado,
    'por_fondo', v_fondos
  );
end $fn$;

revoke all on function public.resumen_ahorro_periodo(uuid, date, date) from public, anon;
grant execute on function public.resumen_ahorro_periodo(uuid, date, date) to authenticated;
