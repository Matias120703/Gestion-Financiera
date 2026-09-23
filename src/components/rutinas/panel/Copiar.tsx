'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { useTextos } from '@/i18n/cliente';
import type { RespuestaCopiarRutina, RutinasDelNegocio } from '@/lib/tipos-rutinas';
import { Hoja, MensajeError } from './Piezas';
import { primerNombre } from './utiles';

/**
 * COPIAR UNA RUTINA DE OTRO LADO (098): de una plantilla o de otra persona.
 *
 * Lo que manda acá es la revisión crítica: las notas de una rutina son
 * texto que ve el cliente, y un trainer escribe ahí «por tu hernia, sin
 * peso muerto». Copiar la rutina de Ana para Pedro sin preguntar pondría la
 * hernia de Ana en el link de Pedro. Por eso toda copia entre personas (o
 * desde una plantilla, que alguna vez fue de alguien) pregunta con dos
 * botones del mismo tamaño, y el primero es el seguro: «sin las notas».
 * Además la base saca del nombre el de la persona de origen.
 *
 * Copiar dentro de la misma persona («Armar la próxima») no pregunta: son
 * sus propias notas.
 *
 * LA COPIA NACE COMO SU PRÓXIMA
 *
 * `copiar_rutina` con `p_borrador` (099): aunque la persona no tenga rutina
 * vigente, la copia queda como su próxima (un borrador que no ve) y se abre
 * en el editor. Antes, sin vigente, la copia quedaba vigente en el acto: la
 * veía en su link —con las notas de la otra persona, si se eligieron— antes
 * de que el trainer abriera el editor, aunque la pantalla le decía que la
 * revisara. Ahora nada llega al link hasta «Activar la próxima», en su
 * carpeta. Si ya tenía una próxima en preparación, la base frena («seguí
 * con esa») y acá se muestra.
 */

/** Las plantillas y quién tiene rutina: se piden al abrir la hoja, no antes. */
function useFuentes(empresaId: string) {
  const t = useTextos();
  const [datos, setDatos] = useState<RutinasDelNegocio | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (datos || cargando) return;
    setCargando(true);
    setError('');
    try {
      // Con p_todos: para elegir a quién, sirve cualquier cliente activo,
      // entrene ahora o no.
      const { data, error: e } = await clienteNavegador()
        .rpc('rutinas_de', { p_empresa: empresaId, p_todos: true });
      if (e) throw e;
      const d = data as RutinasDelNegocio | null;
      setDatos({
        clientes: Array.isArray(d?.clientes) ? d.clientes : [],
        para_atender: Array.isArray(d?.para_atender) ? d.para_atender : [],
        plantillas: Array.isArray(d?.plantillas) ? d.plantillas : [],
      });
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setCargando(false);
    }
  }, [datos, cargando, empresaId, t]);

  return { datos, cargando, error, cargar };
}

/**
 * La dirección del editor para una copia recién hecha: el editor dice
 * arriba que es una copia y, si vinieron las notas de la original, que
 * hay que revisarlas antes de activarla.
 */
export function editorDeCopia(rutinaId: string, conNotas: boolean): string {
  return `/rutinas/${rutinaId}?copiada=1&notas=${conNotas ? 1 : 0}`;
}

/** Copia en la base como su próxima (`p_borrador`) y abre el editor con ella. */
function useCopiar(empresaId: string) {
  const t = useTextos();
  const router = useRouter();
  // Mientras copia y abre el editor, los botones siguen quietos: un segundo
  // toque no copia dos veces.
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  const copiar = useCallback(async (origen: string, cliente: string, conNotas: boolean) => {
    setOcupado(true);
    setError('');
    try {
      const { data, error: e } = await clienteNavegador().rpc('copiar_rutina', {
        p_empresa: empresaId, p_origen: origen, p_cliente: cliente, p_con_notas: conNotas,
        // Aunque no tenga vigente, nace como su próxima: nada llega a su link
        // hasta «Activar la próxima» (099).
        p_borrador: true,
        // Si al sacarle el nombre de la otra persona no queda nada, el de
        // respaldo va en el idioma de la pantalla: «Rutina» llegaba al link
        // de un cliente brasileño (099).
        p_nombre_vacio: t.rutinasEditor.datos.nombrePorDefecto,
      });
      if (e) throw e;
      const r = data as RespuestaCopiarRutina | null;
      if (!r?.id) {
        setError(t.errores.generico);
        setOcupado(false);
        return;
      }
      router.push(editorDeCopia(r.id, conNotas));
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      setOcupado(false);
    }
  }, [empresaId, router, t]);

  return { ocupado, error, copiar };
}

