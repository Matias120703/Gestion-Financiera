'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ETIQUETAS_RANGO, type ClaveRango } from '@/lib/fechas';

const RAPIDOS: ClaveRango[] = ['hoy', 'ayer', 'semana', 'mes', 'mes_pasado', 'anio', 'siempre'];

export function SelectorRango({ clave, desde, hasta }: { clave: ClaveRango; desde: string; hasta: string }) {
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
      <div className="scroll-limpio -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        {RAPIDOS.map((r) => (
          <button
            key={r} type="button" onClick={() => aplicar(r)}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
              clave === r ? 'border-verde bg-verde text-white' : 'border-borde bg-white text-tinta/60 hover:border-verde/50'
            }`}
          >
            {ETIQUETAS_RANGO[r as keyof typeof ETIQUETAS_RANGO]}
          </button>
        ))}
        <button
          type="button" onClick={() => setAbierto((v) => !v)}
          className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
            clave === 'personalizado' ? 'border-verde bg-verde text-white' : 'border-borde bg-white text-tinta/60 hover:border-verde/50'
          }`}
        >
          Elegir fechas
        </button>
      </div>

      {abierto && (
        <div className="tarjeta flex flex-wrap items-end gap-3 p-3.5 aparecer">
          <label className="min-w-[140px] flex-1">
            <span className="etiqueta">Desde</span>
            <input type="date" className="campo py-2" value={d} onChange={(e) => setD(e.target.value)} />
          </label>
          <label className="min-w-[140px] flex-1">
            <span className="etiqueta">Hasta</span>
            <input type="date" className="campo py-2" value={h} onChange={(e) => setH(e.target.value)} />
          </label>
          <button
            className="boton-principal py-2.5"
            onClick={() => aplicar('personalizado', { desde: d <= h ? d : h, hasta: h >= d ? h : d })}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
