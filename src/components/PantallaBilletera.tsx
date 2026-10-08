'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero, simboloDe } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import type { Billetera, CotizacionDeMoneda, CuentaDinero, TipoCuentaDinero } from '@/lib/tipos';
import { PlataSinCuenta } from '@/components/PlataSinCuenta';
import { CampoMonto } from '@/components/CampoMonto';
import { Confirmar } from '@/components/Hoja';
import { COLORES, TONO, colorDeCuenta, tonoDeCuenta, type ColorCuenta } from '@/lib/colores-cuenta';
import {
  cambioGuardado, cambioQueResulta, cambioRaro, convertirEntre, cotizacionAGuardar, textoDelCambio,
} from '@/lib/monedas';
import { ElegirMoneda } from '@/components/billetera/ElegirMoneda';
import { HojaCotizacion } from '@/components/billetera/HojaCotizacion';
import { PasesDeCuenta } from '@/components/billetera/PasesDeCuenta';
import { TotalesDePlata } from '@/components/billetera/TotalesDePlata';

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'] as const;
const TIPOS: TipoCuentaDinero[] = ['banco', 'efectivo', 'billetera'];

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** Lo que contesta `transferir_entre_cuentas` desde la 131. Antes: solo `ok` y `par`. */
interface PaseHecho {
  par?: string;
  salio?: number;
  entro?: number;
}

