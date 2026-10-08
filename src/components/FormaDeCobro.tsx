'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { tonoDeCuenta } from '@/lib/colores-cuenta';
import type { CuentaParaElegir } from '@/lib/tipos';
import { cuentasDelMetodo, cuentaDelCobro, esFiado, type SentidoPlata } from '@/lib/cuenta-del-cobro';
import { cuentasEnOtraMoneda } from '@/lib/cuenta-del-cobro';
import { decimalesDe, dinero, simboloDe } from '@/lib/formato';
import { cambioQueResulta, cambioRaro, cotizacionEscrita, textoDelCambio } from '@/lib/monedas';
import { CampoMonto } from '@/components/CampoMonto';

/** Cómo se cobra algo que ya se hizo. Sin fiado: eso no es cobrar. */
export const METODOS_DE_COBRO = ['efectivo', 'transferencia', 'tarjeta'] as const;

/**
 * Las cuentas de la billetera, para elegir en cuál entró un cobro (095).
 *
 * Se piden desde el navegador porque estos formularios viven adentro de
 * otras pantallas (la agenda, la ficha del alumno). Si quien mira no
 * administra la cuenta, la base contesta con un error y esto queda vacío:
 * el cobro va, como siempre, a la cuenta de su forma de pago.
 */
export function useCuentasParaElegir(empresaId: string, pedir = true): CuentaParaElegir[] {
  const [cuentas, setCuentas] = useState<CuentaParaElegir[]>([]);
  useEffect(() => {
    if (!pedir) return;
    let vivo = true;
    (async () => {
      try {
        const { data } = await clienteNavegador().rpc('cuentas_para_elegir', { p_empresa: empresaId });
        if (vivo && Array.isArray(data)) setCuentas(data as CuentaParaElegir[]);
      } catch { /* sin la lista se cobra igual, por forma de pago */ }
    })();
    return () => { vivo = false; };
  }, [empresaId, pedir]);
  return cuentas;
}

// Las reglas puras (qué cuentas sirven y cuál se manda) viven en
// lib/cuenta-del-cobro.ts, donde se prueban solas. Se reexportan acá para que
// las pantallas sigan importando de donde siempre.
export { cuentasDelMetodo, cuentaDelCobro, esFiado, type SentidoPlata } from '@/lib/cuenta-del-cobro';
// Las de las cuentas en otra moneda (131), que solo usa Gastos.
export { cuentasEnOtraMoneda, cuentaTocada } from '@/lib/cuenta-del-cobro';

/**
 * CÓMO TE PAGÓ Y A QUÉ CUENTA ENTRÓ (095).
 *
 * Matías: «si se me transfirió en mi Continental y en Orden se me carga en
 * el Atlas, no tiene sentido». Cada forma de pago cae sola en una cuenta
 * (074), y con un banco alcanza. Con dos o más, «transferencia» no dice a
 * cuál: acá se elige, y arranca marcada la de siempre para que el caso
 * común siga siendo un toque.
 *
 * Con una sola cuenta posible no hay nada que elegir: solo se dice a dónde
 * va (ver ElegirCuenta).
 */
export function FormaDeCobro({
  cuentas, metodo, alElegirMetodo, elegida, alElegirCuenta, conPregunta = false, deshabilitado = false,
  sentido = 'entra',
}: {
  cuentas: CuentaParaElegir[];
  metodo: string;
  alElegirMetodo: (metodo: string) => void;
  /** La cuenta tocada a mano; null = la de siempre para esa forma de pago. */
  elegida: string | null;
  alElegirCuenta: (cuenta: string) => void;
  /** «¿Cómo te pagó?» arriba de las formas de pago, cuando no hay otra pregunta que lo diga. */
  conPregunta?: boolean;
  deshabilitado?: boolean;
  /** Un cobro (por defecto) o un pago: cambia la pregunta de la cuenta. */
  sentido?: SentidoPlata;
}) {
  const t = useTextos();

  return (
    <div className="space-y-2.5">
      <div>
        {conPregunta && <span className="etiqueta">{t.cobro.comoTePago}</span>}
        <div className={`${conPregunta ? 'mt-1 ' : ''}flex flex-wrap gap-2`}>
          {METODOS_DE_COBRO.map((m) => (
            <button key={m} type="button" disabled={deshabilitado} aria-pressed={metodo === m}
              onClick={() => alElegirMetodo(m)}
              className={`${metodo === m ? 'chip-encendido' : 'chip-apagado'} disabled:opacity-50`}>
              {metodoVisible(t, m)}
            </button>
          ))}
        </div>
      </div>

      <ElegirCuenta
        cuentas={cuentas} metodo={metodo} elegida={elegida}
        alElegir={alElegirCuenta} deshabilitado={deshabilitado} sentido={sentido}
      />
    </div>
  );
}

