'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import type { ComisionAdmin, ReferidoAdmin, SocioAdmin } from '@/lib/tipos';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

type Filtro = 'por_pagar' | 'pagada' | 'anulada' | 'todas';

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'por_pagar', texto: 'Por pagar' },
  { valor: 'pagada', texto: 'Pagadas' },
  { valor: 'anulada', texto: 'Anuladas' },
  { valor: 'todas', texto: 'Todas' },
];

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: '2-digit' });
}

const num = (v: unknown) => Number(v ?? 0);

/** Los nombres que ve el dueño, que no son los de la base. */
const NOMBRE_PLAN: Record<string, string> = { pro: 'Pro', negocio: 'Premium', gratis: 'sin pagar' };

/**
 * SOCIOS Y COMISIONES.
 *
 * Quien trae un cliente nuevo a Orden se lleva la mitad del primer pago de ese
 * cliente, una sola vez. Lo que paga después es todo de Orden.
 *
 * ACÁ NO SE CALCULA NADA
 *
 * La comisión la crea la base en el mismo momento en que se anota el cobro
 * (migración 060), y una sola vez por negocio. Esta pantalla solo muestra lo
 * que hay y deja marcar que ya se transfirió. Si el monto se calculara también
 * acá, un día los dos números no iban a coincidir y habría que adivinar cuál
 * es el bueno.
 *
 * POR QUÉ SE PAGA A MANO
 *
 * Porque el monto a veces hay que mirarlo: si un negocio pagó un año por
 * adelantado, la mitad de ese pago es mucha plata. Esa decisión es de una
 * persona, no de una fórmula, así que el monto se puede ajustar al marcarla
 * pagada y queda registrado que se ajustó.
 */
