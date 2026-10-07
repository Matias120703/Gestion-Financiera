'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import type { Textos } from '@/i18n/diccionarios';
import { decimalesDe, dinero, dineroQueEntra, fechaLegible } from '@/lib/formato';
import { diffDias, hoyISO, sumarDias } from '@/lib/fechas';
import { mensajeDeError } from '@/lib/errores';
import { enlaceWhatsApp } from '@/lib/telefono';
import {
  agruparDeudores, ajustarPlan, armarPlan, fechaCorta, leerDetalleFiado, lineasParaFechar, opcionesDeCobro, planValido,
} from '@/lib/cuotas';
import { Indicador, Vacio } from '@/components/Piezas';
import { Confirmar, Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { SelectorCliente, asegurarCliente, type ClienteElegido } from '@/components/SelectorCliente';
import { CampoMonto } from '@/components/CampoMonto';
import { ElegirCuentaOpcional } from '@/components/FormaDeCobro';
import { CuandoTePaga } from '@/components/CuandoTePaga';
import { OpcionesDeQue } from '@/components/OpcionesDeQue';
import type {
  CuentaParaElegir, CuotaFiado, DetalleFiado, DeudaConCuotas, DeudorFiado, LineaFiado, Plan, ResumenFiado,
} from '@/lib/tipos';

/** Cómo se cobra un fiado. Se guarda el código; se lee con `metodoVisible`. */
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

const NADIE: ClienteElegido = { id: null, nombre: '', telefono: '' };

/**
 * «hace 12 días».
 *
 * Un número suelto no dice si es mucho o poco. «Me debe 800.000» y «me debe
 * 800.000 desde hace cuatro meses» son dos situaciones distintas, y la
 * segunda es la que hay que ir a cobrar.
 */
function hace(t: Textos, dias: number | null): string {
  if (dias == null) return '';
  if (dias <= 0) return t.fiado.desdeHoy;
  if (dias === 1) return t.fiado.desdeAyer;
  return t.fiado.haceDias(dias);
}

/** «Vence en 3 días» / «Venció hace 2 días», con las palabras que ya usa Deudas. */
function cuando(t: Textos, dias: number): string {
  return dias < 0 ? t.deudas.vencioHace(-dias) : t.deudas.venceEn(dias);
}

/** Rojo si ya venció, ámbar si es esta semana, gris si falta. */
function tonoDe(dias: number): string {
  return dias < 0 ? 'text-rojo' : dias <= 7 ? 'text-ambar' : 'text-tinta/45';
}

/**
 * «a · b · c» que, si no entra en un renglón, corta ENTRE las partes.
 *
 * En un teléfono de 375 px la línea de una cuota se partía en medio de
 * «Gs. 150.000» o dejaba «fecha» sola abajo. Cada parte va entera.
 */
function Partes({ partes }: { partes: string[] }) {
  return (
    <>
      {partes.map((parte, i) => (
        <span key={i}>
          <span className="whitespace-nowrap">{parte}{i < partes.length - 1 ? ' ·' : ''}</span>{' '}
        </span>
      ))}
    </>
  );
}

/** Un calendario chico, para el botón que cambia la fecha de una cuota. */
function IconoFecha() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

/** Lo que se necesita en todos lados, junto: la cuenta, la plata y el día. */
interface Entorno {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  esPersonal: boolean;
  cuentas: CuentaParaElegir[];
  hoy: string;
  dec: number;
  plata: (n: number) => string;
}

/**
 * FIADO · LO QUE TE DEBEN
 *
 * CUATRO GRUPOS EN LA MISMA LISTA (127)
 *
 * Matías: «no sé cómo dividir, pero en el mismo sector». Atrasadas · Hoy ·
 * Próximas · Sin fecha. Cada cliente va en uno solo —el de su cuota
 * pendiente más próxima— y al lado va siempre lo que debe en TOTAL, que es
 * el número del libro. Un grupo vacío no se dibuja.
 *
 * QUIEN NO USA FECHAS VE LA PANTALLA DE SIEMPRE: sin ninguna cuota no hay
 * títulos de grupo ni tarjeta «Para cobrar»; es la lista por monto, con la
 * antigüedad al lado y en rojo cuando pasa del mes.
 *
 * COBRAR NO SUMA OTRA VEZ
 *
 * La venta fiada ya se contó el día que salió la mercadería. Cobrarla solo
 * baja lo que te deben; si además sumara como ingreso, la ganancia contaría
 * la misma venta dos veces (ver migración 056).
 */
export function PantallaFiado({
  empresaId, moneda, zona, negocio, esPersonal, resumen, cuentas = [],
}: {
  empresaId: string;
  moneda: string;
  zona: string;
  negocio: string;
  esPersonal: boolean;
  resumen: ResumenFiado;
  /** Las cuentas de la billetera, para decir de cuál salió lo prestado (084). */
  cuentas?: CuentaParaElegir[];
}) {
  const router = useRouter();
  const t = useTextos();
  const locale = useLocale();
  const plata = (n: number) => dinero(n, moneda, true, locale);
  const hoy = hoyISO(zona);
  const entorno: Entorno = {
    empresaId, moneda, zona, negocio, esPersonal, cuentas, hoy, dec: decimalesDe(moneda), plata,
  };

  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState('');

  const grupos = useMemo(() => agruparDeudores(resumen.clientes), [resumen.clientes]);
  // ¿Alguien tiene una cuota pendiente? Si no, la pantalla es la de siempre.
  const conFechas = grupos.atrasadas.length + grupos.hoy.length + grupos.proximas.length > 0;

  const masViejo = resumen.clientes.reduce<DeudorFiado | null>(
    (m, d) => ((d.dias ?? -1) > (m?.dias ?? -1) ? d : m), null);

  const quienes = esPersonal ? t.fiado.personas(resumen.cuantos) : t.fiado.clientes(resumen.cuantos);
  const elAbierto = abierto ? resumen.clientes.find((d) => d.cliente_id === abierto) ?? null : null;

  function listo(mensaje: string) {
    setAviso(mensaje);
    setNuevo(false);
    setAbierto(null);
    router.refresh();
    setTimeout(() => setAviso(''), 4500);
  }

  const GRUPOS: { clave: string; titulo: string; lista: DeudorFiado[] }[] = [
    { clave: 'atrasadas', titulo: t.fiado.grupoAtrasadas, lista: grupos.atrasadas },
    { clave: 'hoy', titulo: t.fiado.grupoHoy, lista: grupos.hoy },
    { clave: 'proximas', titulo: t.fiado.grupoProximas, lista: grupos.proximas },
    { clave: 'sinFecha', titulo: t.fiado.grupoSinFecha, lista: grupos.sinFecha },
  ];

  const filas = (lista: DeudorFiado[]) => (
    <ul className="divide-y divide-borde">
      {lista.map((d) => (
        <FilaDeudor key={d.cliente_id} d={d} hoy={hoy} plata={plata} onAbrir={() => setAbierto(d.cliente_id)} />
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Indicador
          destacado
          titulo={t.fiado.teDeben}
          // En media pantalla: un total largo se partía en dos renglones.
          valor={dineroQueEntra(resumen.total, moneda, locale, t.formato)}
          detalle={resumen.cuantos > 0 ? quienes : t.fiado.nadieTeDebeNada}
        />
        {conFechas ? (
          <ParaCobrar resumen={resumen} moneda={moneda} hoy={hoy} />
        ) : (
          <Indicador
            titulo={t.fiado.loMasViejo}
            valor={masViejo ? hace(t, masViejo.dias) : '—'}
            detalle={masViejo ? masViejo.nombre : t.fiado.sinDeudasPendientes}
          />
        )}
      </div>

      {aviso && (
        <p role="status" className="rounded-xl bg-verde-claro px-4 py-3 text-[13.5px] font-semibold text-verde-fuerte aparecer">
          ✓ {aviso}
        </p>
      )}

      <button type="button" className="boton-principal min-h-[48px] w-full" onClick={() => setNuevo(true)}>
        {esPersonal ? t.fiado.anotarQueTeDeben : t.fiado.anotarFiado}
      </button>

      {resumen.clientes.length === 0 ? (
        <div className="tarjeta overflow-hidden">
          <Vacio
            titulo={t.fiado.nadieTeDebeTitulo}
            detalle={esPersonal ? t.fiado.vacioPersonal : t.fiado.vacioNegocio}
          />
          {/* Una línea, y solo acá: con gente en la lista ya se ve qué pasa
              al cobrar. En la cuenta personal no hay venta de qué hablar. */}
          {!esPersonal && (
            <p className="-mt-6 px-6 pb-8 text-center text-[12.5px] text-tinta/45">{t.fiado.notaCobrar}</p>
          )}
        </div>
      ) : !conFechas ? (
        <div className="tarjeta overflow-hidden">{filas(resumen.clientes)}</div>
      ) : (
        GRUPOS.filter((g) => g.lista.length > 0).map((g) => (
          <section key={g.clave} aria-label={g.titulo}>
            <h2 className="titulo-seccion mb-1.5 px-1">{g.titulo}</h2>
            <div className="tarjeta overflow-hidden">{filas(g.lista)}</div>
          </section>
        ))
      )}

      {nuevo && <HojaNuevo e={entorno} onCerrar={() => setNuevo(false)} onListo={listo} />}

      {elAbierto && (
        <FichaDeudor
          key={elAbierto.cliente_id}
          d={elAbierto}
          e={entorno}
          onCerrar={() => setAbierto(null)}
          onListo={listo}
          onCambio={() => router.refresh()}
        />
      )}
    </div>
  );
}

/**
 * «Para cobrar»: lo atrasado más lo de hoy, que es lo que hay que ir a
 * buscar. Va en rojo si hay algo atrasado y en ámbar si es de hoy o de esta
 * semana. No usa `Indicador` porque ese solo sabe de verde y rojo.
 */
function ParaCobrar({ resumen, moneda, hoy }: { resumen: ResumenFiado; moneda: string; hoy: string }) {
  const t = useTextos();
  const locale = useLocale();
  const atrasadas = resumen.atrasadas ?? 0;
  const deHoy = resumen.vencen_hoy ?? 0;
  const semana = resumen.vencen_semana ?? 0;
  // Sin nada atrasado ni de hoy, el número es lo que vence esta semana:
  // «Gs. 0 · 1 esta semana» no decía cuánto, que es lo que se quiere saber.
  const urgente = (resumen.monto_atrasado ?? 0) + (resumen.monto_hoy ?? 0);
  const monto = atrasadas + deHoy > 0 || semana === 0 ? urgente : resumen.monto_semana ?? 0;

  const detalle = atrasadas + deHoy > 0
    ? t.fiado.atrasadasYHoy(atrasadas, deHoy)
    : semana > 0
      ? t.fiado.estaSemana(semana)
      : resumen.proximo_vencimiento
        ? t.fiado.nadaHoyProxima(fechaCorta(resumen.proximo_vencimiento, hoy))
        : '';
  const color = atrasadas > 0 ? 'text-rojo' : deHoy + semana > 0 ? 'text-ambar' : 'text-tinta';

  return (
    <div className="tarjeta p-4">
      <p className="titulo-seccion">{t.fiado.paraCobrar}</p>
      <p className={`mt-2 text-[22px] font-titulo font-extrabold leading-none tracking-tight tabular-nums lg:text-[25px] ${color}`}>
        {dineroQueEntra(monto, moneda, locale, t.formato)}
      </p>
      {detalle && <p className="mt-2 text-[12.5px] text-tinta/50">{detalle}</p>}
    </div>
  );
}

/** Una persona que te debe: el nombre, lo que debe en total y lo que sigue. */
function FilaDeudor({
  d, hoy, plata, onAbrir,
}: {
  d: DeudorFiado;
  hoy: string;
  plata: (n: number) => string;
  onAbrir: () => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const p = d.proxima ?? null;

  let partes: string[];
  let tono: string;
  if (p) {
    // «Cuota 2 de 3 · venció hace 3 días · 150.000». Con una sola cuota, el
    // «cuota 1 de 1» sobra. A más de una semana se dice la fecha: «en 34
    // días» obliga a hacer la cuenta.
    const cuota = p.de > 1 ? t.fiado.cuotaN(p.numero, p.de) : '';
    const fecha = p.dias > 7 ? t.fiado.venceEl(fechaCorta(p.vence_el, hoy)) : cuando(t, p.dias);
    const sinFecha = (d.sin_fecha ?? 0) > 0 ? t.fiado.masSinFecha(plata(d.sin_fecha ?? 0)) : '';
    partes = [
      cuota,
      cuota ? fecha.charAt(0).toLocaleLowerCase(locale) + fecha.slice(1) : fecha,
      plata(p.pendiente),
      sinFecha,
    ].filter(Boolean);
    tono = `font-semibold ${tonoDe(p.dias)}`;
  } else {
    // Sin fecha: igual que siempre.
    partes = [hace(t, d.dias), d.telefono].filter(Boolean);
    tono = (d.dias ?? 0) > 30 ? 'font-semibold text-rojo' : 'text-tinta/45';
  }

  return (
    <li>
      <button
        type="button" onClick={onAbrir}
        className="block min-h-[56px] w-full px-4 py-3.5 text-left transition hover:bg-arena/60"
      >
        {/* Arriba, quién y cuánto debe en total. Abajo, a todo el ancho, lo
            que sigue: en un teléfono, al lado del monto no entraba y se
            partía en cuatro renglones. */}
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[15px] font-bold">{d.nombre}</span>
          <span className="shrink-0 text-[16px] font-bold tabular-nums">{plata(d.saldo)}</span>
        </span>
        <span className={`mt-0.5 block text-[12.5px] leading-snug ${tono}`}><Partes partes={partes} /></span>
      </button>
    </li>
  );
}

/** Anotar a mano que alguien te debe. */
function HojaNuevo({
  e, onCerrar, onListo,
}: {
  e: Entorno;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const [elegido, setElegido] = useState<ClienteElegido>(NADIE);
  const [monto, setMonto] = useState(0);
  const [concepto, setConcepto] = useState('');
  /** Cuándo paga (127). Null = sin fecha: «me debe y punto», lo de siempre. */
  const [plan, setPlan] = useState<Plan | null>(null);
  /**
   * De qué cuenta salió la plata (084). Vacío = no salió de ninguna, que es
   * lo que pasa cuando fiás una venta: entregaste mercadería, no plata.
   * Arranca vacío a propósito: mover el saldo de alguien sin que lo haya
   * pedido es peor que no moverlo.
   */
  const [cuentaId, setCuentaId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const puede = elegido.nombre.trim().length > 0 && monto > 0 && !guardando;

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!puede) return;
    setGuardando(true);
    setError('');
    try {
      // La ficha se crea recién acá: una por cada nombre a medio escribir
      // llenaría la lista de «J», «Ju», «Jua».
      const clienteId = await asegurarCliente(e.empresaId, elegido);
      if (!clienteId) throw new Error(t.fiado.escribiAQuien);

      // Con plan va todo en una sola llamada: no existe «le fié en 3 cuotas
      // y quedó en 1». Sin plan, la llamada es la de siempre.
      const elPlan = plan ? ajustarPlan(plan, monto, e.dec) : null;
      // Un plan que la base rechazaría (una cuota en cero, una fecha rota)
      // no se manda: mejor frenar acá que anotar el fiado sin sus fechas.
      if (elPlan && !planValido(elPlan, monto, e.dec)) throw new Error(t.fiado.noSePudoGuardar);
      const { error: err } = await clienteNavegador().rpc('anotar_fiado', {
        p_empresa: e.empresaId,
        p_cliente: clienteId,
        p_monto: monto,
        p_concepto: concepto.trim(),
        p_cuenta: cuentaId || null,
        ...(elPlan ? { p_plan: elPlan } : {}),
      });
      if (err) throw err;
      const fechas = elPlan
        ? ` ${elPlan.length > 1
          ? t.fiado.conCuotas(elPlan.length, fechaCorta(elPlan[0].vence_el, e.hoy))
          : t.fiado.tePagaEl(fechaCorta(elPlan[0].vence_el, e.hoy))}`
        : '';
      onListo(t.fiado.anotado(elegido.nombre.trim(), e.plata(monto)) + fechas);
    } catch (err: any) {
      setError(mensajeDeError(err, t.fiado.noSePudoAnotar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja
      titulo={e.esPersonal ? t.fiado.alguienTeDebe : t.fiado.anotarFiado}
      onCerrar={onCerrar} bloqueada={guardando} tamano="medio"
      formulario={{ onSubmit: guardar }}
      pie={(
        <PieHoja columnas={2}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar} disabled={guardando}>
            {t.comun.cancelar}
          </button>
          <button type="submit" className="boton-principal min-h-[48px]" disabled={!puede}>
            {guardando ? t.comun.guardando : t.fiado.anotar}
          </button>
        </PieHoja>
      )}
    >
      <div className="space-y-3.5">
        <SelectorCliente
          empresaId={e.empresaId}
          valor={elegido}
          alElegir={setElegido}
          etiqueta={t.fiado.quienTeDebe}
          pedirTelefono
          obligatorio
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="etiqueta">{t.fiado.cuanto}</span>
            <CampoMonto
              className="campo" placeholder="500000" decimales={e.dec}
              valor={monto} alCambiar={setMonto}
            />
          </label>
          <label className="block min-w-0">
            <span className="etiqueta">{t.fiado.porQue} <span className="font-normal text-tinta/40">{t.fiado.opcional}</span></span>
            <input
              className="campo" maxLength={200}
              placeholder={e.esPersonal ? t.fiado.lePreste : t.fiado.mercaderia}
              value={concepto} onChange={(ev) => setConcepto(ev.target.value)}
            />
          </label>
        </div>

        <CuandoTePaga
          total={monto} hoy={e.hoy} moneda={e.moneda}
          valor={plan} alCambiar={setPlan} deshabilitado={guardando}
        />

        {/* De dónde salió la plata (084). Fiar una venta y prestar plata se
            anotaban igual, y son dos cosas distintas: en la venta entregás
            mercadería y de tus cuentas no sale nada; en el préstamo sale plata
            de verdad y el saldo tiene que bajar. */}
        <ElegirCuentaOpcional
          cuentas={e.cuentas} elegida={cuentaId} alElegir={setCuentaId} deshabilitado={guardando}
          pregunta={t.fiado.salioDeTuBilletera} ninguna={t.fiado.noSalioPlata}
          detalle={cuentaId === '' ? t.fiado.noSalioPlataDetalle : t.fiado.salioDetalle}
        />

        <MensajeError texto={error} />
      </div>
    </Hoja>
  );
}

/** Lo que se está por hacer desde la ficha y pide una hoja encima. */
type Encima =
  | { que: 'fecha'; fioId: string; concepto: string; monto: number; fecha: string; inicial: Plan | null; pagado: number }
  | { que: 'quitar'; deuda: DeudaConCuotas }
  | { que: 'borrar'; linea: LineaFiado }
  | null;

/**
 * LA FICHA DE QUIEN TE DEBE
 *
 * De arriba abajo, en el orden en que se usa: sus cuotas (qué vence y
 * cuándo), lo que debe sin fecha, cobrar, escribirle y, al final, el libro.
 *
 * Las partes SUMAN lo que dice la fila: lo pendiente de las cuotas más lo
 * sin fecha es el saldo del libro. Esa cuenta la hace la base
 * (`detalle_fiado`); acá no se recalcula nada.
 *
 * Cobrar y borrar cierran la ficha (cambió lo que debe). Mover una fecha,
 * armar o quitar cuotas la dejan abierta y la vuelven a leer: no cambió
 * cuánto debe, y casi siempre se toca más de una cosa seguida.
 */
function FichaDeudor({
  d, e, onCerrar, onListo, onCambio,
}: {
  d: DeudorFiado;
  e: Entorno;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
  /** Cambió algo que no cierra la ficha: la lista de atrás se vuelve a leer. */
  onCambio: () => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const { plata, hoy } = e;

  const [detalle, setDetalle] = useState<DetalleFiado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [nota, setNota] = useState('');
  const [encima, setEncima] = useState<Encima>(null);
  const [ocupado, setOcupado] = useState(false);
  const [errorEncima, setErrorEncima] = useState('');
  /** La cuota a la que se le está cambiando la fecha, y la fecha escrita. */
  const [moviendo, setMoviendo] = useState<{ id: string; fecha: string } | null>(null);
  const [escribio, setEscribio] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data, error: err } = await clienteNavegador().rpc('detalle_fiado', { p_cliente: d.cliente_id });
      if (err) throw err;
      setDetalle(leerDetalleFiado(data));
    } catch (err: any) {
      setError(mensajeDeError(err, t.fiado.noSeLeyoDetalle));
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.cliente_id]);

  useEffect(() => { cargar(); }, [cargar]);

  /** Cambió el calendario pero no la deuda: se relee todo y la ficha sigue abierta. */
  async function cambio(mensaje: string) {
    setEncima(null);
    setMoviendo(null);
    setErrorEncima('');
    setNota(mensaje);
    await cargar();
    onCambio();
    setTimeout(() => setNota(''), 4000);
  }

  // ------------------------------- cobrar -------------------------------
  const saldo = detalle?.saldo ?? d.saldo;
  const { opciones, elegida } = useMemo(
    () => (detalle ? opcionesDeCobro(detalle) : { opciones: [], elegida: 'todo' }),
    [detalle],
  );
  const [deQue, setDeQue] = useState('todo');
  // Se propone lo que casi siempre se cobra: la cuota que toca o, sin
  // cuotas, todo lo que debe. Si pagó una parte se corrige un número en vez
  // de escribirlo de cero.
  const [monto, setMonto] = useState(d.proxima ? 0 : d.saldo);
  const [metodo, setMetodo] = useState('efectivo');
  /**
   * En qué cuenta entró (084). Vacío = no se toca ningún saldo, que es lo
   * correcto si te pagaron en efectivo y no llevás caja en Orden.
   *
   * Sube el saldo como AJUSTE y no como ingreso: la 056 sacó a propósito el
   * ingreso que creaba el cobro porque inflaba la ganancia —la venta fiada
   * ya se contó el día de la venta—. Un préstamo que vuelve tampoco es
   * ganancia. El ajuste mueve la plata sin tocar ese número.
   */
  const [cuentaCobro, setCuentaCobro] = useState('');
  const [cobrando, setCobrando] = useState(false);

  // Al leer (o releer) el detalle: lo elegido de entrada y su monto.
  useEffect(() => {
    if (!detalle) return;
    setDeQue(elegida);
    setMonto(opciones.find((o) => o.clave === elegida)?.propuesto ?? detalle.saldo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalle]);

  const opcion = opciones.find((o) => o.clave === deQue) ?? null;
  const tope = opcion ? opcion.tope : saldo;
  // Quien tiene cuotas no cobra hasta que se sepa de cuál: sin eso el pago
  // entraría suelto y la cuota quedaría «atrasada» con la plata ya cobrada.
  const sePuedeCobrar = detalle !== null || !d.proxima;
  const puede = sePuedeCobrar && monto > 0 && monto <= tope && !cobrando;

  async function cobrar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!puede) return;
    setCobrando(true);
    setError('');
    try {
      const { data, error: err } = await clienteNavegador().rpc('cobrar_fiado', {
        p_empresa: e.empresaId, p_cliente: d.cliente_id, p_monto: monto, p_metodo: metodo,
        p_cuenta: cuentaCobro || null,
        // Con la cuota, el pago marca ESA deuda. Sin ella es el cobro de siempre.
        ...(opcion?.cuota ? { p_cuota: opcion.cuota.cuota_id } : {}),
      });
      if (err) throw err;
      const r = data as any;
      const queda = r?.saldo == null ? saldo - monto : Number(r.saldo);
      const proxima = r?.deuda?.proxima?.vence_el ? ` ${t.fiado.proximaVence(fechaCorta(String(r.deuda.proxima.vence_el), hoy))}` : '';
      onListo(queda <= 0
        ? t.fiado.pagoTodo(d.nombre)
        : t.fiado.cobrasteParte(plata(monto), d.nombre, plata(queda)) + proxima);
    } catch (err: any) {
      setError(mensajeDeError(err, t.fiado.noSePudoCobrar));
    } finally {
      setCobrando(false);
    }
  }

  // ----------------------------- lo de encima -----------------------------
  async function quitar(deuda: DeudaConCuotas) {
    setOcupado(true);
    setErrorEncima('');
    try {
      const { error: err } = await clienteNavegador().rpc('quitar_cuotas', { p_fio: deuda.fio_id });
      if (err) throw err;
      await cambio(t.fiado.quitadas);
    } catch (err: any) {
      setErrorEncima(mensajeDeError(err, t.fiado.noSePudoGuardar));
    } finally {
      setOcupado(false);
    }
  }

  async function borrar(l: LineaFiado) {
    setOcupado(true);
    setErrorEncima('');
    try {
      const { error: err } = await clienteNavegador().rpc('borrar_linea_fiado', { p_linea: l.id });
      if (err) throw err;
      onListo(t.fiado.borrado);
    } catch (err: any) {
      setErrorEncima(mensajeDeError(err, t.fiado.noSePudoBorrar));
    } finally {
      setOcupado(false);
    }
  }

  async function mover(cuota: CuotaFiado, fecha: string) {
    if (!fecha || fecha === cuota.vence_el) { setMoviendo(null); return; }
    setOcupado(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('mover_cuota', { p_cuota: cuota.cuota_id, p_vence_el: fecha });
      if (err) throw err;
      await cambio(t.fiado.fechaGuardada);
    } catch (err: any) {
      setError(mensajeDeError(err, t.fiado.noSePudoGuardar));
    } finally {
      setOcupado(false);
    }
  }

  // ------------------------------ el WhatsApp ------------------------------
  // El mensaje ya escrito, según lo que sigue: vence hoy, está atrasado o
  // falta. Sin cuotas es el de siempre, con todo lo que debe.
  const p = d.proxima ?? null;
  const primero = d.nombre.trim().split(/\s+/)[0] || d.nombre;
  let mensaje: string;
  if (!p) {
    mensaje = e.esPersonal
      ? t.fiado.mensajePersonal(primero, plata(d.saldo))
      : t.fiado.mensajeNegocio(primero, e.negocio, plata(d.saldo));
  } else {
    const m = plata(p.pendiente);
    const cuota = t.fiado.cuotaEntreParentesis(p.numero, p.de);
    const fecha = fechaCorta(p.vence_el, hoy);
    if (e.esPersonal) {
      mensaje = p.dias === 0 ? t.fiado.mensajeVenceHoyPersonal(primero, m, cuota)
        : p.dias < 0 ? t.fiado.mensajeAtrasadoPersonal(primero, m, cuota, fecha)
          : t.fiado.mensajeProximoPersonal(primero, m, cuota, fecha);
    } else {
      mensaje = p.dias === 0 ? t.fiado.mensajeVenceHoy(primero, e.negocio, m, cuota)
        : p.dias < 0 ? t.fiado.mensajeAtrasado(primero, e.negocio, m, cuota, fecha)
          : t.fiado.mensajeProximo(primero, e.negocio, m, cuota, fecha);
    }
  }
  const whatsapp = d.telefono ? enlaceWhatsApp(d.telefono, e.zona, mensaje) : '';
  const yaLeEscribio = escribio || (p?.avisado_el != null && p.avisado_el === hoy);

  /** Queda anotado que hoy se le escribió por esa cuota: el aviso de mañana ya no lo cuenta. */
  function anotarQueEscribio() {
    if (!p) return;
    clienteNavegador().rpc('marcar_cuota_avisada', { p_cuota: p.cuota_id }).then(({ error: err }) => {
      if (!err) { setEscribio(true); onCambio(); }
    });
  }

  // ------------------------------- el libro -------------------------------
  const deudaDe = (fioId: string | null | undefined) =>
    (fioId ? detalle?.deudas.find((x) => x.fio_id === fioId) ?? null : null);
  const haySinFecha = (detalle?.sin_fecha ?? 0) > 0;
  // Solo las líneas que hoy explican lo que debe sin fecha: las ya pagadas
  // de hace años no llevan botón.
  const sinFechaLineas = detalle ? lineasParaFechar(detalle.sin_fecha_lineas, detalle.sin_fecha) : [];

  function nombreDeLinea(l: LineaFiado): string {
    if (l.tipo === 'cobro') {
      // «Pago · TV 32"»: de qué deuda fue, sin guardar texto en ningún idioma.
      const concepto = deudaDe(l.fio_id)?.concepto
        ?? (l.fio_id ? detalle?.libro.find((x) => x.id === l.fio_id)?.concepto : '');
      return concepto ? t.fiado.pagoDe(concepto) : l.concepto || t.fiado.lineaPago;
    }
    const deuda = deudaDe(l.id);
    const nombre = l.concepto || t.fiado.lineaFiado;
    return deuda && deuda.cuotas.length > 1 ? `${nombre} · ${t.fiado.enCuotasN(deuda.cuotas.length)}` : nombre;
  }

  function ponerFecha(l: { id: string; concepto: string; monto: number; fecha: string }) {
    setErrorEncima('');
    setEncima({ que: 'fecha', fioId: l.id, concepto: l.concepto, monto: l.monto, fecha: l.fecha, inicial: null, pagado: 0 });
  }

  return (
    <Hoja
      titulo={d.nombre}
      subtitulo={`${t.fiado.teDebe(plata(saldo))}${d.telefono ? ` · ${d.telefono}` : ''}`}
      onCerrar={onCerrar} bloqueada={cobrando || ocupado} tamano="grande"
    >
      <div className="space-y-4">
        {nota && (
          <p role="status" className="rounded-xl bg-verde-claro px-3 py-2.5 text-[13px] font-semibold text-verde-fuerte aparecer">
            ✓ {nota}
          </p>
        )}

        {cargando && !detalle && <p className="text-[12.5px] text-tinta/45">{t.comun.cargando}</p>}

        {/* ---------------- 1 · cada deuda con cuotas ---------------- */}
        {detalle?.deudas.map((deuda) => (
          <div key={deuda.fio_id} className="rounded-2xl border border-borde p-3">
            <p className="text-[14px] font-bold leading-snug">
              {deuda.concepto || t.fiado.lineaFiado}
              <span className="font-medium text-tinta/50"> · {fechaCorta(deuda.fecha, hoy)} · {plata(deuda.monto)}</span>
            </p>

            <ul className="mt-1.5 divide-y divide-borde/60">
              {deuda.cuotas.map((c) => {
                const pagada = c.pendiente <= 0;
                const parcial = !pagada && c.pendiente < c.monto;
                const estado = pagada
                  ? [t.fiado.pagada]
                  : [parcial ? t.fiado.faltan(plata(c.pendiente)) : '', cuando(t, c.dias)].filter(Boolean);
                const abierta = moviendo?.id === c.cuota_id;
                return (
                  <li key={c.cuota_id} className="py-1.5">
                    <div className="flex min-h-[44px] items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`text-[13.5px] font-semibold tabular-nums ${pagada ? 'text-tinta/40' : 'text-tinta'}`}>
                          <span aria-hidden className={pagada ? 'text-verde-fuerte' : tonoDe(c.dias)}>{pagada ? '✓' : c.dias < 0 ? '●' : '○'} </span>
                          {/* La fecha de una pendiente va en su botón, a la derecha:
                              se lee ahí y ahí mismo se cambia. */}
                          <Partes
                            partes={[
                              c.de > 1 ? t.fiado.cuotaN(c.numero, c.de) : '',
                              pagada ? fechaCorta(c.vence_el, hoy) : '',
                              plata(c.monto),
                            ].filter(Boolean)}
                          />
                        </p>
                        <p className={`text-[12.5px] ${pagada ? 'text-tinta/40' : `font-semibold ${tonoDe(c.dias)}`}`}>
                          <Partes partes={estado} />
                        </p>
                      </div>
                      {!pagada && (
                        <button
                          type="button" disabled={ocupado} aria-expanded={abierta}
                          aria-label={`${t.fiado.cambiarFecha}: ${fechaCorta(c.vence_el, hoy)}`}
                          onClick={() => setMoviendo(abierta ? null : { id: c.cuota_id, fecha: c.vence_el })}
                          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-borde bg-superficie px-3 text-[13.5px] font-semibold tabular-nums text-tinta transition active:scale-[.97]"
                        >
                          {fechaCorta(c.vence_el, hoy)}
                          <span className="text-tinta/45"><IconoFecha /></span>
                        </button>
                      )}
                    </div>
                    {abierta && moviendo && (
                      <div className="mt-1 flex items-center gap-2 pb-1.5 aparecer">
                        <input
                          type="date" className="campo min-w-0 flex-1 py-2.5" aria-label={t.fiado.cambiarFecha}
                          value={moviendo.fecha} disabled={ocupado}
                          onChange={(ev) => setMoviendo({ id: c.cuota_id, fecha: ev.target.value })}
                        />
                        <button
                          type="button" className="boton-suave min-h-[44px] shrink-0"
                          disabled={ocupado || !moviendo.fecha} onClick={() => mover(c, moviendo.fecha)}
                        >
                          {ocupado ? t.comun.guardando : t.comun.guardar}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="-mb-2 mt-0.5 flex flex-wrap gap-x-5">
              <button
                type="button" disabled={ocupado} className="boton-texto min-h-[44px] text-[13px]"
                onClick={() => {
                  setErrorEncima('');
                  setEncima({
                    que: 'fecha', fioId: deuda.fio_id, concepto: deuda.concepto, monto: deuda.monto, fecha: deuda.fecha,
                    inicial: deuda.cuotas.map((c) => ({ vence_el: c.vence_el, monto: c.monto })), pagado: deuda.pagado,
                  });
                }}
              >
                {t.fiado.rearmar}
              </button>
              <button
                type="button" disabled={ocupado}
                className="min-h-[44px] text-[13px] font-semibold text-tinta/50 hover:text-rojo"
                onClick={() => { setErrorEncima(''); setEncima({ que: 'quitar', deuda }); }}
              >
                {t.fiado.quitarCuotas}
              </button>
            </div>
          </div>
        ))}

        {/* ---------------- 2 · lo sin fecha ---------------- */}
        {detalle && haySinFecha && (
          <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-3 rounded-2xl bg-arena px-3 py-1.5">
            <p className="text-[13.5px] font-semibold">
              {t.fiado.sinFecha} · <span className="tabular-nums">{plata(detalle.sin_fecha)}</span>
              {detalle.dias != null && <span className="font-medium text-tinta/50"> · {hace(t, detalle.dias)}</span>}
            </p>
            {sinFechaLineas.length === 1 && (
              <button
                type="button" disabled={ocupado} className="boton-texto min-h-[44px] text-[13px]"
                onClick={() => ponerFecha(sinFechaLineas[0])}
              >
                {t.fiado.ponerleFecha}
              </button>
            )}
          </div>
        )}

        {/* ---------------- 3 · cobrar ---------------- */}
        {sePuedeCobrar && (
          <form onSubmit={cobrar} className="space-y-2.5">
            {opciones.length > 0 && (
              <label className="block">
                <span className="etiqueta">{t.fiado.deQue}</span>
                <select
                  className="campo" value={deQue} disabled={cobrando}
                  onChange={(ev) => {
                    setDeQue(ev.target.value);
                    // Elegir propone el monto: la cuota, lo sin fecha o todo.
                    setMonto(opciones.find((o) => o.clave === ev.target.value)?.propuesto ?? saldo);
                  }}
                >
                  <OpcionesDeQue opciones={opciones} plata={plata} hoy={hoy} />
                </select>
              </label>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-[9rem] flex-1">
                <span className="etiqueta">{t.fiado.tePago}</span>
                <CampoMonto className="campo" decimales={e.dec} valor={monto} alCambiar={setMonto} />
              </label>
              <label className="block">
                <span className="etiqueta">{t.fiado.como}</span>
                <select className="campo" value={metodo} onChange={(ev) => setMetodo(ev.target.value)}>
                  {METODOS.map((m) => <option key={m} value={m}>{metodoVisible(t, m)}</option>)}
                </select>
              </label>
              {e.cuentas.length > 0 && (
                <label className="block min-w-0">
                  <span className="etiqueta">{t.fiado.enQueCuentaEntro}</span>
                  <select
                    className="campo" value={cuentaCobro}
                    onChange={(ev) => setCuentaCobro(ev.target.value)}
                  >
                    <option value="">{t.fiado.noEntroEnNinguna}</option>
                    {e.cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
              )}
              <button className="boton-principal min-h-[46px] w-full px-5 disabled:opacity-40 sm:w-auto" disabled={!puede}>
                {cobrando ? t.fiado.cobrando : t.fiado.cobrar}
              </button>
            </div>

            {/* El tope, dicho antes de que la base lo rechace. */}
            {monto > tope && (
              <p className="text-[12.5px] font-medium text-rojo">
                {opcion?.tipo === 'deuda' ? t.fiado.deEsaFaltan(plata(tope)) : t.fiado.noMasQueEso(plata(saldo))}
              </p>
            )}
          </form>
        )}

        {/* ---------------- 4 · escribirle ---------------- */}
        {whatsapp && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={anotarQueEscribio}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-verde/40 px-3.5 text-[13.5px] font-semibold text-verde-fuerte hover:bg-verde-claro"
            >
              {t.fiado.recordarlePorWhatsApp}
            </a>
            {p && yaLeEscribio && (
              <span role="status" className="text-[12.5px] font-semibold text-verde-fuerte">{t.fiado.leEscribisteHoy}</span>
            )}
          </div>
        )}

        <MensajeError texto={error} />

        {/* ---------------- 5 · el libro ---------------- */}
        <div>
          <p className="etiqueta">{t.fiado.detalle}</p>
          {detalle && detalle.libro.length === 0 && <p className="text-[12.5px] text-tinta/45">{t.fiado.sinMovimientos}</p>}
          {detalle && detalle.libro.length > 0 && (
            <ul className="divide-y divide-borde/60">
              {detalle.libro.map((l) => {
                // Con varias líneas sin fecha, la fecha se le pone a cada una.
                const sinFecha = l.tipo === 'fio' && sinFechaLineas.length > 1
                  ? sinFechaLineas.find((x) => x.id === l.id) ?? null
                  : null;
                return (
                  <li key={l.id} className="py-0.5">
                    <div className="flex min-h-[44px] items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate text-tinta/65">
                        {fechaLegible(l.fecha, false, locale)} · {nombreDeLinea(l)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className={`font-semibold tabular-nums ${l.tipo === 'cobro' ? 'text-verde-fuerte' : 'text-tinta'}`}>
                          {l.tipo === 'cobro' ? '−' : '+'} {plata(Number(l.monto))}
                        </span>
                        {/* Lo que vino de una venta no se borra acá: se anula la
                            venta, que es la que además devuelve el stock. */}
                        {!l.venta_id && (
                          <button
                            type="button" disabled={ocupado}
                            onClick={() => { setErrorEncima(''); setEncima({ que: 'borrar', linea: l }); }}
                            className="icono-toque -mr-2 text-tinta/35 hover:bg-rojo-claro hover:text-rojo"
                            aria-label={t.fiado.borrarLinea}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </div>
                    {sinFecha && (
                      <button
                        type="button" disabled={ocupado} className="boton-texto -mt-1 min-h-[44px] text-[13px]"
                        onClick={() => ponerFecha(sinFecha)}
                      >
                        {t.fiado.ponerleFecha}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ---------------- las hojas de encima ---------------- */}
      {encima?.que === 'fecha' && (
        <HojaFechas
          e={e} fioId={encima.fioId} total={encima.monto} inicial={encima.inicial}
          subtitulo={[
            encima.concepto || t.fiado.lineaFiado,
            plata(encima.monto),
            encima.fecha ? hace(t, diffDias(encima.fecha, hoy)) : '',
          ].filter(Boolean).join(' · ')}
          aviso={encima.inicial && encima.pagado > 0 ? t.fiado.rearmarAviso(plata(encima.pagado)) : ''}
          onCerrar={() => setEncima(null)}
          onGuardado={cambio}
        />
      )}

      {encima?.que === 'quitar' && (
        <Confirmar
          titulo={t.fiado.quitarCuotasPregunta(encima.deuda.concepto || t.fiado.lineaFiado)}
          detalle={t.fiado.quitarCuotasDetalle}
          si={t.fiado.quitarCuotas}
          onSi={() => quitar(encima.deuda)} onNo={() => setEncima(null)}
          ocupado={ocupado} error={errorEncima}
        />
      )}

      {encima?.que === 'borrar' && (
        <Confirmar
          titulo={encima.linea.tipo === 'fio'
            ? t.fiado.borrarFiado(plata(Number(encima.linea.monto)))
            : t.fiado.borrarPago(plata(Number(encima.linea.monto)))}
          si={t.comun.borrar} peligro
          onSi={() => borrar(encima.linea)} onNo={() => setEncima(null)}
          ocupado={ocupado} error={errorEncima}
        />
      )}
    </Hoja>
  );
}

/**
 * Ponerle fecha a un fiado que no tenía, o rearmar las cuotas de uno que sí.
 *
 * Es el mismo selector que en Vender, sin «Sin fecha» (para eso está «Quitar
 * las cuotas»). Guardar REEMPLAZA el calendario de esa línea; lo que ya pagó
 * no se toca y vuelve a tapar las primeras cuotas.
 */
function HojaFechas({
  e, fioId, total, inicial, subtitulo, aviso, onCerrar, onGuardado,
}: {
  e: Entorno;
  fioId: string;
  /** El monto de la línea: las cuotas tienen que sumar eso. */
  total: number;
  /** El plan que ya tiene (rearmar), o null (ponerle fecha). */
  inicial: Plan | null;
  subtitulo: string;
  aviso: string;
  onCerrar: () => void;
  onGuardado: (mensaje: string) => void;
}) {
  const t = useTextos();
  // De entrada, una sola fecha a 30 días: es lo que más se dice («me paga a
  // fin de mes») y un toque la cambia.
  const [plan, setPlan] = useState<Plan | null>(
    () => inicial ?? armarPlan({ total, cuotas: 1, cada: 'mes', primera: sumarDias(e.hoy, 30), decimales: e.dec }),
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const puede = plan !== null && planValido(plan, total, e.dec) && !guardando;

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!puede || !plan) return;
    setGuardando(true);
    setError('');
    try {
      const { error: err } = await clienteNavegador().rpc('programar_cuotas', { p_fio: fioId, p_plan: plan });
      if (err) throw err;
      onGuardado(plan.length > 1 ? t.fiado.cuotasGuardadas(plan.length) : t.fiado.fechaGuardada);
    } catch (err: any) {
      setError(mensajeDeError(err, t.fiado.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Hoja
      titulo={t.fiado.cuandoTePaga} subtitulo={subtitulo}
      onCerrar={onCerrar} bloqueada={guardando} tamano="chico"
      formulario={{ onSubmit: guardar }}
      pie={(
        <PieHoja columnas={2}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar} disabled={guardando}>
            {t.comun.cancelar}
          </button>
          <button type="submit" className="boton-principal min-h-[48px]" disabled={!puede}>
            {guardando ? t.comun.guardando : t.comun.guardar}
          </button>
        </PieHoja>
      )}
    >
      {aviso && <p className="mb-3 text-[12.5px] font-medium text-tinta/55">{aviso}</p>}
      <CuandoTePaga
        total={total} hoy={e.hoy} moneda={e.moneda}
        valor={plan} alCambiar={setPlan} sinChipSinFecha deshabilitado={guardando}
      />
      <MensajeError texto={error} />
    </Hoja>
  );
}
