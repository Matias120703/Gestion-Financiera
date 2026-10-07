'use client';

import { useCallback, useEffect, useState } from 'react';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';

/**
 * BANCARD EN EL PANEL DE LA ADMINISTRACIÓN (español fijo, como todo /admin).
 *
 * Lo que hace falta para correr la lista de tests del portal y para atender
 * un pago que quedó raro:
 *
 *   · La tarjeta general: entorno, si las claves están cargadas (nunca su
 *     valor), si está abierto a todos, «Probar conexión», y los pagos para
 *     revisar y los últimos.
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
                {o.tipo === 'personas' ? 'Sumar personas' : `${NOMBRE_PLAN[o.plan] ?? o.plan} ${o.periodo}`}
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