/**
 * ¿DE QUÉ CUENTA SALIÓ? ¿A QUÉ CUENTA ENTRÓ? — LA MISMA PREGUNTA EN TODA LA
 * APP (01/10).
 *
 * Matías: «en Registrar un pago tengo dos bancos, elegí Transferencia, y no me
 * salen las opciones para elegir de cuál banco debitar». Había tres maneras de
 * preguntarlo (Gastos con «Automática», esta con chips de color, Fiado con «No
 * salió plata») y varias pantallas que no preguntaban nada. Ahora todas las
 * que mueven plata usan esta, y se ve y se porta igual en todos lados:
 *
 *   · Solo la ve quien administra: a los demás `cuentas_para_elegir` les
 *     contesta con un error y la lista llega vacía. Lo que entra fiado,
 *     tampoco: no entra en ninguna cuenta hasta que te lo paguen. Un gasto
 *     con «crédito» sí se pregunta: es la tarjeta con la que se pagó.
 *   · Dos o más cuentas posibles para esa forma de pago (los dos bancos con
 *     «transferencia»): un chip por cuenta, con su color, y arranca marcada la
 *     de siempre, la que reclama esa forma de pago. Un toque cambia de banco.
 *     Si ninguna la reclama, no queda ninguna marcada y se avisa en ámbar:
 *     dejarlo así es plata fuera de la billetera (083).
 *   · Una sola posible: no hay nada que elegir, pero se dice a dónde va.
 *   · Ninguna posible (efectivo sin cuenta de efectivo): el aviso y todas las
 *     cuentas, para arreglarlo en el momento.
 *
 * Lo que se manda es siempre `cuentaDelCobro(cuentas, metodo, elegida)`.
 * Quien la usa vuelve `elegida` a null cuando cambia la forma de pago.
 *
 * LAS CUENTAS EN OTRA MONEDA (131) VAN APARTE, Y SOLO SI LAS PASAN.
 *
 * `cuentas` son siempre las que están en la moneda del negocio. Sin `otras`
 * (todas las pantallas menos Gastos) esta pieza se porta exactamente como
 * antes. Con `otras`, después de los chips de siempre van las de otra moneda
 * que sirven para esa forma de pago, cada una con su símbolo («Tarjeta
 * dólares · US$»). Ninguna arranca marcada: una cuenta en dólares vale solo
 * si la tocaron, y al tocarla quien la usa pregunta cuánto salió en esa
 * moneda (`MontoEnCuenta`). Tocarla de nuevo la suelta.
 */
