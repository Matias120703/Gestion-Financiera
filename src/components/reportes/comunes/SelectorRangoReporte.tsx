'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import type { ClaveRangoReporte } from '@/lib/reportes/rango';

/**
 * EL SELECTOR DE RANGO DE LOS REPORTES (23/09).
 *
 * El de siempre (`SelectorRango`) más dos botones para la cuenta personal:
 * «Este ciclo» y «Ciclo pasado», que van de cobro a cobro. Es otro
 * componente y no una opción del de siempre porque ese lo usan el panel y el
 * reto, que no saben de ciclos, y porque sus etiquetas están fijas en
 * español (`ETIQUETAS_RANGO`): acá salen del diccionario, así en portugués
 * dicen «Este mês».
 *
 * `diaCobro`: el día que cobra la persona, o null si no mide por ciclo (un
 * negocio, o quien cobra el 1: su ciclo es el mes, y dos botones que hacen
 * lo mismo confunden). Con día, el ciclo va primero: es lo que más mira.
 */
type Rapido = Exclude<ClaveRangoReporte, 'personalizado' | 'semana_pasada'>;

export function SelectorRangoReporte({
  clave, desde, hasta, diaCobro = null,
}: {
  clave: ClaveRangoReporte;
  desde: string;
  hasta: string;
  diaCobro?: number | null;
}) {
  const t = useTextos();
  const r = t.reportesComunes.rango;
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  const etiquetas: Record<Rapido, string> = {
    ciclo: r.ciclo, ciclo_pasado: r.cicloPasado,
    hoy: r.hoy, ayer: r.ayer, semana: r.semana, mes: r.mes, mes_pasado: r.mesPasado, anio: r.anio, siempre: r.siempre,
  };
  const rapidos: Rapido[] = diaCobro
    ? ['ciclo', 'ciclo_pasado', 'mes', 'mes_pasado', 'anio', 'siempre']
    : ['hoy', 'ayer', 'semana', 'mes', 'mes_pasado', 'anio', 'siempre'];

  function aplicar(nueva: ClaveRangoReporte, custom?: { desde: string; hasta: string }) {
    const p = new URLSearchParams(params.toString());
    p.set('rango', nueva);
    if (nueva === 'personalizado' && custom) {
      p.set('desde', custom.desde);
      p.set('hasta', custom.hasta);
    } else {
      p.delete('desde');
      p.delete('hasta');
    }
    setAbierto(false);
    router.push(`${ruta}?${p.toString()}`);
  }

  const boton = (activo: boolean) => `flex min-h-[44px] shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold transition ${
    activo ? 'border-verde bg-verde text-sobre-verde' : 'border-borde bg-superficie text-tinta/60 hover:border-verde/50'
  }`;

  return (
    <div className="space-y-2.5">
      <div className="scroll-limpio -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {rapidos.map((k) => (
          <button key={k} type="button" onClick={() => aplicar(k)} className={boton(clave === k)} aria-pressed={clave === k}>
            {etiquetas[k]}
          </button>
        ))}
        <button
          type="button" onClick={() => setAbierto((v) => !v)}
          className={boton(clave === 'personalizado')} aria-expanded={abierto}
        >
          {t.comun.elegirFechas}
        </button>
      </div>

      {diaCobro && (clave === 'ciclo' || clave === 'ciclo_pasado') && (
        <p className="text-[12.5px] text-tinta/50">{r.cicloExplicado(diaCobro)}</p>
      )}

      {abierto && (
        <div className="tarjeta flex flex-wrap items-end gap-3 p-3.5 aparecer">
          <label className="min-w-[140px] flex-1">
            <span className="etiqueta">{t.pantallas.desde}</span>
            <input type="date" className="campo py-2" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
          <label className="min-w-[140px] flex-1">
            <span className="etiqueta">{t.pantallas.hasta}</span>
            <input type="date" className="campo py-2" value={h} onChange={(e) => setH(e.target.value)} />
          </label>
          <button
            type="button"
            className="boton-principal py-2.5"
            onClick={() => aplicar('personalizado', { desde: d <= h ? d : h, hasta: h >= d ? h : d })}
          >
            {t.comun.aplicar}
          </button>
        </div>
      )}
    </div>
  );
}
