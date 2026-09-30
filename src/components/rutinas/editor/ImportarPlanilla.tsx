'use client';

import { useId, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTextos } from '@/i18n/cliente';
import type { rutinasEditorEs } from '@/i18n/textos/rutinas-editor';
import { TOPES_PLANILLA, firmaDeArchivo, libroDesdeCsv, type LibroPlanilla } from '@/lib/planilla';
import { darVueltaSeriesYReps, planillaARutina } from '@/lib/rutina-planilla';
import { rutinaComoTexto, type RutinaLeidaConNotas } from '@/lib/rutina-texto';
import type { EjercicioBiblioteca } from '@/lib/tipos-rutinas';
import { Hoja } from '../panel/Piezas';
import { ExtrasPlanilla } from './ExtrasPlanilla';
import { VistaLeida, type ModoPegar } from './VistaLeida';

type CodigoError = keyof typeof rutinasEditorEs.importar.errores;

type Estado =
  | { tipo: 'inicio' }
  | { tipo: 'leyendo' }
  | { tipo: 'error'; codigo: CodigoError }
  | { tipo: 'libro'; libro: LibroPlanilla };

const RUTA = '/api/rutinas/importar';
const TIPOS = '.xlsx,.xlsm,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12';

/** Lo que devolvió la ruta: un libro con hojas, o nada. */
function libroValido(x: unknown): LibroPlanilla | null {
  const l = x as LibroPlanilla | null;
  return l && Array.isArray(l.hojas) && l.hojas.every((h) => h && Array.isArray(h.filas)) ? l : null;
}

/**
 * «SUBIR PLANILLA» (114): la rutina que el trainer tiene en Excel o en
 * Google Sheets.
 *
 * Tres caminos, y los tres terminan en la misma revisión de «Pegar texto»
 * (`VistaLeida`), con lo que la planilla suma arriba: las hojas que no se
 * usaron, la semana (si trae varias) y los avisos. Nada se guarda en la base
 * hasta tocar «Guardar» del editor (G6).
 *
 *   · .csv/.tsv: se lee acá, en el celular, sin subirlo (`libroDesdeCsv`);
 *   · .xlsx/.xlsm: lo lee el servidor (/api/rutinas/importar), porque exceljs
 *     pesa ~0,9 MB y no puede venir al celular. El archivo no se guarda;
 *   · un link de Google Sheets: el servidor baja el .xlsx que exporta Google.
 *
 * Más de 4 MB se frena ACÁ, antes de subir (Vercel corta en 4,5 MB). Un
 * Excel viejo (.xls) o con contraseña se reconoce por su firma, también acá.
 * Lo que se entendió se arma con `planillaARutina`, que es chico y puro: el
 * cambio de semana y «Dar vuelta» corren en el celular, sin volver a subir.
 */
