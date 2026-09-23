-- ============================================================
-- 099 · UNA PERSONA POR TELÉFONO, COPIAS EN PREPARACIÓN, Y LOS DATOS
--       DE SALUD AL ARCHIVAR
-- ============================================================
--
-- Sale de la revisión de las pantallas del módulo de rutinas (098), que
-- destapó tres cosas que la base hacía mal, o dejaba hacer.
--
-- 1. COPIAR A ALGUIEN SIN RUTINA LA DEJABA VIGENTE AL INSTANTE
--
--    «Usar para un cliente» desde una plantilla, «Copiar la de otro
--    cliente» o «Armar una nueva a partir de esta» desde las anteriores de
--    otro iban derecho a vigente si la persona no tenía rutina. Y si ya
--    tenía link —después de «Terminar», por ejemplo—, la veía antes de que
--    el trainer la revisara, con las notas de la otra persona adentro.
--    Ahora `copiar_rutina` acepta `p_borrador`: con él, la copia nace en
--    preparación («Próxima» en su carpeta) y nada llega al link hasta
--    «Activar la próxima». Sin cliente (una plantilla) no dice nada.
--    Y cuando al sacarle el nombre de la otra persona no queda nada
--    («Treino da Ana» → nada), el nombre de respaldo lo manda la pantalla
--    en su idioma (`p_nombre_vacio`): «Rutina» llegaba al link de un
--    cliente brasileño.
--
-- 2. AGENDAR A «LAURA» CON EL TELÉFONO DE «ANA» LE PISABA LA FICHA A ANA
--
--    Desde la 052 el teléfono es la identidad: un número repetido es la
--    misma persona, y la ficha se renombra y se reactiva. En un almacén o
--    una barbería está bien y no cambia. Con datos de entrenamiento no:
--    Laura heredaba las medidas, las lesiones, la rutina, la historia de
--    cargas y el consentimiento de Ana. Es una mezcla de datos de salud.
--    Ahora, si el nombre es otro y esa ficha tiene algo de entrenamiento
--    (rutinas, medidas, ficha o cargas), `guardar_cliente` se frena y dice
--    de quién es el número. Con el mismo nombre escrito de otra manera, o
--    sin nada de entrenamiento, todo sigue exactamente igual que hoy.
--    Si esa ficha está archivada no está en ninguna lista para elegirla:
--    el número queda libre, como en la rama con id de la 058, y la persona
--    nueva nace con su propia ficha sin heredar nada; la archivada conserva
--    sus rutinas y sus cargas por id.
--
-- 3. ARCHIVAR DEJABA LAS MEDIDAS Y LAS LESIONES SIN FORMA DE BORRARLAS
--
--    Una vez archivado, ninguna pantalla llega a su Progreso ni a su
--    ficha, así que sus medidas, su consentimiento y «Salud y lesiones»
--    quedaban guardados para siempre, sin manera de sacarlos (Ley
--    7593/2025). Ahora `eliminar_cliente`, al archivar, los borra en la
--    misma transacción. Las rutinas y cómo subieron sus cargas se
--    conservan: son el trabajo del trainer, no datos de salud, y no se ven
--    en ningún link (el link ya se apaga y cambia de token al archivar, por
--    la 098). Si la persona vuelve con el mismo nombre y el mismo teléfono,
--    vuelve a dar su consentimiento. Es para todos los rubros: en «Notas»
--    de una barbería también puede ir «es alérgica a…», y la pantalla lo
--    dice al eliminar («sus notas se borran»).
--
-- Cada función es copia exacta de su versión viva —leída de producción con
-- pg_get_functiondef y cotejada con la 052/058 (guardar_cliente) y la 098
-- (copiar_rutina, eliminar_cliente)— con lo marcado (099). `copiar_rutina`
-- cambia de firma, así que la vieja se borra antes: con las dos, la llamada
-- de cuatro argumentos sería ambigua. Las otras dos conservan la suya y se
-- reemplazan sin crear otra al lado. `activar_rutina` ya funciona sin una
-- vigente previa (pasa el borrador a vigente desde hoy y asegura el link):
-- no se toca, y se comprueba en pruebas/rutinas.test.js.
--
-- Los espacios raros de las expresiones regulares van escritos como
-- códigos (E'\u00A0') y no pegados: pegados, se volvían espacios comunes al
-- aplicar la migración (098).

