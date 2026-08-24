import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { clienteServidor } from '@/lib/supabase/servidor';
import { hoyISO } from '@/lib/fechas';
import type { CapturaInterpretada, Producto } from '@/lib/tipos';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODELO_TEXTO = process.env.MODELO_IA || 'gpt-4o-mini';
const MODELO_AUDIO = process.env.MODELO_AUDIO || 'whisper-1';
const LIMITE_ARCHIVO = 9 * 1024 * 1024;

/** Esquema estricto: obliga al modelo a devolver exactamente esta forma. */
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'fecha', 'descripcion', 'categoria', 'monto', 'metodo_pago', 'contraparte', 'items', 'confianza', 'aviso'],
  properties: {
    tipo: { type: 'string', enum: ['venta', 'gasto', 'ingreso'] },
    fecha: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    descripcion: { type: 'string' },
    categoria: { type: 'string' },
    monto: { type: 'number' },
    metodo_pago: { type: 'string', enum: ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'] },
    contraparte: { type: ['string', 'null'] },
    confianza: { type: 'number' },
    aviso: { type: ['string', 'null'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'cantidad', 'precio_unitario', 'costo_unitario', 'producto_id'],
        properties: {
          nombre: { type: 'string' },
          cantidad: { type: 'number' },
          precio_unitario: { type: 'number' },
          costo_unitario: { type: ['number', 'null'] },
          producto_id: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

function instrucciones(hoy: string, moneda: string, catalogo: Producto[]) {
  // El costo NO va en el prompt: la base lo asigna sola al registrar la venta.
  // Mandarlo sería filtrarlo sin necesidad.
  const lista = catalogo.length
    ? catalogo.slice(0, 120).map((p) => `- ${p.nombre} | id=${p.id} | precio=${p.precio}`).join('\n')
    : '(el catálogo está vacío)';

  return `Sos el asistente contable de un negocio pequeño en Paraguay. Convertís lenguaje cotidiano en un movimiento financiero estructurado.

FECHA DE HOY: ${hoy}
MONEDA DEL NEGOCIO: ${moneda}

CATÁLOGO DE PRODUCTOS DEL NEGOCIO:
${lista}

REGLAS:

1. TIPO
   - "venta": entró plata por vender un producto o servicio.
   - "gasto": salió plata (compra de mercadería, combustible, comida, delivery, alquiler, publicidad).
   - "ingreso": entró plata que NO es venta de producto (préstamo recibido, aporte de capital, devolución).
   Si dice "compré" mercadería para revender, es un GASTO, no una venta.

2. MONTOS EN GUARANÍES — esto es lo más importante, prestá mucha atención:
   - "150 mil", "150 lucas", "150k"  → 150000
   - "2 millones", "2 palos"          → 2000000
   - "1 millón y medio"               → 1500000
   - "25 mil quinientos"              → 25500
   - "50" a secas, hablando de guaraníes en una venta, casi seguro significa 50000. Si dudás, interpretá el valor razonable y bajá la confianza.
   - Nunca devuelvas separadores de miles ni símbolos: solo el número.
   ${moneda !== 'PYG' ? `- OJO: la moneda es ${moneda}, así que los montos chicos SÍ pueden ser literales.` : ''}

3. PRECIO UNITARIO vs TOTAL
   - "3 perfumes a 150 mil cada uno" → cantidad 3, precio_unitario 150000, monto 450000.
   - "3 perfumes por 450 mil"        → cantidad 3, precio_unitario 150000, monto 450000.
   - "monto" siempre es el TOTAL de la operación.

4. PRODUCTOS DEL CATÁLOGO
   - Si lo que menciona se parece a un producto del catálogo (aunque esté mal escrito o abreviado), poné su "producto_id" exacto y dejá costo_unitario en null: el costo lo pone la base de datos.
   - Si menciona un producto que NO está en el catálogo, dejá producto_id en null y costo_unitario en 0.
   - Si no dice el precio pero el producto está en el catálogo, usá el precio del catálogo.
   - Para gastos e ingresos, "items" va vacío: [].

5. FECHA
   - Sin referencia temporal → hoy (${hoy}).
   - "ayer", "anteayer", "el lunes" → calculá la fecha real en formato YYYY-MM-DD.

6. CATEGORÍA
   - Ventas → "Ventas".
   - Gastos → elegí una corta y clara: "Mercadería", "Transporte", "Comida", "Publicidad", "Servicios", "Alquiler", "Sueldos", "Impuestos", "Otros".

7. CONFIANZA (0 a 1)
   - 0.9+ si el monto y el concepto están explícitos y claros.
   - 0.5-0.7 si tuviste que asumir el monto, la escala o el producto.
   - Menos de 0.5 si el mensaje es confuso. En ese caso explicá la duda en "aviso" con una frase corta y en español rioplatense.
   - "aviso" es null cuando todo está claro.

8. DESCRIPCIÓN
   - Corta, concreta, en español. Ej: "Venta 3 perfumes Lattafa", "Combustible moto".
   - Nunca inventes datos que no estén en el mensaje.`;
}

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
  const hoy = hoyISO();
  const sistema = instrucciones(hoy, empresa.moneda, catalogo);

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

    const limpio: CapturaInterpretada = {
      tipo: ['venta', 'gasto', 'ingreso'].includes(datos.tipo) ? datos.tipo : 'gasto',
      fecha: fechaValida,
      descripcion: String(datos.descripcion ?? '').slice(0, 200) || 'Movimiento',
      categoria: String(datos.categoria ?? 'General').slice(0, 60) || 'General',
      monto,
      metodo_pago: String(datos.metodo_pago ?? 'efectivo'),
      contraparte: datos.contraparte ? String(datos.contraparte).slice(0, 80) : null,
      items: datos.tipo === 'venta' ? items : [],
      confianza: Math.min(1, Math.max(0, Number(datos.confianza) || 0.5)),
      aviso: datos.aviso ? String(datos.aviso).slice(0, 200) : null,
      transcripcion,
    };

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
