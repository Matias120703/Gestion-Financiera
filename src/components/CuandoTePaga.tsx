'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTextos } from '@/i18n/cliente';
import { type Moneda, decimalesDe, dinero, vistaDe } from '@/lib/formato';
import { sumarDias } from '@/lib/fechas';
import {
  MAX_CUOTAS, ajustarPlan, armarPlan, esFecha, fechaCorta, leerPlan, sumarPeriodo,
} from '@/lib/cuotas';
import type { CadaCuota, Plan } from '@/lib/tipos';

/**
 * «¿CUÁNDO TE PAGA?» (127)
 *
 * Matías: «una venta a crédito puede llevar fecha de cobro, una sola o en
 * cuotas». Y lo de siempre —«me debe y punto»— tiene que seguir igual.
 *
 * Por eso son tres botones y arranca en «Sin fecha»: el que fía en el
 * mostrador apurado no ve un paso nuevo. «Una fecha» es un plan de una sola
 * cuota; «En cuotas» pide cuántas, cada cuánto y la primera.
 *
 * LOS BOTONES VAN EN UNA GRILLA, TODOS A LA VISTA. En una fila que se
 * desliza, en un teléfono de 375 px el tercero («En cuotas») quedaba
 * cortado y, al elegirlo, se cortaba el primero: la pregunta entera tiene
 * que leerse sin mover nada. Por eso acá no va `FilaDeslizable`.
 *
 * NO HAY TEXTO DE AYUDA. La línea de abajo —«3 × 150.000 · 15/11 · 15/12 ·
 * 15/01»— es la explicación: se ve lo que va a quedar antes de guardarlo.
 *
 * NO GUARDA NADA PROPIO. Qué botón está elegido, cuántas cuotas y cada
 * cuánto se LEEN del plan (`valor`), que es lo que se va a mandar a la base.
 * En Vender esta pieza está dos veces en la página (el carrito del costado y
 * el del celular): con un estado propio, una de las dos pisaría a la otra.
 *
 * Devuelve el `p_plan` listo, o null = sin fecha.
 */
/**
 * Un chip dentro de la grilla: ocupa su columna entera y, si la palabra no
 * entra (el «Em parcelas» del portugués en un teléfono angosto), baja a dos
 * renglones en vez de salirse del botón.
 */
const CHIP_EN_GRILLA = 'w-full min-w-0 px-1.5 text-center text-[13.5px] leading-tight';