export function ElegirCuenta({
  cuentas, metodo, elegida, alElegir, deshabilitado = false, sentido = 'entra',
  otras, otraElegida = null, alElegirOtra,
}: {
  cuentas: CuentaParaElegir[];
  metodo: string;
  /** La cuenta tocada a mano; null = la de siempre para esa forma de pago. */
  elegida: string | null;
  alElegir: (cuenta: string) => void;
  deshabilitado?: boolean;
  /** «¿A qué cuenta entró?» (un cobro) o «¿De qué cuenta salió?» (un pago). */
  sentido?: SentidoPlata;
  /** Las cuentas en OTRA moneda (131). Solo las pasa Gastos. */
  otras?: CuentaParaElegir[];
  /** La cuenta en otra moneda que se tocó, o null. */
  otraElegida?: string | null;
  /** Null = se soltó la que estaba tocada. */
  alElegirOtra?: (cuenta: string | null) => void;
}) {
  const t = useTextos();
  const sale = sentido === 'sale';
  // (131) Las de otra moneda que sirven para esta forma de pago. Lo que
  // entra fiado no va a ninguna cuenta, tampoco a estas.
  const otrasDelMetodo = otras && otras.length > 0 && !esFiado(metodo, sentido)
    ? cuentasEnOtraMoneda(otras, metodo)
    : [];
  const otraMarcada = otraElegida && otrasDelMetodo.some((c) => c.id === otraElegida) ? otraElegida : null;
  const chipsDeOtras = otrasDelMetodo.map((c) => {
    const on = otraMarcada === c.id;
    return (
      <button key={c.id} type="button" disabled={deshabilitado} aria-pressed={on}
        onClick={() => alElegirOtra?.(on ? null : c.id)}
        className={`${on ? 'chip-encendido' : 'chip-apagado'} max-w-full gap-1.5 disabled:opacity-50`}>
        <PuntoDeCuenta cuenta={c} />
        <span className="truncate">{c.nombre}</span>
        <span className="shrink-0 opacity-75">· {simboloDe(c.moneda ?? '')}</span>
      </button>
    );
  });
  // (131) Quien tiene SOLO cuentas en otra moneda: se le ofrecen ellas. Acá
  // no tocar ninguna no es un olvido que avisar: no hay cuenta en su moneda
  // de la que el gasto pudiera haber salido.
  if (cuentas.length === 0 && chipsDeOtras.length > 0) {
    const preguntaSola = sale ? t.cobro.deQueCuenta : t.cobro.enQueCuenta;
    return (
      <div role="group" aria-label={preguntaSola}>
        <span className="etiqueta">{preguntaSola}</span>
        <div className="mt-1 flex flex-wrap gap-2">{chipsDeOtras}</div>
      </div>
    );
  }
  // A quien no administra (lista vacía) no se le pregunta. Tampoco con lo que
  // entra fiado; un gasto con «crédito» sí: es la tarjeta, y hay que saber cuál.
  if (cuentas.length === 0 || esFiado(metodo, sentido)) return null;
  const posibles = cuentasDelMetodo(cuentas, metodo, sentido);
  // Con una en otra moneda tocada, ninguna de las de siempre queda marcada.
  const marcada = otraMarcada ? null : cuentaDelCobro(cuentas, metodo, elegida, sentido);
  const vaA = (nombre: string) => (sale ? t.cobro.vaASalir(nombre) : t.cobro.vaAEntrar(nombre));

  // Con cuentas en otra moneda para ofrecer, siempre van los chips: «va a
  // salir de…» a secas no dejaría elegir la de dólares.
  if (posibles.length === 1 && chipsDeOtras.length === 0) {
    const unica = posibles[0];
    return (
      <p className="flex items-center gap-2 text-[12.5px] font-medium leading-snug text-tinta/55">
        <PuntoDeCuenta cuenta={unica} />
        <span className="min-w-0">{vaA(unica.nombre)}</span>
      </p>
    );
  }

  const opciones = posibles.length > 0 ? posibles : cuentas;
  // Con «otro» no hay una forma de pago que culpar: se pide elegir, sin más.
  const aviso = metodo === 'otro'
    ? (sale ? t.cobro.elegiUnaSale : t.cobro.elegiUnaEntra)
    : (sale ? t.cobro.ningunaSale : t.cobro.ningunaEntra);
  const pregunta = sale ? t.cobro.deQueCuenta : t.cobro.enQueCuenta;

  return (
    <div role="group" aria-label={pregunta}>
      <span className="etiqueta">{pregunta}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {opciones.map((c) => {
          const on = marcada === c.id;
          return (
            <button key={c.id} type="button" disabled={deshabilitado} aria-pressed={on}
              onClick={() => alElegir(c.id)}
              className={`${on ? 'chip-encendido' : 'chip-apagado'} max-w-full gap-1.5 disabled:opacity-50`}>
              {/* El color de la tarjeta del panel: se reconoce sin leer. */}
              <PuntoDeCuenta cuenta={c} />
              <span className="truncate">{c.nombre}</span>
            </button>
          );
        })}
        {chipsDeOtras}
      </div>
      {/* Con una en otra moneda tocada, lo que sigue lo dice MontoEnCuenta. */}
      {otraMarcada ? null : marcada
        ? <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{t.cobro.enQueCuentaDetalle}</p>
        : <p className="mt-1.5 text-[12px] font-medium leading-snug text-ambar">{aviso}</p>}
    </div>
  );
}

/**
 * CUÁNTO SALIÓ (O ENTRÓ) EN LA MONEDA DE LA CUENTA (131).
 *
 * Pagaste la suscripción con la tarjeta en dólares: el gasto se guarda en
 * guaraníes, como todos (la ganancia, el cierre y los reportes no se
 * enteran), pero de la cuenta salieron dólares, y cuántos lo sabe solo quien
 * pagó. Orden no lo calcula por su cuenta: con una cotización guardada lo
 * PROPONE, y la persona lo confirma o lo pisa con lo que dice su resumen.
 * Sin ese importe no se puede guardar (la base tampoco lo deja).
 *
 * Debajo, el cambio que resulta de los dos importes («US$ 1 = Gs. 7.300»),
 * en ámbar si se aleja mucho del que la persona escribió: casi siempre es un
 * cero de más o de menos. Avisa, no frena.
 */
