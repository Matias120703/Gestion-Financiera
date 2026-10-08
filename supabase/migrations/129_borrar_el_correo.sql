-- ============================================================
-- 129 · BORRAR LA CUENTA BORRA TAMBIÉN EL CORREO
-- ============================================================
--
-- Matías (07/10/2026): «cuando yo borro una cuenta, me gustaría que también
-- se borre el correo. Estoy tratando de entrar ahora en una cuenta y me
-- parece que ya existe ese correo, pero en realidad no existe porque en mi
-- panel de Orden yo ya la había eliminado.» Y después: «si yo elimino la
-- cuenta, me tiene que eliminar todo. Si yo vuelvo a ingresar el mismo
-- correo, tiene que crearse la nueva cuenta.»
--
-- DE DÓNDE VIENE
--
-- `borrar_cuenta` (022) borra el negocio y, a propósito, no toca a las
-- personas: «esa persona puede tener otra empresa». Quedaban entonces
-- usuarios sin ningún negocio, que no se ven en ningún lado del panel y
-- cuyo correo «ya tiene una cuenta». Con la sesión abierta, además, esa
-- persona cae en la pantalla de empezar y se arma un negocio nuevo sin que
-- nadie le pida correo ni contraseña: lo que le pasó a Matías.
--
-- LA DECISIÓN
--
--   · QUIÉN SE BORRA LO DECIDE LA BASE, en un solo lugar
--     (`motivo_para_no_borrar`). Se borra a quien queda SIN NINGÚN NEGOCIO:
--     el dueño y también su personal. Nunca: a la administración de Orden,
--     a quien aprieta el botón, a quien todavía es de otro negocio, ni a
--     quien recomienda Orden (un socio con cuenta: tiene plata de por medio
--     y perdería la pantalla desde donde la cobra; también el que la
--     administración cargó por su correo y todavía no pidió su código).
--   · EL USUARIO LO BORRA EL SERVIDOR, por la API de Auth y con la clave de
--     servicio, nunca una función llamada desde el navegador. Con una sesión
--     puesta, los candados de una cuenta vencida rechazan el rastro que esa
--     persona dejó; sin sesión pasan. Por eso lo nuevo de acá son funciones
--     que reciben al actor por parámetro (`p_actor`) y vuelven a exigir, en
--     la base, que administre Orden.
--   · LA CONSTANCIA NO ES UNA COPIA. En `registro_admin` el correo queda
--     tapado («ma***@correo.test»). Privacidad promete que al borrar una
--     cuenta «se borra de verdad» y que no queda una copia marcada como
--     borrada; un registro que no vence con el correo entero sería esa copia.
--   · LO QUE YA QUEDÓ SUELTO SE VE (`correos_sueltos`) y se borra de a uno,
--     escribiendo el correo entero.
--
-- UN OBSTÁCULO QUE ESTO DESTAPÓ: LA ANULACIÓN
--
-- `movimientos_anulacion_auditada` (002) exigía QUIÉN y CUÁNDO en todo
-- movimiento anulado, y `anulado_por` queda en null cuando esa persona se
-- borra. Resultado: a quien alguna vez anuló algo en un negocio que sigue
-- existiendo no se lo podía borrar (ni desde acá ni con «Borrar mi cuenta»,
-- que quedaba a medias). Pasa a exigir siempre el CUÁNDO; el QUIÉN queda
-- mientras esa persona exista. No abre nada: nadie puede anular a mano (la
-- sesión no tiene UPDATE sobre `movimientos` y al insertar se exige el
-- estado activo); las tres funciones que anulan escriben las dos cosas.
--
-- COMPATIBLE CON EL CÓDIGO PUBLICADO (esta migración se aplica ANTES del
-- deploy). `borrar_cuenta(p_empresa, p_confirmacion)` NO SE TOCA: ni la
-- firma, ni el cuerpo, ni los permisos. El panel publicado la sigue
-- llamando desde el navegador y recibe lo de siempre (`borrada`, `nombre`,
-- `movimientos`). Por ese camino las personas quedan sueltas, como hoy;
-- con el código nuevo aparecen en la lista. Todo lo demás de acá es NUEVO y
-- el código de hoy no lo llama. La restricción nueva es más floja que la
-- vieja: lo que hoy se guarda la sigue cumpliendo.
--
-- QUÉ NO CAMBIA
--
-- `borrar_cuenta`, `listar_cuentas`, `resumen_panel`, `archivos_de_cuenta`,
-- `borrar_datos_de_usuario`, `archivos_a_borrar`, `videos_a_borrar`,
-- `anular_movimiento`: ni una coma. Ninguna tabla ni columna nueva.
--
-- MENSAJES NUEVOS: ninguno. Lo nuevo lanza tres textos que ya existen, con
-- su portugués en src/lib/mensajes-base.ts: «Este panel es solo para la
-- administración de Orden.», «Esa cuenta no existe.» y «Para borrar hay que
-- escribir el nombre exacto: …».
--
-- PASOS PARA APLICARLA
--
--   1. ANTES, en producción y solo lectura: que el número 129 siga libre
--      (billetera-monedas anotó 130 y 131), que no exista ninguna de las
--      siete funciones de acá, y que la restricción sea la de la 002:
--        select pg_get_constraintdef(oid) from pg_constraint
--        where conname = 'movimientos_anulacion_auditada';
--   2. Aplicarla en UNA sola llamada.
--   3. Verificar la huella: las siete funciones, la restricción nueva, que
--      ningún cuerpo tenga una barra invertida
--      (position(chr(92) in prosrc) = 0), y los permisos, con
--      has_function_privilege para anon, authenticated y service_role:
--        · anon: ninguna de las siete;
--        · authenticated: solo personas_de_cuenta y correos_sueltos;
--        · service_role: solo borrar_cuenta_entera, correo_borrable y
--          anotar_correo_borrado.
--      `borrar_cuenta(uuid, text)` tiene que seguir igual que antes.
--   4. Recién después, publicar el código.
--
-- ESTE ARCHIVO NO TIENE NI UNA BARRA INVERTIDA, A PROPÓSITO: la herramienta
-- que lo aplica en producción las altera (30/09/2026).
--
-- No toca datos. Idempotente: se puede aplicar dos veces.
-- ============================================================


