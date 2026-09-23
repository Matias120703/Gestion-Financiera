'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { useLocale, useTextos } from '@/i18n/cliente';
import { sumarDias } from '@/lib/fechas';
import { rutinaComoTexto } from '@/lib/rutina-texto';
import type {
  CarpetaCliente as DatosCarpeta, EnlaceRutina, ProgresoCliente as DatosProgreso,
  RespuestaCopiarRutina, RutinaCompleta,
} from '@/lib/tipos-rutinas';
import { MandarRutina } from './MandarRutina';
import { ProgresoCliente } from './ProgresoCliente';
import { RutinaVista } from './RutinaVista';
import { EmpezarRutina } from './panel/Copiar';
import { Confirmar, MensajeError, MensajeListo, Pestanas } from './panel/Piezas';
import { useAccion } from './panel/useAccion';
import { copiarTexto, fechaCorta, fechaDeMomento, linkDeRutina, primerNombre } from './panel/utiles';

/**
 * LA CARPETA DE UN CLIENTE (098): /rutinas/cliente/[id].
 *
 * Arriba, quién es y (en ámbar) su salud y lesiones: lo primero que tiene
 * que leer quien lo va a entrenar. Nunca se copia a la rutina ni a su link.
 *
 * Dos pestañas: Rutina, para todo el equipo, y Progreso, solo para el dueño
 * o un admin (las medidas son datos de salud).
 *
 * En Rutina, la vigente se lee tal como la ve el cliente, con lo que se hace
 * con ella: mandarla, editarla, copiarla como texto, armar la próxima o
 * terminarla. La próxima («borrador») se prepara sin que el cliente la vea,
 * y recién al activarla pasa a su link. Lo que no se deshace pregunta antes.
 */
