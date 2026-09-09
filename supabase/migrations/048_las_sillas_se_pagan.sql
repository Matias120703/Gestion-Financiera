-- ============================================================
-- ORDEN · Migración 048 · Las sillas se pagan
--
-- LOS DOS AGUJEROS QUE CIERRA
--
-- 1. EL TOPE ERA DEL PLAN, Y EL PLAN ERA UNO SOLO PARA TODOS.
--
--    `limites_plan` da 3 personas en Pro y 15 en Negocio, y no había forma
--    de decir «este negocio pagó por cuatro». Peor: la portada vende Negocio
--    como «sin tope de vendedores» y la base corta en 15. Prometíamos algo
--    que el sistema no cumple, y el que se llevaba la sorpresa era el que ya
--    había pagado.
--
--    Desde acá el tope se escribe por negocio, a mano, en el panel de
--    administración, en el mismo momento en que se cobra. El plan pasa a ser
--    el valor por defecto de quien no tiene nada escrito.
--
-- 2. UN PROFESIONAL SIN CUENTA NO CONTABA PARA NADA.
--
--    `turnos_profesional.user_id` era opcional a propósito (ver la 033), y
--    el argumento no era malo: que el barbero sin celular pueda estar en la
--    agenda. Pero la consecuencia sí lo era. Una peluquería con seis sillas
--    usaba agenda, reparto y comisiones enteras SIN sumar un solo miembro,
--    o sea en el plan gratis. El tope de personas no tocaba el único rubro
--    donde más gente significa más trabajo para el sistema.
--
--    Ahora, para estar en el equipo de reparto hay que ser miembro. Una sola
--    cuenta de «cuántas personas hay acá», y el tope la gobierna entera.
--
-- LO QUE ESTO LE CUESTA AL PRODUCTO, DICHO SIN ADORNO
--
-- El barbero que no tiene celular ya no puede estar en la agenda. Es una
-- pérdida real y fue una decisión tomada a sabiendas: el dueño va a tener
-- que sumarlo como miembro —y pagar su silla— o llevarlo aparte.
--
-- QUÉ PASA CON LOS QUE YA ESTABAN
--
-- No se borra ninguno. Los profesionales sin cuenta se DESACTIVAN, que es
-- reversible y no toca el historial: sus cortes, sus reservas y las
-- liquidaciones ya cerradas quedan intactas. Para recuperarlos, la persona
-- entra con el código del negocio y el dueño lo vuelve a activar.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EL TOPE DE CADA NEGOCIO
--
--    Se escribe en VENDEDORES y no en personas porque es lo que se negocia
--    y se cobra: «pagás por cuatro vendedores». El dueño no es un vendedor
--    al que se le cobre una silla — es el que paga.
--
--    `null` no es cero: significa «este negocio no tiene trato especial,
--    vale lo que diga su plan». Cero sí es cero: el dueño solo.
-- ------------------------------------------------------------
alter table public.suscripciones
  add column if not exists tope_vendedores integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tope_vendedores_razonable'
  ) then
    alter table public.suscripciones
      add constraint tope_vendedores_razonable
      check (tope_vendedores is null or tope_vendedores between 0 and 200);
  end if;
end $$;

comment on column public.suscripciones.tope_vendedores is
  'Cuántos vendedores pagó este negocio, sin contar al dueño. NULL = lo que diga su plan. Lo escribe la administración al cobrar.';

