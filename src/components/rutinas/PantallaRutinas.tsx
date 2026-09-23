'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { Vacio } from '@/components/Piezas';
import type {
  EjercicioBiblioteca, MotivoAtender, RespuestaCopiarRutina, RutinasDelNegocio,
} from '@/lib/tipos-rutinas';
import { BibliotecaEjercicios } from './BibliotecaEjercicios';
import { Confirmar, MensajeError, MensajeListo, Pestanas } from './panel/Piezas';
import { EmpezarRutina, UsarPlantilla } from './panel/Copiar';
import { useAccion } from './panel/useAccion';
import { fechaCorta, fechaDeMomento } from './panel/utiles';

export type VistaRutinas = 'clientes' | 'plantillas' | 'ejercicios';

type ClienteRutinas = RutinasDelNegocio['clientes'][number];
type Plantilla = RutinasDelNegocio['plantillas'][number];

/**
 * RUTINAS (098): la pantalla del trainer para sus rutinas.
 *
 * Tres pestañas que viven en la dirección (?ver=): Clientes, Plantillas y
 * Ejercicios. Clientes abre primero porque la pregunta de todos los días es
 * sobre una persona: «¿a quién le falta rutina?», «¿a quién le toca
 * cambiarla?». Por eso arriba va «Para atender», cada cosa con el botón que
 * la resuelve, y abajo la lista de quienes entrenan con su rutina.
 *
 * «Entrenando» lo decide la base (paquete activo, una sesión cerca o una
 * rutina): el cliente que dejó de venir no se archiva, y sin ese filtro la
 * lista y «sin rutina» se llenarían de gente que ya no está. «Ver todos»
 * muestra al resto.
 */
export function PantallaRutinas({
  empresaId, zona, hoy, esAdmin, ver, todos, datos, ejercicios,
}: {
  empresaId: string;
  zona: string;
  hoy: string;
  esAdmin: boolean;
  ver: VistaRutinas;
  todos: boolean;
  datos: RutinasDelNegocio;
  /** La biblioteca: solo llega con la pestaña Ejercicios abierta. */
  ejercicios: EjercicioBiblioteca[] | null;
}) {
  const t = useTextos();
  const p = t.rutinasPanel;

  const pestanas = [
    { valor: 'clientes', texto: p.pestanas.clientes, href: todos ? '/rutinas?todos=1' : '/rutinas' },
    { valor: 'plantillas', texto: p.pestanas.plantillas, href: '/rutinas?ver=plantillas' },
    { valor: 'ejercicios', texto: p.pestanas.ejercicios, href: '/rutinas?ver=ejercicios' },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Pestanas opciones={pestanas} actual={ver} />
      {ver === 'clientes' && (
        <PestanaClientes empresaId={empresaId} hoy={hoy} todos={todos} datos={datos} />
      )}
      {ver === 'plantillas' && (
        <PestanaPlantillas empresaId={empresaId} zona={zona} esAdmin={esAdmin} plantillas={datos.plantillas} />
      )}
      {ver === 'ejercicios' && (
        <BibliotecaEjercicios empresaId={empresaId} esAdmin={esAdmin} ejercicios={ejercicios ?? []} />
      )}
    </div>
  );
}

// ─────────────────────────── Clientes ───────────────────────────