export function CarpetaCliente({
  empresaId, zona, hoy, esAdmin, ver, carpeta, progreso, anotar,
}: {
  empresaId: string;
  zona: string;
  hoy: string;
  esAdmin: boolean;
  ver: 'rutina' | 'progreso';
  carpeta: DatosCarpeta;
  progreso: DatosProgreso | null;
  anotar: boolean;
}) {
  const t = useTextos();
  const c = t.rutinasPanel.carpeta;
  const { cliente } = carpeta;
  const salud = (cliente.notas ?? '').trim();
  const base = `/rutinas/cliente/${cliente.id}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/rutinas" className="boton-texto -ml-1 inline-flex min-h-[44px] items-center px-1 text-[14px]">
        ‹ {c.volver}
      </Link>

      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 className="min-w-0 break-words font-titulo text-[25px] font-extrabold leading-tight tracking-tight">{cliente.nombre}</h2>
        {!carpeta.entrenando && <span className="pastilla bg-arena text-tinta/55">{c.noEntrena}</span>}
      </header>

      {salud && (
        <div className="rounded-2xl border border-ambar/40 bg-ambar-claro px-4 py-3">
          <p className="text-[13px] font-bold text-ambar">⚠ {c.salud}</p>
          <p className="mt-1 whitespace-pre-line break-words text-[14px] leading-relaxed text-tinta/85">{salud}</p>
          <p className="mt-1.5 text-[12px] text-tinta/55">{c.saludAyuda}</p>
        </div>
      )}

      {esAdmin && (
        <Pestanas
          actual={ver}
          opciones={[
            { valor: 'rutina', texto: t.rutinasPanel.pestanas.rutina, href: base },
            { valor: 'progreso', texto: t.rutinasPanel.pestanas.progreso, href: `${base}?ver=progreso` },
          ]}
        />
      )}

      {ver === 'progreso' && progreso ? (
        <ProgresoCliente
          empresaId={empresaId} zona={zona} hoy={hoy} progreso={progreso} abrirAnotar={anotar}
        />
      ) : (
        <PestanaRutina empresaId={empresaId} zona={zona} hoy={hoy} carpeta={carpeta} />
      )}
    </div>
  );
}

type Pregunta = 'terminar' | 'activar' | 'borrarProxima' | 'cambiarLink' | null;
/**
 * Dónde se muestra lo que pasó: 'rutina' arriba de todo (terminar, activar,
 * borrar la próxima), 'vigente' al pie de la tarjeta de la vigente, justo
 * debajo de sus botones (copiar como texto, armar la próxima: con un día de
 * seis ejercicios esos botones quedan una pantalla más abajo, y un «Copiado»
 * arriba no se veía), 'enlace' en su link y 'anteriores' en la lista.
 */
type Lugar = 'rutina' | 'vigente' | 'enlace' | 'anteriores';
type Aviso = { texto: string; donde: Lugar; token?: string } | null;

function PestanaRutina({
  empresaId, zona, hoy, carpeta,
}: {
  empresaId: string;
  zona: string;
  hoy: string;
  carpeta: DatosCarpeta;
}) {
  const t = useTextos();
  const c = t.rutinasPanel.carpeta;
  const locale = useLocale();
  const router = useRouter();
  const { ocupado, error, setError, correr } = useAccion();

  const { cliente, vigente, borrador, enlace } = carpeta;
  const pila = primerNombre(cliente.nombre) || cliente.nombre;

  const [pregunta, setPregunta] = useState<Pregunta>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  // Dónde mostrar el error de la última acción: cerca del botón que se tocó.
  const [donde, setDonde] = useState<Lugar>('rutina');
  const [yendo, setYendo] = useState(false);

  const sb = () => clienteNavegador();

  function empezar(lugar: Lugar) {
    setAviso(null);
    setError('');
    setDonde(lugar);
  }

  /**
   * Una rutina nueva a partir de otra de la misma persona, conservando todo
   * (notas incluidas: son suyas).
   *
   * La copia es siempre su próxima (un borrador que no ve) y se abre en el
   * editor. Con una vigente ya nacía así; sin vigente, antes quedaba vigente
   * en el acto y la veía en su link antes de que el trainer la revisara. Con
   * `p_borrador` (099) nada llega al link hasta «Activar la próxima».
   */
  async function armarDesde(origen: string, lugar: Lugar) {
    empezar(lugar);
    const r = await correr(() => sb().rpc('copiar_rutina', {
      p_empresa: empresaId, p_origen: origen, p_cliente: cliente.id, p_con_notas: true, p_borrador: true,
    }), { refrescar: false });
    const copia = r.ok ? (r.data as RespuestaCopiarRutina | null) : null;
    if (copia?.id) {
      setYendo(true);
      router.push(`/rutinas/${copia.id}`);
    }
  }

  async function copiarComoTexto(rutina: RutinaCompleta) {
    empezar('vigente');
    const ok = await copiarTexto(rutinaComoTexto(rutina, t.rutinasComun.texto));
    if (ok) setAviso({ texto: c.textoCopiado, donde: 'vigente' });
    else setError(c.noSeCopio);
  }

  async function responder() {
    if (pregunta === 'terminar' && vigente) {
      const r = await correr(() => sb().rpc('terminar_rutina', { p_empresa: empresaId, p_rutina: vigente.id }));
      if (r.ok) { setPregunta(null); setAviso({ texto: c.terminada, donde: 'rutina' }); }
    } else if (pregunta === 'activar' && borrador) {
      const nombre = borrador.nombre;
      const r = await correr(() => sb().rpc('activar_rutina', { p_empresa: empresaId, p_rutina: borrador.id }));
      if (r.ok) {
        const d = r.data as { id: string; token: string | null } | null;
        setPregunta(null);
        setAviso({ texto: c.activada(nombre, pila), donde: 'rutina', token: d?.token ?? undefined });
      }
    } else if (pregunta === 'borrarProxima' && borrador) {
      const r = await correr(() => sb().rpc('borrar_rutina', { p_empresa: empresaId, p_rutina: borrador.id }));
      if (r.ok) { setPregunta(null); setAviso({ texto: c.proximaBorrada, donde: 'rutina' }); }
    } else if (pregunta === 'cambiarLink') {
      const r = await correr(() => sb().rpc('renovar_enlace_rutina', { p_empresa: empresaId, p_cliente: cliente.id }));
      if (r.ok) {
        const d = r.data as EnlaceRutina | null;
        setPregunta(null);
        setAviso({ texto: t.rutinasPanel.enlace.cambiado, donde: 'enlace', token: d?.token ?? undefined });
      }
    }
  }

  function preguntar(p: Exclude<Pregunta, null>) {
    empezar(p === 'cambiarLink' ? 'enlace' : 'rutina');
    setPregunta(p);
  }

  const cambiaEl = vigente?.desde && vigente.semanas ? sumarDias(vigente.desde, vigente.semanas * 7) : null;
  const vencida = !!cambiaEl && cambiaEl <= hoy;

  const avisoAca = (lugar: 'rutina' | 'vigente' | 'enlace') => (aviso?.donde === lugar ? (
    <MensajeListo texto={aviso.texto}>
      {aviso.token && (
        <MandarRutina
          empresaId={empresaId} clienteId={cliente.id} nombre={cliente.nombre}
          telefono={cliente.telefono} zona={zona} token={aviso.token}
          activo={lugar === 'enlace' ? true : enlace?.activo}
        />
      )}
    </MensajeListo>
  ) : null);

  return (
    <div className="space-y-4">
      {avisoAca('rutina')}
      {donde === 'rutina' && !pregunta && <MensajeError texto={error} />}

      {/* La vigente: lo que el cliente ve hoy en su link. */}
      {vigente ? (
        <section className="tarjeta p-4">
          <p className="titulo-seccion">{c.vigente}</p>
          <h3 className="mt-0.5 break-words text-[19px] font-bold leading-snug tracking-tight">{vigente.nombre}</h3>
          <p className="mt-0.5 text-[13px] text-tinta/60">
            {vigente.desde && c.desde(fechaCorta(vigente.desde, locale, hoy))}
            {cambiaEl && (
              <span className={vencida ? 'font-semibold text-ambar' : ''}>
                {' · '}{(vencida ? c.tocabaCambiarla : c.cambiarlaEl)(fechaCorta(cambiaEl, locale, hoy))}
              </span>
            )}
          </p>

          <div className="mt-4">
            <RutinaVista dias={vigente.dias} notas={vigente.notas} />
          </div>

          <div className="mt-4 space-y-2.5 border-t border-borde pt-4">
            <MandarRutina
              empresaId={empresaId} clienteId={cliente.id} nombre={cliente.nombre}
              telefono={cliente.telefono} zona={zona} token={enlace?.token ?? null} activo={enlace?.activo}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <Link href={`/rutinas/${vigente.id}`} className="boton-suave min-h-[44px]">{c.editar}</Link>
              <button type="button" onClick={() => copiarComoTexto(vigente)} className="boton-suave min-h-[44px] px-3">
                {t.rutinasComun.acciones.copiarTexto}
              </button>
            </div>
            {/* Lo que pasó con estos botones, acá al lado y no arriba de todo. */}
            {avisoAca('vigente')}
            {donde === 'vigente' && !pregunta && <MensajeError texto={error} />}
            {!borrador && (
              <div>
                <button
                  type="button" disabled={ocupado || yendo} onClick={() => armarDesde(vigente.id, 'vigente')}
                  className="boton-suave min-h-[44px] w-full"
                >
                  {yendo ? t.rutinasPanel.copiar.copiando : c.armarLaProxima}
                </button>
                <p className="mt-1.5 text-[12.5px] leading-snug text-tinta/55">{c.armarLaProximaAyuda(pila)}</p>
              </div>
            )}
            <button
              type="button" onClick={() => preguntar('terminar')}
              className="inline-flex min-h-[44px] w-full items-center justify-center text-[13.5px] font-semibold text-tinta/45 hover:text-rojo"
            >
              {c.terminar}
            </button>
          </div>
        </section>
      ) : (
        <section className="tarjeta p-4">
          <h3 className="text-[17px] font-bold tracking-tight">{c.sinRutina}</h3>
          {/* Ya tiene una próxima armada (pasa después de «Terminar»): lo
              obvio es activarla, no empezar otra que la deje colgada. */}
          {borrador && (
            <div className="mt-2 rounded-xl bg-verde-claro px-3.5 py-3">
              <p className="text-[13.5px] font-semibold leading-snug text-verde-fuerte">{c.tieneProximaLista(borrador.nombre)}</p>
              <button type="button" onClick={() => preguntar('activar')} className="boton-principal mt-2.5 min-h-[44px] w-full">
                {c.activarLaProxima}
              </button>
            </div>
          )}
          <p className="mb-3 mt-2 text-[13px] leading-relaxed text-tinta/55">{borrador ? c.oEmpezarOtra : c.sinRutinaAyuda}</p>
          {/* Con la próxima ya armada, las copias (que también nacerían como
              próxima) no se ofrecen: la base las frenaría. */}
          <EmpezarRutina
            empresaId={empresaId} clienteId={cliente.id} nombre={cliente.nombre} modo="inline" tieneProxima={!!borrador}
          />
        </section>
      )}

      {/* La próxima: se prepara sin que el cliente la vea. */}
      {borrador && (
        <section className="tarjeta border-verde/35 p-4">
          <p className="titulo-seccion">{c.proxima}</p>
          <h3 className="mt-0.5 break-words text-[17px] font-bold leading-snug">{borrador.nombre}</h3>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/55">
            {c.actualizada(fechaDeMomento(borrador.updated_at, locale, zona))} · {c.proximaAyuda(pila)}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Link href={`/rutinas/${borrador.id}`} className="boton-suave min-h-[44px] px-3">{c.seguirLaProxima}</Link>
            <button type="button" onClick={() => preguntar('activar')} className="boton-principal min-h-[44px] px-3">
              {c.activarLaProxima}
            </button>
          </div>
          <button
            type="button" onClick={() => preguntar('borrarProxima')}
            className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center text-[13px] font-semibold text-tinta/45 hover:text-rojo"
          >
            {c.borrarLaProxima}
          </button>
        </section>
      )}

      <SuLink
        empresaId={empresaId} clienteId={cliente.id} pila={pila} enlace={enlace}
        entrenando={carpeta.entrenando} ocupado={ocupado}
        aviso={avisoAca('enlace')}
        error={donde === 'enlace' && !pregunta ? error : ''}
        onEmpezar={() => empezar('enlace')}
        onCambiar={() => preguntar('cambiarLink')}
        correr={correr}
        onAviso={(texto) => setAviso({ texto, donde: 'enlace' })}
        onError={(texto) => { setDonde('enlace'); setError(texto); }}
      />

      {carpeta.anteriores.length > 0 && (
        <Anteriores
          empresaId={empresaId} hoy={hoy} anteriores={carpeta.anteriores}
          puedeArmar={!borrador} ocupado={ocupado || yendo} onArmar={(id) => armarDesde(id, 'anteriores')}
          error={donde === 'anteriores' && !pregunta ? error : ''}
        />
      )}

      {pregunta === 'terminar' && vigente && (
        <Confirmar
          titulo={c.terminarPregunta(vigente.nombre)} detalle={c.terminarDetalle(pila)}
          si={c.siTerminar} peligro ocupado={ocupado} error={error}
          onSi={responder} onNo={() => setPregunta(null)}
        />
      )}
      {pregunta === 'activar' && borrador && (
        <Confirmar
          titulo={c.activarPregunta(borrador.nombre)} detalle={c.activarDetalle(pila, vigente?.nombre ?? null)}
          si={c.siActivar} ocupado={ocupado} error={error}
          onSi={responder} onNo={() => setPregunta(null)}
        />
      )}
      {pregunta === 'borrarProxima' && borrador && (
        <Confirmar
          titulo={c.borrarProximaPregunta} detalle={c.borrarProximaDetalle}
          si={c.siBorrar} peligro ocupado={ocupado} error={error}
          onSi={responder} onNo={() => setPregunta(null)}
        />
      )}
      {pregunta === 'cambiarLink' && (
        <Confirmar
          titulo={t.rutinasPanel.enlace.cambiarPregunta} detalle={t.rutinasPanel.enlace.cambiarDetalle(pila)}
          si={t.rutinasPanel.enlace.siCambiar} peligro ocupado={ocupado} error={error}
          onSi={responder} onNo={() => setPregunta(null)}
        />
      )}
    </div>
  );
}

/**
 * EL LINK DEL CLIENTE: uno por persona, siempre con la vigente. Cambiarlo
 * (si se reenvió a quien no debía) deja el viejo sin andar, y por eso
 * pregunta; apagarlo y prenderlo no, porque se deshace con otro toque.
 */
function SuLink({
  empresaId, clienteId, pila, enlace, entrenando, ocupado, aviso, error,
  onEmpezar, onCambiar, correr, onAviso, onError,
}: {
  empresaId: string;
  clienteId: string;
  pila: string;
  enlace: EnlaceRutina | null;
  entrenando: boolean;
  ocupado: boolean;
  aviso: React.ReactNode;
  error: string;
  onEmpezar: () => void;
  onCambiar: () => void;
  correr: ReturnType<typeof useAccion>['correr'];
  onAviso: (texto: string) => void;
  onError: (texto: string) => void;
}) {
  const t = useTextos();
  const e = t.rutinasPanel.enlace;

  async function prender(activo: boolean) {
    onEmpezar();
    await correr(() => clienteNavegador().rpc('activar_enlace_rutina', {
      p_empresa: empresaId, p_cliente: clienteId, p_activo: activo,
    }));
  }

  async function copiarLink() {
    if (!enlace) return;
    onEmpezar();
    try {
      const ok = await copiarTexto(linkDeRutina(window.location.origin, enlace.token));
      if (ok) onAviso(e.linkCopiado);
      else onError(t.rutinasPanel.mandar.noSeCopio);
    } catch (err) {
      onError(mensajeDeError(err, t.errores.generico));
    }
  }

  return (
    <section className="tarjeta p-4">
      <h3 className="text-[15px] font-bold tracking-tight">{e.titulo}</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/65">
        {!enlace ? e.sinLink : enlace.activo ? e.prendido(pila) : e.apagado(pila)}
      </p>

      {enlace?.activo && !entrenando && (
        <p className="mt-2.5 rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium leading-snug text-tinta/80">
          {e.sigueAbierto}
        </p>
      )}

      {aviso && <div className="mt-3">{aviso}</div>}
      <MensajeError texto={error} />

      {enlace && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {enlace.activo && (
              <button type="button" onClick={copiarLink} disabled={ocupado} className="boton-suave min-h-[44px] px-4 text-[13.5px]">
                {e.copiarLink}
              </button>
            )}
            <button type="button" onClick={onCambiar} disabled={ocupado} className="boton-suave min-h-[44px] px-4 text-[13.5px]">
              {e.cambiar}
            </button>
            <button
              type="button" onClick={() => prender(!enlace.activo)} disabled={ocupado}
              className={`${enlace.activo ? 'chip-apagado' : 'boton-principal min-h-[44px]'} px-4 text-[13.5px]`}
            >
              {enlace.activo ? e.apagar : e.prender}
            </button>
          </div>
          {enlace.activo && <p className="mt-2 text-[12.5px] leading-snug text-tinta/50">{e.apagarAyuda}</p>}
        </>
      )}
    </section>
  );
}

/** Las rutinas que ya tuvo, con sus fechas. Se abren en lectura, sin salir de la carpeta. */
function Anteriores({
  empresaId, hoy, anteriores, puedeArmar, ocupado, onArmar, error: errorArmar,
}: {
  empresaId: string;
  hoy: string;
  anteriores: DatosCarpeta['anteriores'];
  puedeArmar: boolean;
  ocupado: boolean;
  onArmar: (origen: string) => void;
  /** Si «Armar una nueva a partir de esta» falló: se dice acá, al lado del botón. */
  error: string;
}) {
  const t = useTextos();
  const c = t.rutinasPanel.carpeta;
  const locale = useLocale();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [leidas, setLeidas] = useState<Record<string, RutinaCompleta>>({});
  const [cargando, setCargando] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function abrir(id: string) {
    setError('');
    if (abierta === id) { setAbierta(null); return; }
    setAbierta(id);
    if (leidas[id]) return;
    setCargando(id);
    try {
      const { data, error: e } = await clienteNavegador().rpc('rutina', { p_empresa: empresaId, p_rutina: id });
      if (e) throw e;
      const r = data as RutinaCompleta | null;
      if (r) setLeidas((antes) => ({ ...antes, [id]: { ...r, dias: Array.isArray(r.dias) ? r.dias : [] } }));
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setAbierta(null);
    } finally {
      setCargando(null);
    }
  }

  return (
    <section className="tarjeta overflow-hidden">
      <h3 className="px-4 pb-1 pt-4 text-[15px] font-bold tracking-tight">{c.anteriores}</h3>
      {error && <div className="px-4"><MensajeError texto={error} /></div>}
      <ul className="divide-y divide-borde">
        {anteriores.map((a) => {
          const r = leidas[a.id];
          return (
            <li key={a.id} className="px-4 py-2.5">
              <button
                type="button" onClick={() => abrir(a.id)} aria-expanded={abierta === a.id}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px] font-semibold">{a.nombre}</span>
                  <span className="block text-[12.5px] tabular-nums text-tinta/55">
                    {c.entre(fechaCorta(a.desde, locale, hoy), a.hasta ? fechaCorta(a.hasta, locale, hoy) : '…')}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">
                  {cargando === a.id ? t.comun.cargando : abierta === a.id ? c.ocultar : c.ver}
                </span>
              </button>
              {abierta === a.id && r && (
                <div className="mb-2 mt-1 aparecer">
                  <RutinaVista dias={r.dias} notas={r.notas} />
                  {puedeArmar && (
                    <>
                      <button
                        type="button" disabled={ocupado} onClick={() => onArmar(a.id)}
                        className="boton-suave mt-3 min-h-[44px] w-full"
                      >
                        {c.armarDesdeEsta}
                      </button>
                      <MensajeError texto={errorArmar} />
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
