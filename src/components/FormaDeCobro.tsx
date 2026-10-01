'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { tonoDeCuenta } from '@/lib/colores-cuenta';
import type { CuentaParaElegir } from '@/lib/tipos';
import { cuentasDelMetodo, cuentaDelCobro, esFiado, type SentidoPlata } from '@/lib/cuenta-del-cobro';

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
 */
export function ElegirCuenta({
  cuentas, metodo, elegida, alElegir, deshabilitado = false, sentido = 'entra',
}: {
  cuentas: CuentaParaElegir[];
  metodo: string;
  /** La cuenta tocada a mano; null = la de siempre para esa forma de pago. */
  elegida: string | null;
  alElegir: (cuenta: string) => void;
  deshabilitado?: boolean;
  /** «¿A qué cuenta entró?» (un cobro) o «¿De qué cuenta salió?» (un pago). */
  sentido?: SentidoPlata;
}) {
  const t = useTextos();
  // A quien no administra (lista vacía) no se le pregunta. Tampoco con lo que
  // entra fiado; un gasto con «crédito» sí: es la tarjeta, y hay que saber cuál.
  if (cuentas.length === 0 || esFiado(metodo, sentido)) return null;
  const posibles = cuentasDelMetodo(cuentas, metodo, sentido);
  const marcada = cuentaDelCobro(cuentas, metodo, elegida, sentido);
  const sale = sentido === 'sale';
  const vaA = (nombre: string) => (sale ? t.cobro.vaASalir(nombre) : t.cobro.vaAEntrar(nombre));

  if (posibles.length === 1) {
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
      </div>
      {marcada
        ? <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{t.cobro.enQueCuentaDetalle}</p>
        : <p className="mt-1.5 text-[12px] font-medium leading-snug text-ambar">{aviso}</p>}
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
