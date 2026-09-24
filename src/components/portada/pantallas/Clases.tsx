import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra, Tilde } from './Celular';

/**
 * EL PANEL DE UN PROFE (PanelProfe.tsx, 092): las clases de hoy con la que ya
 * se dio marcada, lo cobrado, lo que falta cobrar y un paquete (088) con las
 * clases que le quedan al alumno. Sin «vendido» ni «ganancia bruta»: un
 * profe no vende mercadería.
 */
export function PantallaClases({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.clases;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      derecha={v.hoy}
      mas={v.barra.mas}
      activa={0}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'agenda', texto: v.barra.agenda },
        { icono: 'clientes', texto: v.barra.alumnos },
        { icono: 'gastos', texto: v.barra.gastos },
      ]}
    >
      <Entra paso={0}>
        <section className="tarjeta overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3.5 pb-1 pt-3">
            <p className="text-[13px] font-bold tracking-tight">{p.clasesDeHoy}</p>
            <span className="text-[10.5px] font-semibold text-verde-fuerte">{p.verAgenda}</span>
          </div>
          <ul className="divide-y divide-borde">
            {p.clases.map((c) => (
              <li key={c.hora} className="flex items-center justify-between gap-2 px-3.5 py-2">
                <span className="flex min-w-0 items-baseline gap-2.5">
                  <span className="shrink-0 text-[13px] font-bold tabular-nums">{c.hora}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{c.alumno}</span>
                    <span className="block truncate text-[10.5px] text-tinta/60">{c.materia}</span>
                  </span>
                </span>
                {c.dada && (
                  <span className="pastilla shrink-0 bg-verde px-2 py-0.5 text-[10px] text-sobre-verde">
                    <Tilde className="h-3 w-3" />{p.claseDada}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </Entra>

      <Entra paso={1}>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="tarjeta p-3 ring-1 ring-verde/25">
            <p className="text-[10.5px] font-semibold text-tinta/60">{p.cobrado}</p>
            <p className="mt-1 font-titulo text-[19px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">
              {p.cobradoMonto}
            </p>
            <p className="mt-1.5 text-[10px] text-tinta/60">{p.clasesDadas}</p>
          </div>
          <div className="tarjeta p-3">
            <p className="text-[10.5px] font-semibold text-tinta/60">{p.porCobrar}</p>
            <p className="mt-1 font-titulo text-[19px] font-extrabold leading-none tracking-tight tabular-nums text-rojo">
              {p.porCobrarMonto}
            </p>
            <p className="mt-1.5 text-[10px] text-tinta/60">{p.teDeben}</p>
          </div>
        </div>
      </Entra>

      <Entra paso={2}>
        <div className="tarjeta p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[12.5px] font-semibold">{p.paquete}</p>
            <span className="pastilla shrink-0 bg-ambar-claro px-2 py-0.5 text-[10px] text-ambar">{p.quedan}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-borde">
            <div className="h-full w-3/4 rounded-full bg-verde" />
          </div>
          <p className="mt-1.5 text-[10.5px] text-tinta/60">{p.usadas}</p>
        </div>
      </Entra>
    </Celular>
  );
}
