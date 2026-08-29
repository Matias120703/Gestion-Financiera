'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import type {
  AccionAdmin, CuentaAdmin, FinanzasOrden, PlanEfectivo, ResumenPanel, TipoCuenta,
} from '@/lib/tipos';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

type Filtro = 'atencion' | 'todas' | 'prueba' | 'pagando' | 'vencidas';

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'atencion', texto: 'Necesitan atención' },
  { valor: 'prueba', texto: 'En prueba' },
  { valor: 'pagando', texto: 'Pagando' },
  { valor: 'vencidas', texto: 'Vencidas' },
  { valor: 'todas', texto: 'Todas' },
];

/**
 * Cómo se lee «le quedan N días».
 *
 * El mismo número decide el texto Y el color, así que viven juntos: separados,
 * es cuestión de tiempo que alguien muestre «vence hoy» en verde.
 */
function urgencia(dias: number | null) {
  if (dias === null) return { texto: 'Sin fecha', clase: 'bg-arena text-tinta/60', punto: 'bg-tinta/25' };
  if (dias < 0) return { texto: `Venció hace ${Math.abs(dias)} d`, clase: 'bg-rojo-claro text-rojo', punto: 'bg-rojo' };
  if (dias === 0) return { texto: 'Vence hoy', clase: 'bg-rojo-claro text-rojo', punto: 'bg-rojo' };
  if (dias <= 3) return { texto: `Faltan ${dias} d`, clase: 'bg-ambar-claro text-ambar', punto: 'bg-ambar' };
  if (dias <= 7) return { texto: `${dias} días`, clase: 'bg-ambar-claro/60 text-ambar', punto: 'bg-ambar' };
  return { texto: `${dias} días`, clase: 'bg-verde-claro text-verde-fuerte', punto: 'bg-verde' };
}

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: '2-digit' });
}

const NOMBRE_PLAN: Record<string, string> = {
  gratis: 'Vencida', pro: 'Pro', negocio: 'Premium',
};

