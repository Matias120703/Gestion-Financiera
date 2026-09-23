'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { useTextos } from '@/i18n/cliente';
import {
  LARGOS, UNIDADES_CARGA, conUnidad, formatoDescanso, normalizarCarga, normalizarReps, unidadDe,
  type UnidadCarga,
} from '@/lib/rutina-texto';
import type { EjercicioDeRutina, RutinaCompleta } from '@/lib/tipos-rutinas';
import { Hoja, MensajeError } from './panel/Piezas';
import { etiquetasDelDia, seriesPorReps } from './panel/utiles';

/**
 * «+2,5» o «−2,5» sobre la carga que ya está: «40 kg» → «42,5 kg».
 *
 * Solo cuando la carga YA dice kg o lb y tiene un solo número. Sin unidad
 * no se sabe qué se está sumando (25 son unas 55 lb, y en muchos gimnasios
 * de la región las mancuernas vienen en libras), y con dos números
 * («2x20 kg», «20-25 kg») no se sabe a cuál. En esos casos devuelve null y
 * el botón no aparece: la unidad NUNCA se agrega sola.
 *
 * Escribe la coma o el punto que ya usaba la carga (la coma si no tenía
 * decimales, que es como se escribe en español y en portugués). Null también
 * si el resultado no es positivo o no entra en el tope de la base.
 */
export function sumarACarga(carga: string, delta: number): string | null {
  const s = normalizarCarga(carga);
  const unidad = unidadDe(s);
  if (unidad !== 'kg' && unidad !== 'lb') return null;
  const numeros = s.match(/\d+(?:[.,]\d+)?/g) ?? [];
  if (numeros.length !== 1) return null;
  const actual = numeros[0];
  const n = Number(actual.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const nuevo = Math.round((n + delta) * 100) / 100;
  if (!(nuevo > 0)) return null;
  const separador = actual.includes('.') ? '.' : ',';
  const texto = String(nuevo).replace('.', separador);
  const resultado = s.replace(actual, texto);
  return resultado.length <= LARGOS.carga ? resultado : null;
}

/** La forma prolija («40kg» → «40 kg»), salvo que así no entre en el tope de la base. */
function prolijo(texto: string, normal: string, tope: number): string {
  return normal.length <= tope ? normal : texto.trim();
}

/**
 * LA RUTINA DE UNA SESIÓN, EN LA AGENDA Y EN EL PANEL DEL TRAINER (098).
 *
 * Debajo de cada sesión cuyo cliente tiene rutina vigente: su nombre y
 * «Ver». La rutina de cada sesión llega aparte (`rutinas_de_la_agenda`, por
 * id de reserva) y no dentro de la agenda: `agenda_del_dia` y `panel_profe`
 * ya van por su quinta copia, y cada copia es una oportunidad de perder algo.
 */
export function RutinaDeLaSesion({
  empresaId, rutinaId, nombre, className = '',
}: {
  empresaId: string;
  rutinaId: string;
  /** El nombre de la rutina: «Fuerza base». */
  nombre: string;
  className?: string;
}) {
  const t = useTextos();
  const r = t.agenda.rutinaSesion;
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <div className={`flex items-center justify-between gap-2 rounded-xl bg-arena/70 pl-3 pr-1 ${className}`}>
        <p className="min-w-0 truncate text-[13px]">
          <span className="text-tinta/50">{r.rutina} · </span>
          <span className="font-semibold text-tinta/85">{nombre}</span>
        </p>
        <button
          type="button" onClick={() => setAbierta(true)} aria-label={r.verLaRutina(nombre)}
          className="boton-texto inline-flex min-h-[44px] shrink-0 items-center px-3 text-[14px]"
        >
          {r.ver}
        </button>
      </div>
      {abierta && (
        <HojaRutinaSesion empresaId={empresaId} rutinaId={rutinaId} nombre={nombre} onCerrar={() => setAbierta(false)} />
      )}
    </>
  );
}

/**
 * LA HOJA «VER»: la rutina para dar la sesión con el celular en la mano.
 *
 * Arriba, las lesiones en ámbar (lo primero que hay que leer antes de
 * empezar); después los días en pestañas y los ejercicios con letra grande.
 * La carga y las repeticiones se tocan y se cambian ahí mismo
 * (`cambiar_carga`): así se anota lo que un trainer hace en cada sesión, y
 * queda en «Cómo subieron las cargas» sin abrir el editor.
 *
 * Solo la vigente se cambia (la base lo vuelve a controlar). Cada cambio le
 * sube la versión a la rutina: si alguien la tenía abierta en el editor, al
 * guardar se entera en vez de pisar la carga nueva con la vieja.
 */