/**
 * «¿Copiar también las notas?», con la explicación de por qué se pregunta.
 * `deQuien` es el nombre de la persona de origen; null si es una plantilla.
 */
export function ConfirmarCopia({
  deQuien, ocupado, error, onElegir, onVolver,
}: {
  deQuien: string | null;
  ocupado: boolean;
  error: string;
  onElegir: (conNotas: boolean) => void;
  onVolver: () => void;
}) {
  const t = useTextos();
  const c = t.rutinasPanel.copiar;
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-tinta/75">
        {deQuien ? c.deOtraPersona(primerNombre(deQuien) || deQuien) : c.dePlantilla}
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-tinta/55">{c.revisalas}</p>
      <MensajeError texto={error} />
      <div className="mt-5 grid gap-2.5">
        <button type="button" disabled={ocupado} onClick={() => onElegir(false)} className="boton-principal min-h-[48px] w-full">
          {ocupado ? c.copiando : c.sinNotas}
        </button>
        <button type="button" disabled={ocupado} onClick={() => onElegir(true)} className="boton-suave min-h-[48px] w-full">
          {c.conNotas}
        </button>
        <button type="button" disabled={ocupado} onClick={onVolver} className="boton-texto min-h-[44px] w-full">
          {t.comun.volver}
        </button>
      </div>
    </div>
  );
}

type Paso =
  | { tipo: 'opciones' }
  | { tipo: 'plantilla' }
  | { tipo: 'otro' }
  | { tipo: 'confirmar'; origen: string; deQuien: string | null; volverA: 'plantilla' | 'otro' };

/**
 * «Todavía no tiene rutina»: armar desde cero, usar una plantilla o copiar
 * la de otro cliente.
 *
 * `modo="inline"` (la carpeta): las tres opciones van en la pantalla y lo que
 * sigue se abre en una hoja. `modo="hoja"` («Para atender» de la lista):
 * todo va en una hoja desde el primer toque.
 *
 * Con una próxima ya en preparación (`tieneProxima`) queda solo «desde
 * cero»: una copia también nacería como próxima y la base la frena («ya
 * tiene una próxima»), así que no se ofrece lo que no va a andar.
 */
