-- ============================================================
-- 097 · PERSONAL TRAINER
-- ============================================================
--
-- Matías: «ponete en el lugar de un personal trainer: ¿qué necesitaría
-- para trabajar?». La respuesta, mirándolo de cerca, es casi todo lo que
-- ya tiene el profe (087-094): clientes que vuelven todas las semanas con
-- un horario fijo, el mes cobrado por adelantado, y cada sesión que se
-- marca como dada o no. Un profe de inglés y un trainer resuelven el mismo
-- problema con distinta ropa.
--
-- Así que el trainer no es un motor nuevo: es un rubro más, «entrenamiento»,
-- que usa el mismo. Lo que decidió Matías para arrancar:
--   · uno a uno (sin dúos ni grupos todavía);
--   · la rutina es una nota simple por cliente, como la materia del profe;
--   · las faltas, como el profe: se decide en cada una si se descuenta.
--
-- Lo único nuevo de verdad es que el trainer tiene que ver las lesiones de
-- cada cliente antes de entrenarlo. Esas notas ya existen (clientes.notas),
-- así que la agenda del día y el panel ahora las traen junto a cada sesión.
--
-- Todo lo demás se engancha solo: el link público se apaga porque
-- `rubro_de_alumnos()` lo dice, el cierre de caja no aplica porque
-- `rubro_cierra_el_dia()` solo nombra a comercio y servicios, y el cheque
-- de `empresas.rubro` lee `rubros_validos()`.
--
-- Cada función es copia exacta de su versión viva (087, 089, 094; la huella
-- del cuerpo coincide) con lo nuevo agregado. Ninguna cambia de firma: se
-- reemplazan sin crear otra al lado.



-- ------------------------------------------------------------
-- 1. EL RUBRO EXISTE
-- ------------------------------------------------------------
create or replace function public.rubros_validos()
returns text[] language sql immutable set search_path = public as $fn$
  select array['comercio', 'ganaderia', 'agricultura', 'servicios', 'clases', 'entrenamiento'];
$fn$;

-- ------------------------------------------------------------
-- 2. SU AGENDA ES DE A UNO, SIN LINK PÚBLICO
-- ------------------------------------------------------------
create or replace function public.rubro_de_alumnos(p_rubro text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p_rubro, '') in ('clases', 'entrenamiento');
$fn$;