export function CuandoTePaga({
  total, hoy, moneda, valor, alCambiar, sinChipSinFecha = false, deshabilitado = false,
}: {
  /** Lo que se reparte: el total de la venta o el monto de la línea fiada. */
  total: number;
  /** Hoy en la zona del negocio, 'YYYY-MM-DD'. */
  hoy: string;
  moneda: Moneda;
  valor: Plan | null;
  alCambiar: (p: Plan | null) => void;
  /** En «Ponerle fecha» no se ofrece «Sin fecha»: para eso está «Quitar las cuotas». */
  sinChipSinFecha?: boolean;
  deshabilitado?: boolean;
}) {
  const t = useTextos();
  const locale = useLocale();
  const idTitulo = useId();
  const idCuantas = useId();
  const idPrimera = useId();
  const campoFecha = useRef<HTMLInputElement>(null);
  const propia = vistaDe(moneda).propia;
  const dec = decimalesDe(propia);
  const plata = (n: number) => dinero(n, propia, true, locale);

  const modo: 'sin' | 'una' | 'cuotas' = !valor || valor.length === 0 ? 'sin' : valor.length === 1 ? 'una' : 'cuotas';
  const leido = valor && valor.length > 0 ? leerPlan(valor) : null;

  // El total cambió con el plan ya elegido (se sumó un producto al carrito,
  // se corrigió el monto): mismas fechas, montos repartidos de nuevo.
  // `ajustarPlan` devuelve el mismo arreglo si ya suma, así que esto no gira.
  useEffect(() => {
    if (!valor || valor.length === 0) return;
    const ajustado = ajustarPlan(valor, total, dec);
    if (ajustado !== valor) alCambiar(ajustado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, dec, valor]);

  // Lo que se está tecleando en «Cuántas». Va aparte del plan para que se
  // pueda borrar el número y escribir otro sin que el campo rebote a «2».
  const [cuantasTexto, setCuantasTexto] = useState(String(leido?.cuotas ?? 3));
  useEffect(() => {
    if (modo === 'cuotas' && leido) setCuantasTexto(String(leido.cuotas));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, leido?.cuotas]);

  function unaFecha(fecha: string) {
    if (!esFecha(fecha)) return;
    alCambiar(armarPlan({ total, cuotas: 1, cada: 'mes', primera: fecha, decimales: dec }));
  }

  function enCuotas(cambio: Partial<{ cuotas: number; cada: CadaCuota; primera: string }>) {
    // Al entrar: 3 cuotas, una por mes, la primera dentro de un mes.
    const base = modo === 'cuotas' && leido
      ? leido
      : { cuotas: 3, cada: 'mes' as CadaCuota, primera: sumarPeriodo(hoy, 'mes', 1) };
    const nuevo = { ...base, ...cambio };
    // Cambiar «cada» sin haber tocado la fecha corre la primera a un período
    // de hoy: «cada semana» con la primera dentro de un mes no es lo que quiso.
    if (cambio.cada && !cambio.primera && base.primera === sumarPeriodo(hoy, base.cada, 1)) {
      nuevo.primera = sumarPeriodo(hoy, cambio.cada, 1);
    }
    if (!esFecha(nuevo.primera)) return;
    const cuotas = Math.min(MAX_CUOTAS, Math.max(2, Math.floor(nuevo.cuotas)));
    alCambiar(armarPlan({ total, cuotas, cada: nuevo.cada, primera: nuevo.primera, decimales: dec }));
  }

  const MODOS: { clave: 'sin' | 'una' | 'cuotas'; nombre: string; elegir: () => void }[] = [
    ...(sinChipSinFecha ? [] : [{ clave: 'sin' as const, nombre: t.fiado.sinFecha, elegir: () => alCambiar(null) }]),
    { clave: 'una', nombre: t.fiado.unaFecha, elegir: () => unaFecha(leido?.primera && modo !== 'sin' ? leido.primera : sumarDias(hoy, 30)) },
    { clave: 'cuotas', nombre: t.fiado.enCuotas, elegir: () => enCuotas({}) },
  ];

  const RAPIDAS = [7, 15, 30];
  const fechaUna = modo === 'una' && leido ? leido.primera : '';
  const esRapida = RAPIDAS.some((n) => sumarDias(hoy, n) === fechaUna);

  const CADAS: { clave: CadaCuota; nombre: string }[] = [
    { clave: 'semana', nombre: t.fiado.cadaSemana },
    { clave: 'quincena', nombre: t.fiado.cadaQuincena },
    { clave: 'mes', nombre: t.fiado.cadaMes },
  ];

  // «3 × 150.000 · 15/11 · 15/12 · 15/01»; con más de cuatro, de punta a punta.
  let vista = '';
  if (modo === 'cuotas' && valor && total > 0) {
    const n = valor.length;
    const monto = plata(valor[0].monto);
    vista = n <= 4
      ? t.fiado.vistaPrevia(n, monto, valor.map((c) => fechaCorta(c.vence_el, hoy)).join(' · '))
      : t.fiado.vistaPreviaLarga(n, monto, fechaCorta(valor[0].vence_el, hoy), fechaCorta(valor[n - 1].vence_el, hoy));
  }

  return (
    <div className="aparecer">
      <p id={idTitulo} className="etiqueta">{t.fiado.cuandoTePaga}</p>
      <div role="group" aria-labelledby={idTitulo} className={`grid gap-2 ${MODOS.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {MODOS.map((m) => (
          <button
            key={m.clave} type="button" disabled={deshabilitado}
            onClick={() => { if (modo !== m.clave) m.elegir(); }}
            aria-pressed={modo === m.clave}
            className={`${modo === m.clave ? 'chip-encendido' : 'chip-apagado'} ${CHIP_EN_GRILLA}`}
          >
            {m.nombre}
          </button>
        ))}
      </div>

      {modo === 'una' && (
        <div className="mt-2.5 space-y-2.5 aparecer">
          <div role="group" aria-label={t.fiado.unaFecha} className="grid grid-cols-2 gap-2">
            {RAPIDAS.map((n) => {
              const f = sumarDias(hoy, n);
              return (
                <button
                  key={n} type="button" disabled={deshabilitado} onClick={() => unaFecha(f)}
                  aria-pressed={fechaUna === f}
                  className={`${fechaUna === f ? 'chip-encendido' : 'chip-apagado'} ${CHIP_EN_GRILLA}`}
                >
                  {t.fiado.enDias(n)}
                </button>
              );
            })}
            <button
              type="button" disabled={deshabilitado} aria-pressed={!esRapida}
              className={`${!esRapida ? 'chip-encendido' : 'chip-apagado'} ${CHIP_EN_GRILLA}`}
              onClick={() => {
                // Abre el calendario del campo de abajo. Donde el navegador
                // no lo deja, alcanza con dejar el foco ahí.
                const c = campoFecha.current;
                if (!c) return;
                c.focus();
                try { c.showPicker?.(); } catch { /* sin calendario propio: se escribe */ }
              }}
            >
              {t.fiado.elegir}
            </button>
          </div>
          <input
            ref={campoFecha} type="date" className="campo py-2.5" disabled={deshabilitado}
            aria-label={t.fiado.unaFecha}
            value={fechaUna} onChange={(e) => unaFecha(e.target.value)}
          />
        </div>
      )}

      {modo === 'cuotas' && leido && (
        <div className="mt-2.5 space-y-2.5 aparecer">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="min-w-0">
              <label htmlFor={idCuantas} className="etiqueta">{t.fiado.cuantas}</label>
              <div className="flex items-center rounded-xl border border-borde bg-superficie">
                <button
                  type="button" aria-label={t.fiado.unaMenos} disabled={deshabilitado || leido.cuotas <= 2}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-l-xl text-[20px] text-tinta/50 active:bg-arena disabled:opacity-30"
                  onClick={() => enCuotas({ cuotas: leido.cuotas - 1 })}
                >−</button>
                <input
                  id={idCuantas} type="number" inputMode="numeric" min={2} max={MAX_CUOTAS} step={1}
                  disabled={deshabilitado}
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-center text-[16px] font-bold tabular-nums text-tinta outline-none"
                  value={cuantasTexto}
                  onChange={(e) => {
                    setCuantasTexto(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 2 && n <= MAX_CUOTAS) enCuotas({ cuotas: n });
                  }}
                  onBlur={() => setCuantasTexto(String(leido.cuotas))}
                />
                <button
                  type="button" aria-label={t.fiado.unaMas} disabled={deshabilitado || leido.cuotas >= MAX_CUOTAS}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-r-xl text-[20px] text-tinta/50 active:bg-arena disabled:opacity-30"
                  onClick={() => enCuotas({ cuotas: leido.cuotas + 1 })}
                >+</button>
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor={idPrimera} className="etiqueta">{t.fiado.laPrimera}</label>
              <input
                id={idPrimera} type="date" className="campo min-w-0 py-2.5" disabled={deshabilitado}
                value={leido.primera} onChange={(e) => enCuotas({ primera: e.target.value })}
              />
            </div>
          </div>

          <div>
            <span className="etiqueta">{t.fiado.cada}</span>
            <div role="group" aria-label={t.fiado.cada} className="grid grid-cols-3 gap-2">
              {CADAS.map((c) => (
                <button
                  key={c.clave} type="button" disabled={deshabilitado}
                  onClick={() => enCuotas({ cada: c.clave })}
                  aria-pressed={leido.cada === c.clave}
                  className={`${leido.cada === c.clave ? 'chip-encendido' : 'chip-apagado'} ${CHIP_EN_GRILLA}`}
                >
                  {c.nombre}
                </button>
              ))}
            </div>
          </div>

          {vista && (
            <p className="rounded-xl bg-arena px-3 py-2.5 text-[13.5px] font-semibold tabular-nums text-tinta/75" aria-live="polite">
              {vista}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