/** El ojo que tapa y destapa los montos. */
export function BotonOjo({ oculto, alCambiar, clase = '' }: { oculto: boolean; alCambiar: () => void; clase?: string }) {
  const t = useTextos();
  return (
    <button
      type="button" onClick={alCambiar}
      aria-label={oculto ? t.billetera.mostrarMontos : t.billetera.ocultarMontos}
      className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${clase}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
        {oculto && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/**
 * LA BILLETERA (074).
 *
 * Del cuaderno de Matías: la tarjeta con «Banco ATLAS · Gs 755.409» y el
 * ojito; y «cada banco tiene un monto diferente».
 *
 * EL SALDO SE MUEVE SOLO
 *
 * Cada cuenta dice qué formas de pago recibe. Lo que se carga en efectivo va
 * a «Efectivo»; lo cobrado por transferencia, al banco que la reciba. Eso lo
 * resuelve la base al guardar el movimiento: acá no se calcula nada.
 *
 * Y se dice la verdad: los bancos de acá no se conectan con ninguna app. Si
 * el número no coincide con el del banco, «Ajustar saldo» lo corrige con un
 * ajuste fechado, sin reescribir la historia.
 *
 * CUENTAS EN OTRA MONEDA (131)
 *
 * Matías: «Tengo una cuenta bancaria en dólares con 10 mil dólares: ¿cómo la
 * guardo en mi billetera, si solo me aparece la opción de cargar en
 * guaraníes?». Al crear una cuenta se elige su moneda. Una cuenta en otra
 * moneda guarda plata, se le pasa y se le saca (con DOS importes: cuánto
 * salió y cuánto entró) y paga gastos desde Gastos; no recibe sola ninguna
 * forma de pago.
 *
 * NUNCA SE SUMAN MONEDAS. El número grande sigue siendo lo que hay en la
 * moneda del negocio; debajo va un renglón exacto por cada otra moneda, y el
 * «≈ todo junto» es aparte, chico, con su cotización a la vista
 * (TotalesDePlata). Quien no tiene ninguna cuenta en otra moneda ve la
 * billetera de siempre: lo único nuevo es la fila «Moneda» al crear una.
 */
export function PantallaBilletera({
  empresaId, moneda, billetera,
}: {
  empresaId: string;
  moneda: string;
  billetera: Billetera;
}) {
  const t = useTextos();
  const b = t.billetera;
  const m = t.monedas.billetera;
  const locale = useLocale();
  const router = useRouter();
  const [oculto, alternar] = useOcultarMontos();
  const cuentas = billetera.cuentas;
  // (131) Las que están en otra moneda viajan aparte. Sin ninguna, `todas`
  // es la lista de siempre y nada de lo nuevo se dibuja.
  const cuentasOtras = billetera.cuentasOtras;
  const hayOtras = cuentasOtras.length > 0;
  const todas = hayOtras ? [...cuentas, ...cuentasOtras] : cuentas;
  const [creando, setCreando] = useState(todas.length === 0);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [cotizando, setCotizando] = useState(false);
  const [aDeshacer, setADeshacer] = useState<string | null>(null);
  const [deshechos, setDeshechos] = useState<string[]>([]);
  const [aQuitar, setAQuitar] = useState<CuentaDinero | null>(null);

  const plata = (n: number, enMoneda: string = moneda) => (oculto ? '••••••' : dinero(n, enMoneda, true, locale));
  const nombreMoneda = (codigo: string) => t.gastosCampana.moneda.nombres[codigo] ?? codigo;

  async function pedir<T>(fn: () => PromiseLike<{ data?: unknown; error: unknown }>): Promise<{ ok: boolean; data: T | null }> {
    setTrabajando(true);
    setError('');
    try {
      const { data, error: e } = await fn();
      if (e) throw e;
      router.refresh();
      return { ok: true, data: (data ?? null) as T | null };
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      return { ok: false, data: null };
    } finally {
      setTrabajando(false);
    }
  }

  const correr = async (fn: () => PromiseLike<{ error: unknown }>): Promise<boolean> => (await pedir(fn)).ok;

  const sb = () => clienteNavegador();

  const fila = (c: CuentaDinero) => (
    <FilaCuenta
      key={c.id}
      empresaId={empresaId}
      cuenta={c}
      otras={todas.filter((x) => x.id !== c.id)}
      moneda={moneda}
      cotizaciones={billetera.cotizaciones}
      conSimbolos={hayOtras}
      plata={plata}
      oculto={oculto}
      ocupado={trabajando}
      deshechos={deshechos}
      alAjustar={(real, nota) => correr(() => sb().rpc('ajustar_saldo_cuenta', {
        p_empresa: empresaId, p_cuenta: c.id, p_saldo_real: real, p_nota: nota,
      }))}
      alTransferir={(hacia, monto, montoHacia) => pedir<PaseHecho>(() => sb().rpc('transferir_entre_cuentas', {
        p_empresa: empresaId, p_desde: c.id, p_hacia: hacia, p_monto: monto, p_nota: '',
        // (131) Cuánto entró, SOLO entre dos monedas: entre dos cuentas de la
        // misma, la llamada es la de siempre.
        ...(montoHacia === undefined ? {} : { p_monto_hacia: montoHacia }),
      }))}
      alEditar={(d) => correr(() => sb().rpc('guardar_cuenta_dinero', {
        p_empresa: empresaId, p_nombre: d.nombre, p_tipo: d.tipo, p_saldo_inicial: 0,
        p_metodos: d.metodos, p_id: c.id, p_color: d.color,
      }))}
      alQuitar={() => {
        // (131) Una cuenta en otra moneda con plata: se dice cuánto deja de contarse.
        if (c.moneda && c.moneda !== moneda && Number(c.saldo) !== 0) { setAQuitar(c); return; }
        if (confirm(b.confirmarQuitar(c.nombre))) {
          correr(() => sb().rpc('quitar_cuenta_dinero', { p_empresa: empresaId, p_id: c.id }));
        }
      }}
      alDeshacer={(par) => setADeshacer(par)}
      alCotizar={(otra, valor) => correr(() => sb().rpc('guardar_cotizacion_moneda', {
        p_empresa: empresaId, p_moneda: otra, p_valor: valor,
      }))}
    />
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      {/* Va ARRIBA del total a propósito: es lo que hace que ese total no
          sea cierto todavía. Ver PlataSinCuenta.tsx (083). */}
      <PlataSinCuenta empresaId={empresaId} moneda={moneda} billetera={billetera} />

      {/* ---- el total y cada cuenta, en una sola tarjeta (como Wise) ---- */}
      <section className="tarjeta overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-tinta/55">{b.tuPlata}</p>
            {/* Un total largo («Gs. 13.000.000») no entraba a 40px en un celular
                de 360 y salía cortado con «…». Con más de 12 letras baja a 34px
                en pantallas angostas; los montos cortos siguen grandes. */}
            <p className={`mt-1.5 truncate font-titulo font-extrabold leading-none tabular-nums tracking-tight ${
              plata(billetera.total).length > 12 ? 'text-[34px] min-[400px]:text-[40px]' : 'text-[40px]'
            }`}>
              {plata(billetera.total)}
            </p>
            {/* (131) Un renglón exacto por cada otra moneda y el «≈ todo junto».
                Sin cuentas en otra moneda no dibuja nada. */}
            <TotalesDePlata billetera={billetera} moneda={moneda} oculto={oculto} alCotizar={() => setCotizando(true)} />
            <p className="mt-2 text-[12.5px] text-tinta/50">{b.enNCuentas(todas.length)}</p>
          </div>
          <BotonOjo oculto={oculto} alCambiar={alternar} clase="shrink-0 bg-arena text-tinta/70 hover:text-tinta" />
        </div>

        {todas.length > 0 && (
          <>
            {cuentas.length > 0 && (
              <ul className="px-2">
                {cuentas.map(fila)}
              </ul>
            )}
            {/* (131) Cada otra moneda, en su grupo y con su subtotal exacto. */}
            {billetera.totalesOtras.map((tot) => (
              <div key={tot.moneda}>
                <p className="flex items-baseline justify-between gap-3 px-5 pb-1 pt-3 text-[12.5px] font-semibold text-tinta/55">
                  <span>{m.enMoneda(nombreMoneda(tot.moneda))}</span>
                  <span className="tabular-nums">{plata(tot.total, tot.moneda)}</span>
                </p>
                <ul className="px-2">
                  {cuentasOtras.filter((c) => c.moneda === tot.moneda).map(fila)}
                </ul>
              </div>
            ))}
            <p className="px-5 pb-4 pt-2 text-[12px] text-tinta/45">{b.tocaUnaCuenta}</p>
          </>
        )}
      </section>

      {/* Aviso ANTES de que la plata se pierda (083). Una forma de pago que
          ninguna cuenta reclama no da error al cargar: el movimiento se
          guarda igual y queda fuera del saldo. Decirlo acá es la diferencia
          entre arreglarlo en un minuto y descubrirlo dentro de tres meses
          con un total que no cierra. */}
      {billetera.metodosSinCuenta.length > 0 && (
        <p className="rounded-2xl bg-ambar-claro/60 px-4 py-3 text-[13px] leading-relaxed text-tinta/75">
          {b.metodoSinCuenta(
            billetera.metodosSinCuenta.map((x) => t.metodos[x] ?? x).join(', '),
          )}
        </p>
      )}

      {/* Con una pregunta abierta (deshacer, quitar) el error se lee ahí. */}
      {error && !aDeshacer && !aQuitar && (
        <p className="rounded-2xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
      )}

      {creando ? (
        <div className="tarjeta p-5">
          <p className="text-[15px] font-bold">{todas.length === 0 ? b.primeraCuenta : b.nuevaCuenta}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/55">{b.nuevaCuentaDetalle}</p>
          <FormularioCuenta
            moneda={moneda}
            ocupado={trabajando}
            conSaldo
            alCancelar={todas.length > 0 ? () => setCreando(false) : undefined}
            alGuardar={async (d) => {
              const listo = await correr(() => sb().rpc('guardar_cuenta_dinero', {
                p_empresa: empresaId, p_nombre: d.nombre, p_tipo: d.tipo,
                p_saldo_inicial: d.saldo, p_metodos: d.metodos, p_id: null, p_color: d.color,
                // (131) La moneda, SOLO si no es la del negocio: crear una
                // cuenta de las de siempre manda lo mismo que antes.
                ...(d.moneda !== moneda ? { p_moneda: d.moneda } : {}),
              }));
              if (listo) setCreando(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreando(true)} className="boton-suave w-full py-3 text-[14px]">
          + {b.agregarCuenta}
        </button>
      )}

      <div className="rounded-3xl border border-borde/70 p-5 text-[12.5px] leading-relaxed text-tinta/60">
        <p className="font-semibold text-tinta/75">{b.comoSeMueve}</p>
        <p className="mt-1">{b.comoSeMueveDetalle}</p>
        <p className="mt-2">{b.sinConexionBancos}</p>
        <Link href="/movimientos" className="mt-2 inline-block font-semibold text-verde-fuerte hover:underline">
          {b.verHistorial}
        </Link>
      </div>

      {/* ---- lo de las otras monedas que se abre encima (131) ---- */}
      {cotizando && (
        <HojaCotizacion
          empresaId={empresaId} moneda={moneda} billetera={billetera} oculto={oculto}
          onCerrar={() => setCotizando(false)}
        />
      )}

      {aDeshacer && (
        <Confirmar
          titulo={m.deshacerTitulo} detalle={m.deshacerDetalle} si={m.deshacer}
          ocupado={trabajando} error={error}
          onNo={() => { setADeshacer(null); setError(''); }}
          onSi={async () => {
            const par = aDeshacer;
            const listo = await correr(() => sb().rpc('deshacer_transferencia', { p_empresa: empresaId, p_par: par }));
            if (listo) { setDeshechos((antes) => [...antes, par]); setADeshacer(null); }
          }}
        />
      )}

      {aQuitar && (
        <Confirmar
          peligro
          titulo={m.quitarConSaldoTitulo(aQuitar.nombre)}
          detalle={m.quitarConSaldo(dinero(Number(aQuitar.saldo), aQuitar.moneda ?? moneda, true, locale))}
          si={b.quitar}
          ocupado={trabajando} error={error}
          onNo={() => { setAQuitar(null); setError(''); }}
          onSi={async () => {
            const listo = await correr(() => sb().rpc('quitar_cuenta_dinero', { p_empresa: empresaId, p_id: aQuitar.id }));
            if (listo) setAQuitar(null);
          }}
        />
      )}
    </div>
  );
}

/** El círculo de cada cuenta: la inicial del banco, o un billete si es efectivo. */
export function IconoCuenta({ cuenta }: { cuenta: CuentaDinero }) {
  return (
    <span
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
      style={{ backgroundColor: tonoDeCuenta(cuenta) }}
    >
      {cuenta.tipo === 'efectivo' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} strokeWidth={1.9}>
          <rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" />
        </svg>
      ) : (
        (cuenta.nombre.trim().charAt(0) || '·').toUpperCase()
      )}
    </span>
  );
}

function FilaCuenta({
  empresaId, cuenta, otras, moneda, cotizaciones, conSimbolos, plata, oculto, ocupado, deshechos,
  alAjustar, alTransferir, alEditar, alQuitar, alDeshacer, alCotizar,
}: {
  empresaId: string;
  cuenta: CuentaDinero;
  /** Las demás cuentas activas, en la moneda que sea: a cualquiera se le puede pasar plata. */
  otras: CuentaDinero[];
  /** La moneda del negocio. La de la cuenta puede ser otra (`cuenta.moneda`). */
  moneda: string;
  cotizaciones: CotizacionDeMoneda[];
  /** Hay cuentas en más de una moneda: al elegir a cuál pasar, cada una dice la suya. */
  conSimbolos: boolean;
  plata: (n: number, enMoneda?: string) => string;
  oculto: boolean;
  ocupado: boolean;
  /** Los pases deshechos en esta visita: su cartel ya no se muestra. */
  deshechos: string[];
  alAjustar: (real: number, nota: string) => Promise<boolean>;
  /** `montoHacia` solo entre dos monedas: cuánto entró en la otra cuenta. */
  alTransferir: (hacia: string, monto: number, montoHacia?: number) => Promise<{ ok: boolean; data: PaseHecho | null }>;
  alEditar: (d: { nombre: string; tipo: TipoCuentaDinero; metodos: string[]; color: ColorCuenta }) => Promise<boolean>;
  alQuitar: () => void;
  alDeshacer: (par: string) => void;
  alCotizar: (otra: string, valor: number) => Promise<boolean>;
}) {
  const t = useTextos();
  const b = t.billetera;
  const m = t.monedas.billetera;
  const locale = useLocale();
  // (131) En qué moneda está ESTA cuenta: la suya, o la del negocio.
  const monedaDe = (c: CuentaDinero) => c.moneda ?? moneda;
  const monedaCuenta = monedaDe(cuenta);
  const enOtra = monedaCuenta !== moneda;
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState<'' | 'ajustar' | 'transferir' | 'editar'>('');
  const [valor, setValor] = useState(0);
  // Cero es un saldo posible («el banco dice que no tengo nada»), así que el
  // campo vacío no se distingue del cero por su valor: se distingue por si
  // alguien lo tocó. Sin esto, ajustar a cero sería imposible.
  const [escribio, setEscribio] = useState(false);
  const [hacia, setHacia] = useState(otras[0]?.id ?? '');
  // (131) Entre dos monedas hay un segundo importe: cuánto ENTRÓ en la otra.
  const [entra, setEntra] = useState(0);
  const [tocoEntra, setTocoEntra] = useState(false);
  const [pase, setPase] = useState<{
    par: string; salio: number; entro: number; monedaEntra: string;
    proponer: { moneda: string; escrita: number } | null;
  } | null>(null);

  // La cuenta elegida, si sigue estando; si no, la primera. Antes se usaba
  // `hacia` a secas: una fila que se montó cuando no había otra cuenta
  // quedaba con '' para siempre y, al crear la segunda, el botón de
  // transferir no se prendía hasta recargar la página.
  const haciaId = otras.some((o) => o.id === hacia) ? hacia : (otras[0]?.id ?? '');
  const destino = otras.find((o) => o.id === haciaId) ?? null;
  const monedaDestino = destino ? monedaDe(destino) : monedaCuenta;
  const entreMonedas = monedaDestino !== monedaCuenta;
  // Con cotización guardada, «Entran» se propone mientras nadie lo toque.
  const propuesto = entreMonedas && valor > 0
    ? convertirEntre(valor, monedaCuenta, monedaDestino, moneda, cotizaciones)
    : null;
  const entraFinal = tocoEntra ? entra : (propuesto ?? 0);
  const resultante = entreMonedas ? cambioQueResulta(valor, monedaCuenta, entraFinal, monedaDestino) : null;
  const raro = resultante !== null
    && cambioRaro(resultante, cambioGuardado(monedaCuenta, monedaDestino, moneda, cotizaciones));
  const cambioTexto = (escrita: number, a: string, z: string) => {
    const partes = textoDelCambio(escrita, a, z, locale);
    return m.cambio(partes.uno, partes.vale);
  };

  async function transferir() {
    const r = await alTransferir(haciaId, valor, entreMonedas ? entraFinal : undefined);
    if (!r.ok) return;
    if (entreMonedas) {
      const salio = Number(r.data?.salio ?? valor);
      const entro = Number(r.data?.entro ?? entraFinal);
      // Si no había cotización de esa moneda, se ofrece la de este pase. Solo
      // cuando una de las dos es la del negocio (es contra ella que se guarda),
      // y con un toque: no se guarda sola.
      const otra = monedaCuenta === moneda ? monedaDestino : (monedaDestino === moneda ? monedaCuenta : null);
      const sinCotizar = otra !== null && !cotizaciones.some((k) => k.moneda === otra && k.valor > 0);
      const cambio = cambioQueResulta(salio, monedaCuenta, entro, monedaDestino);
      setPase({
        par: String(r.data?.par ?? ''), salio, entro, monedaEntra: monedaDestino,
        proponer: otra !== null && sinCotizar && cambio ? { moneda: otra, escrita: cambio } : null,
      });
    } else {
      setPase(null);
    }
    setModo('');
    setEntra(0);
    setTocoEntra(false);
  }

  const paseVisible = pase && !deshechos.includes(pase.par) ? pase : null;

  // A qué cuenta: el mismo desplegable entre dos cuentas de la misma moneda
  // que entre dos monedas. Con más de una moneda en juego, cada una dice la suya.
  const selector = (
    <select
      className="campo mt-1 py-2" value={haciaId}
      onChange={(e) => { setHacia(e.target.value); setEntra(0); setTocoEntra(false); }}
    >
      {otras.map((o) => (
        <option key={o.id} value={o.id}>
          {conSimbolos ? `${o.nombre} · ${simboloDe(monedaDe(o))}` : o.nombre}
        </option>
      ))}
    </select>
  );

  return (
    <li className={`rounded-2xl transition ${abierta ? 'bg-arena' : ''}`}>
      <button
        type="button"
        onClick={() => { setAbierta((v) => !v); setModo(''); }}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-arena"
      >
        <IconoCuenta cuenta={cuenta} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{cuenta.nombre}</span>
          <span className="block truncate text-[12.5px] text-tinta/50">
            {/* (131) Una cuenta en otra moneda no recibe formas de pago: va solo el tipo. */}
            {enOtra ? b.tipos[cuenta.tipo] : [b.tipos[cuenta.tipo], cuenta.metodos.length > 0
              ? cuenta.metodos.map((x) => metodoVisible(t, x)).join(', ')
              : b.noRecibeNada,
            ].filter((x, i, todos) => todos.indexOf(x) === i).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{plata(Number(cuenta.saldo), monedaCuenta)}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-tinta/30 transition ${abierta ? 'rotate-90' : ''}`} {...trazo} strokeWidth={2}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {abierta && (
      <div className="px-3 pb-3 pt-1">
        {(Number(cuenta.entro_mes) > 0 || Number(cuenta.salio_mes) > 0) && (
          <p className="text-[12.5px] text-tinta/55">
            {b.esteMes}{' '}
            <span className="font-semibold text-verde-fuerte">+{plata(Number(cuenta.entro_mes), monedaCuenta)}</span>
            {' · '}
            <span className="font-semibold text-rojo">−{plata(Number(cuenta.salio_mes), monedaCuenta)}</span>
          </p>
        )}

        {/* (131) Lo que acaba de pasar entre dos monedas, con sus dos importes,
            y la salida si salió mal. */}
        {modo === '' && paseVisible && (
          <div className="mt-2 rounded-xl border border-borde/70 bg-superficie px-3 pb-1 pt-2">
            <p className="text-[12.5px] font-semibold tabular-nums text-tinta/75">
              {m.pasaste(plata(paseVisible.salio, monedaCuenta), plata(paseVisible.entro, paseVisible.monedaEntra))}
            </p>
            <div className="flex flex-wrap gap-x-4">
              {paseVisible.par && (
                <button type="button" disabled={ocupado} onClick={() => alDeshacer(paseVisible.par)}
                  className="boton-texto min-h-[40px] text-[12.5px] disabled:opacity-50">
                  {m.deshacer}
                </button>
              )}
              {paseVisible.proponer && (
                <button type="button" disabled={ocupado}
                  onClick={async () => {
                    const p = paseVisible.proponer;
                    if (p && await alCotizar(p.moneda, cotizacionAGuardar(p.escrita, moneda, p.moneda))) {
                      setPase({ ...paseVisible, proponer: null });
                    }
                  }}
                  className="boton-texto min-h-[40px] text-left text-[12.5px] disabled:opacity-50">
                  {m.usarComoCotizacion(cambioTexto(paseVisible.proponer.escrita, moneda, paseVisible.proponer.moneda))}
                </button>
              )}
            </div>
          </div>
        )}

        {modo === '' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="boton-principal px-4 py-2 text-[13px]" disabled={ocupado}
              onClick={() => { setModo('ajustar'); setValor(0); setEscribio(false); }}>
              {b.ajustarSaldo}
            </button>
            {otras.length > 0 && (
              <button type="button" className="boton-suave px-4 py-2 text-[13px]" disabled={ocupado}
                onClick={() => { setModo('transferir'); setValor(0); setEntra(0); setTocoEntra(false); }}>
                {b.transferir}
              </button>
            )}
            <button type="button" className="boton-suave px-4 py-2 text-[13px]" disabled={ocupado}
              onClick={() => setModo('editar')}>
              {b.editar}
            </button>
          </div>
        )}

        {modo === 'ajustar' && (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="etiqueta">{b.cuantoDiceTuBanco}</span>
              <CampoMonto className="campo mt-1 py-2 text-[15px]" autoFocus
                decimales={decimalesDe(monedaCuenta)}
                placeholder={enOtra ? dinero(0, monedaCuenta, true, locale) : undefined}
                valor={valor} alCambiar={(n) => { setValor(n); setEscribio(true); }} />
            </label>
            <p className="text-[12px] leading-snug text-tinta/50">{b.ajustarDetalle}</p>
            <div className="flex gap-2">
              <button type="button" className="boton-principal flex-1 py-2 text-[13.5px]"
                disabled={ocupado || !escribio}
                onClick={async () => { if (await alAjustar(valor, '')) setModo(''); }}>
                {t.comun.guardar}
              </button>
              <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => setModo('')}>
                {t.comun.cancelar}
              </button>
            </div>
          </div>
        )}

        {modo === 'transferir' && (
          <div className="mt-2 space-y-2">
            {entreMonedas ? (
              <>
                {/* (131) DOS IMPORTES: cuánto salió de esta y cuánto entró en la
                    otra, cada uno en su moneda. La base no convierte nada: si
                    hay cotización, «Entran» se propone y la persona lo confirma. */}
                <label className="block">
                  <span className="etiqueta">{b.hacia}</span>
                  {selector}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="etiqueta">{m.salen(simboloDe(monedaCuenta))}</span>
                    <CampoMonto className="campo mt-1 py-2 text-[15px]" autoFocus
                      decimales={decimalesDe(monedaCuenta)}
                      valor={valor} alCambiar={setValor} />
                  </label>
                  <label className="block">
                    <span className="etiqueta">{m.entran(simboloDe(monedaDestino))}</span>
                    <CampoMonto key={monedaDestino} className="campo mt-1 py-2 text-[15px]"
                      decimales={decimalesDe(monedaDestino)}
                      valor={entraFinal} alCambiar={(n) => { setEntra(n); setTocoEntra(true); }} />
                  </label>
                </div>
                {resultante !== null && (
                  <p className={`text-[13px] font-semibold tabular-nums ${raro ? 'text-ambar' : 'text-tinta/70'}`}>
                    {cambioTexto(resultante, monedaCuenta, monedaDestino)}
                  </p>
                )}
                {raro && (
                  <p className="rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">{m.cambioRaroAviso}</p>
                )}
                <p className="text-[12px] leading-snug text-tinta/50">{m.cambiarNoEsGasto}</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="etiqueta">{b.cuanto}</span>
                    <CampoMonto className="campo mt-1 py-2 text-[15px]" autoFocus
                      decimales={decimalesDe(monedaCuenta)}
                      valor={valor} alCambiar={setValor} />
                  </label>
                  <label className="block">
                    <span className="etiqueta">{b.hacia}</span>
                    {selector}
                  </label>
                </div>
                <p className="text-[12px] leading-snug text-tinta/50">{b.transferirDetalle}</p>
              </>
            )}
            <div className="flex gap-2">
              <button type="button" className="boton-principal flex-1 py-2 text-[13.5px]"
                disabled={ocupado || valor <= 0 || !haciaId || (entreMonedas && !(entraFinal > 0))}
                onClick={transferir}>
                {b.transferir}
              </button>
              <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => setModo('')}>
                {t.comun.cancelar}
              </button>
            </div>
          </div>
        )}

        {modo === 'editar' && (
          <div className="mt-1">
            <FormularioCuenta
              moneda={moneda}
              inicial={cuenta}
              ocupado={ocupado}
              alCancelar={() => setModo('')}
              alGuardar={async (d) => { if (await alEditar(d)) setModo(''); }}
            />
            <button type="button" onClick={alQuitar} disabled={ocupado}
              className="mt-2 text-[12.5px] font-semibold text-tinta/40 hover:text-rojo">
              {b.quitar}
            </button>
          </div>
        )}

        {/* (131) Una cuenta en otra moneda se mueve sobre todo con pases:
            se ven, y se pueden deshacer. */}
        {enOtra && modo === '' && (
          <PasesDeCuenta
            empresaId={empresaId} cuentaId={cuenta.id} saldo={Number(cuenta.saldo)}
            oculto={oculto} ocupado={ocupado} alDeshacer={alDeshacer}
          />
        )}
      </div>
      )}
    </li>
  );
}

function FormularioCuenta({
  moneda, inicial, ocupado, conSaldo = false, alGuardar, alCancelar,
}: {
  /** La moneda del negocio. La de la cuenta se elige acá, solo al crear (131). */
  moneda: string;
  inicial?: CuentaDinero;
  ocupado: boolean;
  conSaldo?: boolean;
  alGuardar: (d: {
    nombre: string; tipo: TipoCuentaDinero; metodos: string[]; saldo: number; color: ColorCuenta; moneda: string;
  }) => void;
  alCancelar?: () => void;
}) {
  const t = useTextos();
  const b = t.billetera;
  const m = t.monedas.billetera;
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCuentaDinero>(inicial?.tipo ?? 'banco');
  const [metodos, setMetodos] = useState<string[]>(inicial?.metodos ?? ['transferencia']);
  const [saldo, setSaldo] = useState(0);
  // (131) Al crear arranca en la moneda del negocio, ya marcada. Al editar es
  // la que la cuenta ya tiene: no se cambia.
  const [monedaCuenta, setMonedaCuenta] = useState(inicial?.moneda ?? moneda);
  const enOtra = monedaCuenta !== moneda;
  const nombreMoneda = t.gastosCampana.moneda.nombres[monedaCuenta] ?? monedaCuenta;
  // Arranca en el que le toca por su nombre, no en uno cualquiera: el
  // Atlas ya aparece en rojo antes de que nadie elija nada, y quien esté
  // conforme no tiene que tocar esto.
  const [color, setColor] = useState<ColorCuenta>(
    colorDeCuenta({ nombre: inicial?.nombre ?? '', tipo: inicial?.tipo ?? 'banco', color: inicial?.color }),
  );
  // Mientras no lo toquen, el color sigue al nombre que se va escribiendo.
  const [colorElegido, setColorElegido] = useState(Boolean(inicial?.color));
  const colorVisible = colorElegido
    ? color
    : colorDeCuenta({ nombre, tipo, color: null });

  const elegirTipo = (x: TipoCuentaDinero) => {
    setTipo(x);
    // Lo que casi siempre corresponde, para no hacer pensar a nadie.
    if (!inicial) setMetodos(x === 'efectivo' ? ['efectivo'] : x === 'banco' ? ['transferencia', 'tarjeta'] : ['otro']);
  };

  const elegirMoneda = (codigo: string) => {
    setMonedaCuenta(codigo);
    // Lo ya escrito se queda, sin los centavos que la moneda nueva no tiene.
    const f = 10 ** decimalesDe(codigo);
    setSaldo((s) => Math.round(s * f) / f);
  };

  const ejemploDeNombre = enOtra
    ? (tipo === 'efectivo'
      ? m.nombreEfectivoOtra(m.monedas[monedaCuenta] ?? monedaCuenta)
      : tipo === 'banco' ? m.nombreBancoOtra(nombreMoneda) : m.nombreBilleteraOtra)
    : (tipo === 'efectivo' ? b.nombreEfectivo : tipo === 'banco' ? b.nombreBanco : b.nombreBilletera);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((x) => (
          <button key={x} type="button" onClick={() => elegirTipo(x)}
            className={x === tipo ? 'chip-encendido' : 'chip-apagado'}>
            {b.tipos[x]}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="etiqueta">{b.nombre}</span>
        <input className="campo mt-1" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder={ejemploDeNombre} />
      </label>

      {/* (131) En qué moneda está. Solo al crear: después no se cambia. */}
      {!inicial && <ElegirMoneda propia={moneda} valor={monedaCuenta} alElegir={elegirMoneda} deshabilitado={ocupado} />}

      {conSaldo && (
        <label className="block">
          <span className="etiqueta">{b.cuantoTenesHoy}</span>
          <CampoMonto key={monedaCuenta} className="campo mt-1" valor={saldo} alCambiar={setSaldo}
            decimales={decimalesDe(monedaCuenta)} placeholder={dinero(0, monedaCuenta)} />
        </label>
      )}

      {enOtra ? (
        // (131) Una cuenta en otra moneda no recibe sola ninguna forma de pago:
        // lo que se cobra está en la moneda del negocio y no puede caerle encima.
        inicial
          ? <p><span className="pastilla bg-superficie text-tinta/65">{m.monedaFija(nombreMoneda)}</span></p>
          : <p className="text-[12.5px] leading-snug text-tinta/55">{m.noRecibeSola}</p>
      ) : (
      <div>
        <span className="etiqueta">{b.queEntraAca}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {METODOS.map((x) => {
            const on = metodos.includes(x);
            return (
              <button key={x} type="button"
                onClick={() => setMetodos(on ? metodos.filter((y) => y !== x) : [...metodos, x])}
                className={on ? 'chip-encendido' : 'chip-apagado'}>
                {metodoVisible(t, x)}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{b.queEntraAcaDetalle}</p>
      </div>
      )}

      {/* El color, para distinguirla de un vistazo entre las tarjetas del
          panel (086). Se propone el del banco y se puede cambiar. */}
      <div>
        <span className="etiqueta">{b.color}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {COLORES.map((c) => (
            <button
              key={c} type="button"
              onClick={() => { setColor(c); setColorElegido(true); }}
              aria-label={b.colores[c]}
              aria-pressed={c === colorVisible}
              className={`h-8 w-8 rounded-full transition active:scale-90 ${
                c === colorVisible ? 'ring-2 ring-tinta/70 ring-offset-2 ring-offset-superficie' : ''
              }`}
              style={{ backgroundColor: TONO[c] }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" className="boton-principal flex-1 py-2.5" disabled={ocupado || nombre.trim() === ''}
          onClick={() => alGuardar({
            nombre: nombre.trim(), tipo, metodos: enOtra ? [] : metodos, saldo, color: colorVisible, moneda: monedaCuenta,
          })}>
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
        {alCancelar && (
          <button type="button" className="boton-suave px-4 py-2.5" onClick={alCancelar} disabled={ocupado}>
            {t.comun.cancelar}
          </button>
        )}
      </div>
    </div>
  );
}