-- ------------------------------------------------------------
-- 1. LA ANULACIÓN: SIEMPRE CUÁNDO; QUIÉN MIENTRAS ESA PERSONA EXISTA
--
--    Mismo nombre que en la 002: src/lib/errores.ts la reconoce por el
--    nombre para decir «usá el botón de anular».
--
--    Se saca y se vuelve a poner (no hay «alter constraint» para un check).
--    Toda fila que cumplía la de antes cumple esta.
-- ------------------------------------------------------------
alter table public.movimientos drop constraint if exists movimientos_anulacion_auditada;
alter table public.movimientos add constraint movimientos_anulacion_auditada
  check (estado = 'activo' or anulado_at is not null);


-- ------------------------------------------------------------
-- SOBRE LOS PERMISOS DE TODO LO QUE SIGUE
--
-- En Supabase una función nueva nace ejecutable por PUBLIC y, además, por
-- anon, authenticated y service_role (privilegios por defecto del
-- proyecto). Por eso cada «revoke» de acá nombra, uno por uno, a todos los
-- que NO la tienen que llamar:
--
--   · internas ............ nadie (ni el servidor: las llaman otras funciones)
--   · de la sesión ........ solo authenticated (y adentro, es_superadmin)
--   · del servidor ........ solo service_role (y adentro, p_actor)
--
-- pruebas/borrar-correo.test.js aplica esta migración con esos mismos
-- privilegios por defecto puestos, y mira los tres roles en cada una.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 2. LAS DOS AYUDAS INTERNAS
--
--    Cerradas a todos: solo las llaman las funciones de abajo.
-- ------------------------------------------------------------