export function EmpezarRutina({
  empresaId, clienteId, nombre, modo, tieneProxima = false, onCerrar,
}: {
  empresaId: string;
  clienteId: string;
  nombre: string;
  modo: 'inline' | 'hoja';
  /** Ya tiene una próxima rutina en preparación. */
  tieneProxima?: boolean;
  onCerrar?: () => void;
}) {
  const t = useTextos();
  const c = t.rutinasPanel.carpeta;
  const e = t.rutinasPanel.elegir;
  const fuentes = useFuentes(empresaId);
  const { ocupado, error, copiar } = useCopiar(empresaId);
  const [paso, setPaso] = useState<Paso>({ tipo: 'opciones' });
  const [busca, setBusca] = useState('');

  const cerrarHoja = () => {
    if (ocupado) return;
    if (modo === 'hoja') onCerrar?.();
    else setPaso({ tipo: 'opciones' });
    setBusca('');
  };

  const ir = (tipo: 'plantilla' | 'otro') => {
    setPaso({ tipo });
    setBusca('');
    void fuentes.cargar();
  };

  const opciones = (
    <div className="grid gap-2.5">
      <Link
        href={`/rutinas/nueva?cliente=${clienteId}`}
        className="flex min-h-[56px] flex-col justify-center rounded-2xl border border-verde/40 bg-verde-claro px-4 py-3 text-left transition active:scale-[.99]"
      >
        <span className="text-[15px] font-bold text-verde-fuerte">{c.desdeCero}</span>
        <span className="mt-0.5 text-[12.5px] text-tinta/60">{c.desdeCeroAyuda}</span>
      </Link>
      {!tieneProxima && (
        <>
          <button
            type="button" onClick={() => ir('plantilla')}
            className="flex min-h-[56px] flex-col justify-center rounded-2xl border border-borde bg-superficie px-4 py-3 text-left transition active:scale-[.99]"
          >
            <span className="text-[15px] font-bold">{c.usarPlantilla}</span>
            <span className="mt-0.5 text-[12.5px] text-tinta/55">{c.usarPlantillaAyuda}</span>
          </button>
          <button
            type="button" onClick={() => ir('otro')}
            className="flex min-h-[56px] flex-col justify-center rounded-2xl border border-borde bg-superficie px-4 py-3 text-left transition active:scale-[.99]"
          >
            <span className="text-[15px] font-bold">{c.copiarDeOtro}</span>
            <span className="mt-0.5 text-[12.5px] text-tinta/55">{c.copiarDeOtroAyuda}</span>
          </button>
        </>
      )}
    </div>
  );

  const texto = busca.trim().toLowerCase();
  const otros = (fuentes.datos?.clientes ?? [])
    .filter((x) => x.id !== clienteId && x.vigente)
    .filter((x) => !texto || x.nombre.toLowerCase().includes(texto) || (x.vigente?.nombre ?? '').toLowerCase().includes(texto));
  const plantillas = fuentes.datos?.plantillas ?? [];

  let contenido: React.ReactNode = null;
  let titulo = '';
  if (paso.tipo === 'opciones') {
    titulo = t.rutinasPanel.lista.armarSuRutina;
    contenido = (
      <>
        <p className="mb-3 text-[13.5px] font-semibold text-tinta/60">{nombre}</p>
        {opciones}
      </>
    );
  } else if (paso.tipo === 'plantilla') {
    titulo = e.plantilla;
    contenido = (
      <ListaParaElegir
        cargando={!fuentes.datos && !fuentes.error}
        error={fuentes.error}
        vacio={e.sinPlantillas}
        items={plantillas.map((p) => ({
          id: p.id,
          titulo: p.nombre,
          detalle: t.rutinasPanel.plantillas.resumen(p.dias, p.ejercicios),
          onElegir: () => setPaso({ tipo: 'confirmar', origen: p.id, deQuien: null, volverA: 'plantilla' }),
        }))}
      />
    );
  } else if (paso.tipo === 'otro') {
    titulo = e.deQuien;
    const hayMuchos = (fuentes.datos?.clientes ?? []).filter((x) => x.id !== clienteId && x.vigente).length > 6;
    contenido = (
      <>
        {hayMuchos && (
          <input
            className="campo mb-3" placeholder={e.buscar} value={busca}
            onChange={(ev) => setBusca(ev.target.value)} aria-label={e.buscar}
          />
        )}
        <ListaParaElegir
          cargando={!fuentes.datos && !fuentes.error}
          error={fuentes.error}
          vacio={texto ? t.rutinasPanel.lista.nadieCoincideDetalle(busca.trim()) : e.nadieConRutina}
          items={otros.map((x) => ({
            id: x.id,
            titulo: x.nombre,
            detalle: x.vigente?.nombre ?? '',
            onElegir: () => setPaso({ tipo: 'confirmar', origen: x.vigente!.id, deQuien: x.nombre, volverA: 'otro' }),
          }))}
        />
      </>
    );
  } else {
    titulo = t.rutinasPanel.copiar.pregunta;
    const volverA = paso.volverA;
    contenido = (
      <ConfirmarCopia
        deQuien={paso.deQuien} ocupado={ocupado} error={error}
        onElegir={(conNotas) => { copiar(paso.origen, clienteId, conNotas); }}
        onVolver={() => setPaso({ tipo: volverA })}
      />
    );
  }

  if (modo === 'inline') {
    return (
      <>
        {opciones}
        {paso.tipo !== 'opciones' && (
          <Hoja titulo={titulo} onCerrar={cerrarHoja} bloqueada={ocupado}>{contenido}</Hoja>
        )}
      </>
    );
  }

  return <Hoja titulo={titulo} onCerrar={cerrarHoja} bloqueada={ocupado}>{contenido}</Hoja>;
}

