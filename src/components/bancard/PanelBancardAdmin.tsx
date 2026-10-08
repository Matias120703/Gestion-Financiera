'use client';

import { useCallback, useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { Confirmar, Hoja, MensajeError, PieHoja } from '@/components/Hoja';

/**
 * BANCARD EN EL PANEL DE LA ADMINISTRACIÓN (español fijo, como todo /admin).
 *
 * Lo que hace falta para correr la lista de tests del portal y para atender
 * un pago que quedó raro:
 *
 *   · La tarjeta general: entorno, si las claves están cargadas (nunca su
 *     valor), si está abierto a todos, «Probar conexión», y los pagos para
 *     revisar y los últimos.
 *   · «Tarjetas olvidadas en Bancard»: las que quedaron guardadas en Bancard
 *     a nombre de una cuenta que ya no existe (o que Orden dio por no
 *     guardadas). Se buscan por número de pagador y se borran de a una.
 *   · En la ficha de cada cuenta: «Puede pagar con Bancard» (la cuenta de
 *     prueba que se le da al certificador), y sus pagos, con la autorización
 *     y el ticket (acá sí: lo ve solo la administración), «Consultar a
 *     Bancard» y «Revertir».
 *
 * La seguridad no está acá: cada función de la base exige `es_superadmin()`
 * y cada ruta de /api/admin/bancard también.
 */

export interface ConfigBancardAdmin {
  configurado: boolean;
  entorno: 'staging' | 'produccion' | null;
  motivo: 'sin_entorno' | 'clave_publica' | 'clave_privada' | null;
  /** Qué le pasa a la clave que no sirve, sin mostrarla (`estadoDeConfiguracion`). */
  falla?: { falta: boolean; conEspacios: boolean; largo: number } | null;
  abierto: boolean;
}

/**
 * Por qué no sirve una clave, dicho de forma que se pueda arreglar en Vercel
 * sin pegarla en ningún lado: si no llegó, si tiene un espacio o cuánto mide.
 * «No llegó» casi siempre es que se cargó DESPUÉS del último deploy: las
 * variables nuevas recién valen desde el Redeploy.
 */
function queLePasa(nombre: string, largoEsperado: number, falla: ConfigBancardAdmin['falla']): string {
  if (!falla || falla.falta) {
    return `${nombre} no llegó a este servidor. Revisá en Vercel que exista con ese nombre exacto, en Production, y hacé Redeploy.`;
  }
  if (falla.conEspacios) {
    return `${nombre} tiene un espacio o un salto de línea adentro. Volvé a copiarla del portal de Bancard, sin espacios, y hacé Redeploy.`;
  }
  return `${nombre} tiene ${falla.largo} caracteres y la de Bancard tiene ${largoEsperado}. Volvé a copiarla entera del portal y hacé Redeploy.`;
}

interface OperacionAdmin {
  operacion: number;
  empresa_id: string;
  empresa: string;
  entorno: string;
  tipo: string;
  medio: string;
  origen: string;
  plan: string;
  periodo: string;
  personas: number | null;
  importe: number;
  estado: string;
  creada: string;
  confirmada: string | null;
  descripcion: string | null;
  codigo: string | null;
  autorizacion: string | null;
  ticket: string | null;
  antes: { plan?: string; estado?: string; periodo_fin?: string | null } | null;
  vence: string | null;
  ingreso_id: string | null;
  comision_id: string | null;
  motivo: string | null;
  revisar: string | null;
  consultas: number;
  puede_revertir: boolean;
  por_que_no: string | null;
  eventos: { tipo: string; ok: boolean; clave: string | null; http: number | null; cuando: string }[];
}

interface DatosAdmin {
  habilitada: boolean | null;
  tarjeta: { marca: string | null; ultimos4: string | null; entorno: string } | null;
  debito: { activo: boolean; estado: string; ultimo_error: string | null } | null;
  operaciones: OperacionAdmin[];
}

const NOMBRE_PLAN: Record<string, string> = { basico: 'Básico', pro: 'Pro', negocio: 'Premium' };
const ESTADO: Record<string, { texto: string; clase: string }> = {
  creada: { texto: 'Abierta', clase: 'bg-arena text-tinta/60' },
  en_3ds: { texto: 'Esperando 3D Secure', clase: 'bg-ambar-claro text-ambar' },
  incierta: { texto: 'Incierta', clase: 'bg-ambar-claro text-ambar' },
  pagada: { texto: 'Pagada', clase: 'bg-verde-claro text-verde-fuerte' },
  rechazada: { texto: 'Rechazada', clase: 'bg-rojo-claro text-rojo' },
  revertida: { texto: 'Revertida', clase: 'bg-arena text-tinta/60' },
  vencida: { texto: 'Vencida', clase: 'bg-arena text-tinta/50' },
};

const gs = (n: number) => `Gs. ${Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
const cuando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' })
  : '—');

function useOperaciones(empresaId: string | null, limite: number) {
  const [datos, setDatos] = useState<DatosAdmin | null>(null);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    setError('');
    const { data, error: e } = await clienteNavegador().rpc('bancard_operaciones_admin', {
      p_empresa: empresaId, p_limite: limite,
    });
    if (e) { setError(mensajeDeError(e, 'No se pudieron leer los pagos de Bancard.')); return; }
    setDatos(data as DatosAdmin);
  }, [empresaId, limite]);
  useEffect(() => { void cargar(); }, [cargar]);
  return { datos, error, cargar };
}

// ------------------------------------------------------------ la general

export function TarjetaBancardAdmin({ config }: { config: ConfigBancardAdmin }) {
  const { datos, error, cargar } = useOperaciones(null, 20);
  const [probando, setProbando] = useState(false);
  const [prueba, setPrueba] = useState('');

  async function probar() {
    setProbando(true);
    setPrueba('');
    try {
      const r = await fetch('/api/admin/bancard/probar', { method: 'POST' });
      const d = await r.json().catch(() => null);
      const textos: Record<string, string> = {
        bien: 'Bien: Orden llega a Bancard y las claves sirven.',
        claves: `Claves: Bancard rechazó la clave o la firma (${d?.clave ?? ''}). Revisá que sean las del ambiente correcto.`,
        bloqueo: 'Bloqueo: Bancard contestó una página en vez de datos (su protección bloqueó la llamada). Cargá BANCARD_HTTP=2 en Vercel, redeploy, y probá de nuevo.',
        red: 'Red: no se pudo llegar a Bancard.',
      };
      setPrueba(d?.configurado === false ? 'Bancard no está configurado en Vercel.' : textos[d?.resultado] ?? 'No se pudo probar.');
    } catch {
      setPrueba('No se pudo probar.');
    } finally {
      setProbando(false);
    }
  }

  const ops = datos?.operaciones ?? [];
  const paraRevisar = ops.filter((o) => o.revisar);

  return (
    <section className="rounded-2xl border border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Bancard</h2>
          <p className="mt-0.5 text-[13px] text-tinta/55">
            Entorno <b>{config.entorno ?? '—'}</b> · Claves cargadas <b>{config.configurado ? 'sí' : 'no'}</b>
            {' '}· Abierto a todos <b>{config.abierto && config.entorno === 'produccion' ? 'sí' : 'no'}</b>
          </p>
          {!config.configurado && config.motivo && (
            <p className="mt-1 text-[12.5px] text-ambar">
              {config.motivo === 'sin_entorno'
                ? 'Falta BANCARD_ENTORNO (staging o produccion).'
                : config.motivo === 'clave_publica'
                  ? queLePasa('BANCARD_CLAVE_PUBLICA', 32, config.falla)
                  : queLePasa('BANCARD_CLAVE_PRIVADA', 40, config.falla)}
            </p>
          )}
        </div>
        <button type="button" className="boton-suave shrink-0 py-2" onClick={probar} disabled={probando}>
          {probando ? 'Probando…' : 'Probar conexión'}
        </button>
      </div>
      {prueba && <p className="mt-3 rounded-xl bg-arena px-3 py-2 text-[13px]">{prueba}</p>}
      <MensajeError texto={error} />

      {config.configurado && <TarjetasOlvidadas />}

      {paraRevisar.length > 0 && (
        <div className="mt-4">
          <p className="titulo-seccion mb-2 text-ambar">Para revisar</p>
          <ListaOperaciones ops={paraRevisar} conCuenta onCambio={cargar} />
        </div>
      )}
      <div className="mt-4">
        <p className="titulo-seccion mb-2">Últimos pagos</p>
        {datos && ops.length === 0 ? (
          <p className="text-[13px] text-tinta/50">Todavía no hay pagos con Bancard.</p>
        ) : (
          <ListaOperaciones ops={ops} conCuenta onCambio={cargar} />
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------ las tarjetas olvidadas

/** Qué sabe Orden de una tarjeta que Bancard tiene guardada (lo decide el servidor). */
type EstadoEnOrden =
  | 'sin_cuenta' | 'fallida' | 'quitada' | 'por_quitar'
  | 'pendiente' | 'activa'
  | 'otro_entorno' | 'no_coincide' | 'sin_dato';

interface TarjetaOlvidada {
  /** El número con el que Orden le presentó la cuenta a Bancard. */
  userId: number;
  /** El número que Orden le puso a la tarjeta. */
  cardId: number;
  marca: string | null;
  ultimos4: string | null;
  orden: EstadoEnOrden;
  sePuedeBorrar: boolean;
}

interface BusquedaDeOlvidadas {
  entorno: 'staging' | 'produccion';
  desde: number;
  hasta: number;
  siguiente: number | null;
  cortado: null | 'tiempo' | 'bloqueo' | 'red' | 'claves';
  consultados: number;
  errores: { userId: number; clave: string }[];
  tarjetas: TarjetaOlvidada[];
  /** Hasta dónde se pidió buscar: «Seguir desde el N» termina ese pedido. */
  pedidoHasta: number;
}

const AMBAR = 'text-ambar';
const GRIS = 'text-tinta/55';
const QUE_SABE_ORDEN: Record<EstadoEnOrden, { texto: string; clase: string }> = {
  sin_cuenta: { texto: 'Olvidada: la cuenta ya no existe', clase: AMBAR },
  fallida: { texto: 'Olvidada: Orden la dio por no guardada', clase: AMBAR },
  quitada: { texto: 'Olvidada: Orden ya la había quitado', clase: AMBAR },
  por_quitar: { texto: 'Olvidada: la quitaron y faltaba borrarla en Bancard', clase: AMBAR },
  pendiente: { texto: 'Se está guardando: Orden la confirma sola en menos de una hora. No se toca', clase: GRIS },
  activa: { texto: 'En uso por una cuenta: no se toca', clase: 'text-verde-fuerte' },
  otro_entorno: { texto: 'Es del otro ambiente de Bancard: no se toca', clase: GRIS },
  no_coincide: { texto: 'Orden la tiene con otro pagador: no se toca', clase: GRIS },
  sin_dato: { texto: 'No se pudo comprobar en Orden: no se toca', clase: GRIS },
};

/** Por qué el servidor no la borró (volvió a mirar en el momento y cambió algo). */
const POR_QUE_NO_SE_BORRO: Record<string, string> = {
  activa: 'No se borró: ahora esa tarjeta la está usando una cuenta.',
  pendiente: 'No se borró: se está guardando en este momento.',
  otro_entorno: 'No se borró: es del otro ambiente de Bancard.',
  no_coincide: 'No se borró: Orden la tiene con otro pagador.',
  base: 'No se borró: no se pudo comprobar en Orden. Probá de nuevo.',
};

const nombreDeTarjeta = (t: TarjetaOlvidada) => (t.ultimos4
  ? `${t.marca ?? 'Tarjeta'} •••• ${t.ultimos4}`
  : t.marca ?? 'Tarjeta');
const tantas = (n: number, una: string, varias: string) => (n === 1 ? `1 ${una}` : `${n} ${varias}`);

function textoDelCorte(b: BusquedaDeOlvidadas): string {
  const llego = b.hasta >= b.desde ? `Se llegó hasta el ${b.hasta}. ` : '';
  switch (b.cortado) {
    case 'tiempo': return `${llego}Se acabó el tiempo de esta búsqueda: tocá «Seguir desde el ${b.siguiente}» para el resto.`;
    case 'bloqueo': return `${llego}Bancard bloqueó la búsqueda: contestó una página en vez de datos, y a la prueba de conexión también. Esperá unos minutos, tocá «Probar conexión» y, cuando diga «Bien», seguí desde el ${b.siguiente}.`;
    case 'red': return `${llego}No se pudo llegar a Bancard tres veces seguidas, ni con la prueba de conexión. Tocá «Probar conexión» y, cuando diga «Bien», seguí desde el ${b.siguiente}.`;
    case 'claves': return 'Bancard rechazó la clave o la firma, así que la búsqueda se paró. Tocá «Probar conexión».';
    default: return '';
  }
}

function textoDeErrores(errores: BusquedaDeOlvidadas['errores']): string {
  const lista = errores.slice(0, 8).map((e) => `${e.userId} (${e.clave})`).join(', ');
  const resto = errores.length > 8 ? ` y ${errores.length - 8} más` : '';
  return `Bancard no devolvió la lista de ${tantas(errores.length, 'pagador', 'pagadores')}: ${lista}${resto}. `
    + 'Buscá de nuevo; si se repite con el mismo texto, puede ser que Bancard no conozca esos números.';
}

/**
 * «TARJETAS OLVIDADAS EN BANCARD».
 *
 * Bancard no deja guardar dos veces la misma tarjeta. Si una cuenta se borra
 * (o un guardado queda a medias), la tarjeta sigue guardada allá a nombre de
 * un número de pagador que Orden ya no tiene anotado, y la persona recibe
 * «ya ha sido catastrada» cada vez que prueba. Acá se le pregunta a Bancard,
 * pagador por pagador, qué tarjetas tiene, y se borran las que Orden no usa.
 *
 * La pantalla solo muestra y pide: qué se puede borrar lo dice el servidor
 * en la búsqueda y LO VUELVE A DECIDIR al borrar (pide la lista de nuevo y
 * mira la base en ese momento). Si en el medio una cuenta empezó a usar esa
 * tarjeta, contesta que no y acá se actualiza el renglón.
 *
 * Buscar y borrar van de a uno: mientras busca, «Borrar en Bancard» queda
 * apagado (y mientras borra, no se busca). Una búsqueda que terminaba después
 * de un borrado volvía a dibujar el renglón recién borrado, con su botón, y
 * los dos pedidos salían a Bancard a la vez.
 *
 * En producción son tarjetas de clientes: la confirmación pide escribir
 * BORRAR. En pruebas alcanza con confirmar.
 */
function TarjetasOlvidadas() {
  const [abierta, setAbierta] = useState(false);
  const [desde, setDesde] = useState('5001');
  const [hasta, setHasta] = useState('5030');
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState<BusquedaDeOlvidadas | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<{ texto: string; bien: boolean } | null>(null);
  const [porBorrar, setPorBorrar] = useState<TarjetaOlvidada | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState('');

  /** `anterior`: lo ya encontrado, cuando se sigue una búsqueda que quedó por la mitad. */
  async function buscar(a: number, b: number, anterior: BusquedaDeOlvidadas | null) {
    setBuscando(true);
    setError('');
    setAviso(null);
    try {
      const r = await fetch('/api/admin/bancard/olvidadas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: a, hasta: b }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.ok !== true || !Array.isArray(d.tarjetas) || !Array.isArray(d.errores)) {
        setError(typeof d?.error === 'string' ? d.error : 'No se pudo buscar.');
        return;
      }
      const nueva = d as Omit<BusquedaDeOlvidadas, 'pedidoHasta'>;
      setBusqueda(anterior ? {
        ...nueva,
        desde: anterior.desde,
        hasta: Math.max(anterior.hasta, nueva.hasta),
        consultados: anterior.consultados + nueva.consultados,
        errores: [...anterior.errores, ...nueva.errores],
        tarjetas: [...anterior.tarjetas, ...nueva.tarjetas],
        pedidoHasta: b,
      } : { ...nueva, pedidoHasta: b });
    } catch {
      setError('No se pudo buscar.');
    } finally {
      setBuscando(false);
    }
  }

  function buscarDeCero() {
    const a = Number(desde);
    const b = Number(hasta);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < a) {
      setError('Escribí dos números de pagador. El primero no puede ser mayor que el segundo.');
      return;
    }
    void buscar(a, b, null);
  }

  /** El renglón de esa tarjeta: se saca (`null`) o queda con lo que el servidor acaba de ver. */
  function actualizar(t: TarjetaOlvidada, orden: EstadoEnOrden | null) {
    setBusqueda((b) => (b ? {
      ...b,
      tarjetas: b.tarjetas
        .filter((x) => orden !== null || x.userId !== t.userId || x.cardId !== t.cardId)
        .map((x) => (orden !== null && x.userId === t.userId && x.cardId === t.cardId ? { ...x, orden, sePuedeBorrar: false } : x)),
    } : b));
  }

  async function borrar() {
    if (!porBorrar) return;
    const t = porBorrar;
    setBorrando(true);
    setErrorBorrar('');
    try {
      const r = await fetch('/api/admin/bancard/olvidadas', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: t.userId, cardId: t.cardId }),
      });
      const d = await r.json().catch(() => null);
      const quien = `${nombreDeTarjeta(t)} (pagador ${t.userId})`;
      if (r.ok && d?.ok === true) {
        actualizar(t, null);
        setAviso({
          bien: true,
          texto: d.resultado === 'ya_no_estaba'
            ? `${quien}: Bancard ya no la tenía.`
            : `${quien}: borrada en Bancard. Ya se puede probar guardarla de nuevo.`,
        });
        setPorBorrar(null);
        return;
      }
      if ((r.status === 409 || r.status === 503) && typeof d?.motivo === 'string' && POR_QUE_NO_SE_BORRO[d.motivo]) {
        if (d.motivo !== 'base') actualizar(t, d.motivo as EstadoEnOrden);
        setAviso({ bien: false, texto: `${quien}. ${POR_QUE_NO_SE_BORRO[d.motivo]}` });
        setPorBorrar(null);
        return;
      }
      setErrorBorrar(r.status === 502
        ? `Bancard no contestó (${typeof d?.clave === 'string' && d.clave ? d.clave : 'sin respuesta'}). No se borró nada: probá de nuevo.`
        : typeof d?.error === 'string' ? d.error : 'No se pudo borrar.');
    } catch {
      setErrorBorrar('No se pudo borrar. Probá de nuevo.');
    } finally {
      setBorrando(false);
    }
  }

  const tarjetas = busqueda?.tarjetas ?? [];
  const olvidadas = tarjetas.filter((t) => t.sePuedeBorrar).length;
  const soloNumeros = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 8);

  return (
    <div className="mt-4 rounded-xl border border-borde p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="titulo-seccion">Tarjetas olvidadas en Bancard</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-tinta/55">
            Cuando se borra una cuenta, su tarjeta queda guardada en Bancard y nadie puede volver a guardarla.
            Acá se buscan y se borran. Las que una cuenta está usando no se tocan.
          </p>
        </div>
        <button type="button" className="boton-suave shrink-0 px-3 py-1.5 text-[12.5px]" aria-expanded={abierta} onClick={() => setAbierta((v) => !v)}>
          {abierta ? 'Cerrar' : 'Abrir'}
        </button>
      </div>

      {abierta && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-32">
              <span className="mb-1 block text-[12.5px] font-semibold">Pagador desde</span>
              <input className="campo" inputMode="numeric" value={desde} onChange={(e) => setDesde(soloNumeros(e.target.value))} />
            </label>
            <label className="block w-32">
              <span className="mb-1 block text-[12.5px] font-semibold">hasta</span>
              <input className="campo" inputMode="numeric" value={hasta} onChange={(e) => setHasta(soloNumeros(e.target.value))} />
            </label>
            <button type="button" className="boton-suave min-h-[46px]" onClick={buscarDeCero} disabled={buscando || borrando}>
              {buscando ? 'Buscando…' : 'Buscar en Bancard'}
            </button>
          </div>
          <p className="text-[12px] leading-relaxed text-tinta/50">
            El pagador es el número con el que Orden le presenta cada cuenta a Bancard. Arrancan en 5001 y suben uno
            por cada intento de guardar una tarjeta. Se miran hasta 40 por vez. «Tarjeta N.º» es el número que Orden
            le puso a esa tarjeta, no el de la tarjeta.
          </p>
          <MensajeError texto={error} />
          {aviso && (
            <p role="status" className={`rounded-xl px-3 py-2 text-[13px] font-semibold ${aviso.bien ? 'bg-verde-claro text-verde-fuerte' : 'bg-ambar-claro text-ambar'}`}>
              {aviso.texto}
            </p>
          )}

          {busqueda && (
            <div className="space-y-2">
              {busqueda.entorno === 'produccion' && (
                <p className="text-[12.5px] font-semibold text-ambar">Producción: son tarjetas de clientes de verdad.</p>
              )}
              {busqueda.hasta >= busqueda.desde && (
                <p className="text-[13px] font-semibold">
                  {`Pagadores ${busqueda.desde} a ${busqueda.hasta}: `}
                  {tarjetas.length === 0
                    ? (busqueda.errores.length > 0 ? 'en los que Bancard contestó no hay ninguna tarjeta guardada.' : 'Bancard no tiene ninguna tarjeta guardada.')
                    : `${tantas(tarjetas.length, 'tarjeta guardada', 'tarjetas guardadas')} en Bancard, ${olvidadas === 0 ? 'ninguna olvidada' : tantas(olvidadas, 'olvidada', 'olvidadas')}.`}
                </p>
              )}
              {busqueda.errores.length > 0 && (
                <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] leading-relaxed text-ambar">{textoDeErrores(busqueda.errores)}</p>
              )}
              {busqueda.cortado && (
                <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] leading-relaxed text-ambar">{textoDelCorte(busqueda)}</p>
              )}
              {busqueda.siguiente !== null && (
                <button
                  type="button" className="boton-suave px-3 py-1.5 text-[12.5px]" disabled={buscando || borrando}
                  onClick={() => { if (busqueda.siguiente !== null) void buscar(busqueda.siguiente, busqueda.pedidoHasta, busqueda); }}
                >
                  {buscando ? 'Buscando…' : `Seguir desde el ${busqueda.siguiente}`}
                </button>
              )}

              {tarjetas.length > 0 && (
                <ul className="divide-y divide-borde rounded-xl border border-borde">
                  {tarjetas.map((t) => {
                    const sabe = QUE_SABE_ORDEN[t.orden] ?? QUE_SABE_ORDEN.sin_dato;
                    return (
                      <li key={`${t.userId}-${t.cardId}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-[12.5px]">
                        <div className="min-w-0 flex-1 basis-52">
                          <p>
                            <span className="text-[13.5px] font-bold">{nombreDeTarjeta(t)}</span>
                            <span className="text-tinta/55"> · pagador {t.userId} · tarjeta N.º {t.cardId}</span>
                          </p>
                          <p className={`mt-0.5 font-semibold ${sabe.clase}`}>{sabe.texto}</p>
                        </div>
                        {t.sePuedeBorrar && (
                          <button
                            type="button" className="boton-suave shrink-0 px-3 py-1.5 text-[12.5px] text-rojo" disabled={borrando || buscando}
                            onClick={() => { setErrorBorrar(''); setPorBorrar(t); }}
                          >
                            Borrar en Bancard
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {porBorrar && (
        <ConfirmarBorrado
          tarjeta={porBorrar}
          enProduccion={busqueda?.entorno !== 'staging'}
          ocupado={borrando}
          error={errorBorrar}
          onSi={borrar}
          onNo={() => { if (!borrando) setPorBorrar(null); }}
        />
      )}
    </div>
  );
}

/** La palabra que hay que escribir para borrar una tarjeta en producción. */
const PALABRA_PARA_BORRAR = 'BORRAR';

/**
 * La pregunta antes de borrar. En pruebas, la confirmación de siempre. En
 * producción (o si no se sabe el ambiente) el botón rojo queda apagado hasta
 * que se escribe BORRAR: es la tarjeta de un cliente y no se deshace.
 */
function ConfirmarBorrado({ tarjeta, enProduccion, ocupado, error, onSi, onNo }: {
  tarjeta: TarjetaOlvidada;
  enProduccion: boolean;
  ocupado: boolean;
  error: string;
  onSi: () => void;
  onNo: () => void;
}) {
  const [palabra, setPalabra] = useState('');
  const titulo = '¿Borrar esta tarjeta en Bancard?';
  const detalle = `${nombreDeTarjeta(tarjeta)}, pagador ${tarjeta.userId}. Bancard deja de tenerla guardada, para que se pueda guardar de nuevo en cualquier cuenta. No se deshace.`;

  if (!enProduccion) {
    return (
      <Confirmar
        titulo={titulo} detalle={detalle} si="Borrar en Bancard" peligro
        ocupado={ocupado} error={error} onSi={onSi} onNo={onNo}
      />
    );
  }

  const escrita = palabra.trim().toUpperCase() === PALABRA_PARA_BORRAR;
  return (
    <Hoja
      titulo={titulo}
      subtitulo="Producción: es la tarjeta de un cliente de verdad"
      onCerrar={onNo}
      bloqueada={ocupado}
      cerrarConVelo={false}
      tamano="chico"
      pie={(
        <PieHoja columnas={2}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onNo} disabled={ocupado}>Cancelar</button>
          <button type="button" className="boton-peligro min-h-[48px]" onClick={onSi} disabled={ocupado || !escrita}>
            {ocupado ? 'Borrando…' : 'Borrar en Bancard'}
          </button>
        </PieHoja>
      )}
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed text-tinta/70">
        <p>{detalle}</p>
        <p className="rounded-xl bg-ambar-claro px-3 py-2.5 text-ambar">
          Borrala solo si la cuenta ya no existe o si la persona te pidió liberar su tarjeta.
        </p>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Para confirmar, escribí {PALABRA_PARA_BORRAR}</span>
          <input
            className="campo" value={palabra} maxLength={12} autoComplete="off" autoCapitalize="characters" spellCheck={false}
            onChange={(e) => setPalabra(e.target.value)}
          />
        </label>
        <MensajeError texto={error} />
      </div>
    </Hoja>
  );
}