-- «ma***@correo.test»: lo que queda en el registro de un correo borrado.
-- Las dos primeras letras (una, si no hay más) y el dominio alcanzan para
-- reconocer a quién se borró, junto con el negocio y la fecha.
-- Con left, substr y position: sin expresiones regulares.
create or replace function public.correo_tapado(p_correo text)
returns text language sql immutable set search_path = public as $fn$
  select case
    when coalesce(trim(p_correo), '') = '' then ''
    when position('@' in trim(p_correo)) < 2 then '***'
    else left(trim(p_correo), least(2, position('@' in trim(p_correo)) - 1))
         || '***' || substr(trim(p_correo), position('@' in trim(p_correo)))
  end;
$fn$;

revoke all on function public.correo_tapado(text) from public, anon, authenticated, service_role;

comment on function public.correo_tapado(text) is
  'Un correo como queda en registro_admin al borrarlo (129): dos letras, tres asteriscos y el dominio. Nunca entero.';

-- LA REGLA, en un solo lugar. Null = se puede borrar; si no, por qué no.
--
--   no_existe       ese usuario ya no está (no es un candado: ya se borró)
--   vos             es quien aprieta el botón
--   administracion  administra Orden (su permiso se iría en cascada, sin aviso)
--   otro_negocio    todavía es de un negocio (ese negocio quedaría sin él)
--   socio           recomienda Orden: cobra comisiones desde su cuenta
--
-- p_empresa es el negocio que se está por borrar: sus membresías no
-- cuentan. Con p_empresa null, cualquier membresía cuenta. Así se pregunta
-- DESPUÉS de borrar el negocio, pegado al borrado de cada persona: si en el
-- medio se creó otro negocio o se unió a uno, ya no se la borra.
--
-- QUIÉN ES SOCIO: el mismo criterio que `mi_codigo_socio` (061), que es la
-- que decide de quién es cada fila de `socios`. Lo es quien ya la tiene
-- pegada a su cuenta (`user_id`) y también quien tiene el correo de una fila
-- todavía sin cuenta: la administración lo cargó por su correo antes de que
-- se registrara, y esa fila (su código y su saldo) lo espera hasta que pida
-- el código. Si se le borrara el usuario, el correo quedaría libre con la
-- fila esperando a quien se registre con él. Un socio cargado sin correo no
-- le pone candado a nadie. Para soltar el candado: sacarle el correo a ese
-- socio en «Socios».
--
-- El orden de los «when» es el orden en que se explica.
create or replace function public.motivo_para_no_borrar(
  p_usuario uuid,
  p_actor   uuid,
  p_empresa uuid default null
)
returns text language sql stable security definer set search_path = public as $fn$
  select case
    when p_usuario is null
      or not exists (select 1 from auth.users u where u.id = p_usuario) then 'no_existe'
    when p_usuario = p_actor then 'vos'
    when exists (select 1 from public.superadmins s where s.usuario_id = p_usuario) then 'administracion'
    when exists (
      select 1 from public.miembros m
      where m.user_id = p_usuario
        and (p_empresa is null or m.empresa_id <> p_empresa)
    ) then 'otro_negocio'
    when exists (select 1 from public.socios s where s.user_id = p_usuario) then 'socio'
    when exists (
      select 1 from public.socios s
      join auth.users u on u.id = p_usuario
      where s.user_id is null and s.email <> '' and s.email = lower(coalesce(u.email, ''))
    ) then 'socio'
    else null
  end;
$fn$;

revoke all on function public.motivo_para_no_borrar(uuid, uuid, uuid) from public, anon, authenticated, service_role;

comment on function public.motivo_para_no_borrar(uuid, uuid, uuid) is
  'Por que NO se borra el usuario de una persona (129), o null si se puede. La unica regla de a quien se le borra el correo.';


