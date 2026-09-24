import type { TextosVitrina } from '@/i18n/textos/vitrina';
import { Celular, Entra } from './Celular';

/**
 * EL PRESUPUESTO DE UNA CUENTA PERSONAL (Organización, 024-031 y 085): lo
 * disponible hasta el próximo cobro, cuánto por día, el detalle del cálculo
 * y una cuota que vence.
 *
 * Los números cierran: 4.800.000 − 260.000 − 2.300.000 − 1.000.000 =
 * 1.240.000, y 1.240.000 en 30 días son unos 41.000 por día.
 */
export function PantallaPersonal({ v }: { v: TextosVitrina }) {
  const p = v.pantallas.personal;
  return (
    <Celular
      resumen={p.resumen}
      negocio={p.negocio}
      mas={v.barra.mas}
      activa={3}
      barra={[
        { icono: 'panel', texto: v.barra.panel },
        { icono: 'deudas', texto: v.barra.deudas },
        { icono: 'gastos', texto: v.barra.gastos },
        { icono: 'organizacion', texto: v.barra.presupuesto },
      ]}
    >
      <Entra paso={0}>
        <p className="px-1 text-[15px] font-bold tracking-tight">{p.titulo}</p>
      </Entra>

      <Entra paso={1}>
        <div className="tarjeta p-4 ring-1 ring-verde/25">
          <p className="text-[10.5px] font-bold uppercase tracking-[.14em] text-tinta/60">{p.disponible}</p>
          <p className="mt-1 font-titulo text-[27px] font-extrabold leading-none tracking-tight tabular-nums text-verde-fuerte">
            {p.monto}
          </p>
          <p className="mt-1.5 text-[10.5px] text-tinta/60">{p.hasta}</p>
          <div className="mt-2.5 rounded-xl bg-verde-claro px-3 py-2">
            <p className="text-[14px] font-bold tabular-nums text-verde-fuerte">{p.porDia}</p>
            <p className="text-[10px] text-tinta/60">{p.paraDias}</p>
          </div>
        </div>
      </Entra>

      <Entra paso={2}>
        <div className="tarjeta flex items-center justify-between gap-2 p-3.5">
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold">{p.cuota}</span>
            <span className="pastilla mt-1 bg-ambar-claro px-2 py-0.5 text-[10px] text-ambar">{p.vence}</span>
          </span>
          <span className="shrink-0 text-[13px] font-bold tabular-nums text-rojo">{p.cuotaMonto}</span>
        </div>
      </Entra>

      <Entra paso={3}>
        <div className="tarjeta p-3.5">
          <p className="text-[12.5px] font-bold tracking-tight">{p.detalle}</p>
          <dl className="mt-2 space-y-1.5">
            {p.filas.map((f) => (
              <div key={f.etiqueta} className="flex items-baseline justify-between gap-2 text-[11px]">
                <dt className="min-w-0 truncate font-semibold text-tinta/60">{f.etiqueta}</dt>
                <dd className={`shrink-0 font-bold tabular-nums ${f.tono === 'malo' ? 'text-rojo' : 'text-tinta'}`}>{f.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Entra>
    </Celular>
  );
}
