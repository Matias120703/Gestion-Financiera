-- ============================================================
-- 114 · LOS LINKS DE VIDEO DE UNA PLANILLA, A LA BIBLIOTECA
-- ============================================================
--
-- QUÉ PIDIÓ MATÍAS (30/09/2026)
--
-- Muchos trainers tienen su rutina en Excel o Google Sheets. Ahora la suben
-- en el editor («Subir planilla») y Orden la acomoda sola en días y
-- ejercicios, POR REGLAS y sin IA, con la misma revisión de «Pegar texto»
-- (src/lib/rutina-planilla.ts). Nada se guarda hasta tocar «Guardar».
--
-- Muchas planillas traen una columna «Video» con el link de YouTube de cada
-- ejercicio. Ese link nunca va a la nota (la lee el cliente). Va a la
-- biblioteca, al `video_url` del ejercicio, DESPUÉS de guardar la rutina
-- (así el ejercicio nuevo ya existe) y SOLO si ese ejercicio no tenía ni un
-- link ni un video propio (113): un link importado nunca reemplaza nada.
--
-- QUÉ HACE
--
--   completar_videos_de_ejercicios(p_empresa, p_lista): recibe
--   [{ nombre, url }] y completa `video_url` de los ejercicios de esa cuenta
--   con esa clave (`clave_ejercicio`, la misma de la biblioteca), que no
--   tienen link ni video propio. Devuelve cuántos completó.
--
--   · Un link que no es https://, o de más de 300 letras (el check de la
--     098), se salta en silencio: no es un error del trainer.
--   · Más de 300 elementos, o algo que no es una lista: «Esa lista de videos
--     no es válida.» (un día tiene hasta 30 ejercicios y una rutina 10 días).
--   · Una cuenta vencida no completa nada: la frena el candado de
--     `ejercicios` (cuenta_activa_ejercicios, UPDATE), como cualquier cambio
--     en la biblioteca.
--
-- QUÉ NO HACE
--
--   · No crea ejercicios (los crea guardar_rutina) ni toca otra empresa.
--   · No guarda la planilla: se lee y se descarta (la ruta
--     /api/rutinas/importar no escribe nada).
--
-- Idempotente: se puede aplicar dos veces. No toca datos.
-- ============================================================

create or replace function public.completar_videos_de_ejercicios(p_empresa uuid, p_lista jsonb)
returns integer language plpgsql security definer set search_path = public as $fn$
declare
  v_n     integer := 0;
  v_item  jsonb;
  v_url   text;
  v_filas integer;
begin
  if not public.es_miembro(p_empresa) then
    raise exception 'No pertenecés a esta empresa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_lista) is distinct from 'array' or jsonb_array_length(p_lista) > 300 then
    raise exception 'Esa lista de videos no es válida.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_lista) loop
    v_url := nullif(btrim(coalesce(v_item->>'url', '')), '');
    continue when v_url is null or v_url !~ '^https://\S+$' or char_length(v_url) > 300;
    update public.ejercicios
    set video_url = v_url
    where empresa_id = p_empresa
      and clave = public.clave_ejercicio(coalesce(v_item->>'nombre', ''))
      and video_url is null
      and video_id is null;
    get diagnostics v_filas = row_count;
    v_n := v_n + v_filas;
  end loop;
  return v_n;
end $fn$;

revoke all on function public.completar_videos_de_ejercicios(uuid, jsonb) from public, anon;
grant execute on function public.completar_videos_de_ejercicios(uuid, jsonb) to authenticated;
