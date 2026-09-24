import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra, Tilde } from './Celular';

/**
 * LO QUE VE EL CLIENTE DEL TRAINER, desde el link de su rutina
 * (/rutina/[token], 098). No es la app: es la página que se abre desde
 * WhatsApp, sin cuenta y sin instalar nada. Por eso no tiene la cabecera ni
 * la barra de Orden, y copia la estética de TarjetaEjercicio.tsx.
 *
 * Encima flota la ficha del cliente con su progreso, que ve solo el trainer
 * (las medidas no salen en el link).
 */
export function PantallaEntrenamiento({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.entrenamiento;
  return (
    <Celular
      resumen={p.resumen}
      captura={false}
      encima={(
        // Centrada con `inset-x-0 mx-auto` y no con `-translate-x-1/2`: la
        // animación `aparecer` termina en `transform: none` y le borraría el
        // corrimiento (se veía corrida a la derecha y cortada).
        <div
          aria-hidden
          className="absolute inset-x-0 -bottom-6 mx-auto w-[236px] rounded-2xl border border-borde bg-superficie px-3.5 py-2.5
                     shadow-[0_18px_40px_-18px_rgba(10,23,18,.5)] motion-safe:animate-[aparecer_.5s_ease-out_.5s_both]"
        >
          <p className="text-[10.5px] font-semibold text-tinta/60">{p.fichaTitulo}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] font-bold tabular-nums text-verde-fuerte">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2}
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7l6 6 4-4 8 8" /><path d="M21 11v6h-6" />
            </svg>
            {p.fichaDato}
          </p>
        </div>
      )}
    >
      <Entra paso={0}>
        <div className="px-1 pt-1">
          <p className="text-[10.5px] font-semibold text-tinta/60">{p.estudio}</p>
          <p className="mt-0.5 font-titulo text-[24px] font-extrabold leading-tight tracking-tight">{p.hola}</p>
          <p className="text-[10.5px] text-tinta/60">{p.fechas}</p>
        </div>
      </Entra>

      <Entra paso={1}>
        <div className="flex gap-1.5 overflow-hidden">
          {p.dias.map((d, i) => (
            <span
              key={d}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                i === 0 ? 'border-verde bg-verde text-sobre-verde' : 'border-borde bg-superficie text-tinta/60'}`}
            >
              {d}
            </span>
          ))}
        </div>
        <p className="mt-2 px-1 text-[10.5px] font-semibold text-tinta/60">{p.hechos}</p>
      </Entra>

      {p.ejercicios.map((e, i) => (
        <Entra key={e.numero} paso={2 + i}>
          <article className="tarjeta p-3">
            <div className={e.hecho ? 'opacity-50' : ''}>
              <div className="flex items-start gap-2">
                <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-arena px-1.5 text-[11px] font-bold tabular-nums text-tinta/70">
                  {e.numero}
                </span>
                <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug">{e.nombre}</p>
              </div>
              <p className="mt-1 font-titulo text-[18px] font-extrabold leading-tight tabular-nums">{e.series}</p>
              <dl className="mt-2 grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-arena px-2.5 py-1.5">
                  <dt className="text-[10px] font-semibold text-tinta/60">{p.carga}</dt>
                  <dd className="text-[13px] font-bold tabular-nums">{e.carga}</dd>
                </div>
                <div className="rounded-xl bg-arena px-2.5 py-1.5">
                  <dt className="text-[10px] font-semibold text-tinta/60">{p.descanso}</dt>
                  <dd className="text-[13px] font-bold tabular-nums">{e.descanso}</dd>
                </div>
              </dl>
            </div>
            <span
              className={`mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-full text-[12.5px] font-semibold ${
                e.hecho ? 'bg-verde text-sobre-verde' : 'bg-verde-claro text-verde-fuerte'}`}
            >
              {e.hecho && <Tilde />}
              {e.hecho ? p.hecho : p.marcarHecho}
            </span>
          </article>
        </Entra>
      ))}
    </Celular>
  );
}