export function PanelSocios({ socios, comisiones, referidos, moneda }: {
  socios: SocioAdmin[];
  comisiones: ComisionAdmin[];
  referidos: ReferidoAdmin[];
  moneda: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('por_pagar');
  const [abierto, setAbierto] = useState(false);
  const [nuevo, setNuevo] = useState(false);
  const [editando, setEditando] = useState<SocioAdmin | null>(null);
  /** A quiénes trajo cada uno: se abre desde su fila. */
  const [viendo, setViendo] = useState<string>('');

  const traidosDe = useMemo(() => {
    const mapa = new Map<string, ReferidoAdmin[]>();
    for (const r of referidos) {
      const lista = mapa.get(r.socio_id) ?? [];
      lista.push(r);
      mapa.set(r.socio_id, lista);
    }
    return mapa;
  }, [referidos]);

  const totales = useMemo(() => ({
    activos: socios.filter((s) => s.activo).length,
    traidos: socios.reduce((t, s) => t + s.traidos, 0),
    porPagar: comisiones
      .filter((c) => c.estado === 'por_pagar')
      .reduce((t, c) => t + num(c.monto), 0),
    pagado: comisiones
      .filter((c) => c.estado === 'pagada')
      .reduce((t, c) => t + num(c.monto), 0),
  }), [socios, comisiones]);

  const visibles = useMemo(
    () => (filtro === 'todas' ? comisiones : comisiones.filter((c) => c.estado === filtro)),
    [comisiones, filtro],
  );

  const listo = () => { setNuevo(false); setEditando(null); router.refresh(); };

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Socios que traen clientes</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-tinta/50">
            Se lleva la mitad del primer pago del cliente que trajo, una sola vez. Lo que ese
            cliente pague después queda entero para vos.
          </p>
        </div>
        <button type="button" onClick={() => setNuevo(true)} className="boton-suave shrink-0 px-3.5 py-2 text-[13.5px]">
          Nuevo socio
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta titulo="Socios" valor={String(totales.activos)} detalle="activos" />
        <Tarjeta titulo="Trajeron" valor={String(totales.traidos)} detalle="negocios en total" />
        <Tarjeta
          titulo="Por pagar"
          valor={dinero(totales.porPagar, moneda)}
          detalle={totales.porPagar > 0 ? 'hay que transferir' : 'nada pendiente'}
          tono={totales.porPagar > 0 ? 'ambar' : undefined}
        />
        <Tarjeta titulo="Pagado" valor={dinero(totales.pagado, moneda)} detalle="comisiones ya giradas" />
      </div>

      {/* ---------------- las comisiones ---------------- */}
      <div className="rounded-2xl border border-borde bg-white">
        <div className="flex flex-wrap gap-1.5 border-b border-borde p-4">
          {FILTROS.map((f) => (
            <button
              key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                filtro === f.valor ? 'bg-verde text-white' : 'bg-arena text-tinta/60 hover:bg-borde/40'
              }`}
            >
              {f.texto}
            </button>
          ))}
        </div>

        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] text-tinta/45">
            {comisiones.length === 0
              ? 'Todavía no hay comisiones. Aparecen solas cuando un cliente traído por alguien paga.'
              : 'No hay comisiones en este filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((c) => (
              <FilaComision key={c.id} comision={c} moneda={moneda} onHecho={() => router.refresh()} />
            ))}
          </ul>
        )}
      </div>

      {/* ---------------- la lista de socios ---------------- */}
      <div className="rounded-2xl border border-borde bg-white">
        <button
          type="button" onClick={() => setAbierto(!abierto)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
        >
          <span className="text-[14.5px] font-bold">
            {socios.length} {socios.length === 1 ? 'socio' : 'socios'}
          </span>
          <span className="flex items-center gap-2 text-[12.5px] text-tinta/45">
            {abierto ? 'ocultar' : 'ver y editar'}
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition ${abierto ? 'rotate-90' : ''}`} {...trazo}>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </span>
        </button>

        {abierto && (
          socios.length === 0 ? (
            <p className="border-t border-borde px-4 py-8 text-center text-[13.5px] text-tinta/45">
              Todavía no cargaste a nadie. Cada socio recibe un código para compartir.
            </p>
          ) : (
            <ul className="divide-y divide-borde border-t border-borde">
              {socios.map((s) => (
                <li key={s.id} className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14.5px] font-bold">
                        <span className="truncate">{s.nombre}</span>
                        {!s.activo && <span className="pastilla bg-arena text-tinta/55">desactivado</span>}
                      </p>
                      <p className="mt-0.5 truncate text-[12.5px] text-tinta/50">
                        {s.telefono || 'sin teléfono'}
                        {s.cobra_en ? ` · cobra en ${s.cobra_en}` : ''}
                      </p>
                      <p className="mt-1 text-[12.5px] text-tinta/45">
                        {s.traidos} {s.traidos === 1 ? 'negocio traído' : 'negocios traídos'} ·{' '}
                        {s.pagaron} {s.pagaron === 1 ? 'pagó' : 'pagaron'}
                        {num(s.por_pagar) > 0 && (
                          <span className="font-semibold text-ambar">
                            {' '}· {dinero(num(s.por_pagar), moneda)} por pagar
                          </span>
                        )}
                      </p>
                      {s.traidos > 0 && (
                        <button
                          type="button"
                          onClick={() => setViendo(viendo === s.id ? '' : s.id)}
                          className="mt-1.5 text-[12.5px] font-semibold text-verde-fuerte hover:underline"
                        >
                          {viendo === s.id ? 'Ocultar a quiénes trajo' : 'Ver a quiénes trajo'}
                        </button>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Codigo codigo={s.codigo} />
                      <button
                        type="button" onClick={() => setEditando(s)}
                        className="text-[12.5px] font-semibold text-verde-fuerte hover:underline"
                      >
                        Editar
                      </button>
                    </div>
                  </div>

                  {/* En qué se suscribieron los que trajo: sin esto, «trajo
                      cuatro» no dice si trajo cuatro clientes o cuatro
                      cuentas gratis que no van a pagar nunca. */}
                  {viendo === s.id && (
                    <ul className="mt-2.5 space-y-1.5 rounded-xl bg-arena p-3">
                      {(traidosDe.get(s.id) ?? []).map((r) => (
                        <li key={r.empresa_id} className="flex items-center justify-between gap-3 text-[12.5px]">
                          <span className="min-w-0 truncate">
                            <span className="font-semibold">{r.negocio}</span>
                            <span className="text-tinta/45">
                              {' '}· {fechaCorta(r.desde)} · {r.origen === 'link' ? 'por su enlace' : 'a mano'}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className={`pastilla ${
                              r.paga ? 'bg-verde-claro text-verde-fuerte' : 'bg-white text-tinta/50'
                            }`}>
                              {r.paga ? NOMBRE_PLAN[r.plan] ?? r.plan : 'sin pagar'}
                            </span>
                            {num(r.monto) > 0 && (
                              <span className="ml-1.5 font-semibold tabular-nums">
                                {dinero(num(r.monto), moneda)}
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {(nuevo || editando) && (
        <FormularioSocio
          socio={editando}
          onCerrar={() => { setNuevo(false); setEditando(null); }}
          onHecho={listo}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- comisión

function FilaComision({ comision, moneda, onHecho }: {
  comision: ComisionAdmin;
  moneda: string;
  onHecho: () => void;
}) {
  const [modo, setModo] = useState<'' | 'pagar' | 'anular'>('');
  const [monto, setMonto] = useState(String(num(comision.monto)));
  const [medio, setMedio] = useState('transferencia');
  const [nota, setNota] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function correr(fn: () => Promise<{ data?: any; error: any }>) {
    setTrabajando(true);
    setError('');
    try {
      const { data, error: e } = await fn();
      if (e) throw e;
      // Un aviso no es un fallo: la comisión quedó pagada igual. Pero hay que
      // decirlo, o el gasto se pierde sin que nadie se entere.
      if (data?.aviso) { setAviso(String(data.aviso)); setTrabajando(false); return; }
      onHecho();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo hacer el cambio.'));
      setTrabajando(false);
    }
  }

  const pagar = () => correr(async () => clienteNavegador().rpc('marcar_comision_pagada', {
    p_comision: comision.id,
    // Vacío es null, y null en la base significa «el monto calculado».
    p_monto: monto.trim() === '' ? null : Number(monto),
    p_medio: medio,
    p_nota: nota,
  }));

  const anular = () => correr(async () => clienteNavegador().rpc('anular_comision', {
    p_comision: comision.id, p_nota: nota,
  }));

  const pastilla = comision.estado === 'pagada' ? 'bg-verde-claro text-verde-fuerte'
    : comision.estado === 'anulada' ? 'bg-arena text-tinta/55'
    : 'bg-ambar-claro text-ambar';

  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-bold">{comision.socio}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-tinta/50">
            trajo a {comision.negocio} · pagó {dinero(num(comision.base), moneda)} el{' '}
            {fechaCorta(comision.creado)}
          </p>
          {comision.estado === 'pagada' && (
            <p className="mt-1 truncate text-[12px] text-tinta/45">
              Pagada el {fechaCorta(comision.pagada_at)}
              {comision.medio ? ` por ${comision.medio}` : ''}
              {comision.nota ? ` · ${comision.nota}` : ''}
            </p>
          )}
          {comision.estado === 'anulada' && comision.nota && (
            <p className="mt-1 truncate text-[12px] text-tinta/45">{comision.nota}</p>
          )}
          {comision.estado === 'por_pagar' && comision.cobra_en && (
            <p className="mt-1 truncate text-[12px] text-tinta/45">Cobra en {comision.cobra_en}</p>
          )}
          {comision.estado === 'por_pagar' && comision.ingreso_anulado && (
            <p className="mt-1.5 rounded-xl bg-rojo-claro px-2.5 py-1.5 text-[12px] font-medium text-rojo">
              El cobro que la generó está anulado: no hay que transferir nada.
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold tabular-nums">{dinero(num(comision.monto), moneda)}</p>
          <p className="mt-0.5 text-[11.5px] text-tinta/40">{num(comision.porcentaje)}% del primer pago</p>
          {/* Lo que queda de ese pago. Del cuaderno: «ver el total, el 50%
              que te tengo que dar, cuánto es para mí en ese momento». Es una
              resta de dos números que ya vinieron de la base, no otra cuenta
              de la comisión. */}
          <p className="mt-0.5 text-[11.5px] font-semibold text-verde-fuerte tabular-nums">
            te queda {dinero(num(comision.base) - num(comision.monto), moneda)}
          </p>
          <span className={`pastilla mt-1 ${pastilla}`}>
            {comision.estado === 'por_pagar' ? 'por pagar' : comision.estado}
          </span>
        </div>
      </div>

      {comision.estado === 'por_pagar' && modo === '' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setModo('pagar')} className="boton-principal px-3.5 py-1.5 text-[13px]">
            Marcar pagada
          </button>
          <button type="button" onClick={() => setModo('anular')} className="boton-suave px-3.5 py-1.5 text-[13px]">
            Anular
          </button>
        </div>
      )}

      {modo === 'pagar' && (
        <div className="mt-3 rounded-2xl bg-arena p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className="etiqueta">Cuánto le transferiste</span>
              <input
                className="campo mt-1 py-2 text-[14px]" inputMode="numeric"
                value={monto} onChange={(e) => setMonto(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="etiqueta">Por dónde</span>
              <input
                className="campo mt-1 py-2 text-[14px]" placeholder="transferencia, Tigo Money…"
                value={medio} onChange={(e) => setMedio(e.target.value)}
              />
            </label>
          </div>
          <input
            className="campo mt-2.5 py-2 text-[14px]" placeholder="Nota, si hace falta"
            value={nota} onChange={(e) => setNota(e.target.value)}
          />
          <p className="mt-2 text-[12px] leading-snug text-tinta/50">
            El monto se puede cambiar: si este cliente pagó varios meses de una, acordá lo justo y
            escribilo acá. Queda anotado como gasto de Orden.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={pagar} disabled={trabajando}
              className="boton-principal px-4 py-2 text-[13.5px]"
            >
              {trabajando ? 'Guardando…' : 'Listo, ya le pagué'}
            </button>
            <button
              type="button" onClick={() => { setModo(''); setError(''); }} disabled={trabajando}
              className="boton-suave px-4 py-2 text-[13.5px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {modo === 'anular' && (
        <div className="mt-3 rounded-2xl bg-arena p-3.5">
          <p className="text-[13px] leading-snug text-tinta/65">
            Se anula y no se vuelve a generar otra por este negocio. Escribí por qué, para que en
            tres meses se entienda.
          </p>
          <input
            className="campo mt-2.5 py-2 text-[14px]" placeholder="Motivo: la transferencia nunca llegó…"
            value={nota} onChange={(e) => setNota(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={anular} disabled={trabajando}
              className="boton-peligro px-4 py-2 text-[13.5px]"
            >
              {trabajando ? 'Anulando…' : 'Anular la comisión'}
            </button>
            <button
              type="button" onClick={() => { setModo(''); setError(''); }} disabled={trabajando}
              className="boton-suave px-4 py-2 text-[13.5px]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p className="mt-2 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
          {aviso}{' '}
          <button type="button" onClick={onHecho} className="underline">Entendido</button>
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{error}</p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------- socio

function FormularioSocio({ socio, onCerrar, onHecho }: {
  socio: SocioAdmin | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [nombre, setNombre] = useState(socio?.nombre ?? '');
  const [telefono, setTelefono] = useState(socio?.telefono ?? '');
  const [email, setEmail] = useState(socio?.email ?? '');
  const [cobraEn, setCobraEn] = useState(socio?.cobra_en ?? '');
  const [notas, setNotas] = useState(socio?.notas ?? '');
  const [activo, setActivo] = useState(socio?.activo ?? true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [codigo, setCodigo] = useState('');

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const { data, error: e } = await clienteNavegador().rpc('guardar_socio', {
        p_socio: socio?.id ?? null,
        p_nombre: nombre,
        p_telefono: telefono,
        p_email: email,
        p_cobra_en: cobraEn,
        p_notas: notas,
        p_activo: activo,
      });
      if (e) throw e;
      // Al crear se muestra el código antes de cerrar: es lo único que esta
      // pantalla genera y que hay que pasarle a la persona.
      if (!socio && data?.codigo) { setCodigo(String(data.codigo)); setGuardando(false); return; }
      onHecho();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo guardar.'));
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/45 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={onCerrar}
    >
      <div
        className="zona-segura-abajo max-h-[90vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-tarjeta aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-borde px-5 py-4">
          <h2 className="text-[17px] font-bold tracking-tight">
            {socio ? socio.nombre : 'Nuevo socio'}
          </h2>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="icono-toque shrink-0 text-tinta/40 hover:bg-arena"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {codigo ? (
          <div className="space-y-3 p-5">
            <p className="text-[14px] leading-relaxed text-tinta/70">
              Listo. Este es el código de <strong className="text-tinta">{nombre}</strong>. Pasáselo:
              cuando traiga un negocio, lo anotás con este código y la comisión sale sola.
            </p>
            <div className="rounded-2xl bg-arena p-4 text-center">
              <p className="text-[26px] font-black tracking-[0.2em] tabular-nums">{codigo}</p>
              <div className="mt-2 flex justify-center"><Codigo codigo={codigo} /></div>
            </div>
            <button type="button" onClick={onHecho} className="boton-principal w-full py-2.5 text-[14px]">
              Listo
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            <label className="block">
              <span className="etiqueta">Nombre</span>
              <input
                className="campo mt-1 py-2.5 text-[14.5px]" value={nombre}
                onChange={(e) => setNombre(e.target.value)} placeholder="Sofía Benítez"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="etiqueta">Teléfono</span>
                <input
                  className="campo mt-1 py-2.5 text-[14.5px]" inputMode="tel" value={telefono}
                  onChange={(e) => setTelefono(e.target.value)} placeholder="0981 000 111"
                />
              </label>
              <label className="block">
                <span className="etiqueta">Correo</span>
                <input
                  className="campo mt-1 py-2.5 text-[14.5px]" inputMode="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="opcional"
                />
              </label>
            </div>
            <label className="block">
              <span className="etiqueta">Dónde cobra</span>
              <input
                className="campo mt-1 py-2.5 text-[14.5px]" value={cobraEn}
                onChange={(e) => setCobraEn(e.target.value)}
                placeholder="Banco, billetera o alias"
              />
              <span className="mt-1 block text-[12px] text-tinta/45">
                Se lee cuando hay que transferirle. Escribilo como lo vas a necesitar.
              </span>
            </label>
            <label className="block">
              <span className="etiqueta">Notas</span>
              <textarea
                className="campo mt-1 py-2.5 text-[14.5px]" rows={2} value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Cómo lo conocés, a qué rubro llega…"
              />
            </label>

            {socio && (
              <label className="flex items-center gap-2.5 rounded-xl bg-arena px-3.5 py-2.5">
                <input
                  type="checkbox" className="h-4 w-4 accent-verde" checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                <span className="text-[13.5px]">
                  Sigue activo
                  <span className="block text-[12px] text-tinta/50">
                    Desactivado no recibe negocios nuevos. Lo que ya cobró no se toca.
                  </span>
                </span>
              </label>
            )}

            {error && (
              <p className="rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
            )}

            <button
              type="button" onClick={guardar} disabled={guardando || nombre.trim() === ''}
              className="boton-principal w-full py-2.5 text-[14px]"
            >
              {guardando ? 'Guardando…' : socio ? 'Guardar' : 'Crear y darle su código'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** El código, con copiar al lado: se comparte por WhatsApp, no se dicta. */
function Codigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Sin portapapeles —pasa en algunos navegadores del teléfono— el código
      // igual está a la vista para copiarlo a mano.
    }
  }

  return (
    <button
      type="button" onClick={copiar}
      className="flex items-center gap-1.5 rounded-lg bg-arena px-2.5 py-1 text-[12.5px] font-bold tracking-wider tabular-nums hover:bg-borde/40"
    >
      {codigo}
      {copiado ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-verde-fuerte" {...trazo}>
          <path d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-tinta/35" {...trazo}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h8" />
        </svg>
      )}
    </button>
  );
}

function Tarjeta({ titulo, valor, detalle, tono }: {
  titulo: string; valor: string; detalle: string; tono?: 'ambar';
}) {
  return (
    <div className="rounded-2xl border border-borde bg-white p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <p className={`mt-1.5 text-[20px] font-bold leading-none tabular-nums ${
        tono === 'ambar' ? 'text-ambar' : 'text-tinta'
      }`}>
        {valor}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{detalle}</p>
    </div>
  );
}
