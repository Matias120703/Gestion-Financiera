'use client';

import { useMemo, useState } from 'react';
import { useTextos } from '@/i18n/cliente';
import { TOPES_PLANILLA, type LibroPlanilla } from '@/lib/planilla';
import { darVueltaSeriesYReps, planillaARutina } from '@/lib/rutina-planilla';
import { rutinaComoTexto, type RutinaLeidaConNotas } from '@/lib/rutina-texto';
import type { EjercicioBiblioteca } from '@/lib/tipos-rutinas';
import { ElegirPlanilla } from '@/components/planilla/ElegirPlanilla';
import { Hoja } from '../panel/Piezas';
import { ExtrasPlanilla } from './ExtrasPlanilla';
import { PieLeida, VistaLeida, type ModoPegar } from './VistaLeida';

const RUTA = '/api/rutinas/importar';

/** Lo que devolvió la ruta: un libro con hojas, o nada. */
function libroValido(x: unknown): LibroPlanilla | null {
  const l = x as LibroPlanilla | null;
  return l && Array.isArray(l.hojas) && l.hojas.every((h) => h && Array.isArray(h.filas)) ? l : null;
}

/**
 * «SUBIR PLANILLA» (114): la rutina que el trainer tiene en Excel o en
 * Google Sheets.
 *
 * Elegir el archivo o pegar el link es `ElegirPlanilla` (el mismo de la
 * lista de productos, 122): el CSV se lee acá, el .xlsx y el link los lee el
 * servidor (/api/rutinas/importar), y más de 4 MB o un .xls viejo se frenan
 * antes de subir. Los tres caminos terminan en la misma revisión de «Pegar
 * texto» (`VistaLeida`), con lo que la planilla suma arriba: las hojas que no
 * se usaron, la semana (si trae varias) y los avisos. Nada se guarda en la
 * base hasta tocar «Guardar» del editor (G6).
 *
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
  const [libro, setLibro] = useState<LibroPlanilla | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [semana, setSemana] = useState(1);
  // Las hojas que el trainer sumó o sacó a mano, por nombre (lo demás,
  // automático: solo la que parece la rutina). Se reinicia con otro
  // archivo; al cambiar de semana se mantiene.
  const [hojas, setHojas] = useState<Record<string, boolean>>({});
  // «Dar vuelta» tocado en estos ejercicios (se deshace al cambiar de semana, de hojas o de archivo).
  const [vueltas, setVueltas] = useState<{ dia: number; indice: number }[]>([]);

  const resultado = useMemo(
    () => (libro ? planillaARutina(libro, { semana, hojas }) : null),
    [libro, semana, hojas],
  );
  const leida = useMemo(
    () => (resultado ? vueltas.reduce((l, v) => darVueltaSeriesYReps(l, v.dia, v.indice), resultado.leida) : null),
    [resultado, vueltas],
  );
  const ejercicios = leida ? leida.dias.reduce((s, d) => s + d.ejercicios.length, 0) : 0;

  const usarLibro = (nuevo: LibroPlanilla) => {
    setSemana(1);
    setHojas({});
    setVueltas([]);
    setLibro(nuevo);
  };

  function otroArchivo() {
    setLibro(null);
    setVueltas([]);
    setSemana(1);
    setHojas({});
  }

  const sinEjercicios = !!libro && ejercicios === 0;
  const conRevision = !!libro && !sinEjercicios;

  // Lo que la planilla suma arriba de la revisión (lo comparte con «Pegar texto»).
  const extra = resultado && leida ? (
    <ExtrasPlanilla
      resultado={resultado} leida={leida}
      onSemana={(n) => { setSemana(n); setVueltas([]); }}
      onDarVuelta={(dia, indice) => setVueltas((v) => [...v, { dia, indice }])}
      onHoja={(nombre, usar) => { setHojas((h) => ({ ...h, [nombre]: usar })); setVueltas([]); }}
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
    <Hoja
      titulo={i.titulo} onCerrar={onCerrar} bloqueada={leyendo}
      // La revisión es larga (días lado a lado): ancha en la computadora.
      tamano={conRevision ? 'grande' : 'medio'}
      pie={conRevision ? (
        <PieLeida
          leida={leida} diasActuales={diasActuales} hayEjercicios={hayEjercicios}
          onUsar={(l, modo) => onUsar(l, modo, { semanas: resultado?.duracionSemanas ?? null })}
        />
      ) : null}
    >
      {!conRevision ? (
        <ElegirPlanilla
          empresaId={empresaId} ruta={RUTA} topes={TOPES_PLANILLA} leerRespuesta={libroValido}
          errores={i.errores} onLibro={usarLibro} onLeyendo={setLeyendo}
          explicacion={<p>{i.explicacion}</p>}
          aviso={sinEjercicios ? i.errores.sin_ejercicios : undefined}
        />
      ) : (
        <VistaLeida
          leida={leida} biblioteca={biblioteca} diasActuales={diasActuales} hayEjercicios={hayEjercicios} extra={extra}
        />
      )}
    </Hoja>
  );
}
