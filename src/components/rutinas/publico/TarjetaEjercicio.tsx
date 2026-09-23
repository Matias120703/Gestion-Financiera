'use client';

import { useTextos } from '@/i18n/cliente';
import { formatoDescanso } from '@/lib/rutina-texto';
import type { RutinaPublica } from '@/lib/tipos-rutinas';

type ConRutina = Extract<RutinaPublica, { existe: true }>;
export type EjercicioPublico = NonNullable<ConRutina['rutina']>['dias'][number]['ejercicios'][number];

/**
 * UN EJERCICIO, COMO LO LEE EL CLIENTE EN EL GIMNASIO (098).
 *
 * Con el celular en una mano, entre serie y serie, a un brazo de distancia:
 * el nombre grande, «4 × 8-10» más grande todavía y con números que no
 * bailan, y la carga y el descanso con su nombre al lado. La carga va TAL
 * CUAL la escribió el trainer: «40» queda «40», sin agregarle «kg» (en
 * muchos gimnasios las mancuernas son de libras, y leer «25 kg» donde eran
 * libras puede lastimar).
 *
 * El botón de «Hecho» ocupa todo el ancho: se toca con el pulgar sin
 * apuntar. La tarjeta hecha se atenúa pero no se tacha: se tiene que poder
 * leer igual si la quiere repasar.
 *
 * El video se abre afuera, en otra pestaña, sin incrustarlo, y sin decirle
 * a YouTube o a Instagram de qué link venía (`noreferrer`): la dirección
 * del link es la llave de la rutina.
 */
export function TarjetaEjercicio({
  ejercicio: e, etiqueta, hecho, alAlternar,
}: {
  ejercicio: EjercicioPublico;
  /** «1», «2a», «2b». */
  etiqueta: string;
  hecho: boolean;
  alAlternar: () => void;
}) {
  const t = useTextos();
  const r = t.rutinaPublica;
  const c = t.rutinasComun;

  const reps = (e.reps ?? '').trim();
  const conSeries = e.series !== null && e.series !== undefined;
  const principal = conSeries && reps ? `${e.series} × ${reps}` : conSeries ? `${e.series} ${c.texto.series}` : reps;
  const carga = (e.carga ?? '').trim();
  const nota = (e.nota ?? '').trim();
  const como = (e.como ?? '').trim();
  // La base solo acepta videos que empiezan con https://; se vuelve a
  // mirar acá porque es un link que se toca desde una página pública.
  const video = e.video && /^https:\/\/\S+$/i.test(e.video) ? e.video : null;
  const hayDescanso = e.descanso_seg !== null && e.descanso_seg !== undefined;

  return (
    <article className="tarjeta p-4">
      <div className={`transition-opacity ${hecho ? 'opacity-50' : ''}`}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-8 min-w-8 shrink-0 place-items-center rounded-full bg-arena px-2 text-[14px] font-bold tabular-nums text-tinta/70"
          >
            {etiqueta}
          </span>
          <h3 className="min-w-0 flex-1 break-words text-[20px] font-bold leading-snug">{e.nombre}</h3>
        </div>

        {principal && (
          <p className="mt-2 font-titulo text-[22px] font-extrabold leading-tight tabular-nums">{principal}</p>
        )}

        {(carga || hayDescanso) && (
          <dl className="mt-3 grid grid-cols-2 gap-2">
            {carga && (
              <div className="rounded-2xl bg-arena px-3 py-2">
                <dt className="text-[12.5px] font-semibold text-tinta/55">{c.texto.carga}</dt>
                <dd className="break-words text-[17px] font-bold tabular-nums">{carga}</dd>
              </div>
            )}
            {hayDescanso && (
              <div className="rounded-2xl bg-arena px-3 py-2">
                <dt className="text-[12.5px] font-semibold text-tinta/55">{c.texto.descanso}</dt>
                <dd className="text-[17px] font-bold tabular-nums">
                  {e.descanso_seg === 0 ? r.sinDescanso : formatoDescanso(e.descanso_seg)}
                </dd>
              </div>
            )}
          </dl>
        )}

        {nota && <p className="mt-3 whitespace-pre-line break-words text-[16px] leading-relaxed">{nota}</p>}

        {video && (
          <a
            href={video}
            target="_blank"
            rel="noopener noreferrer"
            className="boton-suave mt-3 min-h-[48px] w-full text-[15px]"
          >
            <span aria-hidden>▶</span>
            {c.acciones.verComoSeHace}
          </a>
        )}

        {como && (
          <details className="group mt-2">
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 text-[15px] font-semibold text-verde-fuerte [&::-webkit-details-marker]:hidden">
              {r.comoSeHace}
              <span aria-hidden className="text-[13px] transition-transform group-open:rotate-180">▼</span>
            </summary>
            <p className="whitespace-pre-line break-words pb-1 text-[16px] leading-relaxed text-tinta/75">{como}</p>
          </details>
        )}
      </div>

      <button
        type="button"
        onClick={alAlternar}
        aria-pressed={hecho}
        aria-label={r.marcarAria(e.nombre)}
        className={`boton mt-3 min-h-[48px] w-full text-[16px] ${
          hecho ? 'bg-verde text-sobre-verde' : 'border border-borde bg-superficie text-tinta/75'
        }`}
      >
        <span aria-hidden>{hecho ? '✓' : '○'}</span>
        {hecho ? r.hecho : r.marcarHecho}
      </button>
    </article>
  );
}