// ------------------------------------------------- en la ficha de la cuenta

export function PagosBancardDeCuenta({ empresaId }: { empresaId: string }) {
  const { datos, error, cargar } = useOperaciones(empresaId, 50);
  const [cambiando, setCambiando] = useState(false);
  const [errorHabilitar, setErrorHabilitar] = useState('');

  async function habilitar(si: boolean) {
    setCambiando(true);
    setErrorHabilitar('');
    const { error: e } = await clienteNavegador().rpc('habilitar_bancard', { p_empresa: empresaId, p_si: si });
    if (e) setErrorHabilitar(mensajeDeError(e, 'No se pudo cambiar.'));
    await cargar();
    setCambiando(false);
  }

  return (
    <div className="rounded-2xl border border-borde p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="titulo-seccion mb-1">Pagos con Bancard</p>
          <p className="text-[12.5px] leading-relaxed text-tinta/55">
            Mientras Bancard no esté abierto a todos, esta cuenta lo ve solo si está habilitada.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-[13px] font-semibold">
          <input
            type="checkbox"
            className="h-5 w-5 accent-verde"
            checked={datos?.habilitada === true}
            disabled={!datos || cambiando}
            onChange={(e) => habilitar(e.target.checked)}
          />
          Puede pagar con Bancard
        </label>
      </div>
      <MensajeError texto={errorHabilitar || error} />
      {datos?.tarjeta && (
        <p className="mt-3 text-[12.5px] text-tinta/60">
          Tarjeta guardada: {datos.tarjeta.marca ?? '—'} •••• {datos.tarjeta.ultimos4 ?? '—'} ({datos.tarjeta.entorno})
          {datos.debito ? ` · débito ${datos.debito.activo ? datos.debito.estado : 'apagado'}` : ''}
          {datos.debito?.ultimo_error ? ` · ${datos.debito.ultimo_error}` : ''}
        </p>
      )}
      <div className="mt-3">
        {datos && datos.operaciones.length === 0 ? (
          <p className="text-[13px] text-tinta/50">Sin pagos con Bancard.</p>
        ) : (
          <ListaOperaciones ops={datos?.operaciones ?? []} onCambio={cargar} />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ la lista

function ListaOperaciones({ ops, conCuenta = false, onCambio }: {
  ops: OperacionAdmin[];
  conCuenta?: boolean;
  onCambio: () => Promise<void> | void;
}) {
  const [trabajando, setTrabajando] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ operacion: number; texto: string } | null>(null);
  const [revirtiendo, setRevirtiendo] = useState<OperacionAdmin | null>(null);

  async function consultar(o: OperacionAdmin) {
    setTrabajando(o.operacion);
    setResultado(null);
    try {
      const r = await fetch('/api/admin/bancard/consultar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operacion: o.operacion }),
      });
      const d = await r.json().catch(() => null);
      setResultado({ operacion: o.operacion, texto: r.ok ? `Bancard: ${d?.estado ?? '—'}` : (d?.error ?? 'No se pudo consultar.') });
      await onCambio();
    } catch {
      setResultado({ operacion: o.operacion, texto: 'No se pudo consultar.' });
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <>
      <ul className="divide-y divide-borde rounded-xl border border-borde">
        {ops.map((o) => {
          const e = ESTADO[o.estado] ?? { texto: o.estado, clase: 'bg-arena text-tinta/60' };
          return (
            <li key={o.operacion} className="space-y-1.5 p-3 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold tabular-nums">#{o.operacion}</span>
                <span className={`pastilla ${e.clase}`}>{e.texto}</span>
                {o.entorno !== 'produccion' && <span className="pastilla bg-arena text-tinta/60">{o.entorno}</span>}
                {conCuenta && <span className="font-semibold">{o.empresa}</span>}
                <span className="ml-auto font-bold tabular-nums">{gs(o.importe)}</span>
              </div>
              <p className="text-tinta/60">
                {o.tipo === 'personas' ? 'Sumar personas'
                  // Subir de plan con días pagos (130): no es un período entero del plan nuevo.
                  : o.tipo === 'cambio' ? `Cambio${o.antes?.plan ? ` de ${NOMBRE_PLAN[o.antes.plan] ?? o.antes.plan}` : ''} a ${NOMBRE_PLAN[o.plan] ?? o.plan}`
                  : `${NOMBRE_PLAN[o.plan] ?? o.plan} ${o.periodo}`}
                {o.personas ? ` · ${o.personas} personas` : ''} · {o.medio === 'token' ? 'tarjeta guardada' : 'formulario'}
                {o.origen === 'automatico' ? ' (automático)' : ''} · creada {cuando(o.creada)}
                {o.confirmada ? ` · confirmada ${cuando(o.confirmada)}` : ''}
              </p>
              {(o.descripcion || o.autorizacion || o.ticket) && (
                <p className="text-tinta/60">
                  {o.descripcion ?? ''}{o.codigo ? ` · código ${o.codigo}` : ''}
                  {o.autorizacion ? ` · autorización ${o.autorizacion}` : ''}{o.ticket ? ` · ticket ${o.ticket}` : ''}
                </p>
              )}
              {o.revisar && <p className="font-semibold text-ambar">Revisar: {o.revisar}</p>}
              {o.motivo && o.estado !== 'pagada' && <p className="text-tinta/50">Motivo: {o.motivo}</p>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" className="boton-suave px-3 py-1.5 text-[12.5px]" onClick={() => consultar(o)} disabled={trabajando !== null}>
                  {trabajando === o.operacion ? 'Consultando…' : 'Consultar a Bancard'}
                </button>
                {o.estado === 'pagada' && (
                  <button type="button" className="boton-suave px-3 py-1.5 text-[12.5px] text-rojo" onClick={() => setRevirtiendo(o)} disabled={trabajando !== null}>
                    Revertir
                  </button>
                )}
              </div>
              {o.estado === 'pagada' && !o.puede_revertir && o.por_que_no && (
                <p className="text-tinta/50">{o.por_que_no}</p>
              )}
              {resultado?.operacion === o.operacion && <p className="font-semibold">{resultado.texto}</p>}
            </li>
          );
        })}
      </ul>
      {revirtiendo && (
        <HojaRevertir
          op={revirtiendo}
          onCerrar={() => setRevirtiendo(null)}
          onHecho={async (texto) => { setRevirtiendo(null); setResultado({ operacion: revirtiendo.operacion, texto }); await onCambio(); }}
        />
      )}
    </>
  );
}

function HojaRevertir({ op, onCerrar, onHecho }: {
  op: OperacionAdmin;
  onCerrar: () => void;
  onHecho: (texto: string) => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [sinBancard, setSinBancard] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const antes = op.antes ?? {};
  const vuelve = `${antes.estado === 'prueba' ? 'en prueba' : NOMBRE_PLAN[antes.plan ?? ''] ?? antes.plan ?? '—'}`
    + (antes.periodo_fin ? ` hasta el ${cuando(antes.periodo_fin)}` : '');

  async function revertir() {
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/admin/bancard/revertir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operacion: op.operacion, motivo, sinBancard }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) { setError(d?.error ?? 'No se pudo revertir.'); return; }
      // Revisión 07/10: revertir pausa el cobro automático de esa cuenta
      // (si no, la tarea la cobraba de nuevo al día siguiente). Que quien
      // revierte lo sepa: se reactiva cuando la persona paga a mano.
      const pausa = d.debito_pausado === true
        ? ' Su cobro automático quedó pausado: vuelve cuando la persona pague a mano o guarde otra tarjeta.'
        : '';
      onHecho((d.bancard === 'sin_bancard' ? 'Marcado como anulado. La cuenta volvió a como estaba.' : 'Revertido en Bancard y en Orden.') + pausa);
    } catch {
      setError('No se pudo revertir.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Hoja
      titulo={`Revertir el pago #${op.operacion}`}
      subtitulo={`${op.empresa} · ${gs(op.importe)}`}
      onCerrar={onCerrar}
      bloqueada={ocupado}
      tamano="chico"
      pie={(
        <PieHoja columnas={2}>
          <button type="button" className="boton-suave min-h-[48px]" onClick={onCerrar} disabled={ocupado}>Cancelar</button>
          <button type="button" className="boton-peligro min-h-[48px]" onClick={revertir} disabled={ocupado || !motivo.trim()}>
            {ocupado ? 'Revirtiendo…' : 'Revertir'}
          </button>
        </PieHoja>
      )}
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed text-tinta/70">
        <p>
          La cuenta vuelve a <b>{vuelve}</b>.
          {op.ingreso_id ? ` Se anula el ingreso de ${gs(op.importe)} en tus finanzas.` : ''}
          {op.comision_id ? ' La comisión del socio se borra si todavía no se pagó.' : ''}
        </p>
        <p>Bancard solo revierte el mismo día del pago. Otro día, se anula por el portal de comercios (Soporte → Anulaciones) y acá se marca abajo.</p>
        <label className="block">
          <span className="mb-1 block text-[12.5px] font-semibold">Motivo</span>
          <input className="campo w-full" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Prueba de certificación" />
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-verde" checked={sinBancard} onChange={(e) => setSinBancard(e.target.checked)} />
          Ya lo anulé por el portal de comercios (no se le pide nada a Bancard)
        </label>
        <MensajeError texto={error} />
      </div>
    </Hoja>
  );
}