export function ImportarPlanilla({
  empresaId, diasActuales, hayEjercicios, biblioteca, onUsar, onEditarComoTexto, onCerrar,
}: {
  empresaId: string;
  diasActuales: number;
  hayEjercicios: boolean;
  biblioteca: readonly EjercicioBiblioteca[];
  onUsar: (leida: RutinaLeidaConNotas, modo: ModoPegar, extra: { semanas: number | null }) => void;
  onEditarComoTexto: (texto: string) => void;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const i = t.rutinasEditor.importar;
  const idLink = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'inicio' });
  const [enlace, setEnlace] = useState('');
  const [semana, setSemana] = useState(1);
  // «Dar vuelta» tocado en estos ejercicios (se deshace al cambiar de semana o de archivo).
  const [vueltas, setVueltas] = useState<{ dia: number; indice: number }[]>([]);

  const resultado = useMemo(
    () => (estado.tipo === 'libro' ? planillaARutina(estado.libro, { semana }) : null),
    [estado, semana],
  );
  const leida = useMemo(
    () => (resultado ? vueltas.reduce((l, v) => darVueltaSeriesYReps(l, v.dia, v.indice), resultado.leida) : null),
    [resultado, vueltas],
  );
  const ejercicios = leida ? leida.dias.reduce((s, d) => s + d.ejercicios.length, 0) : 0;

  const fallar = (codigo: CodigoError) => setEstado({ tipo: 'error', codigo });
  const usarLibro = (libro: LibroPlanilla) => {
    setSemana(1);
    setVueltas([]);
    setEstado({ tipo: 'libro', libro });
  };

  /** El .xlsx o el link, al servidor. Sin sesión, el middleware redirige al login: eso también se entiende. */
  async function pedir(cuerpo: FormData | { empresa: string; enlace: string }) {
    setEstado({ tipo: 'leyendo' });
    try {
      const esArchivo = cuerpo instanceof FormData;
      const r = await fetch(RUTA, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: esArchivo ? cuerpo : JSON.stringify(cuerpo),
        headers: esArchivo ? undefined : { 'Content-Type': 'application/json' },
      });
      if (r.redirected || r.status === 401) { fallar('sin_sesion'); return; }
      let datos: { libro?: unknown; error?: unknown } | null = null;
      try { datos = await r.json(); } catch { datos = null; }
      const libro = libroValido(datos?.libro);
      if (r.ok && libro) { usarLibro(libro); return; }
      const codigo = typeof datos?.error === 'string' && datos.error in i.errores ? (datos.error as CodigoError) : 'error';
      fallar(codigo);
    } catch {
      fallar('error');
    }
  }

  async function alElegir(ev: ChangeEvent<HTMLInputElement>) {
    const archivo = ev.target.files?.[0];
    ev.target.value = '';
    if (!archivo) return;
    if (archivo.size > TOPES_PLANILLA.bytes) { fallar('muy_grande'); return; }
    setEstado({ tipo: 'leyendo' });
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
      if (/\.(csv|tsv|txt)$/i.test(archivo.name) || archivo.type.startsWith('text/')) { usarLibro(libroDesdeCsv(bytes)); return; }
      fallar('no_es_planilla');
    } catch {
      fallar('error');
    }
  }

  function traer() {
    if (!enlace.trim()) return;
    void pedir({ empresa: empresaId, enlace: enlace.trim() });
  }

  function otroArchivo() {
    setEstado({ tipo: 'inicio' });
    setVueltas([]);
    setSemana(1);
  }

  const sinEjercicios = estado.tipo === 'libro' && ejercicios === 0;
  const leyendo = estado.tipo === 'leyendo';

  // Lo que la planilla suma arriba de la revisión (lo comparte con «Pegar texto»).
  const extra = resultado && leida ? (
    <ExtrasPlanilla
      resultado={resultado} leida={leida}
      onSemana={(n) => { setSemana(n); setVueltas([]); }}
      onDarVuelta={(dia, indice) => setVueltas((v) => [...v, { dia, indice }])}
    >
      <div className="flex flex-wrap gap-x-4">
        <button
          type="button" onClick={() => onEditarComoTexto(rutinaComoTexto(leida, t.rutinasComun.texto))}
          className="boton-texto min-h-[44px]"
        >
          {i.editarComoTexto}
        </button>
        <button type="button" onClick={otroArchivo} className="boton-texto min-h-[44px]">{i.otroArchivo}</button>
      </div>
    </ExtrasPlanilla>
  ) : null;

  return (
    <Hoja titulo={i.titulo} onCerrar={onCerrar} bloqueada={leyendo}>
      {estado.tipo !== 'libro' || sinEjercicios ? (
        <>
          <p className="text-[13.5px] leading-relaxed text-tinta/65">{i.explicacion}</p>

          <input ref={entrada} type="file" accept={TIPOS} hidden onChange={alElegir} />
          <button
            type="button" onClick={() => entrada.current?.click()} disabled={leyendo}
            className="boton-principal mt-4 min-h-[48px] w-full"
          >
            {i.elegirArchivo}
          </button>

          <p className="mt-5 text-[13px] font-semibold text-tinta/60">{i.oLink}</p>
          <label htmlFor={idLink} className="etiqueta mt-2">{i.linkCampo}</label>
          <div className="flex gap-2">
            <input
              id={idLink} className="campo min-w-0 flex-1" type="url" inputMode="url" autoComplete="off" autoCapitalize="off"
              spellCheck={false} value={enlace} placeholder={i.linkEjemplo} disabled={leyendo}
              onChange={(ev) => setEnlace(ev.target.value)}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); traer(); } }}
            />
            <button type="button" onClick={traer} disabled={leyendo || !enlace.trim()} className="boton-suave min-h-[48px] shrink-0 px-5">
              {i.traer}
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{i.ayudaGoogle}</p>

          {leyendo && <p role="status" className="mt-4 text-[13.5px] font-semibold text-verde-fuerte">{i.leyendo}</p>}
          {estado.tipo === 'error' && <p role="alert" className="mt-4 text-[13px] font-medium text-rojo">{i.errores[estado.codigo]}</p>}
          {sinEjercicios && <p role="alert" className="mt-4 text-[13px] font-medium text-rojo">{i.errores.sin_ejercicios}</p>}
        </>
      ) : (
        <VistaLeida
          leida={leida} biblioteca={biblioteca} diasActuales={diasActuales} hayEjercicios={hayEjercicios} extra={extra}
          onUsar={(l, modo) => onUsar(l, modo, { semanas: resultado?.duracionSemanas ?? null })}
        />
      )}
    </Hoja>
  );
}