export function MontoEnCuenta({
  cuenta, propia, montoPropio, valor, alCambiar, sentido = 'sale', deshabilitado = false, conNombre = false,
}: {
  /** La cuenta tocada, con su moneda y su cotización. */
  cuenta: CuentaParaElegir;
  /** La moneda del negocio. */
  propia: string;
  /** Lo que se guarda como gasto o ingreso, en la moneda del negocio. */
  montoPropio: number;
  /** El importe en la moneda de la cuenta. */
  valor: number;
  alCambiar: (n: number) => void;
  sentido?: SentidoPlata;
  deshabilitado?: boolean;
  /** Arriba, el nombre de la cuenta: para cuando este bloque queda a la vista sin los chips. */
  conNombre?: boolean;
}) {
  const t = useTextos();
  const c = t.monedas.cobro;
  const locale = useLocale();
  const monedaCuenta = cuenta.moneda ?? propia;
  const nombre = (codigo: string) => t.gastosCampana.moneda.nombres[codigo] ?? codigo;
  const sale = sentido === 'sale';
  const resultante = cambioQueResulta(montoPropio, propia, valor, monedaCuenta);
  const guardada = Number(cuenta.cotizacion) > 0 ? cotizacionEscrita(Number(cuenta.cotizacion), propia, monedaCuenta) : null;
  const raro = resultante !== null && cambioRaro(resultante, guardada);
  const partes = resultante !== null ? textoDelCambio(resultante, propia, monedaCuenta, locale) : null;

  return (
    <div className="rounded-2xl border border-borde/70 bg-arena/40 p-3.5 aparecer">
      {/* De qué cuenta se habla, cuando los chips de las cuentas están plegados. */}
      {conNombre && (
        <p className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-tinta/70">
          <PuntoDeCuenta cuenta={cuenta} />
          <span className="min-w-0 truncate">{cuenta.nombre} · {simboloDe(monedaCuenta)}</span>
        </p>
      )}
      <label className="block">
        <span className="etiqueta">{sale ? c.cuantoSalioEn(nombre(monedaCuenta)) : c.cuantoEntroEn(nombre(monedaCuenta))}</span>
        <CampoMonto
          className="campo" disabled={deshabilitado}
          decimales={decimalesDe(monedaCuenta)} placeholder={dinero(0, monedaCuenta, true, locale)}
          valor={valor} alCambiar={(n) => alCambiar(Math.max(0, n))}
        />
      </label>
      {partes && (
        <p className={`mt-2 text-[13px] font-semibold tabular-nums ${raro ? 'text-ambar' : 'text-tinta/70'}`}>
          {t.monedas.billetera.cambio(partes.uno, partes.vale)}
        </p>
      )}
      {raro && (
        <p className="mt-2 rounded-lg bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
          {t.monedas.billetera.cambioRaroAviso}
        </p>
      )}
      <p className="mt-2 text-[12px] leading-snug text-tinta/45">
        {sale ? c.seGuardaEn(nombre(propia)) : c.seGuardaEnIngreso(nombre(propia))}
      </p>
    </div>
  );
}

/**
 * LA CUENTA DE UN FIADO (084), CON LOS MISMOS CHIPS.
 *
 * Acá «ninguna» es una respuesta y no un olvido: fiar mercadería no saca plata
 * de ninguna cuenta, y lo que te devuelven en efectivo, si no llevás caja en
 * Orden, no tiene dónde entrar. Por eso arranca en «ninguna» y la cuenta se
 * toca a propósito: mover el saldo de alguien sin que lo pida es peor que no
 * moverlo. Lo usan Fiado y la revisión de lo dictado.
 */
export function ElegirCuentaOpcional({
  cuentas, elegida, alElegir, pregunta, ninguna, detalle, deshabilitado = false,
}: {
  cuentas: CuentaParaElegir[];
  /** '' = ninguna. */
  elegida: string;
  alElegir: (cuenta: string) => void;
  pregunta: string;
  /** El chip de «ninguna»: «No salió plata», «No mover ningún saldo». */
  ninguna: string;
  /** La línea de abajo, según lo marcado. */
  detalle?: string;
  deshabilitado?: boolean;
}) {
  if (cuentas.length === 0) return null;
  return (
    <div role="group" aria-label={pregunta}>
      <span className="etiqueta">{pregunta}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        <button type="button" disabled={deshabilitado} aria-pressed={elegida === ''}
          onClick={() => alElegir('')}
          className={`${elegida === '' ? 'chip-encendido' : 'chip-apagado'} disabled:opacity-50`}>
          {ninguna}
        </button>
        {cuentas.map((c) => (
          <button key={c.id} type="button" disabled={deshabilitado} aria-pressed={elegida === c.id}
            onClick={() => alElegir(c.id)}
            className={`${elegida === c.id ? 'chip-encendido' : 'chip-apagado'} max-w-full gap-1.5 disabled:opacity-50`}>
            <PuntoDeCuenta cuenta={c} />
            <span className="truncate">{c.nombre}</span>
          </button>
        ))}
      </div>
      {detalle && <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{detalle}</p>}
    </div>
  );
}

function PuntoDeCuenta({ cuenta }: { cuenta: CuentaParaElegir }) {
  return (
    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/70"
      style={{ backgroundColor: tonoDeCuenta(cuenta) }} />
  );
}
