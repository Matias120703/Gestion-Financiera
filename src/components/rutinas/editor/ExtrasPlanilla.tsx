'use client';

import { useMemo, type ReactNode } from 'react';
import { useTextos } from '@/i18n/cliente';
import { seriesRaras, type ResultadoPlanilla } from '@/lib/rutina-planilla';
import type { RutinaLeidaConNotas } from '@/lib/rutina-texto';

/**
 * LO QUE UNA PLANILLA SUMA ARRIBA DE LA REVISIÓN (114).
 *
 * Lo comparten «Subir planilla» y «Pegar texto» (lo pegado de un Excel o de
 * Google Sheets también es una planilla): las hojas que no se usaron, el
 * selector de semana si trae varias, y los avisos. Así lo que no se usó
 * nunca se pierde en silencio: una columna «Semana 2» o «Nombre: Juan» que
 * no pasan a la rutina se nombran acá.
 *
 * «12 × 3» (series al revés) se recalcula sobre lo que se ve, después de
 * cada «Dar vuelta». Sin nada que mostrar no dibuja nada.
 *
 * Las hojas (30/09): por defecto se usa solo la que parece la rutina; un
 * registro, el progreso corporal, un resumen o una guía quedan afuera, y una
 * línea lo dice. Las hojas con ejercicios son botones (`onHoja`): el trainer
 * suma la que quiera o saca una (nunca la última que queda).
 */
export function ExtrasPlanilla({
  resultado, leida, onSemana, onDarVuelta, onHoja, children,
}: {
  resultado: ResultadoPlanilla;
  /** Lo que se ve: el resultado con los «Dar vuelta» ya tocados. */
  leida: RutinaLeidaConNotas;
  onSemana: (semana: number) => void;
  onDarVuelta: (dia: number, indice: number) => void;
  /** Sumar o sacar esa hoja (por su nombre). Sin esto, las hojas solo se muestran. */
  onHoja?: (nombre: string, usar: boolean) => void;
  /** Botones propios de quien lo usa («Editar como texto», «Elegir otro archivo»). */
  children?: ReactNode;
}) {
  const t = useTextos();
  const i = t.rutinasEditor.importar;
  const raras = useMemo(() => seriesRaras(leida), [leida]);
  const lista = (nombres: string[]) => nombres.map((n) => `«${n}»`).join(', ');
  const chip = (encendido: boolean) => `${encendido ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13px]`;
  const avisos = resultado.avisos.filter((a) => a.codigo !== 'series_raras');
  const usadasConEjercicios = resultado.hojas.filter((h) => h.usada && h.conEjercicios).length;
  const noUsadas = resultado.hojas.filter((h) => !h.usada && h.conEjercicios).map((h) => h.nombre);
  // «No usamos las hojas Registro, Progreso, Resumen y Guía. Tocá una para sumarla.»
  const lineaNoUsadas = !noUsadas.length ? '' : [
    noUsadas.length === 1
      ? i.hojaNoUsadaConEjercicios(noUsadas[0])
      : i.hojasNoUsadas(noUsadas.slice(0, -1).join(', '), noUsadas[noUsadas.length - 1]),
    onHoja ? (noUsadas.length === 1 ? i.tocalaParaSumarla : i.tocaUnaParaSumarla) : '',
  ].filter(Boolean).join(' ');

  if (resultado.hojas.length <= 1 && !resultado.semanas && !avisos.length && !raras.length && !children) return null;

  return (
    <div className="space-y-2.5">
      {resultado.hojas.length > 1 && (
        <div className="space-y-1.5">
          <ul className="flex flex-wrap gap-1.5" aria-label={i.hojas}>
            {resultado.hojas.map((h, k) => (h.conEjercicios && onHoja ? (
              <li key={k}>
                <button
                  type="button" aria-pressed={h.usada}
                  // La última hoja que queda no se saca: sin ninguna no hay rutina.
                  disabled={h.usada && usadasConEjercicios <= 1}
                  onClick={() => onHoja(h.nombre, !h.usada)}
                  className={`${chip(h.usada)} min-h-[40px] max-w-full`}
                >
                  <span className="truncate">{h.usada ? `✓ ${h.nombre}` : h.nombre}</span>
                </button>
              </li>
            ) : (
              <li key={k} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${h.usada ? 'bg-verde-claro text-verde-fuerte' : 'bg-arena text-tinta/50'}`}>
                {h.usada || h.conEjercicios ? h.nombre : i.hojaNoUsada(h.nombre)}
              </li>
            )))}
          </ul>
          {lineaNoUsadas && <p className="text-[12.5px] leading-snug text-tinta/55">{lineaNoUsadas}</p>}
        </div>
      )}

      {resultado.semanas && (
        <div className="rounded-xl border border-borde/70 px-3 py-2.5">
          <p className="text-[13px] font-semibold">{i.semanaElegida(resultado.semanas.elegida, resultado.semanas.cuantas)}</p>
          <div className="scroll-limpio -mx-3 mt-2 flex gap-2 overflow-x-auto px-3" role="group" aria-label={i.semana}>
            {resultado.semanas.nombres.map((nombre, k) => (
              <button
                key={k} type="button" title={nombre} aria-pressed={resultado.semanas?.elegida === k + 1}
                onClick={() => onSemana(k + 1)}
                className={`${chip(resultado.semanas?.elegida === k + 1)} min-h-[40px] shrink-0`}
              >
                {`${i.semana} ${k + 1}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {avisos.map((a, k) => {
        const caja = 'rounded-xl bg-ambar-claro px-3 py-2.5 text-[12.5px] leading-snug text-tinta/80';
        switch (a.codigo) {
          case 'fecha_corregida': return <p key={k} className={caja}>{i.avisos.fechaCorregida(lista(a.ejercicios))}</p>;
          case 'cargas_sin_unidad': return <p key={k} className={caja}>{i.avisos.cargasSinUnidad}</p>;
          case 'datos_no_usados': return <p key={k} className="text-[12.5px] text-tinta/55">{i.avisos.datosNoUsados(a.etiquetas.join(', '))}</p>;
          case 'filas_recortadas': return <p key={k} className={caja}>{i.avisos.filasRecortadas}</p>;
          case 'videos': return <p key={k} className="text-[12.5px] text-tinta/55">▶ {i.avisos.videos(a.cuantos)}</p>;
        }
        return null;
      })}

      {raras.length > 0 && (
        <div className="rounded-xl bg-ambar-claro px-3 py-2.5">
          <p className="text-[12.5px] leading-snug text-tinta/80">{i.avisos.seriesRaras(lista(raras.map((r) => r.nombre)))}</p>
          <ul className="mt-1.5 space-y-1">
            {raras.map((r) => (
              <li key={`${r.dia}-${r.indice}`}>
                <button
                  type="button" onClick={() => onDarVuelta(r.dia, r.indice)}
                  className="boton-texto min-h-[40px] text-left text-[13px]"
                >
                  {`${i.avisos.darVuelta} · ${r.nombre}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {children}
    </div>
  );
}
