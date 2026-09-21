'use client';

import { useEffect, useRef, useState } from 'react';
import { LogoVoz } from '@/components/LogoVoz';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { RevisionFiado } from '@/components/RevisionFiado';
import { RevisionProducto } from '@/components/RevisionProducto';
import { RevisionCliente } from '@/components/RevisionCliente';
import { OpcionesTipo } from '@/components/OpcionesTipo';
import { CLAVE_TURNO_DICTADO, EVENTO_TURNO_DICTADO } from '@/lib/turno-voz';
import { dinero, decimalesDe } from '@/lib/formato';
import { hoyISO } from '@/lib/fechas';
import { useZona } from '@/lib/zona';
import type { CapturaInterpretada, DeudaInterpretada, ItemInterpretado, Origen, TipoCaptura, TipoCuenta } from '@/lib/tipos';
import { mensajeDeError } from '@/lib/errores';
import { guardarTranscripcion, subirComprobante } from '@/lib/adjuntos';
import { comprimirFoto } from '@/lib/imagen';
import { useTextos } from '@/i18n/cliente';
import { useBloquearFondo } from '@/lib/fondo';
import { CampoMonto } from '@/components/CampoMonto';

type Modo = 'cerrado' | 'menu' | 'audio' | 'texto' | 'procesando' | 'revisar';

/** Lo mínimo de una deuda para poder elegirla al imputar un pago. */
type DeudaBreve = { id: string; nombre: string; acreedor: string; saldo: number };

const DEUDA_VACIA: DeudaInterpretada = {
  clase: 'otro', acreedor: null, cuotas: null, monto_cuota: null, vence_el: null, deuda_id: null,
};