function PestanaClientes({
  empresaId, hoy, todos, datos,
}: {
  empresaId: string;
  hoy: string;
  todos: boolean;
  datos: RutinasDelNegocio;
}) {
  const t = useTextos();
  const l = t.rutinasPanel.lista;
  const [busca, setBusca] = useState('');

  const porId = useMemo(() => new Map(datos.clientes.map((c) => [c.id, c])), [datos.clientes]);

  const texto = busca.trim().toLowerCase();
  const visibles = texto
    ? datos.clientes.filter((c) => c.nombre.toLowerCase().includes(texto)
      || (c.vigente?.nombre ?? '').toLowerCase().includes(texto))
    : datos.clientes;

  return (
    <div className="space-y-4">
      {datos.para_atender.length > 0 && (
        <ParaAtender empresaId={empresaId} items={datos.para_atender} porId={porId} />
      )}

      <section className="tarjeta overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3">
          <h2 className="text-[15px] font-bold tracking-tight">{todos ? l.todosTusClientes : l.quienesEntrenan}</h2>
          <Link
            href={todos ? '/rutinas' : '/rutinas?todos=1'} replace scroll={false}
            className="boton-texto -mr-1 inline-flex min-h-[44px] items-center px-1 text-[13.5px]"
          >
            {todos ? l.verQuienesEntrenan : l.verTodos}
          </Link>
        </div>

        {datos.clientes.length > 6 && (
          <div className="px-4 pb-2 pt-1">
            <input
              className="campo" placeholder={l.buscar} value={busca} aria-label={l.buscar}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}

        {datos.clientes.length === 0 ? (
          todos
            ? <Vacio titulo={l.sinClientes} detalle={l.sinClientesDetalle} />
            : <Vacio titulo={l.nadieEntrenando} detalle={l.nadieEntrenandoDetalle} />
        ) : visibles.length === 0 ? (
          <Vacio titulo={l.nadieCoincide} detalle={l.nadieCoincideDetalle(busca.trim())} />
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((c) => <FilaCliente key={c.id} c={c} hoy={hoy} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * «Para atender»: lo que hay que hacer hoy, cada cosa con su botón.
 * Sin rutina → armarla ahí mismo (o, si ya tiene la próxima armada, ir a
 * activarla a su carpeta); toca cambiarla → armar la próxima (o
 * seguirla, si ya está empezada); hace más de un mes que no se mide →
 * anotar el control (solo le llega a quien ve las medidas).
 */
function ParaAtender({
  empresaId, items, porId,
}: {
  empresaId: string;
  items: RutinasDelNegocio['para_atender'];
  porId: Map<string, ClienteRutinas>;
}) {
  const t = useTextos();
  const l = t.rutinasPanel.lista;
  const router = useRouter();
  const { ocupado, error, correr } = useAccion();
  const [armando, setArmando] = useState<{ id: string; nombre: string } | null>(null);
  const [copiando, setCopiando] = useState<string | null>(null);

  async function armarLaProxima(vigenteId: string, clienteId: string) {
    setCopiando(clienteId);
    const r = await correr(() => clienteNavegador().rpc('copiar_rutina', {
      p_empresa: empresaId, p_origen: vigenteId, p_cliente: clienteId, p_con_notas: true,
    }), { refrescar: false });
    const copia = r.ok ? (r.data as RespuestaCopiarRutina | null) : null;
    if (copia?.id) router.push(`/rutinas/${copia.id}`);
    else setCopiando(null);
  }

  const accion = (cliente: string, nombre: string, motivo: MotivoAtender) => {
    const c = porId.get(cliente);
    const clase = 'boton-suave min-h-[44px] shrink-0 px-3.5 text-[13px]';
    if (motivo === 'medir') {
      return (
        <Link href={`/rutinas/cliente/${cliente}?ver=progreso&anotar=1`} className={clase}>
          {l.anotarControl}
        </Link>
      );
    }
    if (motivo === 'cambiar') {
      if (c?.borrador_id) {
        return <Link href={`/rutinas/${c.borrador_id}`} className={clase}>{l.seguirLaProxima}</Link>;
      }
      if (c?.vigente) {
        const vigenteId = c.vigente.id;
        return (
          <button type="button" disabled={ocupado || copiando !== null} className={clase}
            onClick={() => armarLaProxima(vigenteId, cliente)}>
            {copiando === cliente ? t.rutinasPanel.copiar.copiando : l.armarLaProxima}
          </button>
        );
      }
      return <Link href={`/rutinas/cliente/${cliente}`} className={clase}>{l.armarLaProxima}</Link>;
    }
    // Sin vigente pero con la próxima armada (pasa al tocar «Terminar» con
    // una próxima en preparación): lo obvio es activarla, y eso se hace en su
    // carpeta. Armar otra acá dejaría dos rutinas para la misma persona.
    if (c?.borrador_id) {
      return <Link href={`/rutinas/cliente/${cliente}`} className={clase}>{l.verLaProxima}</Link>;
    }
    return (
      <button type="button" className={clase} onClick={() => setArmando({ id: cliente, nombre })}>
        {l.armarSuRutina}
      </button>
    );
  };

  return (
    <section className="tarjeta overflow-hidden border-ambar/35">
      <h2 className="bg-ambar-claro/60 px-4 py-2.5 text-[14px] font-bold tracking-tight">
        {l.paraAtender} <span className="font-semibold text-tinta/50">· {items.length}</span>
      </h2>
      {error && <div className="px-4"><MensajeError texto={error} /></div>}
      <ul className="divide-y divide-borde">
        {items.map((a) => (
          <li key={`${a.cliente_id}-${a.motivo}`} className="flex items-center gap-3 px-4 py-2.5">
            <Link href={`/rutinas/cliente/${a.cliente_id}`} className="min-w-0 flex-1 py-1">
              <span className="block truncate text-[14.5px] font-semibold">{a.nombre}</span>
              <span className="block text-[12.5px] leading-snug text-tinta/55">
                {a.motivo === 'sin_rutina' && porId.get(a.cliente_id)?.borrador_id ? l.sinRutinaConProxima : l.motivos[a.motivo]}
              </span>
            </Link>
            {accion(a.cliente_id, a.nombre, a.motivo)}
          </li>
        ))}
      </ul>

      {armando && (
        <EmpezarRutina
          empresaId={empresaId} clienteId={armando.id} nombre={armando.nombre}
          modo="hoja" onCerrar={() => setArmando(null)}
        />
      )}
    </section>
  );
}

function FilaCliente({ c, hoy }: { c: ClienteRutinas; hoy: string }) {
  const t = useTextos();
  const l = t.rutinasPanel.lista;
  const locale = useLocale();
  const v = c.vigente;
  const vencida = !!v?.cambia_el && v.cambia_el <= hoy;

  // «Fuerza base · desde el 15/09 · cambiarla el 13/10»
  const detalle = v
    ? [
      v.nombre,
      l.desde(fechaCorta(v.desde, locale, hoy)),
      v.cambia_el ? (vencida ? l.tocabaCambiarla : l.cambiarlaEl)(fechaCorta(v.cambia_el, locale, hoy)) : '',
    ].filter(Boolean)
    : [];

  return (
    <li>
      <Link
        href={`/rutinas/cliente/${c.id}`}
        aria-label={`${c.nombre} · ${l.abrirCarpeta}`}
        className="flex min-h-[60px] items-center gap-3 px-4 py-3 transition hover:bg-arena/60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{c.nombre}</span>
          {v ? (
            <span className="mt-0.5 block text-[12.5px] leading-snug text-tinta/60">
              {detalle.map((d, i) => (
                <span key={i} className={i === 2 && vencida ? 'font-semibold text-ambar' : ''}>
                  {i > 0 && ' · '}{d}
                </span>
              ))}
            </span>
          ) : (
            <span className="mt-0.5 block text-[12.5px] font-semibold text-ambar">{l.sinRutina}</span>
          )}
          <span className="mt-1 flex flex-wrap gap-1.5">
            {c.borrador_id && <span className="pastilla bg-verde-claro text-verde-fuerte">{l.proximaEnPreparacion}</span>}
            {c.enlace && (
              <span className={`pastilla ${c.enlace.activo ? 'bg-arena text-tinta/60' : 'bg-rojo-claro text-rojo'}`}>
                {c.enlace.activo ? l.linkPrendido : l.linkApagado}
              </span>
            )}
            {!c.entrenando && <span className="pastilla bg-arena text-tinta/50">{l.noEntrena}</span>}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[20px] text-tinta/30">›</span>
      </Link>
    </li>
  );
}

// ─────────────────────────── Plantillas ───────────────────────────

function PestanaPlantillas({
  empresaId, zona, esAdmin, plantillas,
}: {
  empresaId: string;
  zona: string;
  esAdmin: boolean;
  plantillas: Plantilla[];
}) {
  const t = useTextos();
  const p = t.rutinasPanel.plantillas;
  const locale = useLocale();
  const { ocupado, error, setError, correr } = useAccion();
  const [usando, setUsando] = useState<Plantilla | null>(null);
  const [borrando, setBorrando] = useState<Plantilla | null>(null);
  const [aviso, setAviso] = useState('');

  async function borrar() {
    if (!borrando) return;
    const r = await correr(() => clienteNavegador().rpc('borrar_rutina', { p_empresa: empresaId, p_rutina: borrando.id }));
    if (r.ok) {
      setBorrando(null);
      setAviso(p.borrada);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13.5px] leading-relaxed text-tinta/60">{p.explicacion}</p>
        <Link href="/rutinas/nueva?plantilla=1" className="boton-principal min-h-[44px] shrink-0">{p.nueva}</Link>
      </div>

      <MensajeListo texto={aviso} />

      {plantillas.length === 0 ? (
        <div className="tarjeta"><Vacio titulo={p.ninguna} detalle={p.ningunaDetalle} /></div>
      ) : (
        <ul className="space-y-2.5">
          {plantillas.map((pl) => (
            <li key={pl.id} className="tarjeta p-4">
              <Link href={`/rutinas/${pl.id}`} className="block">
                <p className="break-words text-[15.5px] font-bold leading-snug">{pl.nombre}</p>
                <p className="mt-0.5 text-[12.5px] text-tinta/55">
                  {[
                    p.resumen(pl.dias, pl.ejercicios),
                    pl.semanas ? p.semanas(pl.semanas) : '',
                    t.rutinasPanel.carpeta.actualizada(fechaDeMomento(pl.updated_at, locale, zona)),
                  ].filter(Boolean).join(' · ')}
                </p>
              </Link>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { setAviso(''); setUsando(pl); }} className="boton-principal min-h-[44px] px-4 text-[13.5px]">
                  {p.usarParaUnCliente}
                </button>
                <Link href={`/rutinas/${pl.id}`} className="boton-suave min-h-[44px] px-4 text-[13.5px]">{p.abrir}</Link>
                {esAdmin && (
                  <button
                    type="button" onClick={() => { setError(''); setAviso(''); setBorrando(pl); }}
                    className="ml-auto inline-flex min-h-[44px] items-center px-2 text-[13px] font-semibold text-tinta/45 hover:text-rojo"
                  >
                    {p.borrar}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {usando && (
        <UsarPlantilla empresaId={empresaId} plantilla={usando} onCerrar={() => setUsando(null)} />
      )}

      {borrando && (
        <Confirmar
          titulo={p.borrarPregunta(borrando.nombre)} detalle={p.borrarDetalle}
          si={p.siBorrar} peligro ocupado={ocupado} error={error}
          onSi={borrar} onNo={() => setBorrando(null)}
        />
      )}
    </div>
  );
}