export function PanelAdmin({
  cuentas, resumen, finanzas, misEmpresas, whatsapp,
}: {
  cuentas: CuentaAdmin[];
  resumen: ResumenPanel;
  finanzas: FinanzasOrden;
  misEmpresas: { id: string; nombre: string }[];
  whatsapp: string | null;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>('atencion');
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<CuentaAdmin | null>(null);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return cuentas.filter((c) => {
      if (texto && !c.nombre.toLowerCase().includes(texto) && !c.correo.toLowerCase().includes(texto)) {
        return false;
      }
      const d = c.dias_restantes;
      switch (filtro) {
        // El filtro por defecto: a quiénes hay que escribirles hoy. Incluye
        // los ya vencidos, que son los que más urge recuperar.
        case 'atencion': return d !== null && d <= 7;
        case 'vencidas': return d !== null && d < 0;
        case 'pagando': return c.estado === 'activa' && c.plan !== 'gratis';
        case 'prueba': return c.estado === 'prueba' && d !== null && d >= 0;
        default: return true;
      }
    });
  }, [cuentas, filtro, busqueda]);

  return (
    <div className="space-y-7">
      {/* ---------------- Mis finanzas ---------------- */}
      <MisFinanzas finanzas={finanzas} misEmpresas={misEmpresas} onHecho={() => router.refresh()} />

      {/* ---------------- Mis clientes ---------------- */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight">Clientes</h2>
            <p className="mt-0.5 text-[13px] text-tinta/50">
              Quién se registró y en qué plan está. Los números de cada negocio no se ven desde acá.
            </p>
          </div>
          <span className="shrink-0 text-[13px] font-semibold text-tinta/40">
            {resumen.cuentas} {resumen.cuentas === 1 ? 'cuenta' : 'cuentas'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metrica
            titulo="Pagando"
            valor={resumen.pagando}
            detalle="con plan activo"
            tono={resumen.pagando > 0 ? 'verde' : undefined}
          />
          <Metrica
            titulo="En prueba"
            valor={resumen.en_prueba}
            detalle={`${resumen.comercios} comercios · ${resumen.personales} personales`}
          />
          <Metrica
            titulo="Vencen en 7 días"
            valor={resumen.vencen_semana}
            detalle={resumen.vencen_semana > 0 ? 'escribiles hoy' : 'nada urgente'}
            tono={resumen.vencen_semana > 0 ? 'ambar' : undefined}
          />
          <Metrica
            titulo="Vencidas"
            valor={resumen.vencidas}
            detalle="para recuperar"
            tono={resumen.vencidas > 0 ? 'rojo' : undefined}
          />
        </div>
      </section>

      {/* ---------------- La lista ---------------- */}
      <section className="rounded-2xl border border-borde bg-white">
        <div className="flex flex-col gap-3 border-b border-borde p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
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
          <input
            className="campo w-full py-2 text-[14px] sm:max-w-[240px]"
            placeholder="Buscar nombre o correo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {visibles.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13.5px] text-tinta/45">
            {cuentas.length === 0
              ? 'Todavía no se registró nadie.'
              : 'No hay cuentas en este filtro.'}
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {visibles.map((c) => {
              const u = urgencia(c.dias_restantes);
              const usoIA = c.ia_tope > 0 ? Math.round((c.ia_usada / c.ia_tope) * 100) : 0;

              return (
                <li key={c.empresa_id}>
                  <button
                    type="button" onClick={() => setAbierta(c)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-arena/60"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${u.punto}`} aria-hidden />

                    {/* Nombre y contacto: es lo que se lee primero. */}
                    <span className="min-w-0 flex-[2]">
                      <span className="block truncate text-[15px] font-bold">{c.nombre}</span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-tinta/50">
                        {c.correo || 'sin correo'}
                      </span>
                    </span>

                    {/* En pantalla chica esto desaparece: apretar seis columnas
                        en 375 px es lo que hacía que se viera mal. */}
                    <span className="hidden min-w-0 flex-1 md:block">
                      <span className="block text-[13px] font-semibold text-tinta/70">
                        {c.tipo_cuenta === 'personal' ? 'Personal' : 'Comercio'}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-tinta/45">
                        {c.miembros} {c.miembros === 1 ? 'persona' : 'personas'} · {c.movimientos} mov.
                      </span>
                    </span>

                    <span className="hidden min-w-0 flex-1 lg:block">
                      <span className="block text-[13px] font-semibold text-tinta/70">
                        {NOMBRE_PLAN[c.plan] ?? c.plan}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-tinta/45">
                        IA {c.ia_usada}/{c.ia_tope} · {usoIA}%
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className={`pastilla ${u.clase}`}>{u.texto}</span>
                      <span className="mt-1 block text-[11.5px] text-tinta/40">
                        {fechaCorta(c.periodo_fin)}
                      </span>
                    </span>

                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-tinta/25" {...trazo}>
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {abierta && (
        <FichaCuenta
          cuenta={abierta}
          whatsapp={whatsapp}
          onCerrar={() => setAbierta(null)}
          onHecho={() => { setAbierta(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- finanzas

function MisFinanzas({
  finanzas, misEmpresas, onHecho,
}: {
  finanzas: FinanzasOrden;
  misEmpresas: { id: string; nombre: string }[];
  onHecho: () => void;
}) {
  const [eligiendo, setEligiendo] = useState('');
  const [error, setError] = useState('');

  async function elegir(id: string) {
    setEligiendo(id);
    setError('');
    try {
      const { error: e } = await clienteNavegador().rpc('definir_empresa_orden', { p_empresa: id });
      if (e) throw e;
      onHecho();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo elegir la empresa.'));
    } finally {
      setEligiendo('');
    }
  }

  // Sin configurar: se ofrece elegirla. Mostrar ceros haría parecer que el
  // negocio está fundido, que es lo contrario de informar.
  if (!finanzas.configurada) {
    return (
      <section className="rounded-2xl border border-verde/30 bg-verde-claro/25 p-5">
        <h2 className="text-[17px] font-bold tracking-tight">Conectá tus propias finanzas</h2>
        <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-tinta/65">
          Orden también es un negocio: cobra suscripciones y paga sus cuentas. Elegí cuál de tus
          empresas lo representa y, cada vez que actives el plan de un cliente,{' '}
          <strong className="text-tinta">el cobro se va a anotar solo como ingreso</strong>. Tus
          deudas y gastos los llevás en las mismas pantallas que cualquier cliente.
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
        )}

        {misEmpresas.length === 0 ? (
          <p className="mt-4 rounded-xl bg-white px-3.5 py-2.5 text-[13px] text-tinta/60">
            Todavía no tenés ninguna empresa. Creá la tuya en Orden y volvé acá para elegirla.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {misEmpresas.map((e) => (
              <button
                key={e.id} type="button" onClick={() => elegir(e.id)} disabled={eligiendo !== ''}
                className="boton-suave px-4 py-2 text-[13.5px]"
              >
                {eligiendo === e.id ? 'Eligiendo…' : e.nombre}
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  const m = finanzas.moneda;
  const ganancia = finanzas.ingresos_mes - finanzas.gastos_mes;

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-bold tracking-tight">Tus finanzas · {finanzas.nombre}</h2>
          <p className="mt-0.5 text-[13px] text-tinta/50">Este mes, con todo lo que cargaste.</p>
        </div>
        <Link href="/panel" className="shrink-0 text-[13px] font-semibold text-verde-fuerte hover:underline">
          Abrir mi negocio →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metrica
          titulo="Suscripciones"
          valor={dinero(finanzas.cobrado_mes, m)}
          detalle={`${finanzas.cobros_mes} ${finanzas.cobros_mes === 1 ? 'cobro' : 'cobros'} este mes`}
          tono="verde"
        />
        <Metrica
          titulo="Entró"
          valor={dinero(finanzas.ingresos_mes, m)}
          detalle="todo, no solo suscripciones"
        />
        <Metrica
          titulo="Salió"
          valor={dinero(finanzas.gastos_mes, m)}
          detalle="gastos del mes"
          tono={finanzas.gastos_mes > 0 ? 'rojo' : undefined}
        />
        <Metrica
          titulo="Te quedó"
          valor={dinero(ganancia, m)}
          detalle={ganancia >= 0 ? 'en positivo' : 'en negativo'}
          tono={ganancia >= 0 ? 'verde' : 'rojo'}
        />
      </div>

      {finanzas.deuda_total > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-white px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold text-tinta/55">Lo que debés</p>
            <p className="mt-0.5 text-[19px] font-bold tabular-nums">{dinero(finanzas.deuda_total, m)}</p>
          </div>
          {finanzas.deudas_vencidas > 0 && (
            <span className="pastilla bg-rojo-claro text-rojo">
              {finanzas.deudas_vencidas} {finanzas.deudas_vencidas === 1 ? 'vencida' : 'vencidas'}
            </span>
          )}
          <Link href="/deudas" className="boton-suave px-4 py-2 text-[13.5px]">Ver deudas</Link>
        </div>
      )}
    </section>
  );
}

function Metrica({ titulo, valor, detalle, tono }: {
  titulo: string; valor: number | string; detalle: string; tono?: 'verde' | 'ambar' | 'rojo';
}) {
  const color = tono === 'verde' ? 'text-verde-fuerte'
    : tono === 'ambar' ? 'text-ambar'
    : tono === 'rojo' ? 'text-rojo'
    : 'text-tinta';
  return (
    <div className="rounded-2xl border border-borde bg-white p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <p className={`mt-1.5 text-[22px] font-bold leading-none tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{detalle}</p>
    </div>
  );
}

// ---------------------------------------------------------------- ficha

function FichaCuenta({ cuenta, whatsapp, onCerrar, onHecho }: {
  cuenta: CuentaAdmin;
  whatsapp: string | null;
  onCerrar: () => void;
  onHecho: () => void;
}) {
  const [plan, setPlan] = useState<PlanEfectivo>(cuenta.plan === 'gratis' ? 'pro' : cuenta.plan);
  const [meses, setMeses] = useState(1);
  const [importe, setImporte] = useState('');
  const [nota, setNota] = useState('');
  const [dias, setDias] = useState(7);
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta.tipo_cuenta);
  const [historial, setHistorial] = useState<AccionAdmin[] | null>(null);
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  async function correr(nombre: string, fn: () => Promise<{ data?: any; error: any }>) {
    setTrabajando(nombre);
    setError('');
    try {
      const { data, error: e } = await fn();
      if (e) throw e;
      // Un aviso no es un fallo: la cuenta se activó igual. Pero hay que
      // decirlo, o el ingreso propio se pierde sin que nadie se entere.
      if (data?.aviso) { setAviso(String(data.aviso)); setTrabajando(''); return; }
      onHecho();
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo hacer el cambio.'));
    } finally {
      setTrabajando('');
    }
  }

  const activar = () => correr('activando', async () => clienteNavegador().rpc('cambiar_plan_cuenta', {
    p_empresa: cuenta.empresa_id,
    p_plan: plan,
    p_meses: meses,
    p_nota: nota,
    p_importe: Number(importe) > 0 ? Number(importe) : null,
  }));

  const cortar = () => correr('cortando', async () => clienteNavegador().rpc('cambiar_plan_cuenta', {
    p_empresa: cuenta.empresa_id, p_plan: 'gratis', p_meses: 1, p_nota: nota, p_importe: null,
  }));

  const estirar = () => correr('estirando', async () => clienteNavegador().rpc('extender_prueba', {
    p_empresa: cuenta.empresa_id, p_dias: dias, p_nota: nota,
  }));

  const cambiarTipo = () => correr('cambiando', async () => clienteNavegador().rpc('cambiar_tipo_cuenta', {
    p_empresa: cuenta.empresa_id, p_tipo: tipo,
  }));

  async function verHistorial() {
    try {
      const { data, error: e } = await clienteNavegador().rpc('historial_cuenta', {
        p_empresa: cuenta.empresa_id,
      });
      if (e) throw e;
      setHistorial(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo leer el historial.'));
    }
  }

  const u = urgencia(cuenta.dias_restantes);
  const ocupado = trabajando !== '';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/45 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={onCerrar}
    >
      <div
        className="zona-segura-abajo max-h-[90vh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-white shadow-tarjeta aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- cabecera pegada arriba: el nombre no se pierde al bajar ---- */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-bold tracking-tight">{cuenta.nombre}</h2>
            <p className="mt-0.5 truncate text-[13px] text-tinta/55">
              {cuenta.propietario} · {cuenta.correo || 'sin correo'}
            </p>
          </div>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="icono-toque shrink-0 text-tinta/40 hover:bg-arena"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* ---- de un vistazo ---- */}
          <div className="rounded-2xl bg-arena p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className={`pastilla ${u.clase}`}>{u.texto}</span>
              <span className="pastilla bg-white text-tinta/60">{NOMBRE_PLAN[cuenta.plan] ?? cuenta.plan}</span>
              <span className="pastilla bg-white text-tinta/60">
                {cuenta.tipo_cuenta === 'personal' ? 'Personal' : 'Comercio'}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
              <Dato etiqueta="Estado" valor={cuenta.estado} />
              <Dato etiqueta="Vence" valor={fechaCorta(cuenta.periodo_fin)} />
              <Dato etiqueta="Se registró" valor={fechaCorta(cuenta.creada)} />
              <Dato etiqueta="Última actividad" valor={fechaCorta(cuenta.ultima_actividad)} />
              <Dato etiqueta="Movimientos" valor={String(cuenta.movimientos)} />
              <Dato etiqueta="Capturas de IA" valor={`${cuenta.ia_usada} de ${cuenta.ia_tope}`} />
            </dl>
          </div>

          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(
                `Hola! Te escribo de Orden por la cuenta "${cuenta.nombre}".`)}`}
              target="_blank" rel="noopener noreferrer"
              className="boton-suave flex w-full items-center justify-center gap-2 py-2.5"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
                <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
              </svg>
              Escribirle por WhatsApp
            </a>
          )}

          {error && (
            <p className="rounded-xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
          )}
          {aviso && (
            <div className="rounded-xl bg-ambar-claro px-3.5 py-2.5">
              <p className="text-[13px] font-medium text-ambar">{aviso}</p>
              <button
                type="button" onClick={onHecho}
                className="mt-2 text-[12.5px] font-semibold text-ambar underline"
              >
                Entendido, cerrar
              </button>
            </div>
          )}

          {/* ---- entró el pago ---- */}
          <div className="rounded-2xl border border-verde/30 bg-verde-claro/25 p-4">
            <p className="titulo-seccion mb-3">Entró el pago</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta">Plan</label>
                <select className="campo" value={plan} onChange={(e) => setPlan(e.target.value as PlanEfectivo)}>
                  <option value="pro">Pro</option>
                  <option value="negocio">Premium</option>
                </select>
              </div>
              <div>
                <label className="etiqueta">Meses</label>
                <input
                  type="number" min={1} max={24} className="campo"
                  value={meses} onChange={(e) => setMeses(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="col-span-2">
                <label className="etiqueta">Cuánto transfirió</label>
                <input
                  type="number" min={0} inputMode="decimal" className="campo tabular-nums"
                  placeholder="190000"
                  value={importe} onChange={(e) => setImporte(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">
                  Se anota como ingreso en tus finanzas. Si lo dejás vacío, la cuenta se activa
                  igual pero no queda registrado el cobro.
                </p>
              </div>
              <div className="col-span-2">
                <label className="etiqueta">Nota (queda en el registro)</label>
                <input
                  className="campo" placeholder="transferencia 27/08, comprobante 1234"
                  value={nota} onChange={(e) => setNota(e.target.value)}
                />
              </div>
            </div>

            <button className="boton-principal mt-3 w-full py-2.5" onClick={activar} disabled={ocupado}>
              {trabajando === 'activando' ? 'Activando…' : `Activar ${meses} ${meses === 1 ? 'mes' : 'meses'}`}
            </button>
            <p className="mt-2 text-[12px] text-tinta/50">
              Si todavía le quedan días pagos, se le suman. Nunca se le comen.
            </p>
          </div>

          {/* ---- ajustes finos ---- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-borde p-4">
              <p className="titulo-seccion mb-2.5">Dar unos días más</p>
              <div className="flex items-end gap-2">
                <input
                  type="number" min={1} max={90} className="campo flex-1"
                  value={dias} onChange={(e) => setDias(Math.max(1, Number(e.target.value) || 1))}
                />
                <button className="boton-suave shrink-0 py-2.5" onClick={estirar} disabled={ocupado}>
                  {trabajando === 'estirando' ? '…' : 'Estirar'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-borde p-4">
              <p className="titulo-seccion mb-2.5">Tipo de cuenta</p>
              <div className="flex items-end gap-2">
                <select
                  className="campo flex-1" value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoCuenta)}
                >
                  <option value="personal">Personal</option>
                  <option value="emprendedor">Comercio</option>
                </select>
                <button
                  className="boton-suave shrink-0 py-2.5" onClick={cambiarTipo}
                  disabled={ocupado || tipo === cuenta.tipo_cuenta}
                >
                  {trabajando === 'cambiando' ? '…' : 'Cambiar'}
                </button>
              </div>
            </div>
          </div>

          {/* ---- historial ---- */}
          {historial === null ? (
            <button className="boton-suave w-full py-2.5" onClick={verHistorial}>
              Ver qué se le hizo a esta cuenta
            </button>
          ) : (
            <div className="rounded-2xl border border-borde p-4">
              <p className="titulo-seccion mb-3">Historial</p>
              {historial.length === 0 ? (
                <p className="text-[13px] text-tinta/50">Todavía no se le hizo nada desde el panel.</p>
              ) : (
                <ul className="space-y-2">
                  {historial.map((h, n) => (
                    <li key={n} className="rounded-xl bg-arena px-3 py-2 text-[12.5px]">
                      <span className="font-semibold">{h.accion.replace(/_/g, ' ')}</span>
                      <span className="text-tinta/50"> · {fechaCorta(h.cuando)} · {h.quien}</span>
                      {h.detalle?.importe ? (
                        <span className="ml-1 font-semibold text-verde-fuerte">
                          {dinero(Number(h.detalle.importe), cuenta.moneda)}
                        </span>
                      ) : null}
                      {h.detalle?.nota ? (
                        <span className="mt-0.5 block italic text-tinta/60">«{h.detalle.nota}»</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---- cortar ---- */}
          <div className="rounded-2xl border border-rojo/20 bg-rojo-claro/25 p-4">
            <p className="titulo-seccion mb-1 text-rojo">Cortar el servicio</p>
            <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/60">
              Deja de poder cargar. Sigue entrando, viendo lo suyo y bajando su Excel:
              los datos son de esa persona, no nuestros.
            </p>
            <button
              className="boton-suave w-full border-rojo/30 py-2.5 text-rojo hover:bg-rojo-claro"
              onClick={cortar} disabled={ocupado}
            >
              {trabajando === 'cortando' ? 'Cortando…' : 'Cortar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{etiqueta}</dt>
      <dd className="mt-0.5 font-semibold">{valor}</dd>
    </div>
  );
}
