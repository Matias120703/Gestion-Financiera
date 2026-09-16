'use client';

import { useState } from 'react';
import { useTextos } from '@/i18n/cliente';

export function BotonExcel({ empresaId, desde, hasta }: { empresaId: string; desde: string; hasta: string }) {
  const t = useTextos();
  const [bajando, setBajando] = useState(false);
  const [error, setError] = useState('');

  async function descargar() {
    setBajando(true);
    setError('');
    try {
      const url = `/api/excel?empresa=${encodeURIComponent(empresaId)}&desde=${desde}&hasta=${hasta}`;
      const r = await fetch(url);
      if (!r.ok) {
        const datos = await r.json().catch(() => ({}));
        throw new Error(datos?.error ?? t.errores.excelNoSeGenero);
      }

      const blob = await r.blob();
      // Sacamos el nombre real del encabezado del servidor.
      const cabecera = r.headers.get('Content-Disposition') ?? '';
      const coincide = /filename\*=UTF-8''([^;]+)/.exec(cabecera);
      const nombre = coincide ? decodeURIComponent(coincide[1]) : `Orden ${desde}.xlsx`;

      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(blob);
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
    } catch (e: any) {
      setError(e?.message ?? t.errores.excelFallo);
    } finally {
      setBajando(false);
    }
  }

  return (
    <div className="shrink-0">
      <button className="boton-principal w-full py-3 sm:w-auto" onClick={descargar} disabled={bajando}>
        {bajando ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            {t.errores.excelArmando}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />
            </svg>
            {t.errores.excelDescargar}
          </>
        )}
      </button>
      {error && <p className="mt-2 text-[12.5px] font-medium text-rojo">{error}</p>}
    </div>
  );
}