-- ------------------------------------------------------------
-- 3. PARA LA SESIÓN DE LA ADMINISTRACIÓN (el panel)
--
--    Las dos exigen `es_superadmin()` adentro, como todo el panel (016).
-- ------------------------------------------------------------

-- La ficha, ANTES de borrar: quiénes están en la cuenta y qué le pasa al
-- correo de cada uno. Es para MOSTRAR; quién se borra lo vuelve a decidir
-- `borrar_cuenta_entera` en el momento. No devuelve ids de usuario: la
-- pantalla no los necesita, porque no los manda.
create or replace function public.personas_de_cuenta(p_empresa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'correo',   coalesce(u.email, ''),
        'nombre',   m.nombre,
        'rol',      m.rol,
        'se_borra', x.motivo is null,
        'motivo',   x.motivo
      ) order by (m.rol = 'propietario') desc, m.created_at, m.id)
      from public.miembros m
      join auth.users u on u.id = m.user_id
      cross join lateral (
        select public.motivo_para_no_borrar(m.user_id, auth.uid(), p_empresa) as motivo
      ) x
      where m.empresa_id = p_empresa
    ), '[]'::jsonb),
    -- También la que ya se pidió quitar y Bancard no confirmó: sigue
    -- guardada allá (ver `borrar_cuenta_entera`).
    'tarjeta', exists (
      select 1 from public.bancard_tarjetas t
      where t.empresa_id = p_empresa and t.estado in ('activa', 'por_quitar')
    )
  );
end $fn$;

revoke all on function public.personas_de_cuenta(uuid) from public, anon, service_role;
grant execute on function public.personas_de_cuenta(uuid) to authenticated;

comment on function public.personas_de_cuenta(uuid) is
  'Quienes estan en una cuenta y si su correo se borra con ella (129). Solo la administracion de Orden.';

-- Los correos que ya quedaron sin ningún negocio.
--
-- A la administración no la muestra: sería ofrecerle a Matías borrar su
-- propio correo. A nadie más lo esconde: lo que se pidió es justamente ver
-- el correo que «existe» y no aparece en ningún lado. El que recomienda
-- Orden aparece con su candado (`se_puede` falso).
--
-- De `auth.users` se nombran solo `id` y `email`. Las fechas se leen de la
-- fila entera pasada a JSON: la tabla es de Supabase y sus columnas no son
-- nuestras; si una faltara, la lista sigue andando con ese dato vacío.
-- De esa fila no sale ningún otro dato.
--
--   reciente    se registró en los últimos 7 días: puede estar terminando
--               de crear su cuenta o por unirse a un negocio
--   con_codigo  vino por el enlace de un socio (el código viaja en su cuenta)
create or replace function public.correos_sueltos(p_limite integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.es_superadmin() then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'usuario',        x.id,
      'correo',         x.correo,
      'creado',         x.creado,
      'ultimo_ingreso', x.ultimo_ingreso,
      'confirmado',     x.confirmado,
      'reciente',       coalesce(x.creado > now() - interval '7 days', false),
      'con_codigo',     x.con_codigo,
      'se_puede',       x.motivo is null,
      'motivo',         x.motivo
    ) order by x.creado desc nulls last, x.correo, x.id)
    from (
      select u.id,
             coalesce(u.email, '') as correo,
             (d.j ->> 'created_at')::timestamptz      as creado,
             (d.j ->> 'last_sign_in_at')::timestamptz as ultimo_ingreso,
             (d.j ->> 'email_confirmed_at') is not null as confirmado,
             coalesce(d.j -> 'raw_user_meta_data' ->> 'ref', '') <> '' as con_codigo,
             public.motivo_para_no_borrar(u.id, auth.uid(), null) as motivo
      from auth.users u
      cross join lateral (select to_jsonb(u) as j) d
      where not exists (select 1 from public.miembros m where m.user_id = u.id)
        and not exists (select 1 from public.superadmins s where s.usuario_id = u.id)
      order by (d.j ->> 'created_at')::timestamptz desc nulls last, u.email, u.id
      limit greatest(1, least(coalesce(p_limite, 200), 500))
    ) x
  ), '[]'::jsonb);