const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function mimeSoportado(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function BotonCaptura({
  empresaId, moneda, guardaComprobantes = false, tipoCuenta = 'emprendedor',
}: {
  empresaId: string;
  moneda: string;
  /** Del plan, no de la interfaz: la base rechaza el adjunto igual si no toca. */
  guardaComprobantes?: boolean;
  /**
   * En una cuenta personal no existe «venta». El servidor ya lo impone —el
   * prompt no la ofrece y el saneo la convertiría en ingreso—, pero el
   * selector de la pantalla de revisión tampoco tiene que mostrarla: ofrecer
   * a mano lo que el sistema no acepta es prometer algo que va a fallar.
   */
  tipoCuenta?: TipoCuenta;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const t = useTextos();
  const zona = useZona();

  /**
   * En Vender no aparece. Dos motivos:
   *   · ahí ya estás en el camino más rápido para cargar una venta;
   *   · la barra de cobro ocupa esa misma esquina, y el botón le tapaba el
   *     total justo cuando había que confirmarlo.
   * Para cargar por voz mientras vendés, se sale a cualquier otra pantalla.
   */
  const oculto = ruta.startsWith('/vender');
  const [modo, setModo] = useState<Modo>('cerrado');
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [borrador, setBorrador] = useState<CapturaInterpretada | null>(null);
  /**
   * A quién se le fía, cuando la venta es fiada (055).
   *
   * La IA puede entender «vendí tres yerbas fiado», pero no sabe a quién:
   * un nombre dictado no alcanza para atarlo a una ficha. Se pregunta acá,
   * sobre lo que ya se entendió, que es cuando la persona lo tiene fresco.
   */
  const [elegido, setElegido] = useState<ClienteElegido>({ id: null, nombre: '', telefono: '' });
  const [guardando, setGuardando] = useState(false);
  const [paso, setPaso] = useState('');
  const [origen, setOrigen] = useState<Origen>('texto');
  const [sinCupo, setSinCupo] = useState(false);
  /** Pidió algo que esta cuenta no tiene (un turno sin agenda). */
  const [sinLugar, setSinLugar] = useState<{ aviso: string; dicho: string } | null>(null);
  /**
   * Las deudas ya cargadas, para poder elegir a cuál se le imputa un pago.
   *
   * Se piden recién al revisar, y solo si lo que se dictó es una deuda. La
   * enorme mayoría de las capturas son ventas y gastos: pedirlas al abrir el
   * menú sería una consulta al pedo en cada uso.
   */
  const [deudas, setDeudas] = useState<DeudaBreve[]>([]);
  /**
   * Pagar una cuota también deja el bolsillo más flaco, así que por defecto
   * se anota el gasto. Quien lleva la contabilidad fina lo desmarca.
   */
  const [crearGasto, setCrearGasto] = useState(true);

  // Con la hoja adelante, el panel de atrás se queda quieto.
  useBloquearFondo(modo !== 'cerrado');

  const grabadora = useRef<MediaRecorder | null>(null);
  // El micrófono abierto, para que el logo se mueva con la voz (LogoVoz).
  const [flujoVoz, setFlujoVoz] = useState<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cronometro = useRef<ReturnType<typeof setInterval> | null>(null);
  const archivoRef = useRef<HTMLInputElement | null>(null);
  /**
   * La foto que la persona sacó, guardada hasta que exista el movimiento al
   * que colgarla. La IA la lee al instante, pero el comprobante solo se
   * puede adjuntar cuando ya hay un id: por eso viaja en un ref y no en el
   * estado (no queremos re-renderizar por tener un archivo en memoria).
   */
  const fotoRef = useRef<File | null>(null);

  useEffect(() => () => { if (cronometro.current) clearInterval(cronometro.current); }, []);

  function cerrar() {
    fotoRef.current = null;
    setDeudas([]);
    setCrearGasto(true);
    setModo('cerrado');
    setTexto('');
    setError('');
    setSinCupo(false);
    setSinLugar(null);
    setBorrador(null);
    // El cliente elegido es de ESTA captura. Si se quedara, la próxima venta
    // saldría a nombre de quien fue el último, sin que nadie lo eligiera.
    setElegido({ id: null, nombre: '', telefono: '' });
    setPaso('');
  }

  // ---------------------------------------------------------- envío a la IA
  async function analizar(cuerpo: FormData) {
    setModo('procesando');
    setError('');
    setOrigen((String(cuerpo.get('modo')) as Origen) ?? 'texto');
    try {
      const r = await fetch('/api/capturar', { method: 'POST', body: cuerpo });
      const datos = await r.json();

      // Cupo de IA agotado. No es un fallo: es el plan gratis haciendo lo
      // suyo. Se marca aparte para poder ofrecer la salida (cargar a mano o
      // pasar a Pro) en vez de mostrar un error rojo sin camino.
      if (r.status === 402) {
        setSinCupo(true);
        setError(datos?.error ?? t.plan.capturasAgotadas);
        setModo('menu');
        return;
      }

      if (!r.ok) throw new Error(datos?.error ?? t.captura.noSePudoInterpretar);

      // Pidió algo que esta cuenta no tiene —un turno sin agenda—. Antes eso
      // terminaba guardado como un gasto de cero. Se dice, con la
      // transcripción a la vista para que se entienda qué se entendió.
      if (datos?.no_disponible) {
        setSinLugar({ aviso: String(datos.aviso ?? ''), dicho: String(datos.transcripcion ?? '') });
        setModo('menu');
        return;
      }

      const interpretado = normalizar(datos as CapturaInterpretada);

      // Un turno se revisa en la agenda, en el formulario de siempre: con los
      // horarios libres a la vista, que es lo único que dice si se puede.
      // Viaja por sessionStorage y no por la URL, porque lleva el nombre y el
      // teléfono de un cliente. El aviso es por si la agenda ya estaba abierta.
      if (interpretado.tipo === 'turno' && interpretado.turno) {
        try {
          sessionStorage.setItem(CLAVE_TURNO_DICTADO, JSON.stringify(interpretado.turno));
        } catch {
          // Sin almacenamiento (una ventana privada estricta) la agenda se
          // abre igual, con el formulario para completar a mano.
        }
        cerrar();
        const dia = interpretado.turno.fecha;
        router.push(dia ? `/agenda?dia=${dia}` : '/agenda');
        window.dispatchEvent(new Event(EVENTO_TURNO_DICTADO));
        return;
      }

      setBorrador(interpretado);
      // Si la persona dijo «fiado a Juan», la IA ya sabe que es Juan. Dejar
      // el campo vacío la obligaba a escribir de nuevo algo que acababa de
      // decir, y si tocaba Guardar sin darse cuenta, la venta no salía.
      setElegido({ id: null, nombre: interpretado.contraparte ?? '', telefono: '' });
      setModo('revisar');
    } catch (e: any) {
      setError(mensajeDeError(e, t.captura.fallóInterpretar));
      setModo('menu');
    }
  }

  function normalizar(c: CapturaInterpretada): CapturaInterpretada {
    const items = (c.items ?? []).map((i) => ({
      ...i,
      cantidad: Number(i.cantidad) || 1,
      precio_unitario: Number(i.precio_unitario) || 0,
      // Solo tiene sentido para productos sueltos: si la línea es de catálogo,
      // el costo lo pone la base y acá llega en null.
      costo_unitario: i.producto_id ? null : Number(i.costo_unitario ?? 0) || 0,
    }));
    const sumaItems = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    return {
      ...c,
      items,
      fecha: c.fecha || hoyISO(zona),
      monto: Number(c.monto) || sumaItems,
      categoria: c.categoria || (c.tipo === 'venta' ? 'Ventas' : 'General'),
      metodo_pago: c.metodo_pago || 'efectivo',
      // Siempre con forma: así la pantalla no tiene que preguntar si existe
      // antes de tocar cada campo, ni el tipo cambia bajo los pies al pasar
      // de gasto a deuda con el selector.
      deuda: { ...DEUDA_VACIA, ...(c.deuda ?? {}) },
    };
  }

  /**
   * Trae las deudas cuando hacen falta.
   *
   * Si falla se queda con la lista vacía y no se avisa: puede ser sencillamente
   * que quien captura sea un vendedor, y la base no le devuelve las deudas del
   * negocio a propósito. En ese caso la pantalla ya le dice que no puede.
   */
  useEffect(() => {
    const esDeuda = borrador?.tipo === 'deuda' || borrador?.tipo === 'pago_deuda';
    if (modo !== 'revisar' || !esDeuda || deudas.length > 0) return;

    let vivo = true;
    (async () => {
      try {
        const supabase = clienteNavegador();
        const { data } = await supabase.rpc('listar_deudas', {
          p_empresa: empresaId, p_incluir_saldadas: false,
        });
        if (!vivo || !Array.isArray(data)) return;
        setDeudas(data.map((d: any) => ({
          id: String(d.id),
          nombre: String(d.nombre ?? ''),
          acreedor: String(d.acreedor ?? ''),
          saldo: Number(d.saldo ?? 0),
        })));
      } catch {
        // Sin lista: el pago se tendrá que cargar desde Deudas.
      }
    })();
    return () => { vivo = false; };
  }, [modo, borrador?.tipo, deudas.length, empresaId]);

  // ---------------------------------------------------------- audio
  async function empezarGrabacion() {
    setError('');
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const tipo = mimeSoportado();
      const rec = new MediaRecorder(flujo, tipo ? { mimeType: tipo } : undefined);
      trozos.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) trozos.current.push(e.data); };
      rec.onstop = () => {
        flujo.getTracks().forEach((t) => t.stop());
        setFlujoVoz(null);
        const blob = new Blob(trozos.current, { type: tipo || 'audio/webm' });
        if (blob.size < 1200) {
          setError(t.captura.audioCorto);
          setModo('menu');
          return;
        }
        const ext = (tipo || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';
        const fd = new FormData();
        fd.append('modo', 'audio');
        fd.append('empresa_id', empresaId);
        fd.append('archivo', blob, `nota.${ext}`);
        analizar(fd);
      };
      rec.start();
      grabadora.current = rec;
      setFlujoVoz(flujo);
      setSegundos(0);
      setModo('audio');
      cronometro.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch {
      setError(t.captura.sinMicrofonoDetalle);
      setModo('menu');
    }
  }

  function terminarGrabacion(cancelar = false) {
    if (cronometro.current) clearInterval(cronometro.current);
    const rec = grabadora.current;
    if (!rec) return;
    if (cancelar) {
      rec.onstop = null;
      rec.stream.getTracks().forEach((t) => t.stop());
      setFlujoVoz(null);
      rec.stop();
      setModo('menu');
      return;
    }
    rec.stop();
  }

  // ---------------------------------------------------------- foto
  /**
   * La foto se achica ANTES de subirla, y esto es la mitad de por qué la
   * captura por foto tardaba tanto.
   *
   * La cámara de un celular saca 3 a 6 MB. Eso viajaba entero desde datos
   * móviles hasta el servidor, ahí se convertía a base64 —que lo agranda un
   * 33% más— y recién después salía para OpenAI. Con una foto de 4 MB eran
   * varios segundos que la persona pasaba mirando «Leyendo el comprobante…»
   * sin que hubiera empezado a leerse nada.
   *
   * Achicada al lado más largo de 1600 px queda en unos 150 KB, y un ticket
   * impreso se lee igual de bien. La función ya existía y se usaba para
   * guardar el comprobante; simplemente no se estaba usando acá.
   *
   * Si comprimir falla —un formato raro, un navegador viejo— sube la
   * original. Mejor lenta que perdida.
   */
  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    if (archivo.size > 8 * 1024 * 1024) {
      setError(t.captura.fotoPesada);
      return;
    }

    // La original se guarda para el respaldo: el comprobante que queda
    // pegado al movimiento tiene su propio camino de compresión.
    fotoRef.current = archivo;

    const { archivo: liviano } = await comprimirFoto(archivo);

    const fd = new FormData();
    fd.append('modo', 'foto');
    fd.append('empresa_id', empresaId);
    fd.append('archivo', liviano);
    analizar(fd);
  }

  // ---------------------------------------------------------- texto
  function enviarTexto() {
    if (texto.trim().length < 4) {
      setError(t.captura.escribiUnPocoMas);
      return;
    }
    const fd = new FormData();
    fd.append('modo', 'texto');
    fd.append('empresa_id', empresaId);
    fd.append('texto', texto.trim());
    analizar(fd);
  }

  // ---------------------------------------------------------- guardar
  async function guardar() {
    if (!borrador) return;
    setGuardando(true);
    setError('');
    setPaso(t.comun.guardando);
    let idGuardado: string | null = null;
    try {
      const supabase = clienteNavegador();

      if (borrador.tipo === 'deuda') {
        /**
         * Contraer una deuda NO es un movimiento: no entró ni salió plata del
         * cajón por firmarla. Por eso va a su propia tabla y no toca las
         * ventas ni los gastos del día. Era justamente esto lo que fallaba:
         * «debo cinco millones de la tarjeta» se anotaba como otro ingreso y
         * el negocio parecía haber ganado plata que nunca vio.
         */
        const d = borrador.deuda ?? DEUDA_VACIA;
        const { error } = await supabase.rpc('crear_deuda', {
          p_empresa: empresaId,
          p_nombre: borrador.descripcion || t.captura.tipoDeuda,
          p_tipo: d.clase,
          p_acreedor: d.acreedor ?? '',
          p_monto: borrador.monto,
          // null: el saldo arranca igual al monto. Una deuda recién cargada
          // se debe entera.
          p_saldo: null,
          p_cuotas_totales: d.cuotas,
          p_monto_cuota: d.monto_cuota,
          p_vence_el: d.vence_el,
          p_notas: borrador.transcripcion ?? '',
        });
        if (error) throw error;
        // Sin movimiento no hay dónde colgar la foto. Lo dictado queda en las
        // notas de la deuda, que es su lugar.

      } else if (borrador.tipo === 'pago_deuda') {
        const deudaId = borrador.deuda?.deuda_id;
        if (!deudaId) throw new Error(t.captura.elegiLaDeuda);

        const { data, error } = await supabase.rpc('registrar_pago_deuda', {
          p_deuda: deudaId,
          p_monto: borrador.monto,
          p_fecha: borrador.fecha,
          p_crear_gasto: crearGasto,
          p_metodo: borrador.metodo_pago,
          p_nota: borrador.transcripcion ?? '',
        });
        if (error) throw error;
        // Si se creó el gasto, el comprobante se cuelga de ahí.
        idGuardado = (data as any)?.movimiento_id ?? null;

      } else if (borrador.tipo === 'venta') {
        // Una venta SIEMPRE pasa por la función transaccional: es la única que
        // mueve stock, congela el costo y deja los items coherentes con el total.
        // Si la IA no separó productos, mandamos una sola línea suelta.
        const items: ItemInterpretado[] = borrador.items.length > 0
          ? borrador.items
          : [{
              nombre: borrador.descripcion || t.captura.tipoVenta,
              cantidad: 1,
              precio_unitario: borrador.monto,
              costo_unitario: 0,
              producto_id: null,
            }];

        const bruto = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
        // El total que confirmó la persona manda; la diferencia es descuento.
        const descuento = Math.max(0, Math.min(bruto, bruto - borrador.monto));

        // La base rechaza una venta fiada sin cliente. Se avisa acá antes,
        // para que no llegue como un error del servidor sobre algo que la
        // persona ya dio por confirmado.
        if (borrador.metodo_pago === 'credito' && elegido.nombre.trim().length === 0) {
          throw new Error(t.venta.fiarSinNombre);
        }
        const clienteId = borrador.metodo_pago === 'credito'
          ? await asegurarCliente(empresaId, elegido)
          : null;

        const { data, error } = await supabase.rpc('registrar_venta', {
          p_empresa: empresaId,
          p_items: items.map((i) => ({
            producto_id: i.producto_id ?? null,
            nombre: i.nombre,
            cantidad: i.cantidad,
            precio_unitario: i.precio_unitario,
            // Para productos del catálogo el costo lo pone la base, no nosotros.
            ...(i.producto_id ? {} : { costo_unitario: i.costo_unitario ?? 0 }),
          })),
          p_fecha: borrador.fecha,
          p_descripcion: borrador.descripcion,
          p_metodo_pago: borrador.metodo_pago,
          p_contraparte: elegido.nombre || (borrador.contraparte ?? ''),
          p_cliente: clienteId,
          p_notas: borrador.transcripcion ?? '',
          p_origen: origen,
          p_descuento: descuento,
        });
        if (error) throw error;
        idGuardado = typeof data === 'string' ? data : null;
      } else {
        // Gastos y otros ingresos no llevan items, stock ni descuento.
        const { data, error } = await supabase.from('movimientos').insert({
          empresa_id: empresaId,
          tipo: borrador.tipo,
          fecha: borrador.fecha,
          descripcion: borrador.descripcion,
          categoria: borrador.categoria,
          subtotal: borrador.monto,
          descuento: 0,
          monto: borrador.monto,
          costo_total: 0,
          metodo_pago: borrador.metodo_pago,
          contraparte: borrador.contraparte ?? '',
          notas: borrador.transcripcion ?? '',
          origen,
        }).select('id').single();
        if (error) throw error;
        idGuardado = data?.id ?? null;
      }

      // ---- Respaldo ----
      // Va DESPUÉS de que el movimiento existe y se trata aparte a propósito:
      // el número ya está guardado y no se pierde aunque la subida falle. Si
      // el comprobante no sube, se avisa, pero no se deshace la carga.
      if (idGuardado) {
        try {
          setPaso(t.adjuntos.subiendo);
          if (borrador.transcripcion) {
            await guardarTranscripcion(idGuardado, borrador.transcripcion);
          }
          if (guardaComprobantes && fotoRef.current) {
            await subirComprobante({
              empresaId,
              movimientoId: idGuardado,
              archivo: fotoRef.current,
              texto: borrador.descripcion,
            });
          }
        } catch {
          // Se guardó lo importante. El comprobante se puede volver a
          // adjuntar desde el historial.
        }
      }

      cerrar();
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, t.captura.noSePudoGuardar));
    } finally {
      setGuardando(false);
      setPaso('');
    }
  }

  // ---------------------------------------------------------- render
  const abierto = modo !== 'cerrado';
  if (oculto && !abierto) return null;

  return (
    <>
      <input
        ref={archivoRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={elegirFoto}
      />

      <button
        type="button"
        onClick={() => setModo('menu')}
        aria-label={t.captura.botonAria}
        className="fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-full bg-verde text-sobre-verde shadow-[0_10px_30px_-6px_rgba(40,180,100,.7)] transition active:scale-95 lg:bottom-7 lg:right-7 lg:h-[60px] lg:w-[60px]"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))' }}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" {...trazo}>
          <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" />
          <path d="M18.5 11.5A6.5 6.5 0 0 1 12 18a6.5 6.5 0 0 1-6.5-6.5M12 18v3.2" />
        </svg>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-[60] flex touch-none items-center justify-center overscroll-none bg-noche/70 px-4 pb-24 pt-6 backdrop-blur-sm sm:pb-6" onClick={() => modo !== 'procesando' && modo !== 'audio' && cerrar()}>
          <div
            className={`max-h-full w-full max-w-md touch-pan-y overflow-y-auto overscroll-contain aparecer ${
              modo === 'menu'
                ? 'p-1'
                : 'rounded-3xl border border-borde bg-superficie p-5 shadow-tarjeta'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ---------------- MENÚ ---------------- */}
            {modo === 'menu' && (
              <>
                <h2 className="px-1 text-[19px] font-bold tracking-tight text-white">
                  {t.captura.registrarRapido}
                </h2>
                {/* Que el micrófono sirve para más que plata se dice acá: si no,
                    nadie prueba decirle «agregá el shampoo». En una cuenta
                    personal no hay catálogo ni clientes. */}
                <p className="mt-1 px-1 text-[14px] leading-relaxed text-white/60">
                  {tipoCuenta === 'personal'
                    ? t.captura.contaleLoQuePasoPersonal
                    : t.captura.contaleLoQuePasoNegocio}
                </p>

                {/* Pidió algo que esta cuenta no tiene. Se muestra lo que
                    entendió, porque lo primero que piensa cualquiera es «no me
                    escuchó bien» — y sí escuchó bien, lo que falta es la
                    agenda. */}
                {sinLugar && (
                  <div className="mt-4 rounded-xl bg-ambar-claro px-3.5 py-3">
                    {sinLugar.dicho && (
                      <p className="mb-2 text-[13px] italic leading-relaxed text-tinta/55">
                        «{sinLugar.dicho}»
                      </p>
                    )}
                    <p className="text-[13px] font-medium leading-relaxed text-ambar">{sinLugar.aviso}</p>
                    <button
                      type="button" onClick={() => setSinLugar(null)}
                      className="mt-2 text-[12.5px] font-bold text-ambar underline"
                    >
                      {t.captura.entendido}
                    </button>
                  </div>
                )}

                {error && (
                  <div className={`mt-4 rounded-xl px-3 py-2.5 text-[13px] font-medium ${
                    sinCupo ? 'bg-ambar-claro text-ambar' : 'bg-rojo-claro text-rojo'
                  }`}>
                    <p>{error}</p>
                    {sinCupo && (
                      <>
                        <p className="mt-1 font-normal leading-relaxed">{t.plan.capturasAgotadasDetalle}</p>
                        <Link href="/plan" className="mt-2 inline-block font-bold underline">
                          {t.plan.titulo}
                        </Link>
                      </>
                    )}
                  </div>
                )}

                <div className="mt-5 space-y-2.5">
                  <Opcion
                    titulo={t.captura.porVoz}
                    detalle={tipoCuenta === 'personal'
                      ? t.captura.ejemploVozPersonal
                      : t.captura.ejemploVozNegocio}
                    onClick={empezarGrabacion}
                    icono={<svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Z" /><path d="M18.5 11.5A6.5 6.5 0 0 1 5.5 11.5M12 18v3.2" /></svg>}
                  />
                  <Opcion
                    titulo={t.captura.porFoto} detalle={t.captura.porFotoDetalle}
                    onClick={() => archivoRef.current?.click()}
                    icono={<svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M3.5 8.5h3l1.5-2.5h8L17.5 8.5h3v10h-17z" /><circle cx="12" cy="13" r="3.2" /></svg>}
                  />
                  <Opcion
                    titulo={t.captura.porTexto} detalle={t.captura.porTextoDetalle}
                    onClick={() => { setError(''); setModo('texto'); }}
                    icono={<svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}><path d="M4 20h16M6 16.5 16.5 6a2.1 2.1 0 0 1 3 3L9 19.5l-4 1z" /></svg>}
                  />
                </div>

                <button onClick={cerrar} className="mt-4 w-full py-2 text-[13.5px] font-semibold text-white/50">{t.comun.cancelar}</button>
              </>
            )}

            {/* ---------------- GRABANDO ---------------- */}
            {modo === 'audio' && (
              <div className="py-4 text-center">
                {/* El logo de Orden que escucha: se mueve con la voz. */}
                <div className="py-3">
                  <LogoVoz flujo={flujoVoz} />
                </div>
                <p className="mt-5 text-3xl font-titulo font-extrabold tabular-nums tracking-tight">
                  {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')}
                </p>
                <p className="mt-2 text-[14px] text-tinta/60">{t.captura.hablaNormal}</p>
                <div className="mt-6 grid grid-cols-2 gap-2.5">
                  <button className="boton-suave py-3" onClick={() => terminarGrabacion(true)}>{t.comun.cancelar}</button>
                  <button className="boton-principal py-3" onClick={() => terminarGrabacion(false)}>{t.comun.listo}</button>
                </div>
              </div>
            )}

            {/* ---------------- TEXTO ---------------- */}
            {modo === 'texto' && (
              <>
                <h2 className="text-[19px] font-bold tracking-tight">{t.captura.contameQuePaso}</h2>
                <textarea
                  className="campo mt-4 min-h-[130px] resize-none"
                  autoFocus placeholder={t.captura.ejemploLargo}
                  value={texto} onChange={(e) => setTexto(e.target.value)}
                />
                {error && <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <button className="boton-suave py-3" onClick={() => setModo('menu')}>{t.captura.atras}</button>
                  <button className="boton-principal py-3" onClick={enviarTexto}>{t.captura.interpretar}</button>
                </div>
              </>
            )}

            {/* ---------------- PROCESANDO ---------------- */}
            {modo === 'procesando' && (
              <div className="py-12 text-center">
                {/* El mismo logo, sin voz: gira y respira mientras la IA piensa. */}
                <LogoVoz tamano={112} />
                <p className="mt-6 text-[15px] font-semibold">{t.captura.interpretando}</p>
                <p className="mt-1 text-[13.5px] text-tinta/50">{t.captura.tardaSegundos}</p>
              </div>
            )}

            {/* ---------------- REVISAR ---------------- */}
            {/* Lo que te deben tiene su propia revisión: pregunta quién, que es
                lo único que importa, y guarda en el libro de fiado. */}
            {modo === 'revisar' && borrador && (
              borrador.tipo === 'fiado' || borrador.tipo === 'cobro_fiado' ? (
                <RevisionFiado
                  borrador={borrador} moneda={moneda} empresaId={empresaId} tipoCuenta={tipoCuenta}
                  onCambio={setBorrador} onCancelar={() => setModo('menu')}
                  onListo={() => { cerrar(); router.refresh(); }}
                />
              ) : borrador.tipo === 'producto' ? (
                <RevisionProducto
                  borrador={borrador} moneda={moneda} empresaId={empresaId} tipoCuenta={tipoCuenta}
                  onCambio={setBorrador} onCancelar={() => setModo('menu')}
                  onListo={() => { cerrar(); router.refresh(); }}
                />
              ) : borrador.tipo === 'cliente' ? (
                <RevisionCliente
                  borrador={borrador} empresaId={empresaId} tipoCuenta={tipoCuenta}
                  onCambio={setBorrador} onCancelar={() => setModo('menu')}
                  onListo={() => { cerrar(); router.refresh(); }}
                />
              ) : (
                <Revision
                  borrador={borrador} moneda={moneda} error={error} guardando={guardando} paso={paso}
                  tipoCuenta={tipoCuenta}
                  deudas={deudas} crearGasto={crearGasto} onCrearGasto={setCrearGasto}
                  onCambio={setBorrador} onCancelar={() => setModo('menu')} onGuardar={guardar}
                  empresaId={empresaId} elegido={elegido} setElegido={setElegido}
                />
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Opcion({ titulo, detalle, icono, onClick }: { titulo: string; detalle: string; icono: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-borde bg-superficie px-4 py-3.5 text-left shadow-tarjeta transition hover:border-verde hover:bg-verde-claro/40 active:scale-[.99]"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-verde-claro text-verde-fuerte">{icono}</span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">{titulo}</span>
        <span className="block truncate text-[13px] text-tinta/55" dangerouslySetInnerHTML={{ __html: detalle }} />
      </span>
    </button>
  );
}

function Revision({
  borrador, moneda, error, guardando, paso, tipoCuenta, deudas, crearGasto, onCrearGasto,
  onCambio, onCancelar, onGuardar, empresaId, elegido, setElegido,
}: {
  borrador: CapturaInterpretada;
  moneda: string;
  empresaId: string;
  /** Solo se usa al fiar. Ver el comentario del estado en BotonCaptura. */
  elegido: ClienteElegido;
  setElegido: (c: ClienteElegido) => void;
  error: string;
  guardando: boolean;
  paso: string;
  tipoCuenta: TipoCuenta;
  deudas: DeudaBreve[];
  crearGasto: boolean;
  onCrearGasto: (v: boolean) => void;
  onCambio: (c: CapturaInterpretada) => void;
  onCancelar: () => void;
  onGuardar: () => void;
}) {
  const t = useTextos();
  const dec = decimalesDe(moneda);
  const bajaConfianza = (borrador.confianza ?? 1) < 0.65;

  const esCuentaPersonal = tipoCuenta === 'personal';
  const esDeuda = borrador.tipo === 'deuda';
  const esPago = borrador.tipo === 'pago_deuda';
  const infoDeuda = borrador.deuda ?? DEUDA_VACIA;
  const deudaElegida = deudas.find((d) => d.id === infoDeuda.deuda_id) ?? null;

  function set<K extends keyof CapturaInterpretada>(clave: K, valor: CapturaInterpretada[K]) {
    onCambio({ ...borrador, [clave]: valor });
  }

  function setDeuda(cambio: Partial<DeudaInterpretada>) {
    onCambio({ ...borrador, deuda: { ...infoDeuda, ...cambio } });
  }

  /**
   * Cambiar el tipo a mano.
   *
   * Al pasar a venta se limpia lo de la deuda y viceversa: dejar los dos
   * juegos de datos cargados a la vez es lo que después hace que se guarde
   * una cosa creyendo que es otra.
   */
  function setTipo(tipo: TipoCaptura) {
    const vaADeuda = tipo === 'deuda' || tipo === 'pago_deuda';
    onCambio({
      ...borrador,
      tipo,
      items: tipo === 'venta' ? borrador.items : [],
      deuda: vaADeuda ? infoDeuda : DEUDA_VACIA,
      categoria: tipo === 'pago_deuda' ? 'Deudas' : borrador.categoria,
    });
  }

  function setItem(indice: number, cambio: Partial<ItemInterpretado>) {
    const items = borrador.items.map((i, n) => (n === indice ? { ...i, ...cambio } : i));
    const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    onCambio({ ...borrador, items, monto: total });
  }

  function quitarItem(indice: number) {
    const items = borrador.items.filter((_, n) => n !== indice);
    const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);
    onCambio({ ...borrador, items, monto: items.length ? total : borrador.monto });
  }

  const etiquetaTipo: Record<TipoCaptura, string> = {
    venta: t.captura.tipoVenta, gasto: t.captura.tipoGasto, ingreso: t.captura.tipoOtroIngreso,
    deuda: t.captura.tipoDeuda, pago_deuda: t.captura.tipoPagoDeuda,
    // Estos se revisan en su propia pantalla (RevisionFiado, RevisionProducto,
    // RevisionCliente) o en la agenda; acá están para que el tipo cierre.
    fiado: t.captura.tipoTeDeben, cobro_fiado: t.captura.tipoTePagaron,
    turno: t.captura.tipoTurno, producto: t.captura.tipoCatalogo, cliente: t.venta.cliente,
  };

  // La deuda se pinta en ámbar y no en rojo: no es plata que se fue, es plata
  // que se debe. Son dos cosas distintas y conviene que se vean distintas.
  const colorTipo = esDeuda ? 'bg-ambar-claro text-ambar'
    : borrador.tipo === 'gasto' || esPago ? 'bg-rojo-claro text-rojo'
    : 'bg-verde-claro text-verde-fuerte';

  // Un pago sin saber a qué deuda no se puede guardar: quedaría plata saliendo
  // sin que baje ningún saldo.
  const faltaElegirDeuda = esPago && !infoDeuda.deuda_id;

  return (
    <div className="max-h-[78vh] overflow-y-auto scroll-limpio">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">{t.captura.revisar}</h2>
          <p className="mt-0.5 text-[13.5px] text-tinta/55">{t.captura.podesCorregir}</p>
        </div>
        <span className={`pastilla shrink-0 ${colorTipo}`}>
          {etiquetaTipo[borrador.tipo]}
        </span>
      </div>

      {borrador.transcripcion && (
        <p className="mb-4 rounded-xl bg-arena px-3.5 py-2.5 text-[13px] italic leading-relaxed text-tinta/60">
          &laquo;{borrador.transcripcion}&raquo;
        </p>
      )}

      {bajaConfianza && (
        <p className="mb-4 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
          {t.captura.bajaConfianza}
        </p>
      )}
      {borrador.aviso && (
        <p className="mb-4 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">{borrador.aviso}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="etiqueta">{esDeuda ? t.captura.campoNombreDeuda : t.captura.campoDescripcion}</label>
          <input className="campo" value={borrador.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
        </div>

        <div className={esDeuda ? 'col-span-2' : ''}>
          <label className="etiqueta">{t.captura.campoTipo}</label>
          <select className="campo" value={borrador.tipo} onChange={(e) => setTipo(e.target.value as TipoCaptura)}>
            {/* Si la IA se equivocó de tipo —«me debe» por «debo», un producto
                nuevo por una venta—, se corrige acá y pasa a la revisión que
                corresponde. */}
            <OpcionesTipo tipoCuenta={tipoCuenta} />
          </select>
        </div>

        {/* Una deuda no tiene fecha de carga: tiene vencimiento, y va abajo. */}
        {!esDeuda && (
          <div>
            <label className="etiqueta">{t.captura.campoFecha}</label>
            <input type="date" className="campo" value={borrador.fecha ?? ''} onChange={(e) => set('fecha', e.target.value)} />
          </div>
        )}

        {!esDeuda && !esPago && (
          <div>
            <label className="etiqueta">{t.captura.campoCategoria}</label>
            <input className="campo" value={borrador.categoria} onChange={(e) => set('categoria', e.target.value)} />
          </div>
        )}

        {!esDeuda && (
          <div>
            <label className="etiqueta">{t.captura.campoCobroPago}</label>
            <select className="campo" value={borrador.metodo_pago} onChange={(e) => set('metodo_pago', e.target.value)}>
              <option value="efectivo">{t.captura.metodoEfectivo}</option>
              <option value="transferencia">{t.captura.metodoTransferencia}</option>
              <option value="tarjeta">{t.captura.metodoTarjeta}</option>
              <option value="credito">{t.captura.metodoCredito}</option>
              <option value="otro">{t.captura.metodoOtro}</option>
            </select>
          </div>
        )}

        {/* Solo al fiar una venta. En cualquier otro caso, preguntar por el
            cliente sería una pregunta de más en una pantalla que existe
            justamente para no tener que escribir. */}
        {borrador.tipo === 'venta' && borrador.metodo_pago === 'credito' && (
          <div className="sm:col-span-2">
            <SelectorCliente
              empresaId={empresaId}
              valor={elegido}
              alElegir={setElegido}
              etiqueta={t.captura.aQuienSeLoFias}
              pedirTelefono
              obligatorio
            />
          </div>
        )}
      </div>

      {/* ---------------- DEUDA NUEVA ---------------- */}
      {esDeuda && (
        <div className="mt-5 rounded-2xl border border-ambar/25 bg-ambar-claro/40 p-4">
          <p className="titulo-seccion mb-3">{t.captura.datosDeuda}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="etiqueta">{t.captura.claseDeuda}</label>
              <select
                className="campo" value={infoDeuda.clase}
                onChange={(e) => setDeuda({ clase: e.target.value as DeudaInterpretada['clase'] })}
              >
                <option value="tarjeta">{t.captura.metodoTarjeta}</option>
                <option value="prestamo">{t.captura.clasePrestamo}</option>
                <option value="proveedor">{t.captura.claseProveedor}</option>
                <option value="otro">{t.captura.metodoOtro}</option>
              </select>
            </div>

            <div>
              <label className="etiqueta">{t.captura.aQuien}</label>
              <input
                className="campo" placeholder={t.captura.aQuienEjemplo}
                value={infoDeuda.acreedor ?? ''}
                onChange={(e) => setDeuda({ acreedor: e.target.value || null })}
              />
            </div>

            <div>
              <label className="etiqueta">{t.captura.cuotas}</label>
              <input
                type="number" inputMode="numeric" min={0} step={1}
                className="campo" placeholder="—"
                value={infoDeuda.cuotas ?? ''}
                onChange={(e) => setDeuda({ cuotas: Number(e.target.value) || null })}
              />
            </div>

            <div>
              <label className="etiqueta">{t.captura.montoPorCuota}</label>
              <CampoMonto
                decimales={dec}
                className="campo" placeholder="—"
                valor={infoDeuda.monto_cuota ?? 0}
                alCambiar={(n) => setDeuda({ monto_cuota: n > 0 ? n : null })}
              />
            </div>

            <div className="col-span-2">
              <label className="etiqueta">{t.captura.proximoVencimiento}</label>
              <input
                type="date" className="campo"
                value={infoDeuda.vence_el ?? ''}
                onChange={(e) => setDeuda({ vence_el: e.target.value || null })}
              />
              <p className="mt-1.5 text-[12.5px] text-tinta/50">
                {t.captura.sinVencimiento}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- PAGO DE UNA DEUDA ---------------- */}
      {esPago && (
        <div className="mt-5 rounded-2xl border border-borde bg-arena p-4">
          <label className="etiqueta">{t.captura.cualDeuda}</label>
          {deudas.length === 0 ? (
            <p className="mt-1 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
              {t.captura.sinDeudasCargadas}
            </p>
          ) : (
            <select
              className="campo" value={infoDeuda.deuda_id ?? ''}
              onChange={(e) => setDeuda({ deuda_id: e.target.value || null })}
            >
              <option value="">{t.captura.elegiUna}</option>
              {deudas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}{d.acreedor ? ' · ' + d.acreedor : ''} — {t.captura.faltaPagar(dinero(d.saldo, moneda))}
                </option>
              ))}
            </select>
          )}

          {deudaElegida && borrador.monto > deudaElegida.saldo && (
            <p className="mt-2.5 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
              {t.captura.pagaDeMas(dinero(deudaElegida.saldo, moneda))}
            </p>
          )}

          <label className="mt-3 flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox" className="mt-0.5 h-4 w-4 accent-verde"
              checked={crearGasto} onChange={(e) => onCrearGasto(e.target.checked)}
            />
            <span className="text-[13.5px] leading-snug text-tinta/70">
              {t.captura.anotarComoGasto}
              <span className="block text-[12.5px] text-tinta/45">
                {t.captura.anotarComoGastoDetalle}
              </span>
            </span>
          </label>
        </div>
      )}

      {borrador.items.length > 0 && (
        <div className="mt-5">
          <p className="titulo-seccion mb-2">{t.captura.productos}</p>
          <div className="space-y-2">
            {borrador.items.map((it, n) => (
              <div key={n} className="rounded-xl border border-borde p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="campo flex-1 py-2 text-[14px]" value={it.nombre}
                    onChange={(e) => setItem(n, { nombre: e.target.value })}
                  />
                  <button
                    type="button" onClick={() => quitarItem(n)}
                    aria-label={t.captura.quitarProducto}
                    className="icono-toque shrink-0 text-tinta/35 hover:bg-rojo-claro hover:text-rojo"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-tinta/50">{t.captura.cantidad}</span>
                    <input type="number" inputMode="numeric" min={0} step="any" className="campo py-2 text-[14px]" value={it.cantidad}
                      onChange={(e) => setItem(n, { cantidad: Number(e.target.value) || 0 })} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11.5px] font-semibold text-tinta/50">{t.captura.precioCadaUno}</span>
                    <CampoMonto decimales={dec} className="campo py-2 text-[14px]" valor={it.precio_unitario}
                      alCambiar={(v) => setItem(n, { precio_unitario: v })} />
                  </label>
                </div>
                {it.producto_id && (
                  <p className="mt-2 text-[11.5px] font-semibold text-verde-fuerte">{t.captura.vinculadoAlCatalogo}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl bg-arena p-4">
        <label className="etiqueta">
          {esDeuda ? t.captura.cuantoDebes : esPago ? t.captura.cuantoPagaste : t.captura.total}
        </label>
        <CampoMonto
          decimales={dec}
          className="campo text-[22px] font-titulo font-extrabold"
          valor={borrador.monto}
          alCambiar={(n) => onCambio({ ...borrador, monto: n })}
        />
        <p className="mt-1.5 text-[13px] text-tinta/50">{dinero(borrador.monto, moneda)}</p>
      </div>

      {error && <p className="mt-4 rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>}

      <div className="mt-5 grid grid-cols-2 gap-2.5 pb-1">
        <button className="boton-suave py-3" onClick={onCancelar} disabled={guardando}>{t.captura.atras}</button>
        <button className="boton-principal py-3" onClick={onGuardar} disabled={guardando || borrador.monto <= 0 || faltaElegirDeuda}>
          {guardando ? paso || t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </div>
  );
}
