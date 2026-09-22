'use client';

import { useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import { tonoDeCuenta } from '@/lib/colores-cuenta';
import type { CuentaParaElegir } from '@/lib/tipos';

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

/**
 * Dónde puede caer un cobro según cómo se pagó: la plata en mano va a una
 * cuenta de efectivo; una transferencia o una tarjeta, a un banco o a una
 * billetera del celular. Ofrecer «Efectivo» para una transferencia sería
 * ofrecer un error.
 *
 * La cuenta que reclama esa forma de pago entra siempre, sea del tipo que
 * sea: es la que el dueño eligió en su billetera. Lo fiado no entra en
 * ninguna —todavía no te pagaron—, y «otro» puede ser cualquiera.
 */
export function cuentasDelMetodo(cuentas: CuentaParaElegir[], metodo: string): CuentaParaElegir[] {
  if (metodo === 'credito') return [];
  if (metodo === 'otro') return cuentas;
  const tipos = metodo === 'efectivo' ? ['efectivo'] : ['banco', 'billetera'];
  return cuentas.filter((c) => tipos.includes(c.tipo) || (c.metodos ?? []).includes(metodo));
}

/**
 * La cuenta que se manda al cobrar.
 *
 * La elegida a mano, si sirve para esa forma de pago. Si no, la que reclama
 * esa forma de pago (la de siempre, 074). Y si ninguna la reclama pero hay
 * una sola donde puede caer, esa: con un solo banco, una transferencia no
 * tiene otro lugar adonde ir, y dejarla afuera de la billetera es peor.
 */
export function cuentaDelCobro(cuentas: CuentaParaElegir[], metodo: string, elegida: string | null): string | null {
  const posibles = cuentasDelMetodo(cuentas, metodo);
  if (elegida && posibles.some((c) => c.id === elegida)) return elegida;
  const reclama = posibles.find((c) => (c.metodos ?? []).includes(metodo));
  if (reclama) return reclama.id;
  return posibles.length === 1 ? posibles[0].id : null;
}

/**
 * CÓMO TE PAGÓ Y A QUÉ CUENTA ENTRÓ (095).
 *
 * Matías: «si se me transfirió en mi Continental y en Orden se me carga en
 * el Atlas, no tiene sentido». Cada forma de pago cae sola en una cuenta
 * (074), y con un banco alcanza. Con dos o más, «transferencia» no dice a
 * cuál: acá se elige, y arranca marcada la de siempre para que el caso
 * común siga siendo un toque.
 *
 * Con una sola cuenta posible no se pregunta nada: no hay nada que elegir.
 */
export function FormaDeCobro({
  cuentas, metodo, alElegirMetodo, elegida, alElegirCuenta, conPregunta = false, deshabilitado = false,
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
        alElegir={alElegirCuenta} deshabilitado={deshabilitado}
      />
    </div>
  );
}

/**
 * Solo la pregunta de la cuenta, para una pantalla que ya pregunta la forma
 * de pago a su manera (la de Cobrar). Con una sola cuenta posible no se
 * dibuja: no hay nada que elegir.
 */
export function ElegirCuenta({
  cuentas, metodo, elegida, alElegir, deshabilitado = false,
}: {
  cuentas: CuentaParaElegir[];
  metodo: string;
  elegida: string | null;
  alElegir: (cuenta: string) => void;
  deshabilitado?: boolean;
}) {
  const t = useTextos();
  const posibles = cuentasDelMetodo(cuentas, metodo);
  if (posibles.length < 2) return null;
  const marcada = cuentaDelCobro(cuentas, metodo, elegida);

  return (
    <div>
      <span className="etiqueta">{t.cobro.enQueCuenta}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {posibles.map((c) => {
          const on = marcada === c.id;
          return (
            <button key={c.id} type="button" disabled={deshabilitado} aria-pressed={on}
              onClick={() => alElegir(c.id)}
              className={`${on ? 'chip-encendido' : 'chip-apagado'} max-w-full gap-1.5 disabled:opacity-50`}>
              {/* El color de la tarjeta del panel: se reconoce sin leer. */}
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/70"
                style={{ backgroundColor: tonoDeCuenta(c) }} />
              <span className="truncate">{c.nombre}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/45">{t.cobro.enQueCuentaDetalle}</p>
    </div>
  );
}
