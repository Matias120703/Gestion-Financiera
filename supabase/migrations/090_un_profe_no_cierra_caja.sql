-- ============================================================
-- 090 · UN PROFE NO CIERRA CAJA
-- ============================================================
--
-- Matías, mirando el rubro terminado: «¿cómo vas a comprar y vender un
-- curso? Aparece invertido en stock, reponer. No tiene sentido. Esto es
-- para que el profesor se administre con su agenda, con lo que entra y con
-- lo que sale».
--
-- La mayor parte de ese cambio es de pantalla (`src/lib/rubros.ts`): se
-- van los productos, la pantalla de cobrar y el cierre del día. Pero el
-- cierre tiene una mitad que vive acá, y es la que molesta de verdad: el
-- recordatorio de la noche. Con el rubro en `true`, a un profe que no da
-- clases los sábados le llegaría todos los sábados «no cargaste nada hoy».
-- Es retarlo por descansar.
--
-- La racha no se toca en esta migración. Hoy cuenta los días con algo
-- cargado; va a pasar a contar los días que tenía clases y las marcó,
-- cuando exista marcar una clase como dada. Hasta entonces sigue como está.

create or replace function public.rubro_cierra_el_dia(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_tipo_cuenta, 'emprendedor') <> 'personal'
     and coalesce(p_rubro, 'comercio') in ('comercio', 'servicios');
$fn$;

grant execute on function public.rubro_cierra_el_dia(text, text) to anon, authenticated;
