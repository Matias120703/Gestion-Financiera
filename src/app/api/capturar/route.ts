import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { clienteServidor } from '@/lib/supabase/servidor';
import { hoyISO } from '@/lib/fechas';
import type { CapturaInterpretada, Producto } from '@/lib/tipos';
import { ESQUEMA, instrucciones } from '@/lib/captura';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELO_TEXTO = process.env.MODELO_IA || 'gpt-4o-mini';
const MODELO_AUDIO = process.env.MODELO_AUDIO || 'whisper-1';
const LIMITE_ARCHIVO = 9 * 1024 * 1024;

function respuestaVacia(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

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
    .select('id, moneda')
    .eq('id', empresaId)
    .maybeSingle();
  if (!empresa) return respuestaVacia('No tenés acceso a esta empresa.', 403);

  if (!process.env.OPENAI_API_KEY) {
    return respuestaVacia(
      'Falta configurar la clave de OpenAI. Agregá OPENAI_API_KEY en las variables de entorno y volvé a intentar.',
      503,
    );
  }

  // ---------- 1 bis. Cupo de capturas ----------
  // Antes de hablar con OpenAI, no después. El costo lo pagamos nosotros por
  // pedido, así que el tope tiene que frenar ANTES de gastar. Y lo decide la
  // base, no esta ruta: un cliente manipulado no puede saltárselo.
  const { data: cupo, error: errorCupo } = await supabase.rpc('consumir_credito_ia', {
    p_empresa: empresaId,
  });

  if (errorCupo) {
    console.error('[capturar] cupo', errorCupo.message);
    return respuestaVacia('No pudimos verificar tu plan. Probá de nuevo en un momento.', 503);
  }

  if (cupo && cupo.permitido === false) {
    return NextResponse.json(
      {
        error: 'Se te acabaron las capturas con IA de este mes. Podés seguir cargando a mano.',
        motivo: 'sin_cupo',
        usados: cupo.usados,
        tope: cupo.tope,
        plan: cupo.plan,
      },
      { status: 402 },
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // ---------- 2. Catálogo para que la IA pueda vincular productos ----------
  // Por la puerta oficial: si quien captura es un vendedor, los costos
  // llegan en null y nunca entran al prompt. La base decide, no esta ruta.
  const { data: productos, error: errorCatalogo } = await supabase.rpc('listar_productos', {
    p_empresa: empresaId,
    p_incluir_pausados: false,
  });

  if (errorCatalogo) {
    console.error('[capturar] catálogo', errorCatalogo.message);
    return respuestaVacia('No pudimos leer tu catálogo. Probá de nuevo en un momento.', 503);
  }

  const catalogo = (Array.isArray(productos) ? productos : []) as Producto[];

  /**
   * Las deudas ya cargadas, para poder reconocer «pagué la cuota de la
   * tarjeta» y saber CUÁL tarjeta.
   *
   * Si falla no se corta la captura: solo se pierde la posibilidad de
   * enganchar un pago con su deuda, y el modelo lo va a decir en el aviso.
   * Un vendedor no puede leerlas —la función exige administración— así que
   * para él llega vacío y la captura sigue funcionando igual.
   */
  const { data: deudasCrudas } = await supabase.rpc('listar_deudas', {
    p_empresa: empresaId,
    p_incluir_saldadas: false,
  });

  const deudas = (Array.isArray(deudasCrudas) ? deudasCrudas : []).map((d: any) => ({
    id: String(d.id),
    nombre: String(d.nombre ?? ''),
    acreedor: String(d.acreedor ?? ''),
    saldo: Number(d.saldo ?? 0),
  }));

  const hoy = hoyISO();
  const sistema = instrucciones(hoy, empresa.moneda, catalogo, deudas);

  try {
    let textoUsuario = '';
    let transcripcion: string | null = null;
    let contenidoImagen: string | null = null;

    // ---------- 3. Obtener el texto según el modo ----------
    if (modo === 'texto') {
      textoUsuario = String(form.get('texto') ?? '').trim();
      if (textoUsuario.length < 3) return respuestaVacia('Escribí un poco más.');
      if (textoUsuario.length > 2000) textoUsuario = textoUsuario.slice(0, 2000);
    } else if (modo === 'audio') {
      const archivo = form.get('archivo');
      if (!(archivo instanceof File)) return respuestaVacia('No llegó el audio.');
      if (archivo.size > LIMITE_ARCHIVO) return respuestaVacia('El audio es demasiado largo.');

      const t = await openai.audio.transcriptions.create({
        file: archivo,
        model: MODELO_AUDIO,
        language: 'es',
        prompt: 'Nota de voz de un comerciante paraguayo registrando ventas y gastos. Puede decir montos como "150 mil", "dos millones", "150 lucas".',
      });
      transcripcion = (t.text ?? '').trim();
      if (!transcripcion) return respuestaVacia('No se entendió el audio. Probá de nuevo hablando más cerca.');
      textoUsuario = transcripcion;
    } else if (modo === 'foto') {
      const archivo = form.get('archivo');
      if (!(archivo instanceof File)) return respuestaVacia('No llegó la foto.');
      if (archivo.size > LIMITE_ARCHIVO) return respuestaVacia('La foto es demasiado pesada.');
      const buffer = Buffer.from(await archivo.arrayBuffer());
      contenidoImagen = `data:${archivo.type || 'image/jpeg'};base64,${buffer.toString('base64')}`;
      textoUsuario = 'Leé este comprobante y registrá el movimiento que representa.';
    } else {
      return respuestaVacia('Modo de captura no reconocido.');
    }

    // ---------- 4. Interpretar ----------
    const mensajeUsuario: any = contenidoImagen
      ? [
          { type: 'text', text: textoUsuario },
          { type: 'image_url', image_url: { url: contenidoImagen, detail: 'auto' } },
        ]
      : textoUsuario;

    const completado = await openai.chat.completions.create({
      model: MODELO_TEXTO,
      temperature: 0.1,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: mensajeUsuario },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'movimiento', strict: true, schema: ESQUEMA as any },
      },
    });

    const crudo = completado.choices[0]?.message?.content;
    if (!crudo) return respuestaVacia('La IA no devolvió nada. Probá otra vez.', 502);

    const datos = JSON.parse(crudo) as CapturaInterpretada;

    // ---------- 5. Saneamiento del lado del servidor ----------
    const idsValidos = new Set(catalogo.map((p) => p.id));
    const porId = new Map(catalogo.map((p) => [p.id, p]));

    const items = (Array.isArray(datos.items) ? datos.items : [])
      .map((i) => {
        const pid = i.producto_id && idsValidos.has(i.producto_id) ? i.producto_id : null;
        const prod = pid ? porId.get(pid) : undefined;
        const cantidad = Math.max(0, Number(i.cantidad) || 0);
        const precio = Math.max(0, Number(i.precio_unitario) || Number(prod?.precio) || 0);
        // Para productos del catálogo el costo lo decide la base al registrar
        // la venta. Acá solo viaja el de un producto suelto.
        const costo = pid ? 0 : Math.max(0, Number(i.costo_unitario ?? 0) || 0);
        return {
          nombre: String(i.nombre ?? prod?.nombre ?? 'Producto').slice(0, 120),
          cantidad,
          precio_unitario: precio,
          costo_unitario: costo,
          producto_id: pid,
        };
      })
      .filter((i) => i.cantidad > 0);

    const sumaItems = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    const monto = Math.max(0, Number(datos.monto) || sumaItems);

    const fechaValida = typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? datos.fecha : hoy;

    const TIPOS = ['venta', 'gasto', 'ingreso', 'deuda', 'pago_deuda'];
    const tipo = TIPOS.includes(datos.tipo) ? datos.tipo : 'gasto';

    // Los datos de la deuda se limpian acá y no se confía en lo que llegó:
    // el `deuda_id` tiene que ser uno REAL de esta empresa, o no vale. Sin
    // esta comprobación, un id inventado por el modelo intentaría pagar una
    // deuda que no existe — o peor, la de otro.
    const idsDeuda = new Set(deudas.map((d) => d.id));
    const d = (datos as any).deuda ?? {};
    const CLASES = ['tarjeta', 'prestamo', 'proveedor', 'otro'];

    const infoDeuda = tipo === 'deuda' || tipo === 'pago_deuda'
      ? {
          clase: CLASES.includes(d.clase) ? d.clase : 'otro',
          acreedor: d.acreedor ? String(d.acreedor).slice(0, 80) : null,
          cuotas: Number(d.cuotas) > 0 ? Math.round(Number(d.cuotas)) : null,
          monto_cuota: Number(d.monto_cuota) > 0 ? Number(d.monto_cuota) : null,
          vence_el: typeof d.vence_el === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.vence_el)
            ? d.vence_el : null,
          deuda_id: typeof d.deuda_id === 'string' && idsDeuda.has(d.deuda_id) ? d.deuda_id : null,
        }
      : null;

    const limpio: CapturaInterpretada = {
      tipo,
      fecha: fechaValida,
      descripcion: String(datos.descripcion ?? '').slice(0, 200) || 'Movimiento',
      categoria: String(datos.categoria ?? 'General').slice(0, 60) || 'General',
      monto,
      metodo_pago: String(datos.metodo_pago ?? 'efectivo'),
      contraparte: datos.contraparte ? String(datos.contraparte).slice(0, 80) : null,
      items: tipo === 'venta' ? items : [],
      deuda: infoDeuda,
      confianza: Math.min(1, Math.max(0, Number(datos.confianza) || 0.5)),
      aviso: datos.aviso ? String(datos.aviso).slice(0, 200) : null,
      transcripcion,
    };

    // Un pago sin saber a qué deuda no se puede guardar solo: la pantalla
    // tiene que pedir que la elija a mano.
    if (tipo === 'pago_deuda' && !infoDeuda?.deuda_id) {
      limpio.aviso = deudas.length === 0
        ? 'Todavía no tenés deudas cargadas. Cargá la deuda primero.'
        : 'No supe a cuál de tus deudas corresponde. Elegila vos.';
      limpio.confianza = Math.min(limpio.confianza, 0.4);
    }

    if (limpio.monto <= 0) {
      limpio.aviso = 'No pude sacar el monto del mensaje. Escribilo vos.';
      limpio.confianza = Math.min(limpio.confianza, 0.4);
    }

    return NextResponse.json(limpio);
  } catch (e: any) {
    const detalle: string = e?.message ?? '';
    if (/api key|401|invalid_api_key/i.test(detalle)) {
      return respuestaVacia('La clave de OpenAI no es válida. Revisá OPENAI_API_KEY.', 502);
    }
    if (/quota|insufficient_quota|429/i.test(detalle)) {
      return respuestaVacia('La cuenta de OpenAI se quedó sin crédito o llegó al límite.', 502);
    }
    console.error('[capturar]', detalle);
    return respuestaVacia('No se pudo interpretar. Probá de nuevo o cargalo a mano.', 502);
  }
}