-- ------------------------------------------------------------
-- 2. CUÁNTAS PERSONAS ENTRAN ACÁ
--
--    Una sola función que responde la pregunta, para que no haya dos
--    lugares que puedan contestar distinto.
--
--    El «+1» es el dueño, y vive únicamente acá. En el panel se escriben
--    vendedores; la tabla `miembros` cuenta personas. Si esa suma estuviera
--    repetida en dos lados, tarde o temprano una de las dos se olvidaría.
--
--    SIN PLAN PAGO NO VALE EL TRATO. Si no, un negocio al que le
--    habilitamos diez sillas se quedaría con las diez el día que deja de
--    pagar, que es exactamente cuando no corresponde.
-- ------------------------------------------------------------
create or replace function public.tope_de_miembros(p_empresa uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case
    when public.plan_efectivo_calculado(p_empresa) = 'gratis'
      then (public.limites_plan('gratis')->>'miembros')::integer
    else coalesce(
      (select s.tope_vendedores + 1
       from public.suscripciones s
       where s.empresa_id = p_empresa and s.tope_vendedores is not null),
      (public.limites_plan(public.plan_efectivo_calculado(p_empresa))->>'miembros')::integer
    )
  end;
$fn$;

revoke all on function public.tope_de_miembros(uuid) from public, anon;
grant execute on function public.tope_de_miembros(uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. LA PUERTA DE ENTRADA AL NEGOCIO
--
--    Único lugar donde alguien se suma a una empresa, y por eso único lugar
--    donde hay que contar. Lo que cambia es de dónde sale el tope.
--
--    El mensaje también cambia. El viejo decía «el plan Negocio permite
--    más», que ahora sería mentira: en Negocio el tope también lo ponemos
--    nosotros. Un mensaje de error que manda a la persona equivocada a
--    hacer la cosa equivocada es peor que uno corto.
-- ------------------------------------------------------------
create or replace function public.unirse_empresa(
  p_codigo text,
  p_nombre_usuario text default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id      uuid;
  v_cuantos integer;
  v_tope    integer;
  v_tipo    text;
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión.' using errcode = '42501';
  end if;

  select a.empresa_id into v_id
  from public.empresa_accesos a
  where a.codigo = upper(trim(coalesce(p_codigo, ''))) and a.activo;

  if v_id is null then
    raise exception 'El código no corresponde a ninguna empresa.' using errcode = '42501';
  end if;

  -- Ya es miembro: no es un error, simplemente devolvemos la empresa.
  if exists (select 1 from public.miembros where empresa_id = v_id and user_id = auth.uid()) then
    return v_id;
  end if;

  select tipo_cuenta into v_tipo from public.empresas where id = v_id;
  if v_tipo = 'personal' then
    raise exception 'Esa es una cuenta personal: no admite más personas.'
      using errcode = '54000';
  end if;

  select count(*)::int into v_cuantos from public.miembros where empresa_id = v_id;
  v_tope := public.tope_de_miembros(v_id);

  if v_cuantos >= v_tope then
    raise exception
      'Este negocio ya tiene sus % personas. Para sumar a alguien más hay que ampliar el plan.', v_tope
      using errcode = '54000';
  end if;

  insert into public.miembros (empresa_id, user_id, nombre, rol)
  values (v_id, auth.uid(), coalesce(nullif(trim(p_nombre_usuario), ''), 'Colaborador'), 'vendedor')
  on conflict (empresa_id, user_id) do nothing;

  return v_id;
end $fn$;

revoke all on function public.unirse_empresa(text, text) from public, anon;
grant execute on function public.unirse_empresa(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4. EL PANEL: COBRAR Y HABILITAR SON EL MISMO ACTO
--
--    El tope se pone donde se cobra, y no en otra pantalla, porque son la
--    misma decisión: «me pagó por cuatro vendedores hasta el 9 de octubre».
--    Separarlos daría cuentas cobradas y sin habilitar, o al revés.
--
--    `p_vendedores` en null deja el tope como estaba. Para volver al valor
--    del plan hay que mandar -1: sin esa distinción no habría forma de
--    borrar un trato especial, porque null ya significa «no lo toques».
-- ------------------------------------------------------------
create or replace function public.cambiar_plan_cuenta(
  p_empresa    uuid,
  p_plan       text,
  p_meses      integer default 1,
  p_nota       text default '',
  p_importe    numeric default null,
  p_vendedores integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_antes    public.suscripciones;
  v_fin      timestamptz;
  v_estado   text;
  v_orden    uuid;
  v_cliente  text;
  v_ingreso  uuid;
  v_aviso    text := null;
  v_tope     integer;
  v_personas integer;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_plan not in ('gratis', 'pro', 'negocio') then
    raise exception 'Plan desconocido: %', p_plan using errcode = '22023';
  end if;

  if p_vendedores is not null and p_vendedores < -1 then
    raise exception 'El tope de vendedores no puede ser negativo.' using errcode = '22023';
  end if;

  select * into v_antes from public.suscripciones where empresa_id = p_empresa;
  if v_antes.empresa_id is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  select nombre into v_cliente from public.empresas where id = p_empresa;

  if p_plan = 'gratis' then
    v_estado := 'vencida';
    v_fin := now();
    -- Cortar el servicio borra el trato: si vuelve, se negocia de nuevo.
    v_tope := null;
  else
    v_estado := 'activa';
    -- Si todavía le queda tiempo pago, se le suma; si no, arranca hoy.
    v_fin := greatest(coalesce(v_antes.periodo_fin, now()), now())
             + make_interval(months => greatest(1, coalesce(p_meses, 1)));
    v_tope := case
      when p_vendedores is null then v_antes.tope_vendedores  -- no se toca
      when p_vendedores = -1    then null                     -- volver al plan
      else p_vendedores
    end;
  end if;

  update public.suscripciones
  set plan = p_plan,
      estado = v_estado,
      periodo_inicio = case when p_plan = 'gratis' then periodo_inicio else now() end,
      periodo_fin = v_fin,
      tope_vendedores = v_tope,
      proveedor_pago = case when p_plan = 'gratis' then proveedor_pago else 'transferencia' end,
      updated_at = now()
  where empresa_id = p_empresa;

  perform set_config('orden.suscripcion_confiable', '1', true);
  update public.empresas
  set plan = case when p_plan = 'gratis' then 'gratis' else 'pro' end
  where id = p_empresa;
  perform set_config('orden.suscripcion_confiable', '0', true);

  -- ---- ¿le queda gente afuera del tope nuevo? ----
  --
  -- No se echa a nadie: bajar un número en un panel no puede sacarle el
  -- acceso a una persona que hoy está trabajando. Pero hay que decirlo, o
  -- el que lo bajó se entera cuando el cliente reclama.
  if v_tope is not null then
    select count(*)::int into v_personas from public.miembros where empresa_id = p_empresa;
    if v_personas > v_tope + 1 then
      v_aviso := 'Ojo: este negocio ya tiene ' || v_personas || ' personas y le habilitaste '
              || v_tope || ' vendedores (' || (v_tope + 1) || ' con el dueño). '
              || 'No se sacó a nadie, pero no va a poder sumar a nadie más.';
    end if;
  end if;

  -- ---- el cobro, como ingreso de Orden ----
  if p_plan <> 'gratis' and coalesce(p_importe, 0) > 0 then
    select empresa_id into v_orden from public.ajustes_orden where unica;

    if v_orden is null then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'No hay una empresa de Orden elegida, así que el cobro no se anotó en tus finanzas.';
    elsif v_orden = p_empresa then
      v_aviso := coalesce(v_aviso || ' ', '')
              || 'Esta ES tu empresa, así que no se anotó ningún ingreso.';
    else
      begin
        insert into public.movimientos (
          empresa_id, tipo, estado, fecha, descripcion, categoria,
          subtotal, descuento, monto, costo_total, metodo_pago, contraparte, creado_por
        ) values (
          v_orden, 'ingreso', 'activo', public.hoy_empresa(v_orden),
          'Suscripción ' || coalesce(v_cliente, 'cliente'), 'Suscripciones',
          p_importe, 0, p_importe, 0, 'transferencia',
          left(coalesce(v_cliente, ''), 80), auth.uid()
        )
        returning id into v_ingreso;
      exception when others then
        v_aviso := coalesce(v_aviso || ' ', '')
                || 'La cuenta se activó, pero el ingreso no se pudo anotar: ' || sqlerrm;
      end;
    end if;
  end if;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (auth.uid(), p_empresa, 'cambiar_plan', jsonb_build_object(
    'plan_antes', v_antes.plan, 'plan_despues', p_plan,
    'estado_antes', v_antes.estado, 'estado_despues', v_estado,
    'vence_antes', v_antes.periodo_fin, 'vence_despues', v_fin,
    'meses', greatest(1, coalesce(p_meses, 1)),
    'importe', p_importe,
    'tope_antes', v_antes.tope_vendedores,
    'tope_despues', v_tope,
    'ingreso_id', v_ingreso,
    'nota', left(coalesce(p_nota, ''), 300)
  ));

  return jsonb_build_object(
    'plan', p_plan, 'estado', v_estado, 'periodo_fin', v_fin,
    'tope_vendedores', v_tope,
    'personas_permitidas', public.tope_de_miembros(p_empresa),
    'ingreso_anotado', v_ingreso is not null,
    'aviso', v_aviso
  );
end $fn$;

-- La firma de 5 argumentos queda muerta: si no se borra, PostgREST ve dos
-- funciones con el mismo nombre y no sabe cuál llamar. Es la misma razón
-- por la que la 019 borró la de 4.
drop function if exists public.cambiar_plan_cuenta(uuid, text, integer, text, numeric);

revoke all on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer)
  from public, anon;
grant execute on function public.cambiar_plan_cuenta(uuid, text, integer, text, numeric, integer)
  to authenticated;

-- ------------------------------------------------------------
-- 5. PARA ESTAR EN EL EQUIPO HAY QUE ESTAR EN EL NEGOCIO
--
--    La comprobación de que la cuenta pertenece a esta empresa ya existía
--    desde la 034. Lo único que cambia es que ahora no se puede omitir.
-- ------------------------------------------------------------
create or replace function public.guardar_profesional(
  p_empresa    uuid,
  p_nombre     text,
  p_reparto    text    default 'local',
  p_porcentaje numeric default null,
  p_user       uuid    default null,
  p_id         uuid    default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not public.es_admin(p_empresa) then
    raise exception 'Solo el dueño de la cuenta puede tocar el equipo.' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) = 0 then
    raise exception 'Ponele un nombre, para saber de quién es cada corte.' using errcode = '22023';
  end if;

  if coalesce(p_reparto, '') not in ('local', 'comision', 'alquiler', 'sueldo') then
    raise exception 'Ese tipo de arreglo no existe.' using errcode = '22023';
  end if;

  if p_reparto = 'comision'
     and (p_porcentaje is null or p_porcentaje <= 0 or p_porcentaje > 100) then
    raise exception 'Con comisión hace falta un porcentaje entre 1 y 100.' using errcode = '22023';
  end if;

  -- El cambio de la 048. El mensaje explica el camino completo, porque el
  -- dueño está mirando una lista de nombres y no tiene por qué adivinar que
  -- primero hay que pasarle un código.
  if p_user is null then
    raise exception
      'Para estar en el equipo, esa persona tiene que entrar antes al negocio con el código de acceso. Pasale el código, que se cree su cuenta, y después sumala acá.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.miembros m
                 where m.empresa_id = p_empresa and m.user_id = p_user) then
    raise exception 'Esa persona no es parte de este negocio.' using errcode = '42501';
  end if;

  if p_id is null then
    insert into public.turnos_profesional (empresa_id, nombre, user_id, reparto, porcentaje)
    values (p_empresa, trim(p_nombre), p_user, p_reparto,
            case when p_reparto = 'comision' then p_porcentaje else null end)
    returning id into v_id;
  else
    update public.turnos_profesional
    set nombre = trim(p_nombre),
        user_id = p_user,
        reparto = p_reparto,
        porcentaje = case when p_reparto = 'comision' then p_porcentaje else null end,
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Esa persona no está en el equipo de esta cuenta.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end $fn$;

revoke all on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.guardar_profesional(uuid, text, text, numeric, uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 6. LOS QUE YA ESTABAN SIN CUENTA
--
--    Se desactivan, no se borran. `activo = false` los saca de la agenda y
--    del reparto de acá en adelante y deja intacto todo lo anterior: sus
--    cortes, sus reservas y las liquidaciones ya cerradas siguen
--    respondiendo por su id.
--
--    Borrarlos habría hecho desaparecer de quién fue cada corte y las
--    liquidaciones del mes pasado dejarían de cerrar — que es exactamente
--    lo que la 034 evita cuando se borra a alguien con cortes cargados.
-- ------------------------------------------------------------
do $$
declare v_cuantos integer;
begin
  update public.turnos_profesional
  set activo = false, updated_at = now()
  where user_id is null and activo;

  get diagnostics v_cuantos = row_count;

  if v_cuantos > 0 then
    raise notice
      'Se desactivaron % profesionales sin cuenta. No se borró ninguno: para recuperarlos, que la persona entre con el código del negocio y volvelos a activar.',
      v_cuantos;
  end if;
end $$;

-- ------------------------------------------------------------
-- 7. QUE EL PANEL PUEDA LEER EL TOPE
--
--    Sin esto, el número se puede escribir y no se puede ver: quien cobra
--    tendría que acordarse de memoria de cuántas sillas le habilitó a cada
--    negocio, o mirar la tabla a mano.
--
--    Van los dos números y no uno solo, a propósito: `tope_vendedores` es lo
--    que se negoció y `personas_permitidas` es lo que la puerta va a contar
--    de verdad. Mostrar solo el primero obligaría a la pantalla a hacer el
--    «+1» por su cuenta, y esa suma tiene que vivir en un solo lugar.
-- ------------------------------------------------------------
create or replace function public.listar_cuentas(
  p_busqueda text default null,
  p_estado   text default null,
  p_limite   integer default 200
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_res jsonb;
  v_periodo text;
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  v_periodo := to_char(now(), 'YYYY-MM');

  select coalesce(jsonb_agg(x order by x->>'orden'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
      'empresa_id',   e.id,
      'nombre',       e.nombre,
      'tipo_cuenta',  e.tipo_cuenta,
      'rubro',        e.rubro,
      'moneda',       e.moneda,
      'creada',       e.created_at,
      'propietario',  coalesce(prop.nombre, ''),
      'correo',       coalesce(u.email, ''),
      'sin_duenio',   prop.id is null,
      'como_nos_conocio', e.como_nos_conocio,

      'contacto',  coalesce(f.contacto, ''),
      'telefono',  coalesce(f.telefono, ''),
      'se_dedica', coalesce(f.se_dedica, ''),
      'notas',     coalesce(f.notas, ''),

      'plan',         public.plan_efectivo_calculado(e.id),
      'plan_guardado', s.plan,
      'estado',       s.estado,
      'periodo_fin',  s.periodo_fin,
      'prueba_fin',   s.prueba_fin,
      'dias_restantes', case
        when s.periodo_fin is null then null
        else floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer
      end,
      'miembros', (select count(*) from public.miembros m where m.empresa_id = e.id),
      -- Lo negociado y lo que la puerta cuenta. Ver el comentario de arriba.
      'tope_vendedores',     s.tope_vendedores,
      'personas_permitidas', public.tope_de_miembros(e.id),
      'movimientos', (select count(*) from public.movimientos mv where mv.empresa_id = e.id),
      'ultima_actividad', (select max(mv.created_at) from public.movimientos mv where mv.empresa_id = e.id),
      'ia_usada', coalesce((
        select ui.usados from public.uso_ia ui
        where ui.empresa_id = e.id and ui.periodo = v_periodo
      ), 0),
      'ia_tope', (public.limites_plan(public.plan_efectivo_calculado(e.id))->>'capturas_mes')::integer,
      'puede_deshacer', exists (
        select 1 from public.registro_admin r
        where r.empresa_id = e.id
          and r.accion in ('cambiar_plan', 'extender_prueba')
          and not coalesce((r.detalle->>'deshecho')::boolean, false)
      ),
      'orden', lpad(
        greatest(0, coalesce(
          floor(extract(epoch from (s.periodo_fin - now())) / 86400)::integer + 1000,
          9999))::text, 5, '0')
    ) as x
    from public.empresas e
    join public.suscripciones s on s.empresa_id = e.id
    left join public.miembros prop
      on prop.empresa_id = e.id and prop.rol = 'propietario'
    left join auth.users u on u.id = prop.user_id
    left join public.ficha_cliente f on f.empresa_id = e.id
    where (
        p_busqueda is null
        or trim(p_busqueda) = ''
        or e.nombre ilike '%' || trim(p_busqueda) || '%'
        or coalesce(u.email, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.contacto, '') ilike '%' || trim(p_busqueda) || '%'
        or coalesce(f.telefono, '') ilike '%' || trim(p_busqueda) || '%'
      )
      and (p_estado is null or trim(p_estado) = '' or s.estado = p_estado)
    limit greatest(1, least(coalesce(p_limite, 200), 500))
  ) t;

  return v_res;
end $fn$;

revoke all on function public.listar_cuentas(text, text, integer) from public, anon;
grant execute on function public.listar_cuentas(text, text, integer) to authenticated;
