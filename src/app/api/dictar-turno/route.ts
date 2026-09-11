import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { clienteServidor } from '@/lib/supabase/servidor';
import { hoyISO } from '@/lib/fechas';
import { transcribir } from '@/lib/transcribir';
import { traerProductos } from '@/lib/datos';
import { traerProfesionales, soloServicios } from '@/lib/reparto';
import { traerServiciosAgenda } from '@/lib/agenda';
import {
  ESQUEMA_TURNO, instruccionesTurno, sanearTurno, mismoNombre,
  type ServicioDictable, type ProfesionalDictable, type TurnoRespuesta,
} from '@/lib/turno-voz';
import type { Producto } from '@/lib/tipos';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELO_TEXTO = process.env.MODELO_IA || 'gpt-4o-mini';
const LIMITE_ARCHIVO = 9 * 1024 * 1024;

/** Qué va a oír: con esto «a las tres» sale como una hora y no como un monto. */
const PISTA_AUDIO =
  'Nota de voz de alguien en Paraguay anotando un turno: el nombre del cliente, '
  + 'el día, la hora, el servicio, y a veces con quién y un teléfono.';

function respuestaVacia(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * DICTAR UN TURNO
 *
 * Devuelve lo entendido para completar el formulario de «Anotar un turno».
 * NO reserva nada: quien reserva es el formulario, con los horarios libres
 * de la base. Así lo dictado pasa por las mismas reglas que lo cargado a
 * mano, y un turno mal entendido se corrige antes de existir.
 */
export async function POST(request: Request) {
  // ---------- 1. Sesión y permisos ----------
  const supabase = clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return respuestaVacia('Necesitás iniciar sesión.', 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respuestaVacia('No se pudo leer el envío.');
  }

  const modo = String(form.get('modo') ?? '');
  const empresaId = String(form.get('empresa_id') ?? '');
  if (!empresaId) return respuestaVacia('Falta la empresa.');

  // RLS se encarga: si no es miembro, no devuelve nada.
  const { data: empresa } = await supabase
    .from('empresas')
    .select('id, zona_horaria')
    .eq('id', empresaId)
    .maybeSingle();
  if (!empresa) return respuestaVacia('No tenés acceso a esta empresa.', 403);

  if (!process.env.OPENAI_API_KEY) {
    return respuestaVacia(
      'Falta configurar la clave de OpenAI. Agregá OPENAI_API_KEY en las variables de entorno y volvé a intentar.',
      503,
    );
  }

  // ---------- 2. Lo que el modelo necesita para elegir ----------
  // Todo junto: nada depende de nada. El cupo es el mismo de la captura, y
  // la decisión se toma antes de gastar, como allá.
  let servicios: ServicioDictable[] = [];
  let profesionales: ProfesionalDictable[] = [];
  let cupo: any = null;
  try {
    const [respCupo, equipo, agenda, productos] = await Promise.all([
      supabase.rpc('consumir_credito_ia', { p_empresa: empresaId }),
      traerProfesionales(empresaId),
      traerServiciosAgenda(empresaId),
      traerProductos(empresaId),
    ]);
    if (respCupo.error) throw respCupo.error;
    cupo = respCupo.data;

    // Los mismos que ofrece el formulario: los servicios marcados para
    // reservarse. Uno que no se agenda no tiene horarios que ofrecer.
    const reservables = new Map(
      agenda.filter((s) => s.reservable).map((s) => [s.producto_id, Number(s.duracion_min)]));
    servicios = soloServicios(productos as Producto[])
      .filter((p) => reservables.has(p.id))
      .map((p) => ({ id: p.id, nombre: p.nombre, duracion_min: reservables.get(p.id) ?? 0 }));
    profesionales = equipo.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombre }));
  } catch (e: any) {
    console.error('[dictar-turno] contexto', e?.message);
    return respuestaVacia('No pudimos leer tu agenda. Probá de nuevo en un momento.', 503);
  }

  if (cupo && cupo.permitido === false) {
    return NextResponse.json(
      {
        error: 'Se te acabaron las capturas con IA de este mes. Podés seguir anotando a mano.',
        motivo: 'sin_cupo',
      },
      { status: 402 },
    );
  }

  if (servicios.length === 0 || profesionales.length === 0) {
    return respuestaVacia(
      'Para dictar un turno hace falta alguien en el equipo y al menos un servicio que se reserve.');
  }

  const hoy = hoyISO(empresa.zona_horaria);
  const ctx = { hoy, servicios, profesionales };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // ---------- 3. El texto ----------
    let texto = '';
    let transcripcion: string | null = null;

    if (modo === 'texto') {
      texto = String(form.get('texto') ?? '').trim().slice(0, 500);
      if (texto.length < 3) return respuestaVacia('Decí un poco más.');
    } else if (modo === 'audio') {
      const archivo = form.get('archivo');
      if (!(archivo instanceof File)) return respuestaVacia('No llegó el audio.');
      if (archivo.size > LIMITE_ARCHIVO) return respuestaVacia('El audio es demasiado largo.');
      transcripcion = await transcribir(openai, archivo, PISTA_AUDIO);
      if (!transcripcion) return respuestaVacia('No se entendió el audio. Probá de nuevo hablando más cerca.');
      texto = transcripcion;
    } else {
      return respuestaVacia('Modo no reconocido.');
    }

    // ---------- 4. Entender ----------
    const completado = await openai.chat.completions.create({
      model: MODELO_TEXTO,
      temperature: 0.1,
      messages: [
        { role: 'system', content: instruccionesTurno(ctx) },
        { role: 'user', content: texto },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'turno', strict: true, schema: ESQUEMA_TURNO as any },
      },
    });

    const crudo = completado.choices[0]?.message?.content;
    if (!crudo) return respuestaVacia('La IA no devolvió nada. Probá otra vez.', 502);

    const turno = sanearTurno(JSON.parse(crudo), ctx);

    // ---------- 5. ¿Ya es cliente? ----------
    // Solo si no hay ninguna duda: el mismo teléfono, o el mismo nombre y
    // uno solo con ese nombre. Con dos «Juan» no se elige ninguno: la
    // persona lo ve en el formulario y elige.
    let cliente: TurnoRespuesta['cliente'] = null;
    const buscar = turno.cliente_telefono ?? turno.cliente_nombre;
    if (buscar) {
      const { data } = await supabase.rpc('buscar_clientes', {
        p_empresa: empresaId, p_texto: buscar, p_limite: 8,
      });
      const lista = (Array.isArray(data) ? data : []) as { id: string; nombre: string; telefono: string }[];
      const coinciden = turno.cliente_telefono
        ? lista.filter((c) => c.telefono.replace(/\D/g, '') === turno.cliente_telefono)
        : lista.filter((c) => mismoNombre(c.nombre, turno.cliente_nombre ?? ''));
      if (coinciden.length === 1) cliente = coinciden[0];
    }

    const respuesta: TurnoRespuesta = { ...turno, cliente, transcripcion };
    return NextResponse.json(respuesta);
  } catch (e: any) {
    const detalle: string = e?.message ?? '';
    if (/api key|401|invalid_api_key/i.test(detalle)) {
      return respuestaVacia('La clave de OpenAI no es válida. Revisá OPENAI_API_KEY.', 502);
    }
    if (/quota|insufficient_quota|429/i.test(detalle)) {
      return respuestaVacia('La cuenta de OpenAI se quedó sin crédito o llegó al límite.', 502);
    }
    console.error('[dictar-turno]', detalle);
    return respuestaVacia('No se pudo entender el turno. Probá de nuevo o anotalo a mano.', 502);
  }
}
