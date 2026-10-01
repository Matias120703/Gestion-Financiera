'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useTextos } from '@/i18n/cliente';
import { useState } from 'react';
import { ETIQUETAS_RANGO, type ClaveRango } from '@/lib/fechas';
import { FilaDeslizable } from '@/components/FilaDeslizable';

const RAPIDOS: ClaveRango[] = ['hoy', 'ayer', 'semana', 'mes', 'mes_pasado', 'anio', 'siempre'];

export function SelectorRango({ clave, desde, hasta }: { clave: ClaveRango; desde: string; hasta: string }) {
  const t = useTextos();
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const [abierto, setAbierto] = useState(false);
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);

  function aplicar(nueva: ClaveRango, custom?: { desde: string; hasta: string }) {
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

  return (
    <div className="space-y-2.5">
      {/* En el celular se desliza; con mouse va en varias líneas (01/10). */}
      <FilaDeslizable enCompu="envolver" sangria="pagina" activo={clave} className="gap-2">
        {RAPIDOS.map((r) => (
          <button
            key={r} type="button" onClick={() => aplicar(r)} aria-pressed={clave === r}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
              clave === r ? 'border-verde bg-verde text-sobre-verde' : 'border-borde bg-superficie text-tinta/60 hover:border-verde/50'
            }`}
          >
            {ETIQUETAS_RANGO[r as keyof typeof ETIQUETAS_RANGO]}
          </button>
        ))}
        <button
          type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
            clave === 'personalizado' ? 'border-verde bg-verde text-sobre-verde' : 'border-borde bg-superficie text-tinta/60 hover:border-verde/50'
          }`}
        >
          {t.comun.elegirFechas}
        </button>
      </FilaDeslizable>

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