-- ------------------------------------------------------------
-- 1. COPIAR UNA RUTINA, EN PREPARACIÓN SI SE PIDE
--
--    La firma vieja se va: si quedara, `copiar_rutina(e, o, c, true)`
--    coincidiría con las dos y PostgreSQL no sabría cuál llamar.
-- ------------------------------------------------------------
drop function if exists public.copiar_rutina(uuid, uuid, uuid, boolean);
drop function if exists public.copiar_rutina(uuid, uuid, uuid, boolean, boolean);

create or replace function public.copiar_rutina(
  p_empresa      uuid,
  p_origen       uuid,
  p_cliente      uuid default null,
  p_con_notas    boolean default true,
  p_borrador     boolean default false,
  p_nombre_vacio text default 'Rutina'
)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_o         public.rutinas;
  v_estado    text;
  v_cliente   uuid;
  v_mismo     boolean;
  v_sin_notas boolean;
  v_pila      text;
  v_nombre    text;
  v_id        uuid;
  v_dia       public.rutina_dias;
  v_dia_id    uuid;
  v_token     uuid;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  select * into v_o from public.rutinas where id = p_origen and empresa_id = p_empresa;
  if v_o.id is null then
    raise exception 'Esa rutina no existe.' using errcode = 'P0002';
  end if;

  v_estado := public.destino_nueva_rutina(p_empresa, p_cliente);

  -- (099) Si la persona no tiene rutina, la copia iba derecho a vigente y,
  -- con el link ya en su celular, la veía antes de que el trainer la
  -- revisara, con las notas de la otra persona. Con p_borrador nace en
  -- preparación y se activa desde su carpeta. Una plantilla no tiene link
  -- ni preparación: ahí p_borrador no dice nada. Y `destino_nueva_rutina`
  -- no mira si ya hay una en preparación cuando no hay vigente (ahí la
  -- nueva iba a ser la vigente), así que se mira acá, con el mensaje de
  -- siempre, antes de chocar con el índice de un borrador por cliente.
  if coalesce(p_borrador, false) and v_estado = 'vigente' then
    if exists (select 1 from public.rutinas where cliente_id = p_cliente and estado = 'borrador') then
      raise exception 'Este cliente ya tiene una próxima rutina en preparación: seguí con esa.'
        using errcode = '22023';
    end if;
    v_estado := 'borrador';
  end if;

  v_cliente := case when v_estado = 'plantilla' then null else p_cliente end;

  -- «Armar la próxima» (el mismo cliente) conserva todo.
  v_mismo := v_o.cliente_id is not null and v_cliente is not null and v_o.cliente_id = v_cliente;
  v_sin_notas := not v_mismo and not coalesce(p_con_notas, true);

  v_nombre := v_o.nombre;
  if v_o.cliente_id is not null and not v_mismo then
    -- El nombre ENTERO de la persona, no solo el de pila: «Rutina de Ana
    -- Ruiz» sin «Ana» dejaría «Rutina de Ruiz» en el link de Pedro.
    select nombre into v_pila from public.clientes where id = v_o.cliente_id;
    v_nombre := public.sin_nombre_de_persona(v_nombre, v_pila);
    -- Lo que quedó suelto: «Rutina ()», «Rutina ·  · piernas», «· fuerza»,
    -- y un «de» que se quedó sin la persona antes de un separador.
    v_nombre := regexp_replace(v_nombre, '\(\s*\)|\[\s*\]', ' ', 'g');
    -- Los espacios raros van escritos como códigos (E'\u00A0') y no pegados:
    -- pegados, se volvían espacios comunes al aplicar la migración.
    v_nombre := regexp_replace(v_nombre, E'[[:space:]\u00A0]+', ' ', 'g');
    v_nombre := regexp_replace(v_nombre, '\s*([·•|/,:;–—-])(\s*[·•|/,:;–—-])+\s*', ' \1 ', 'g');
    v_nombre := regexp_replace(v_nombre, '(^|\s)(de|del|da|do|das|dos|para|pra)\s+(?=[·•|/,:;–—-])', '\1', 'gi');
    v_nombre := btrim(v_nombre, ' ·•|/,:;–—-');
    -- Vacío, o colgando de una partícula («Fuerza de», «Treino da»): el
    -- nombre de respaldo. (099) Lo manda la pantalla en su idioma («Treino»
    -- en una cuenta en portugués): «Rutina» llegaba al link de un cliente
    -- brasileño. En blanco, «Rutina» como siempre; largo de más, se recorta.
    if v_nombre = '' or lower(v_nombre) ~ '(^|\s)(de|del|da|do|das|dos|para|pra)$' then
      v_nombre := btrim(left(btrim(coalesce(p_nombre_vacio, '')), 60));
      if v_nombre = '' then
        v_nombre := 'Rutina';
      end if;
    end if;
  end if;

  insert into public.rutinas (empresa_id, cliente_id, estado, nombre, notas, desde, semanas, origen_id, creado_por)
  values (p_empresa, v_cliente, v_estado, v_nombre,
          case when v_sin_notas then '' else v_o.notas end,
          case when v_estado = 'vigente' then public.hoy_empresa(p_empresa) end,
          v_o.semanas, v_o.id, auth.uid())
  returning id into v_id;

  for v_dia in select * from public.rutina_dias where rutina_id = v_o.id order by orden loop
    insert into public.rutina_dias (empresa_id, rutina_id, orden, nombre, notas)
    values (p_empresa, v_id, v_dia.orden, v_dia.nombre, case when v_sin_notas then '' else v_dia.notas end)
    returning id into v_dia_id;

    insert into public.rutina_ejercicios (empresa_id, dia_id, orden, ejercicio_id, series, reps, carga,
                                          descanso_seg, nota, junto_al_anterior)
    select p_empresa, v_dia_id, re.orden, re.ejercicio_id, re.series, re.reps, re.carga,
           re.descanso_seg, case when v_sin_notas then '' else re.nota end, re.junto_al_anterior
    from public.rutina_ejercicios re
    where re.dia_id = v_dia.id
    order by re.orden;
  end loop;

  if v_estado = 'vigente' then
    v_token := public.asegurar_enlace_rutina(p_empresa, v_cliente);
  end if;

  return jsonb_build_object('id', v_id, 'estado', v_estado, 'token', v_token);
