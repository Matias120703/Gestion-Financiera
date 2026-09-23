'use client';

import { useMemo, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useIdioma, useLocale, useTextos } from '@/i18n/cliente';
import {
  CULTIVOS, avisoHectareas, avisoPrecio, cultivoPorNombre, precioEnUnidad, precioPorTonelada,
  sugerirCampana, unidadDePrecio,
} from '@/lib/agricultura';
import { decimalesDe } from '@/lib/formato';
import { CampoMonto } from '@/components/CampoMonto';
import { Hoja, MensajeError } from '@/components/rutinas/panel/Piezas';
import { useAccion } from '@/components/rutinas/panel/useAccion';
import type { Lote } from '@/lib/tipos';
import { nombreLargo, precioDicho, ultimoPrecio, unidadDelPrecio } from './utiles';

export type ModoCampana = 'nuevo' | 'editar' | 'repetir';

/**
 * ABRIR, EDITAR O REPETIR UNA CAMPAÑA (flujo A, 30 segundos).
 *
 * Dos caras del mismo formulario:
 * - AGRÍCOLA (la jerga del agricultor): cultivo en chips, nombre del lote
 *   (con los que ya usó a un toque), la campaña sugerida por la fecha,
 *   hectáreas obligatorias y «¿A cuánto pensás vender?», opcional, en la
 *   unidad en que habla cada uno: US$/t el sojero, Gs/kg el sesamero. Se
 *   guarda siempre por tonelada.
 * - NEUTRA (el ganadero, una obra): nombre, cuántos y de qué, como siempre.
 *
 * El precio esperado NO trae un valor de fábrica (decisión 16: envejece en
 * un mes). Se precarga con el último que esta cuenta cargó para ese
 * cultivo, y se dice de dónde salió.
 *
 * Editar reescribe TODAS las columnas (guardar_lote hace un update entero),
 * así que lo que esta cara no muestra se manda como estaba: al ganadero no
 * se le borra el precio esperado por editarle el nombre.
 */