end $fn$;

revoke all on function public.correos_sueltos(integer) from public, anon, service_role;
grant execute on function public.correos_sueltos(integer) to authenticated;

comment on function public.correos_sueltos(integer) is
  'Usuarios sin ningun negocio, para el panel (129). Sin la administracion. Solo la administracion de Orden.';


-- ------------------------------------------------------------
-- 4. PARA EL SERVIDOR (clave de servicio; el actor viaja por parámetro)
--
--    Con la clave de servicio no hay sesión y `es_superadmin()` contesta
--    falso. Las tres reciben a quien aprieta el botón y exigen, acá, que
--    esté en `superadmins` (como `bancard_revertir`, 125). La ruta ya lo
--    comprobó con la sesión; esto es la segunda pared.
-- ------------------------------------------------------------

-- BORRA LA CUENTA y devuelve lo que el servidor tiene que terminar afuera
-- de la base: los archivos (comprobantes y videos) y las personas, cada una
-- con el motivo si se queda.
--
-- Con p_solo_comprobar no borra ni anota nada: valida y cuenta. El servidor
-- ensaya primero, para que un nombre mal escrito no le quite la tarjeta a
-- nadie antes de saber si se puede borrar.
--
-- Las personas se calculan ANTES de borrar (después no hay `miembros`) y en
-- la misma transacción. La fila de la empresa se toma «for update»: dos
-- pedidos a la vez no se pisan (el segundo encuentra que ya no existe).
--
-- La constancia lleva la acción de siempre, `borrar_cuenta`, para que quien
-- busque borrados encuentre los dos caminos. `nombre`, `movimientos` y
-- `personas` (un número) son los de la 022; lo demás se suma. `empresa` es
-- el id en texto: sirve para encontrar comprobantes que hayan quedado bajo
-- su carpeta si el depósito falla.
--
-- LA TARJETA GUARDADA. Cuando esto borra de verdad, el servidor ya pasó por
-- Bancard. Si pudo pedirle que la borre, la tarjeta dejó de estar `activa`
-- (quedó `quitada` si Bancard contestó, `por_quitar` si no); si no pudo (es
-- del otro entorno, o el servidor no tiene Bancard), sigue `activa`. Por eso
-- acá «tiene tarjeta» es `activa` O `por_quitar`: las dos siguen guardadas
-- en Bancard. Con la cuenta se van sus filas y la conciliación ya no las
-- encuentra, así que la constancia es el único rastro que queda:
--
--   tenia_tarjeta           la cuenta guardó alguna vez una tarjeta en
--                           Bancard (también si ya está quitada)
--   tarjetas_sin_confirmar  las que Bancard NO confirmó que borró, con lo
--                           que hace falta para pedírselo a mano: el número
--                           de la tarjeta, el del pagador y el entorno. Son
--                           números de Orden; de la tarjeta no hay ningún dato.
create or replace function public.borrar_cuenta_entera(
  p_actor          uuid,
  p_empresa        uuid,
  p_confirmacion   text,
  p_solo_comprobar boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_nombre   text;
  v_movs     integer;
  v_personas jsonb;
  v_archivos jsonb;
  v_videos   jsonb;
  v_tarjeta  boolean;
begin
  if p_actor is null or not exists (select 1 from public.superadmins s where s.usuario_id = p_actor) then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select nombre into v_nombre from public.empresas where id = p_empresa for update;
  if v_nombre is null then
    raise exception 'Esa cuenta no existe.' using errcode = 'P0002';
  end if;

  -- La misma comparación de la 022.
  if trim(coalesce(p_confirmacion, '')) <> v_nombre then
    raise exception 'Para borrar hay que escribir el nombre exacto: %', v_nombre
      using errcode = '22023';
  end if;

  select count(*) into v_movs from public.movimientos where empresa_id = p_empresa;

  -- Todas las personas de la cuenta, sin mirar el rol. Primero el dueño.
  select coalesce(jsonb_agg(jsonb_build_object(
    'usuario', m.user_id,
    'correo',  coalesce(u.email, ''),
    'rol',     m.rol,
    'motivo',  public.motivo_para_no_borrar(m.user_id, p_actor, p_empresa)
  ) order by (m.rol = 'propietario') desc, m.created_at, m.id), '[]'::jsonb)
  into v_personas
  from public.miembros m
  join auth.users u on u.id = m.user_id
  where m.empresa_id = p_empresa;

  select coalesce(jsonb_agg(a.ruta), '[]'::jsonb) into v_archivos
  from public.adjuntos a where a.empresa_id = p_empresa and a.ruta is not null;

  -- No existía una función de videos por empresa: va acá.
  select coalesce(jsonb_agg(v.ruta), '[]'::jsonb) into v_videos
  from public.videos v where v.empresa_id = p_empresa;

  -- Lo que el ensayo le dice al servidor: si hay una tarjeta que Bancard
  -- todavía tiene. Con una `por_quitar` (un intento anterior que se cortó, o
  -- el dueño la quitó y Bancard no confirmó) el servidor no la puede pedir
  -- de nuevo: así lo avisa en vez de contestar «no tenía tarjeta».
  v_tarjeta := exists (
    select 1 from public.bancard_tarjetas t
    where t.empresa_id = p_empresa and t.estado in ('activa', 'por_quitar')
  );

  if coalesce(p_solo_comprobar, false) then
    return jsonb_build_object(
      'borrada', false, 'nombre', v_nombre, 'movimientos', v_movs,
      'personas', v_personas, 'archivos', '[]'::jsonb, 'videos', '[]'::jsonb,
      'tarjeta', v_tarjeta
    );
  end if;

  -- Constancia ANTES de borrar: después `empresa_id` queda en null.
  -- Los correos van tapados: el registro no es una copia de lo borrado.
  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (p_actor, p_empresa, 'borrar_cuenta', jsonb_build_object(
    'nombre', v_nombre,
    'movimientos', v_movs,
    'personas', jsonb_array_length(v_personas),
    'empresa', p_empresa::text,
    'fotos', jsonb_array_length(v_archivos),
    'videos', jsonb_array_length(v_videos),
    'tenia_tarjeta', exists (
      select 1 from public.bancard_tarjetas t
      where t.empresa_id = p_empresa and t.estado in ('activa', 'por_quitar', 'quitada')
    ),
    'tarjetas_sin_confirmar', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tarjeta', t.id, 'pagador', t.pagador_id, 'entorno', t.entorno
      ) order by t.id)
      from public.bancard_tarjetas t
      where t.empresa_id = p_empresa and t.estado in ('activa', 'por_quitar')
    ), '[]'::jsonb),
    'correos', coalesce((
      select jsonb_agg(public.correo_tapado(p ->> 'correo'))
      from jsonb_array_elements(v_personas) p where p ->> 'motivo' is null
    ), '[]'::jsonb),
    'se_quedan', coalesce((
      select jsonb_agg(jsonb_build_object(
        'correo', public.correo_tapado(p ->> 'correo'), 'motivo', p ->> 'motivo'))
      from jsonb_array_elements(v_personas) p where p ->> 'motivo' is not null
    ), '[]'::jsonb)
  ));

  delete from public.empresas where id = p_empresa;

  return jsonb_build_object(
    'borrada', true, 'nombre', v_nombre, 'movimientos', v_movs,
    'personas', v_personas, 'archivos', v_archivos, 'videos', v_videos,
    'tarjeta', v_tarjeta
  );