-- ------------------------------------------------------------
-- 3. EN QUÉ GASTA UN TRAINER
-- ------------------------------------------------------------
create or replace function public.categorias_de_rubro(
  p_rubro text,
  p_tipo_cuenta text default 'emprendedor'
)
returns jsonb language sql immutable set search_path = public as $fn$
  select case
    when coalesce(p_tipo_cuenta, 'emprendedor') = 'personal' then jsonb_build_array(
      jsonb_build_object('nombre','Comida','pistas','supermercado, almacén, verdulería, carnicería, despensa, panadería'),
      jsonb_build_object('nombre','Alquiler','pistas','alquiler, expensas, condominio'),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono, cable, gas'),
      jsonb_build_object('nombre','Transporte','pistas','colectivo, nafta, combustible, pasaje, taxi, uber, peaje'),
      jsonb_build_object('nombre','Salud','pistas','farmacia, remedios, médico, dentista, seguro médico, análisis'),
      jsonb_build_object('nombre','Educación','pistas','colegio, cuota, universidad, útiles, curso, libros'),
      jsonb_build_object('nombre','Ropa','pistas','ropa, calzado, zapatillas, campera'),
      jsonb_build_object('nombre','Cuidado personal','pistas','peluquería, uñas, barbería, cosmética, gimnasio, perfume'),
      jsonb_build_object('nombre','Ocio','pistas','salida, restaurante, cine, streaming, viaje, cerveza, cumpleaños'),
      jsonb_build_object('nombre','Hogar','pistas','limpieza, muebles, arreglos, electrodomésticos, ferretería'),
      jsonb_build_object('nombre','Cuotas y deudas','pistas','tarjeta, préstamo, cuota, financiera'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'ganaderia' then jsonb_build_array(
      jsonb_build_object('nombre','Alimentación','pistas','maíz, balanceado, ración, fardos, sal, pasto'),
      jsonb_build_object('nombre','Sanidad','pistas','vacunas, antiparasitarios, veterinario, remedios'),
      jsonb_build_object('nombre','Personal','pistas','peón, capataz, jornales, sueldos'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo, pastaje'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de hacienda, camión jaula'),
      jsonb_build_object('nombre','Mantenimiento','pistas','alambrado, aguadas, maquinaria, herramientas'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'agricultura' then jsonb_build_array(
      jsonb_build_object('nombre','Semilla','pistas','semilla, plantines'),
      jsonb_build_object('nombre','Fertilizante','pistas','urea, fosfato, abono'),
      jsonb_build_object('nombre','Agroquímicos','pistas','herbicida, fungicida, insecticida'),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Cosecha','pistas','cosechadora, trilla, secado'),
      jsonb_build_object('nombre','Fletes','pistas','transporte de granos'),
      jsonb_build_object('nombre','Arrendamiento','pistas','alquiler de campo'),
      jsonb_build_object('nombre','Personal','pistas','jornales, tractorista, peón'),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'servicios' then jsonb_build_array(
      jsonb_build_object('nombre','Materiales','pistas','cemento, arena, cables, pintura, insumos'),
      jsonb_build_object('nombre','Repuestos','pistas','piezas, filtros, aceite'),
      jsonb_build_object('nombre','Herramientas','pistas',''),
      jsonb_build_object('nombre','Combustible','pistas','gasoil, nafta'),
      jsonb_build_object('nombre','Personal','pistas','ayudante, jornales, sueldos'),
      jsonb_build_object('nombre','Transporte','pistas','flete, viaje, delivery'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    when coalesce(p_rubro, 'comercio') = 'clases' then jsonb_build_array(
      jsonb_build_object('nombre','Internet y plataformas','pistas','internet, wifi, Zoom, Meet, plan del celular, hosting'),
      jsonb_build_object('nombre','Comisiones','pistas','Preply, Italki, Superprof, lo que se lleva la plataforma, comisión de cobro'),
      jsonb_build_object('nombre','Material','pistas','libros, licencias, PDF, impresiones, fotocopias, cuadernos'),
      jsonb_build_object('nombre','Equipo','pistas','notebook, micrófono, cámara, auriculares, tablet, pizarra, luz'),
      jsonb_build_object('nombre','Publicidad','pistas','anuncios, Instagram, Facebook, volantes'),
      jsonb_build_object('nombre','Capacitación','pistas','cursos propios, certificaciones, exámenes, membresías'),
      jsonb_build_object('nombre','Alquiler','pistas','aula, salón, espacio de trabajo'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    -- Lo que gasta un personal trainer (097): el equipo que lleva, el lugar
    -- donde entrena, y moverse hasta cada cliente.
    when coalesce(p_rubro, 'comercio') = 'entrenamiento' then jsonb_build_array(
      jsonb_build_object('nombre','Equipamiento','pistas','pesas, mancuernas, bandas, colchonetas, kettlebell, TRX, soga, conos'),
      jsonb_build_object('nombre','Gimnasio y espacio','pistas','cuota del gimnasio, alquiler del espacio, box, cancha, derecho de uso'),
      jsonb_build_object('nombre','Transporte','pistas','nafta, combustible, colectivo, uber, ir a domicilio'),
      jsonb_build_object('nombre','Ropa deportiva','pistas','ropa, zapatillas, calzas, uniforme'),
      jsonb_build_object('nombre','Internet y aplicaciones','pistas','internet, plan del celular, app de rutinas, Zoom'),
      jsonb_build_object('nombre','Publicidad','pistas','anuncios, Instagram, Facebook, TikTok, volantes'),
      jsonb_build_object('nombre','Capacitación','pistas','cursos, certificaciones, workshops, membresías'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))

    else jsonb_build_array(
      jsonb_build_object('nombre','Mercadería','pistas','lo que comprás para revender'),
      jsonb_build_object('nombre','Transporte','pistas','combustible, flete, delivery'),
      jsonb_build_object('nombre','Comida','pistas',''),
      jsonb_build_object('nombre','Publicidad','pistas',''),
      jsonb_build_object('nombre','Servicios','pistas','luz, agua, internet, teléfono'),
      jsonb_build_object('nombre','Alquiler','pistas',''),
      jsonb_build_object('nombre','Sueldos','pistas','empleados, jornales'),
      jsonb_build_object('nombre','Impuestos','pistas',''),
      jsonb_build_object('nombre','Otros','pistas',''))
  end;
$fn$;

-- ------------------------------------------------------------
-- 4. LA AGENDA DEL DÍA TRAE LAS NOTAS DE CADA CLIENTE
-- ------------------------------------------------------------
create or replace function public.agenda_del_dia(
  p_empresa uuid,
  p_fecha   date default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona  text;
  v_fecha date;
  v_res   jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona
  from public.empresas where id = p_empresa;
  v_fecha := coalesce(p_fecha, public.hoy_empresa(p_empresa));

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          r.id,
    'inicia',      r.inicia,
    'termina',     r.termina,
    'profesional', p.nombre,
    'profesional_id', r.profesional_id,
    'servicio',    pr.nombre,
    'producto_id', r.producto_id,
    'cliente',     r.cliente_nombre,
    'telefono',    r.cliente_telefono,
    'estado',      r.estado,
    'origen',      r.origen,
    'token',       r.token,
    'avisado',     (r.avisado_at is not null),
    'paquete_id',  r.paquete_id,
    'materia',     pq.materia,
    -- Lo que hay que saber de la persona antes de empezar (097): para un
    -- trainer, sus lesiones. Null si no hay nada anotado.
    'notas',       nullif(trim(cl.notas), '')
  ) order by r.inicia), '[]'::jsonb)
  into v_res
  from public.turnos_reserva r
  join public.turnos_profesional p on p.id = r.profesional_id
  join public.productos pr on pr.id = r.producto_id
  left join public.paquetes pq on pq.id = r.paquete_id
  left join public.clientes cl on cl.id = r.cliente_id and cl.empresa_id = r.empresa_id
  where r.empresa_id = p_empresa
    and (r.inicia at time zone v_zona)::date = v_fecha
    and r.estado <> 'cancelada';

  return v_res;
end $fn$;

-- ------------------------------------------------------------
-- 5. Y EL PANEL, EN LAS SESIONES DE HOY
-- ------------------------------------------------------------
create or replace function public.panel_profe(p_empresa uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_zona text;
  v_hoy  date;
  v_res  jsonb;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select coalesce(zona_horaria, 'America/Asuncion') into v_zona from public.empresas where id = p_empresa;
  v_hoy := public.hoy_empresa(p_empresa);

  select jsonb_build_object(
    'hoy', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'hora', to_char(r.inicia at time zone v_zona, 'HH24:MI'),
        'alumno', r.cliente_nombre, 'estado', r.estado, 'materia', pq.materia,
        'notas', nullif(trim(cl.notas), '')) order by r.inicia)
      from public.turnos_reserva r
      left join public.paquetes pq on pq.id = r.paquete_id
      left join public.clientes cl on cl.id = r.cliente_id and cl.empresa_id = r.empresa_id
      where r.empresa_id = p_empresa and r.estado <> 'cancelada'
        and (r.inicia at time zone v_zona)::date = v_hoy), '[]'::jsonb),
    'clases_periodo', (
      select count(*)::int from public.turnos_reserva r
      where r.empresa_id = p_empresa and r.estado = 'atendida'
        and (r.inicia at time zone v_zona)::date between p_desde and p_hasta),
    'cobrado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo in ('venta', 'ingreso')
        and m.fecha between p_desde and p_hasta), 0),
    'gastado', coalesce((
      select sum(m.monto) from public.movimientos m
      where m.empresa_id = p_empresa and m.estado = 'activo' and m.tipo = 'gasto'
        and m.fecha between p_desde and p_hasta), 0),
    'por_cobrar', coalesce((
      select sum(p.precio) from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado), 0),
    'deben', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and p.movimiento_id is null and p.precio > 0 and not p.cerrado),
    'alumnos_activos', (
      select count(distinct p.cliente_id)::int from public.paquetes p
      where p.empresa_id = p_empresa and not p.cerrado
        and (public.estado_paquete(p.id)->>'estado') = 'activo')
  ) into v_res;

  return v_res;
end $fn$;

-- Los permisos, los mismos de siempre (087, 089, 094). `create or replace`
-- ya los conserva; se escriben igual para que esta migración se lea sola.
grant execute on function public.rubros_validos() to anon, authenticated;
grant execute on function public.rubro_de_alumnos(text) to anon, authenticated;
grant execute on function public.categorias_de_rubro(text, text) to anon, authenticated;
revoke all on function public.agenda_del_dia(uuid, date) from public, anon;
grant execute on function public.agenda_del_dia(uuid, date) to authenticated;
revoke all on function public.panel_profe(uuid, date, date) from public, anon;
grant execute on function public.panel_profe(uuid, date, date) to authenticated;