export function FormularioCampana({
  empresaId, moneda, hoy, agricola, modo, lote, lotes, onCerrar, onListo,
}: {
  empresaId: string;
  /** La moneda de los DATOS: el precio se escribe en esta. */
  moneda: string;
  hoy: string;
  agricola: boolean;
  modo: ModoCampana;
  /** La campaña que se edita o se repite; null para una nueva. */
  lote: Lote | null;
  /** Todas, para los nombres ya usados y el último precio del cultivo. */
  lotes: Lote[];
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const f = t.campanas.formulario;
  const locale = useLocale();
  const idioma = useIdioma() === 'pt' ? 'pt' : 'es';
  const { ocupado, error, setError, correr } = useAccion();

  const editando = modo === 'editar' && lote !== null;
  const unidad = unidadDePrecio(moneda);
  const decPrecio = unidad === 'kg' ? decimalesDe(moneda) : 2;

  const [nombre, setNombre] = useState(lote?.nombre ?? '');
  const [cultivo, setCultivo] = useState(lote?.cultivo ?? '');
  // «Otro» abre un campo libre: el cultivo guardado no es ninguno de los chips.
  const [otro, setOtro] = useState(() => !!lote?.cultivo && cultivoPorNombre(lote.cultivo).clave === 'otro'
    && lote.cultivo.trim().toLowerCase() !== 'otro');
  const [abierto, setAbierto] = useState(editando ? lote.abierto_el : hoy);
  const [campana, setCampana] = useState(editando ? lote.campana : sugerirCampana(hoy, idioma));
  // Mientras no la toque, la campaña sigue a la fecha.
  const [campanaTocada, setCampanaTocada] = useState(editando);
  const [hectareas, setHectareas] = useState<number>(Number(lote?.hectareas ?? 0));
  const precioInicial = (): number => {
    if (editando) return lote.precio_esperado ? precioEnUnidad(Number(lote.precio_esperado), unidad) : 0;
    const ultimo = lote ? ultimoPrecio(lotes, lote.cultivo) : null;
    return ultimo ? precioEnUnidad(ultimo, unidad) : 0;
  };
  const [precio, setPrecio] = useState<number>(precioInicial);
  const [precioTocado, setPrecioTocado] = useState(editando);
  const [cantidad, setCantidad] = useState<number>(Number(lote?.cantidad ?? 0));
  const [unidadLote, setUnidadLote] = useState(lote?.unidad ?? '');
  const [notas, setNotas] = useState(editando ? lote.notas : '');

  // Los nombres de lote que ya usó, para repetir a un toque. Sin repetidos.
  const nombresDeAntes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const l of lotes) {
      const k = l.nombre.trim().toLowerCase();
      if (k && !vistos.has(k)) vistos.set(k, l.nombre.trim());
    }
    return [...vistos.values()].slice(0, 8);
  }, [lotes]);

  const ultimo = useMemo(
    () => (cultivo ? ultimoPrecio(lotes, cultivo, editando ? lote.id : undefined) : null),
    [lotes, cultivo, editando, lote],
  );

  const titulo = modo === 'editar' ? f.tituloEditar : modo === 'repetir' ? f.tituloRepetir : f.titulo;

  /**
   * El cultivo se guarda SIEMPRE con su nombre en español («Maíz», no
   * «Milho»): la base guarda texto, y lo leen tal cual los chips de Gastos y
   * Vender, el Panel y el Excel. Si cada uno lo guardara en su idioma, el
   * equipo vería la mitad de las campañas en el otro. Cada pantalla lo
   * traduce al mostrarlo (`cultivoVisible`). Un «Milho» escrito a mano en
   * «Otro», o guardado antes de este cambio, también vuelve a «Maíz».
   */
  function cultivoCanonico(nombreCultivo: string): string {
    const ficha = cultivoPorNombre(nombreCultivo);
    return ficha.clave === 'otro' ? nombreCultivo.trim() : ficha.nombre.es;
  }

  function elegirCultivo(nombreCultivo: string, esOtro: boolean) {
    setOtro(esOtro);
    setCultivo(esOtro ? '' : nombreCultivo);
    setError('');
    // Al cambiar de cultivo, el precio sugerido es el último de ESE cultivo,
    // salvo que la persona ya haya escrito el suyo.
    if (!precioTocado && !esOtro) {
      const u = ultimoPrecio(lotes, nombreCultivo, editando ? lote.id : undefined);
      setPrecio(u ? precioEnUnidad(u, unidad) : 0);
    }
  }

  function cambiarFecha(nueva: string) {
    setAbierto(nueva);
    if (!campanaTocada && /^\d{4}-\d{2}-\d{2}$/.test(nueva)) setCampana(sugerirCampana(nueva, idioma));
  }

  // Los avisos dejan seguir; lo que la base rechaza igual, frena acá.
  const avisoHa = hectareas > 0 ? avisoHectareas(hectareas) : 'ok';
  const precioT = precio > 0 ? precioPorTonelada(precio, unidad) : null;
  const rango = cultivoPorNombre(cultivo).precioRango;
  const avisoP = precioT !== null && moneda === 'USD' ? avisoPrecio(cultivo, precioT) : 'ok';

  const faltaAlgo = nombre.trim() === ''
    || (agricola && (hectareas <= 0 || avisoHa === 'bloqueo'))
    || !/^\d{4}-\d{2}-\d{2}$/.test(abierto);

  async function guardar() {
    if (faltaAlgo) {
      if (agricola && hectareas <= 0) setError(f.hectareasObligatorias);
      return;
    }
    // La unidad: en agricultura, si el lote se mide en hectáreas (o no se
    // mide), se manda vacía y la base escribe «ha» con las hectáreas nuevas.
    // Si no, editar las hectáreas dejaría la cantidad vieja.
    const medidoEnHa = !lote || lote.unidad === '' || lote.unidad === 'ha';
    const datos = agricola
      ? {
        p_unidad: editando && !medidoEnHa ? lote.unidad : '',
        p_cantidad: editando && !medidoEnHa ? Number(lote.cantidad) : 0,
        p_cultivo: cultivoCanonico(cultivo),
        p_campana: campana.trim(),
        p_hectareas: hectareas,
        p_precio_esperado: precioT,
      }
      : {
        p_unidad: unidadLote.trim(),
        p_cantidad: cantidad,
        // Lo que esta cara no muestra, tal como estaba.
        p_cultivo: editando ? lote.cultivo : '',
        p_campana: editando ? lote.campana : '',
        p_hectareas: editando ? lote.hectareas : null,
        p_precio_esperado: editando ? lote.precio_esperado : null,
      };

    const r = await correr(() => clienteNavegador().rpc('guardar_lote', {
      p_empresa: empresaId,
      p_nombre: nombre.trim(),
      p_notas: notas,
      p_id: editando ? lote.id : null,
      p_abierto: abierto,
      ...datos,
    }));
    if (!r.ok) return;
    if (editando) {
      onListo(f.guardado);
      return;
    }
    const largo = agricola ? nombreLargo({ nombre, cultivo, campana }, idioma) : nombre.trim();
    onListo(precioT !== null && agricola ? `${f.listo(largo)} ${f.listoConPrecio}` : f.listo(largo));
  }

  return (
    <Hoja titulo={titulo} onCerrar={onCerrar} bloqueada={ocupado}>
      {modo === 'repetir' && <p className="-mt-1 mb-3 text-[13px] leading-relaxed text-tinta/55">{f.repetirDetalle}</p>}

      <div className="space-y-4">
        {/* ---- el cultivo ---- */}
        {agricola && (
          <div>
            <span className="etiqueta">{f.cultivo}</span>
            <div className="flex flex-wrap gap-2">
              {CULTIVOS.map((c) => {
                // El chip se lee en el idioma de quien mira, pero guarda el
                // nombre en español (ver `cultivoCanonico`).
                const nombreC = idioma === 'pt' ? c.nombre.pt : c.nombre.es;
                const esOtro = c.clave === 'otro';
                const on = esOtro ? otro : !otro && cultivoPorNombre(cultivo).clave === c.clave && cultivo !== '';
                return (
                  <button key={c.clave} type="button" aria-pressed={on} disabled={ocupado}
                    className={on ? 'chip-encendido' : 'chip-apagado'}
                    onClick={() => elegirCultivo(c.nombre.es, esOtro)}>
                    {nombreC}
                  </button>
                );
              })}
            </div>
            {otro && (
              <input className="campo mt-2" maxLength={40} value={cultivo} disabled={ocupado} autoFocus
                placeholder={f.cultivoOtro} aria-label={f.cultivoOtro}
                onChange={(e) => setCultivo(e.target.value)} />
            )}
          </div>
        )}

        {/* ---- el lote ---- */}
        <div>
          <label className="etiqueta" htmlFor="campana-nombre">{f.nombre}</label>
          <input id="campana-nombre" className="campo" maxLength={80} value={nombre} disabled={ocupado}
            placeholder={f.nombreEjemplo} onChange={(e) => setNombre(e.target.value)} />
          {modo === 'nuevo' && nombresDeAntes.length > 0 && (
            <div className="mt-2">
              <span className="text-[12px] text-tinta/45">{f.nombreDeAntes}</span>
              <div className="mt-1 flex gap-2 overflow-x-auto scroll-limpio">
                {nombresDeAntes.map((n) => (
                  <button key={n} type="button" disabled={ocupado}
                    className={nombre.trim().toLowerCase() === n.toLowerCase() ? 'chip-encendido' : 'chip-apagado'}
                    onClick={() => setNombre(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {agricola ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta" htmlFor="campana-ha">{f.hectareas}</label>
                <CampoMonto id="campana-ha" className="campo" decimales={2} valor={hectareas} disabled={ocupado}
                  placeholder={f.hectareasEjemplo}
                  alCambiar={(n) => { setHectareas(n); setError(''); }} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="campana-desde">{f.abiertoEl}</label>
                <input id="campana-desde" type="date" className="campo" value={abierto} max={hoy} disabled={ocupado}
                  onChange={(e) => cambiarFecha(e.target.value)} />
              </div>
            </div>
            {avisoHa === 'aviso' && (
              <p className="-mt-2 text-[12.5px] font-medium text-ambar">
                {f.hectareasMuchas(hectareas.toLocaleString(locale))}
              </p>
            )}

            <div>
              <label className="etiqueta" htmlFor="campana-campana">{f.campana}</label>
              <input id="campana-campana" className="campo" maxLength={40} value={campana} disabled={ocupado}
                placeholder={f.campanaEjemplo}
                onChange={(e) => { setCampana(e.target.value); setCampanaTocada(true); }} />
              {!campanaTocada && <p className="mt-1 text-[12px] text-tinta/45">{f.campanaSugerida}</p>}
            </div>

            <div>
              <label className="etiqueta" htmlFor="campana-precio">
                {f.precioEsperado} <span className="font-normal text-tinta/45">{unidadDelPrecio(moneda, t)}</span>
              </label>
              <CampoMonto id="campana-precio" className="campo" decimales={decPrecio} valor={precio} disabled={ocupado}
                alCambiar={(n) => { setPrecio(n); setPrecioTocado(true); }} />
              <p className="mt-1 text-[12px] leading-snug text-tinta/45">
                {ultimo !== null && !editando ? f.precioUltimo(precioDicho(ultimo, moneda, locale, t)) : f.precioEsperadoDetalle}
              </p>
              {avisoP === 'aviso' && rango && (
                <p className="mt-1 text-[12.5px] font-medium text-ambar">
                  {f.precioRaro(precioDicho(rango.min, 'USD', locale, t), precioDicho(rango.max, 'USD', locale, t))}
                </p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta" htmlFor="campana-cant">{t.lotes.cantidad}</label>
                <CampoMonto id="campana-cant" className="campo" decimales={2} valor={cantidad} disabled={ocupado}
                  alCambiar={setCantidad} />
              </div>
              <div>
                <label className="etiqueta" htmlFor="campana-unidad">{t.lotes.unidad}</label>
                <input id="campana-unidad" className="campo" maxLength={20} value={unidadLote} disabled={ocupado}
                  placeholder={t.lotes.unidadEjemplo} onChange={(e) => setUnidadLote(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="etiqueta" htmlFor="campana-desde">{f.abiertoEl}</label>
              <input id="campana-desde" type="date" className="campo" value={abierto} max={hoy} disabled={ocupado}
                onChange={(e) => setAbierto(e.target.value)} />
            </div>
          </>
        )}

        <div>
          <label className="etiqueta" htmlFor="campana-notas">{f.notas}</label>
          <input id="campana-notas" className="campo" maxLength={500} value={notas} disabled={ocupado}
            onChange={(e) => setNotas(e.target.value)} />
        </div>
      </div>

      <MensajeError texto={error} />

      <button type="button" className="boton-principal mt-5 min-h-[48px] w-full"
        disabled={ocupado || faltaAlgo} onClick={guardar}>
        {ocupado ? t.comun.guardando : editando ? f.guardar : f.abrir}
      </button>
    </Hoja>
  );
}