end $fn$;

revoke all on function public.copiar_rutina(uuid, uuid, uuid, boolean, boolean, text) from public, anon;
grant execute on function public.copiar_rutina(uuid, uuid, uuid, boolean, boolean, text) to authenticated;

-- ------------------------------------------------------------
-- 2. GUARDAR UN CLIENTE: UN TELÉFONO ES DE UNA PERSONA
--
--    Misma firma que en la 052 y la 058: se reemplaza sin tocar a quien
--    ya la llama. El cuerpo es el de la 058 (la versión viva es esa, sin
--    los comentarios) con lo marcado (099).
-- ------------------------------------------------------------
create or replace function public.guardar_cliente(
  p_empresa  uuid,
  p_nombre   text,
  p_telefono text default '',
  p_notas    text default '',
  p_id       uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_id     uuid;
  v_nombre text;
  v_tel    text;
  v_norm   text;
  v_otro   public.clientes;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  v_nombre := trim(coalesce(p_nombre, ''));
  if char_length(v_nombre) = 0 then
    raise exception 'Ponele un nombre, para saber de quién estamos hablando.' using errcode = '22023';
  end if;
  v_nombre := left(v_nombre, 80);

  v_tel  := left(trim(coalesce(p_telefono, '')), 40);
  v_norm := regexp_replace(v_tel, '\D', '', 'g');

  -- Un teléfono de dos dígitos no es un teléfono: es un dedazo. Se guarda
  -- vacío antes que guardar algo que después va a hacer chocar a dos
  -- personas distintas en el mismo índice.
  if v_norm <> '' and char_length(v_norm) < 6 then
    v_tel := '';
    v_norm := '';
  end if;

  if p_id is not null then
    -- (058) El número nuevo puede ser de otra ficha. Si esa ficha se
    -- eliminó, el número quedó libre: se le saca a la vieja, que conserva
    -- su historial por id. Si está activa, se dice de quién es, en vez del
    -- «ya existe algo con ese nombre» del índice único, que encima hablaba
    -- del nombre cuando el problema era el teléfono.
    if v_norm <> '' then
      select * into v_otro
      from public.clientes c
      where c.empresa_id = p_empresa and c.telefono_norm = v_norm and c.id <> p_id;

      if v_otro.id is not null then
        if v_otro.activo then
          raise exception 'Ese teléfono ya es de «%». Si son la misma persona, eliminá la ficha que sobra.',
            v_otro.nombre using errcode = '22023';
        end if;
        update public.clientes set telefono = '', updated_at = now() where id = v_otro.id;
      end if;
    end if;

    update public.clientes
    set nombre = v_nombre,
        telefono = v_tel,
        notas = left(coalesce(p_notas, ''), 1000),
        updated_at = now()
    where id = p_id and empresa_id = p_empresa
    returning id into v_id;

    if v_id is null then
      raise exception 'Ese cliente no es de esta cuenta.' using errcode = 'P0002';
    end if;
    return v_id;
  end if;

  -- Sin id: si el teléfono ya está, es la misma persona.
  if v_norm <> '' then
    select c.id into v_id
    from public.clientes c
    where c.empresa_id = p_empresa and c.telefono_norm = v_norm;

    if v_id is not null then
      -- (099) Salvo que sea OTRA persona y la ficha tenga datos de
      -- entrenamiento. «Laura» con el número de «Ana» renombraba la ficha
      -- de Ana, y Laura heredaba sus medidas, sus lesiones, su rutina, la
      -- historia de sus cargas y su consentimiento: una mezcla de datos de
      -- salud. Se comparan los nombres normalizados —minúsculas, sin
      -- tildes, espacios colapsados; `clave_ejercicio` (098) hace justo
      -- eso con cualquier texto— y, si son distintos y la ficha tiene
      -- rutinas, medidas, ficha de entrenamiento o cargas anotadas, se
      -- frena y se dice de quién es el número. Con el mismo nombre escrito
      -- de otra manera («ANA RUIZ», «Ana  Ruiz»), o sin nada de
      -- entrenamiento (la barbería, el almacén), sigue todo igual que
      -- siempre: se renombra, se reactiva, se conservan las notas.
      select * into v_otro from public.clientes where id = v_id;
      if public.clave_ejercicio(v_otro.nombre) <> public.clave_ejercicio(v_nombre)
         and (exists (select 1 from public.rutinas where cliente_id = v_id)
              or exists (select 1 from public.mediciones where cliente_id = v_id)
              or exists (select 1 from public.fichas_entreno where cliente_id = v_id)
              or exists (select 1 from public.cargas_historial where cliente_id = v_id)) then
        if v_otro.activo then
          raise exception 'Ese teléfono ya es de «%». Si es otra persona, dejá el teléfono vacío o elegila de la lista.',
            v_otro.nombre using errcode = '22023';
        end if;
        -- Archivada, no está en ninguna lista para «elegirla», y el número
        -- quedó libre, como en la rama con id (058): se le saca a la ficha
        -- archivada —que conserva sus rutinas y sus cargas por id— y la
        -- persona nueva nace abajo con su propia ficha, sin heredar nada.
        update public.clientes set telefono = '', updated_at = now() where id = v_otro.id;
      else
        update public.clientes
        set nombre = v_nombre,
            notas = case when trim(coalesce(p_notas, '')) = '' then notas
                         else left(p_notas, 1000) end,
            activo = true,
            updated_at = now()
        where id = v_id;
        return v_id;
      end if;
    end if;
  end if;

  insert into public.clientes (empresa_id, nombre, telefono, notas, creado_por)
  values (p_empresa, v_nombre, v_tel, left(coalesce(p_notas, ''), 1000), auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

revoke all on function public.guardar_cliente(uuid, text, text, text, uuid) from public, anon;
grant execute on function public.guardar_cliente(uuid, text, text, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. ELIMINAR UN CLIENTE: ARCHIVAR SE LLEVA SUS DATOS DE SALUD
--
--    Copia exacta de la 098 (la versión viva) con lo marcado (099), en la
--    rama que archiva. Devuelve lo mismo de siempre: 'borrado' o
--    'archivado'.
-- ------------------------------------------------------------
create or replace function public.eliminar_cliente(p_cliente uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v       public.clientes;
  v_saldo numeric;
  v_debe  text;
begin
  select * into v from public.clientes where id = p_cliente;
  if v.id is null then
    raise exception 'Ese cliente ya no existe.' using errcode = 'P0002';
  end if;

  if not public.es_miembro(v.empresa_id) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;

  if not public.es_admin(v.empresa_id) then
    raise exception 'Eliminar clientes es del dueño o de un administrador.' using errcode = '42501';
  end if;

  -- El mismo candado que al cobrar (056): mientras se decide, nadie le fía
  -- ni le cobra a este cliente.
  perform 1 from public.clientes where id = p_cliente for update;

  v_saldo := public.saldo_fiado(p_cliente);
  if v_saldo > 0 then
    -- «80.000» y no «80000.00»: esto lo lee una persona.
    v_debe := case when v_saldo = trunc(v_saldo)
                   then replace(to_char(v_saldo, 'FM999,999,999,990'), ',', '.')
                   else v_saldo::text end;
    raise exception '% todavía te debe %. Cobrale o borrá esa deuda desde Fiado, y después lo eliminás.',
      v.nombre, v_debe using errcode = '22023';
  end if;

  -- Sin nada atado se borra de verdad: no hay nada que conservar.
  if not exists (select 1 from public.fiado where cliente_id = p_cliente)
     and not exists (select 1 from public.movimientos where cliente_id = p_cliente)
     and not exists (select 1 from public.turnos_reserva where cliente_id = p_cliente)
     -- (098) Sus rutinas, sus medidas y cómo subieron sus cargas son su
     -- historia: con cualquiera de las tres, se archiva.
     and not exists (select 1 from public.rutinas where cliente_id = p_cliente)
     and not exists (select 1 from public.mediciones where cliente_id = p_cliente)
     and not exists (select 1 from public.cargas_historial where cliente_id = p_cliente) then
    delete from public.clientes where id = p_cliente;
    return 'borrado';
  end if;

  -- Con historia se archiva. La lista y el buscador ya dejan afuera a los
  -- archivados (052, 053); «lo que te deben» no, así que si alguna vez
  -- vuelve a deber algo, aparece ahí igual.
  update public.clientes set activo = false, updated_at = now() where id = p_cliente;

  -- (099) Archivado, ninguna pantalla llega a su Progreso ni a su ficha,
  -- así que sus medidas, su consentimiento y «Salud y lesiones» quedaban
  -- guardados sin forma de borrarlos (Ley 7593/2025). Se van acá, en la
  -- misma transacción. Las rutinas y cómo subieron sus cargas se quedan:
  -- son el trabajo del trainer, no datos de salud, y no se ven en ningún
  -- link. Si la persona vuelve con el mismo nombre y teléfono, vuelve a dar
  -- su consentimiento. Los candados de cuenta vencida (098) son de insert
  -- y update, y `clientes` no tiene uno: esto anda siempre, como el link.
  delete from public.mediciones where cliente_id = p_cliente;
  delete from public.fichas_entreno where cliente_id = p_cliente;
  update public.clientes set notas = '' where id = p_cliente;

  -- (098) Su link se apaga y cambia de token. Apagado solo por estar
  -- archivado no alcanza: `guardar_cliente` (052) toma un teléfono repetido
  -- como la misma persona y reactiva la ficha, y con un teléfono compartido
  -- (madre e hijo, una pareja) el link que la otra persona tiene en su
  -- celular volvería a andar, a nombre de otra. Si vuelve la misma persona,
  -- el trainer prende el link y le manda el nuevo. `rutina_enlaces` no
  -- tiene el candado de cuenta vencida: esto anda siempre.
  update public.rutina_enlaces
  set activo = false, token = gen_random_uuid(), updated_at = now()
  where cliente_id = p_cliente;

  return 'archivado';
end $fn$;

revoke all on function public.eliminar_cliente(uuid) from public, anon;
grant execute on function public.eliminar_cliente(uuid) to authenticated;