end $fn$;

revoke all on function public.borrar_cuenta_entera(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.borrar_cuenta_entera(uuid, uuid, text, boolean) to service_role;

comment on function public.borrar_cuenta_entera(uuid, uuid, text, boolean) is
  'Borra una cuenta desde el panel y devuelve archivos, videos y personas para que el servidor termine (129). Solo el servidor, con el actor por parametro.';

-- LA COMPROBACIÓN PEGADA AL BORRADO de cada usuario. El servidor la llama
-- justo antes de pedirle a Auth que lo borre, con el negocio ya borrado:
-- por eso pregunta con la empresa en null (cualquier membresía cuenta).
--
-- No lanza por «no se puede»: contesta, para que el servidor siga con la
-- persona siguiente.
--
-- p_confirmacion es el correo escrito a mano y se usa solo en la lista de
-- correos sueltos; al borrar una cuenta va null (ya se confirmó con el
-- nombre del negocio). Se compara sin mirar mayúsculas ni los espacios de
-- los costados.
create or replace function public.correo_borrable(
  p_actor        uuid,
  p_usuario      uuid,
  p_confirmacion text default null
)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_correo text;
  v_motivo text;
begin
  if p_actor is null or not exists (select 1 from public.superadmins s where s.usuario_id = p_actor) then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  select u.email into v_correo from auth.users u where u.id = p_usuario;
  v_motivo := public.motivo_para_no_borrar(p_usuario, p_actor, null);

  if v_motivo is null and p_confirmacion is not null
     and lower(trim(p_confirmacion)) <> lower(coalesce(v_correo, '')) then
    v_motivo := 'confirmacion';
  end if;

  return jsonb_build_object(
    'borrable', v_motivo is null,
    'motivo',   v_motivo,
    'correo',   coalesce(v_correo, '')
  );
end $fn$;

revoke all on function public.correo_borrable(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.correo_borrable(uuid, uuid, text) to service_role;

comment on function public.correo_borrable(uuid, uuid, text) is
  'Si el usuario de una persona se puede borrar AHORA, y por que no (129). Solo el servidor, justo antes de pedirselo a Auth.';

-- LA CONSTANCIA de un correo borrado, DESPUÉS de que Auth lo borró.
--
-- Si el usuario todavía existe no anota nada: el registro no dice «borrado»
-- de algo que no pasó. El correo entra entero y se guarda tapado. El id del
-- usuario (al azar, no dice quién era) queda en texto, para poder cruzarlo
-- con los registros de Supabase si alguna vez hace falta.
create or replace function public.anotar_correo_borrado(
  p_actor   uuid,
  p_usuario uuid,
  p_correo  text,
  p_origen  text,
  p_cuenta  text default null
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
begin
  if p_actor is null or not exists (select 1 from public.superadmins s where s.usuario_id = p_actor) then
    raise exception 'Este panel es solo para la administración de Orden.' using errcode = '42501';
  end if;

  if p_usuario is null or exists (select 1 from auth.users u where u.id = p_usuario) then
    return jsonb_build_object('anotado', false);
  end if;

  insert into public.registro_admin (actor_id, empresa_id, accion, detalle)
  values (p_actor, null, 'borrar_correo', jsonb_build_object(
    'correo',  public.correo_tapado(p_correo),
    'usuario', p_usuario::text,
    'origen',  case when p_origen = 'cuenta' then 'cuenta' else 'suelto' end,
    'cuenta',  nullif(trim(coalesce(p_cuenta, '')), '')
  ));

  return jsonb_build_object('anotado', true);
end $fn$;

revoke all on function public.anotar_correo_borrado(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.anotar_correo_borrado(uuid, uuid, text, text, text) to service_role;

comment on function public.anotar_correo_borrado(uuid, uuid, text, text, text) is
  'Deja en registro_admin que se borro un correo, tapado (129). Solo si el usuario ya no existe. Solo el servidor.';