/**
 * «Usar para un cliente» (pestaña Plantillas): elegir a quién, confirmar
 * las notas y abrir el editor con la copia, que queda como la próxima de
 * esa persona (tenga o no una vigente).
 */
export function UsarPlantilla({
  empresaId, plantilla, onCerrar,
}: {
  empresaId: string;
  plantilla: { id: string; nombre: string };
  onCerrar: () => void;
}) {
  const t = useTextos();
  const e = t.rutinasPanel.elegir;
  const fuentes = useFuentes(empresaId);
  const { ocupado, error, copiar } = useCopiar(empresaId);
  const [destino, setDestino] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Se pide una sola vez, al abrir.
  useEffect(() => { void fuentes.cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const texto = busca.trim().toLowerCase();
  const clientes = (fuentes.datos?.clientes ?? [])
    .filter((x) => !texto || x.nombre.toLowerCase().includes(texto));

  return (
    <Hoja titulo={destino ? t.rutinasPanel.copiar.pregunta : e.paraQuien} onCerrar={() => { if (!ocupado) onCerrar(); }} bloqueada={ocupado}>
      {destino ? (
        <ConfirmarCopia
          deQuien={null} ocupado={ocupado} error={error}
          onElegir={(conNotas) => { copiar(plantilla.id, destino, conNotas); }}
          onVolver={() => setDestino(null)}
        />
      ) : (
        <>
          <p className="mb-3 text-[13.5px] font-semibold text-tinta/60">{plantilla.nombre}</p>
          {(fuentes.datos?.clientes.length ?? 0) > 6 && (
            <input
              className="campo mb-3" placeholder={e.buscar} value={busca}
              onChange={(ev) => setBusca(ev.target.value)} aria-label={e.buscar}
            />
          )}
          <ListaParaElegir
            cargando={!fuentes.datos && !fuentes.error}
            error={fuentes.error}
            vacio={texto ? t.rutinasPanel.lista.nadieCoincideDetalle(busca.trim()) : e.ninguno}
            items={clientes.map((x) => ({
              id: x.id,
              titulo: x.nombre,
              // Con `p_borrador` la copia es siempre su próxima, tenga o no una
              // vigente. Con una próxima ya armada la base no deja otra
              // («seguí con esa»): se ve, pero no se elige.
              detalle: x.borrador_id ? e.yaTieneProxima : x.vigente ? e.quedaComoProxima : e.quedaComoSuRutina,
              deshabilitado: !!x.borrador_id,
              onElegir: () => setDestino(x.id),
            }))}
          />
        </>
      )}
    </Hoja>
  );
}

function ListaParaElegir({
  cargando, error, vacio, items,
}: {
  cargando: boolean;
  error: string;
  vacio: string;
  items: { id: string; titulo: string; detalle: string; deshabilitado?: boolean; onElegir: () => void }[];
}) {
  const t = useTextos();
  if (error) return <MensajeError texto={error} />;
  if (cargando) return <p className="py-3 text-[13.5px] text-tinta/50">{t.comun.cargando}</p>;
  if (items.length === 0) return <p className="py-3 text-[13.5px] leading-relaxed text-tinta/55">{vacio}</p>;
  return (
    <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button" onClick={i.onElegir} disabled={i.deshabilitado}
            className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-arena disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-semibold">{i.titulo}</span>
              {i.detalle && <span className="block truncate text-[12.5px] text-tinta/55">{i.detalle}</span>}
            </span>
            {!i.deshabilitado && <span aria-hidden className="shrink-0 text-[18px] text-tinta/30">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
