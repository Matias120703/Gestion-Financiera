'use client';

import { useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useTextos } from '@/i18n/cliente';
import type { CodigoErrorPlanilla } from '@/i18n/textos/planilla';
import { firmaDeArchivo, libroDesdeCsv, type LibroPlanilla, type TopesPlanilla } from '@/lib/planilla';

const TIPOS = '.xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12';

/**
 * ELEGIR LA PLANILLA (114, compartido desde la 122): el archivo o el link.
 *
 * Lo mismo para la rutina del trainer y para la lista de productos. Tres
 * caminos, y los tres terminan en `onLibro` con un `LibroPlanilla`:
 *
 *   · .csv/.tsv: se lee acá, en el celular, sin subirlo (`libroDesdeCsv`,
 *     con los topes de quien lo usa);
 *   · .xlsx/.xlsm: lo lee el servidor (`ruta`), porque exceljs pesa ~0,9 MB y
 *     no puede venir al celular. El archivo no se guarda;
 *   · un link de Google Sheets: el servidor baja el .xlsx que exporta Google.
 *
 * Más de 4 MB se frena ACÁ, antes de subir (Vercel corta en 4,5 MB). Un
 * Excel viejo (.xls) o con contraseña se reconoce por su firma, también acá.
 * Sin sesión, el middleware redirige al login: eso también se entiende.
 *
 * `leerRespuesta`: lo que devolvió la ruta → el libro (la rutina lo recibe
 * entero; los productos, en corto). `errores`: lo que se dice de cada código
 * (los de todas las planillas, y lo que suma quien lo usa).
 */
export function ElegirPlanilla({
  empresaId, ruta, topes, leerRespuesta, errores, onLibro, onLeyendo, explicacion, aviso,
}: {
  empresaId: string;
  ruta: string;
  topes: TopesPlanilla;
  leerRespuesta: (x: unknown) => LibroPlanilla | null;
  errores: Record<CodigoErrorPlanilla, string>;
  onLibro: (libro: LibroPlanilla) => void;
  onLeyendo?: (leyendo: boolean) => void;
  explicacion: ReactNode;
  /** Algo que decir abajo (la planilla anterior no tenía nada que usar). */
  aviso?: string;
}) {
  const t = useTextos();
  const p = t.planilla;
  const idLink = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<CodigoErrorPlanilla | null>(null);
  const [enlace, setEnlace] = useState('');

  const marcar = (v: boolean) => { setLeyendo(v); onLeyendo?.(v); };
  const fallar = (codigo: CodigoErrorPlanilla) => { marcar(false); setError(codigo); };
  const listo = (libro: LibroPlanilla) => { marcar(false); setError(null); onLibro(libro); };

  /** El .xlsx o el link, al servidor. */
  async function pedir(cuerpo: FormData | { empresa: string; enlace: string }) {
    marcar(true);
    setError(null);
    try {
      const esArchivo = cuerpo instanceof FormData;
      const r = await fetch(ruta, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: esArchivo ? cuerpo : JSON.stringify(cuerpo),
        headers: esArchivo ? undefined : { 'Content-Type': 'application/json' },
      });
      if (r.redirected || r.status === 401) { fallar('sin_sesion'); return; }
      let datos: { libro?: unknown; error?: unknown } | null = null;
      try { datos = await r.json(); } catch { datos = null; }
      const libro = leerRespuesta(datos?.libro);
      if (r.ok && libro) { listo(libro); return; }
      const codigo = typeof datos?.error === 'string' && datos.error in errores ? (datos.error as CodigoErrorPlanilla) : 'error';
      fallar(codigo);
    } catch {
      fallar('error');
    }
  }

  async function alElegir(ev: ChangeEvent<HTMLInputElement>) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    if (archivo.size > topes.bytes) { fallar('muy_grande'); return; }
    marcar(true);
    setError(null);
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const firma = firmaDeArchivo(bytes);
      if (firma === 'xls_viejo') { fallar('xls_viejo'); return; }
      if (firma === 'zip') {
        const datos = new FormData();
        datos.append('empresa', empresaId);
        datos.append('archivo', archivo);
        await pedir(datos);
        return;
      }
      // Un CSV (o un TSV) se lee acá, sin subirlo.
      if (/\.(csv|tsv|txt)$/i.test(archivo.name) || archivo.type.startsWith('text/')) { listo(libroDesdeCsv(bytes, topes)); return; }
      fallar('no_es_planilla');
    } catch {
      fallar('error');
    }
  }

  function traer() {
    if (!enlace.trim() || leyendo) return;
    void pedir({ empresa: empresaId, enlace: enlace.trim() });
  }

  return (
    <>
      <div className="text-[13.5px] leading-relaxed text-tinta/65">{explicacion}</div>

      <input ref={entrada} type="file" accept={TIPOS} hidden onChange={alElegir} />
      <button
        type="button" onClick={() => entrada.current?.click()} disabled={leyendo}
        className="boton-principal mt-4 min-h-[48px] w-full"
      >
        {p.elegirArchivo}
      </button>

      <p className="mt-5 text-[13px] font-semibold text-tinta/60">{p.oLink}</p>
      <label htmlFor={idLink} className="etiqueta mt-2">{p.linkCampo}</label>
      <div className="flex gap-2">
        <input
          id={idLink} className="campo min-w-0 flex-1" type="url" inputMode="url" autoComplete="off" autoCapitalize="off"
          spellCheck={false} value={enlace} placeholder={p.linkEjemplo} disabled={leyendo}
          onChange={(ev) => setEnlace(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); traer(); } }}
        />
        <button type="button" onClick={traer} disabled={leyendo || !enlace.trim()} className="boton-suave min-h-[48px] shrink-0 px-5">
          {p.traer}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{p.ayudaGoogle}</p>

      {leyendo && <p role="status" className="mt-4 text-[13.5px] font-semibold text-verde-fuerte">{p.leyendo}</p>}
      {error && <p role="alert" className="mt-4 text-[13px] font-medium text-rojo">{errores[error]}</p>}
      {!error && !leyendo && aviso && <p role="alert" className="mt-4 text-[13px] font-medium text-rojo">{aviso}</p>}
    </>
  );
}