export function HojaRutinaSesion({
  empresaId, rutinaId, nombre, onCerrar,
}: {
  empresaId: string;
  rutinaId: string;
  nombre: string;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const r = t.agenda.rutinaSesion;
  const txt = t.rutinasComun.texto;

  const [rutina, setRutina] = useState<RutinaCompleta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [intento, setIntento] = useState(0);
  const [elegido, setElegido] = useState(0);
  // Qué ejercicio se está cambiando, y en qué campo arranca el cursor.
  const [editando, setEditando] = useState<{ id: string; foco: 'carga' | 'reps' } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setErrorCarga('');
    (async () => {
      try {
        const { data, error } = await clienteNavegador().rpc('rutina', { p_empresa: empresaId, p_rutina: rutinaId });
        if (error) throw error;
        const leida = data as RutinaCompleta | null;
        if (!leida || !Array.isArray(leida.dias)) throw new Error(r.noSeCargo);
        if (!vivo) return;
        setRutina({
          ...leida,
          dias: [...leida.dias]
            .sort((a, b) => a.orden - b.orden)
            .map((d) => ({
              ...d,
              ejercicios: (Array.isArray(d.ejercicios) ? [...d.ejercicios] : []).sort((a, b) => a.orden - b.orden),
            })),
        });
      } catch (e) {
        if (vivo) setErrorCarga(mensajeDeError(e, r.noSeCargo));
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, [empresaId, rutinaId, intento]); // eslint-disable-line react-hooks/exhaustive-deps

  // El «Guardado» se va solo: es una confirmación, no algo para leer dos veces.
  useEffect(() => {
    if (!guardado) return;
    const id = window.setTimeout(() => setGuardado(null), 4000);
    return () => window.clearTimeout(id);
  }, [guardado]);

  const dias = rutina?.dias ?? [];
  const dia = dias[Math.min(elegido, Math.max(0, dias.length - 1))];
  // «1», «2a», «2b»: la superserie comparte el número, como en la carpeta.
  const etiquetas = dia ? etiquetasDelDia(dia.ejercicios) : [];
  const vigente = rutina?.estado === 'vigente';
  const lesiones = rutina?.cliente_notas?.trim() ?? '';
  const notasGenerales = rutina?.notas?.trim() ?? '';

  /** Lo que devolvió la base, en su renglón: sin volver a pedir la rutina entera. */
  function alGuardar(id: string, carga: string, reps: string) {
    setRutina((antes) => antes && {
      ...antes,
      dias: antes.dias.map((d) => ({
        ...d,
        ejercicios: d.ejercicios.map((e) => (e.id === id ? { ...e, carga, reps } : e)),
      })),
    });
    setEditando(null);
    setGuardado(id);
  }

  return (
    <Hoja titulo={rutina?.nombre || nombre} onCerrar={onCerrar} bloqueada={guardando}>
      {cargando && !rutina && <p className="py-4 text-[14px] text-tinta/50">{t.comun.cargando}</p>}

      {errorCarga && !rutina && (
        <div>
          <MensajeError texto={errorCarga} />
          <button type="button" className="boton-suave mt-3 min-h-[44px] w-full" onClick={() => setIntento((n) => n + 1)}>
            {r.reintentar}
          </button>
        </div>
      )}

      {rutina && (
        <div className="space-y-3">
          {rutina.cliente_id && (
            <div className="-mt-1 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[14px] font-semibold text-tinta/70">{rutina.cliente_nombre}</p>
              <Link
                href={`/rutinas/cliente/${rutina.cliente_id}`}
                className="boton-texto inline-flex min-h-[44px] shrink-0 items-center text-[13.5px]"
              >
                {t.rutinasPanel.lista.abrirCarpeta} →
              </Link>
            </div>
          )}

          {/* Las lesiones antes que nada: es lo que hay que tener presente al
              empezar. Las ve el equipo, nunca el cliente. El aviso en ámbar y la
              letra en el color de siempre, como en la agenda: ámbar sobre ámbar
              claro no llega al contraste mínimo en el modo claro. */}
          {lesiones && (
            <div className="rounded-xl bg-ambar-claro px-3 py-2.5">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/60">
                <span aria-hidden className="text-ambar">⚠ </span>{t.rutinasPanel.carpeta.salud}
              </p>
              <p className="mt-0.5 whitespace-pre-line text-[14px] font-medium leading-relaxed text-tinta/85">{lesiones}</p>
            </div>
          )}

          {!vigente && (
            <p className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13.5px] font-medium leading-snug text-tinta/80">
              {r.yaNoVigente}
            </p>
          )}

          {notasGenerales && (
            <div className="rounded-xl bg-arena px-3.5 py-3">
              <p className="text-[12px] font-semibold text-tinta/55">{t.rutinasPanel.carpeta.indicaciones}</p>
              <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-tinta/80">{notasGenerales}</p>
            </div>
          )}

          {dias.length === 0 && <p className="text-[14px] text-tinta/50">{t.rutinasPanel.vista.sinDias}</p>}

          {/* Pestañas grandes que se deslizan de costado si son muchas. */}
          {dias.length > 1 && (
            <div role="tablist" className="scroll-limpio -mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
              {dias.map((d, i) => (
                <button
                  key={d.id} type="button" role="tab" aria-selected={d === dia}
                  onClick={() => { setElegido(i); setEditando(null); }}
                  className={`${d === dia ? 'chip-encendido' : 'chip-apagado'} max-w-[220px]`}
                >
                  <span className="min-w-0 truncate">{d.nombre}</span>
                </button>
              ))}
            </div>
          )}

          {dia && (
            <div role="tabpanel">
              {dias.length === 1 && <p className="text-[15px] font-bold">{dia.nombre}</p>}
              {dia.notas.trim() && (
                <p className="mt-1 whitespace-pre-line text-[13.5px] italic leading-relaxed text-tinta/60">{dia.notas.trim()}</p>
              )}
              {vigente && dia.ejercicios.length > 0 && (
                <p className="mt-1.5 text-[12.5px] leading-snug text-tinta/50">{r.ayuda}</p>
              )}
              {dia.ejercicios.length === 0 ? (
                <p className="mt-2 text-[14px] text-tinta/50">{t.rutinasPanel.vista.sinEjercicios}</p>
              ) : (
                <ol className="mt-2 space-y-2">
                  {dia.ejercicios.map((e, i) => {
                    const enGrupo = /[a-z]$/.test(etiquetas[i]);
                    const abreGrupo = etiquetas[i].endsWith('a');
                    const hace = seriesPorReps(e.series, e.reps, txt.series);
                    return (
                      <li
                        key={e.id}
                        className={`rounded-2xl bg-arena/70 px-3.5 py-3 ${enGrupo ? 'border-l-4 border-verde/60' : ''}`}
                      >
                        {abreGrupo && (
                          <p className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-verde-fuerte">
                            {t.rutinasPanel.vista.superserie}
                          </p>
                        )}
                        <div className="flex items-baseline gap-2.5">
                          <span className="w-7 shrink-0 text-[13px] font-bold tabular-nums text-tinta/45">{etiquetas[i]}</span>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-[16px] font-bold leading-snug">{e.nombre}</p>
                            {editando?.id !== e.id && (
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                <Valor
                                  texto={hace || r.ponerReps} vacio={!hace} activo={vigente}
                                  etiqueta={r.cambiarDe(e.nombre)}
                                  onTocar={() => setEditando({ id: e.id, foco: 'reps' })}
                                />
                                <Valor
                                  texto={e.carga.trim() || r.ponerCarga} vacio={!e.carga.trim()} activo={vigente}
                                  etiqueta={r.cambiarDe(e.nombre)}
                                  onTocar={() => setEditando({ id: e.id, foco: 'carga' })}
                                />
                              </div>
                            )}
                            {e.descanso_seg !== null && (
                              <p className="mt-1.5 text-[13px] tabular-nums text-tinta/60">
                                {txt.descanso} {formatoDescanso(e.descanso_seg)}
                              </p>
                            )}
                            {e.nota.trim() && (
                              <p className="mt-1 whitespace-pre-line text-[13px] italic leading-snug text-tinta/55">{e.nota.trim()}</p>
                            )}
                            {guardado === e.id && (
                              <p role="status" className="mt-1.5 text-[12.5px] font-semibold text-verde-fuerte aparecer">
                                ✓ {r.guardado(e.nombre)}
                              </p>
                            )}
                          </div>
                        </div>
                        {editando?.id === e.id && vigente && (
                          <CambiarCarga
                            empresaId={empresaId} ejercicio={e} foco={editando.foco}
                            onOcupado={setGuardando}
                            onListo={alGuardar}
                            onCancelar={() => setEditando(null)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </Hoja>
  );
}

/** La carga o las repeticiones, como botón: se tocan para cambiarlas. */
function Valor({
  texto, vacio, activo, etiqueta, onTocar,
}: {
  texto: string;
  vacio: boolean;
  /** Solo la vigente se cambia: en otra, es texto. */
  activo: boolean;
  etiqueta: string;
  onTocar: () => void;
}) {
  if (!activo) {
    if (vacio) return null;
    return <span className="inline-flex min-h-[36px] items-center text-[15px] font-semibold tabular-nums text-tinta/80">{texto}</span>;
  }
  return (
    <button
      type="button" onClick={onTocar} aria-label={`${etiqueta}: ${texto}`}
      className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 text-[15px] font-semibold tabular-nums transition active:scale-[.98] ${
        vacio ? 'border-dashed border-borde text-tinta/50' : 'border-borde bg-superficie text-tinta'
      }`}
    >
      {texto}
    </button>
  );
}

/**
 * Cambiar la carga y las repeticiones de un ejercicio, ahí mismo.
 *
 * Los botones de unidad escriben la unidad en el texto (`conUnidad`), igual
 * que en el editor; «+2,5 / −2,5» aparecen solo cuando la carga ya dice kg o
 * lb (ver `sumarACarga`). Un número solo se guarda tal cual, con el aviso
 * «¿kg o lb?»: nunca se le pone la unidad por su cuenta.
 */
function CambiarCarga({
  empresaId, ejercicio, foco, onOcupado, onListo, onCancelar,
}: {
  empresaId: string;
  ejercicio: EjercicioDeRutina;
  foco: 'carga' | 'reps';
  onOcupado: (ocupado: boolean) => void;
  onListo: (id: string, carga: string, reps: string) => void;
  onCancelar: () => void;
}) {
  const t = useTextos();
  const h = t.rutinasEditor.hoja;
  const [carga, setCarga] = useState(ejercicio.carga);
  const [reps, setReps] = useState(ejercicio.reps);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const campoCarga = useRef<HTMLInputElement>(null);
  const campoReps = useRef<HTMLInputElement>(null);
  const enCurso = useRef(false);

  useEffect(() => {
    (foco === 'carga' ? campoCarga : campoReps).current?.focus();
  }, [foco]);

  const unidad = unidadDe(carga);
  const mas = sumarACarga(carga, 2.5);
  const menos = sumarACarga(carga, -2.5);
  const conPasos = mas !== null;
  // «40» a secas: se guarda así, pero se pregunta.
  const numeroSolo = /^\d+(?:[.,]\d+)?$/.test(carga.trim());

  function tocarUnidad(u: UnidadCarga) {
    setAviso('');
    if (u !== 'corporal' && !/\d/.test(carga)) {
      setAviso(h.cargaPrimeroNumero);
      campoCarga.current?.focus();
      return;
    }
    const nueva = conUnidad(carga, u);
    if (nueva.length <= LARGOS.carga) setCarga(nueva);
  }

  /**
   * Enter guarda desde cualquiera de los dos campos. No se deja solo al
   * formulario: hay teclados de celular (y navegadores dentro de otras apps)
   * que con «Listo» no lo envían, y el trainer se queda tocando sin que pase nada.
   */
  function alTeclado(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key !== 'Enter' || ev.nativeEvent.isComposing) return;
    ev.preventDefault();
    guardar();
  }

  async function guardar() {
    // Con una marca y no con el estado: dos Enter seguidos llegan antes de
    // que el estado cambie, y mandarían el mismo cambio dos veces al historial.
    if (enCurso.current) return;
    // Lo que no se tocó se manda como estaba: ordenar un texto viejo no es un
    // cambio, y dejaría una línea falsa en el historial de cargas.
    const nuevaCarga = carga.trim() === ejercicio.carga.trim()
      ? ejercicio.carga
      : prolijo(carga, normalizarCarga(carga), LARGOS.carga);
    const nuevasReps = reps.trim() === ejercicio.reps.trim()
      ? ejercicio.reps
      : prolijo(reps, normalizarReps(reps), LARGOS.reps);
    if (nuevaCarga === ejercicio.carga && nuevasReps === ejercicio.reps) {
      onCancelar();
      return;
    }

    enCurso.current = true;
    setOcupado(true);
    onOcupado(true);
    setError('');
    try {
      const { data, error: e } = await clienteNavegador().rpc('cambiar_carga', {
        p_empresa: empresaId,
        p_rutina_ejercicio: ejercicio.id,
        p_carga: nuevaCarga,
        // Null es «no cambia»: así no se toca lo que no se tocó.
        p_reps: nuevasReps === ejercicio.reps ? null : nuevasReps,
      });
      if (e) throw e;
      const res = (data ?? {}) as { carga?: string; reps?: string };
      onListo(ejercicio.id, res.carga ?? nuevaCarga, res.reps ?? nuevasReps);
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      enCurso.current = false;
      setOcupado(false);
      onOcupado(false);
    }
  }

  const chip = (encendido: boolean) => `${encendido ? 'chip-encendido' : 'chip-apagado'} px-3.5 text-[13.5px]`;
  const paso = 'inline-flex min-h-[44px] min-w-[56px] shrink-0 items-center justify-center rounded-full border border-borde bg-superficie px-2 text-[14px] font-bold tabular-nums text-tinta/80 transition active:scale-95 disabled:opacity-40';

  return (
    <form onSubmit={(ev) => { ev.preventDefault(); guardar(); }} className="mt-2.5 space-y-3 rounded-xl bg-superficie p-3 aparecer">
      <div>
        <label htmlFor={`reps-${ejercicio.id}`} className="etiqueta">{h.reps}</label>
        <div className="flex items-center gap-2">
          {ejercicio.series !== null && (
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-tinta/60">{ejercicio.series} ×</span>
          )}
          <input
            ref={campoReps} id={`reps-${ejercicio.id}`} className="campo min-w-0 flex-1"
            value={reps} maxLength={LARGOS.reps} placeholder={h.repsEjemplo}
            autoComplete="off" enterKeyHint="done" onKeyDown={alTeclado}
            onChange={(ev) => setReps(ev.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`carga-${ejercicio.id}`} className="etiqueta">{h.carga}</label>
        <div className="flex items-center gap-2">
          {conPasos && (
            <button
              type="button" className={paso} disabled={menos === null}
              aria-label={t.agenda.rutinaSesion.restarDe(unidad ?? '')}
              onClick={() => { if (menos !== null) { setCarga(menos); setAviso(''); } }}
            >
              {t.agenda.rutinaSesion.restar}
            </button>
          )}
          <input
            ref={campoCarga} id={`carga-${ejercicio.id}`} className="campo min-w-0 flex-1"
            value={carga} maxLength={LARGOS.carga} placeholder={h.cargaEjemplo}
            autoComplete="off" enterKeyHint="done" onKeyDown={alTeclado}
            onChange={(ev) => { setCarga(ev.target.value); setAviso(''); }}
          />
          {conPasos && (
            <button
              type="button" className={paso}
              aria-label={t.agenda.rutinaSesion.sumarDe(unidad ?? '')}
              onClick={() => { if (mas !== null) { setCarga(mas); setAviso(''); } }}
            >
              {t.agenda.rutinaSesion.sumar}
            </button>
          )}
        </div>
        <div className="scroll-limpio -mx-3 mt-2 flex gap-2 overflow-x-auto px-3" role="group" aria-label={h.carga}>
          {UNIDADES_CARGA.map((u) => (
            <button key={u} type="button" onClick={() => tocarUnidad(u)} aria-pressed={unidad === u} className={chip(unidad === u)}>
              {t.rutinasComun.unidadesCarga[u]}
            </button>
          ))}
        </div>
        <p className={`mt-1.5 text-[12px] leading-snug ${aviso || numeroSolo ? 'font-medium text-ambar' : 'text-tinta/45'}`}>
          {aviso || (numeroSolo ? t.rutinasEditor.tarjeta.sinUnidad : h.cargaAyuda)}
        </p>
      </div>

      <MensajeError texto={error} />

      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="boton-suave min-h-[44px]" onClick={onCancelar} disabled={ocupado}>
          {t.comun.cancelar}
        </button>
        <button type="submit" className="boton-principal min-h-[44px]" disabled={ocupado}>
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
      </div>
    </form>
  );
}
