'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { avisarActivacion } from '@/lib/avisos-cliente';
import type {
  AccionAdmin, CodigoRechazado, ComisionAdmin, CuentaAdmin, DescuentoRacha, FinanzasOrden, PlanEfectivo, ReferidoAdmin,
  ResumenPanel, RetiroAdmin, SocioAdmin, TipoCuenta,
} from '@/lib/tipos';
import { PanelSocios } from './PanelSocios';
import { CampoMonto } from '@/components/CampoMonto';

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
  if (dias === null) return { texto: 'Sin fecha', clase: 'bg-arena text-tinta/60', punto: 'bg-noche/25' };
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
  gratis: 'Vencida', basico: 'Básico', pro: 'Pro', negocio: 'Premium',
};

/**
 * Cómo se llama la PERSONA de esta cuenta.
 *
 * Diez cuentas personales se llaman «Mis finanzas», así que decir el nombre
 * de la cuenta no distingue a nadie. Primero el contacto de la ficha, después
 * el propietario del registro, y solo si no hay ninguno, la cuenta.
 */
function quienEs(cuenta: { contacto?: string; propietario?: string; nombre: string }) {
  return (cuenta.contacto ?? '').trim() || (cuenta.propietario ?? '').trim() || cuenta.nombre;
}

/**
 * Cómo se llama lo que esta cuenta tiene hoy.
 *
 * Una cuenta en prueba nace con `plan = 'pro'` en la base —es lo que le
 * damos gratis esos días— y esta pantalla lo leía tal cual: decía «Pro»
 * de alguien que no pagó un guaraní. Al ir a activarla el plan ya estaba
 * en Pro, así que había que elegir Premium para que el select cambiara, y
 * se terminaba vendiendo un plan que el cliente no pidió.
 *
 * Mientras dura la prueba, entonces, lo que manda es la prueba. El plan
 * de abajo no se muestra: todavía no es de nadie.
 */
function comoSeLlama(cuenta: { plan: string; estado: string }) {
  if (cuenta.estado === 'prueba') return 'En prueba';
  return NOMBRE_PLAN[cuenta.plan] ?? cuenta.plan;
}

/**
 * Qué planes se le pueden vender a esta cuenta.
 *
 * Premium es el plan de los negocios: vendedores, productos, lotes. Una
 * cuenta personal no tiene nada de eso, así que ofrecérselo es ofrecerle
 * aire. Solo Pro.
 */
function planesQueVan(tipo: TipoCuenta): { valor: PlanEfectivo; texto: string }[] {
  if (tipo === 'personal') return [{ valor: 'pro', texto: 'Pro' }];
  // Básico es el negocio entero para una sola persona (077).
  return [
    { valor: 'basico', texto: 'Básico' },
    { valor: 'pro', texto: 'Pro' },
    { valor: 'negocio', texto: 'Premium' },
  ];
}

export function PanelAdmin({
  cuentas, resumen, finanzas, misEmpresas, socios, comisiones, referidos, rechazados = [], retiros = [], whatsapp,
}: {
  cuentas: CuentaAdmin[];
  resumen: ResumenPanel;
  finanzas: FinanzasOrden;
  misEmpresas: { id: string; nombre: string }[];
  socios: SocioAdmin[];
  comisiones: ComisionAdmin[];
  referidos: ReferidoAdmin[];
  /** Cuentas que llegaron con un enlace y cuyo código se rechazó (068). */
  rechazados?: CodigoRechazado[];
  /** Los retiros de los socios contra su saldo (070). */
  retiros?: RetiroAdmin[];
  whatsapp: string | null;
}) {
  const router = useRouter();
  // Quién trajo a cada negocio, por empresa: la ficha lo necesita al abrirse y
  // no vale una consulta por cada vez que alguien abre una.
  const porEmpresa = useMemo(
    () => new Map(referidos.map((r) => [r.empresa_id, r])),
    [referidos],
  );
  const rechazoPorEmpresa = useMemo(
    () => new Map(rechazados.map((r) => [r.empresa_id, r])),
    [rechazados],
  );
  const [filtro, setFiltro] = useState<Filtro>('atencion');
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<CuentaAdmin | null>(null);
  /** Lo que acaba de pasar, para decirlo arriba y con la lista ya al día. */
  const [hecho, setHecho] = useState('');

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
      {/*
        QUÉ PASÓ, DESPUÉS DE QUE PASÓ.
        Matías: «cuando activo el mes quiero que se reinicie solo y que me
        aparezca un mensaje de que se pudo activar la cuenta y que se generó
        la comisión». Antes la ficha quedaba abierta con un cartel adentro y
        había que cerrarla a mano para ver la lista al día.
      */}
      {hecho && (
        <div className="flex items-start gap-3 rounded-2xl bg-verde-claro px-4 py-3">
          <p className="min-w-0 flex-1 text-[13.5px] font-medium leading-relaxed text-verde-fuerte">{hecho}</p>
          <button
            type="button" onClick={() => setHecho('')}
            aria-label="Cerrar el aviso"
            className="shrink-0 text-[13px] font-bold text-verde-fuerte"
          >
            ✕
          </button>
        </div>
      )}

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
      <section className="rounded-2xl border border-borde bg-superficie">
        <div className="flex flex-col gap-3 border-b border-borde p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.valor} type="button" onClick={() => setFiltro(f.valor)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                  filtro === f.valor ? 'bg-verde text-sobre-verde' : 'bg-arena text-tinta/60 hover:bg-borde/40'
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
                        {c.sin_duenio
                          ? 'sin dueño · nadie puede entrar'
                          : c.contacto || c.correo || 'sin correo'}
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
                        {comoSeLlama(c)}
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

      {/* ---------------- Socios y comisiones ---------------- */}
      <PanelSocios
        socios={socios}
        comisiones={comisiones}
        referidos={referidos}
        retiros={retiros}
        moneda={finanzas.configurada ? finanzas.moneda : 'PYG'}
      />

      {abierta && (
        <FichaCuenta
          cuenta={abierta}
          referido={porEmpresa.get(abierta.empresa_id) ?? null}
          rechazado={rechazoPorEmpresa.get(abierta.empresa_id) ?? null}
          whatsapp={whatsapp}
          onCerrar={() => setAbierta(null)}
          onHecho={(mensaje) => { setAbierta(null); setHecho(mensaje ?? ''); router.refresh(); }}
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
          <p className="mt-4 rounded-xl bg-superficie px-3.5 py-2.5 text-[13px] text-tinta/60">
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie px-4 py-3">
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
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <p className={`mt-1.5 text-[22px] font-titulo font-extrabold leading-none tabular-nums ${color}`}>{valor}</p>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{detalle}</p>
    </div>
  );
}

// ---------------------------------------------------------------- ficha

function FichaCuenta({ cuenta, referido, rechazado, whatsapp, onCerrar, onHecho }: {
  cuenta: CuentaAdmin;
  /** Quién trajo este negocio, si alguien lo trajo. Ver migración 060. */
  referido: ReferidoAdmin | null;
  /** Si llegó con un enlace y el código se rechazó al registrarse (068). */
  rechazado: CodigoRechazado | null;
  whatsapp: string | null;
  onCerrar: () => void;
  /** Cierra la ficha y recarga la lista; el mensaje se lee arriba. */
  onHecho: (mensaje?: string) => void;
}) {
  const [codigoSocio, setCodigoSocio] = useState('');
  /**
   * Lo que esta cuenta se ganó cargando durante su prueba (078).
   *
   * Se pide al abrir la ficha y no viene en la lista: es un cálculo sobre
   * los movimientos de UNA cuenta, y la lista trae todas.
   */
  const [descuento, setDescuento] = useState<DescuentoRacha | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve(clienteNavegador().rpc('descuento_por_racha', { p_empresa: cuenta.empresa_id }))
      .then(({ data }) => { if (vivo && data) setDescuento(data as DescuentoRacha); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [cuenta.empresa_id]);

  // Los planes que se le pueden vender a esta cuenta, y el que viene
  // elegido. Una cuenta personal arranca y termina en Pro: si quedó en
  // Premium por un error viejo, igual se ofrece Pro y no un plan que no
  // existe para ella.
  const planes = planesQueVan(cuenta.tipo_cuenta);
  const esPersonal = cuenta.tipo_cuenta === 'personal';
  const [plan, setPlan] = useState<PlanEfectivo>(
    esPersonal || cuenta.plan === 'gratis' ? 'pro' : cuenta.plan,
  );
  const [meses, setMeses] = useState(1);
  const [importe, setImporte] = useState(0);
  /**
   * Cuántos vendedores paga este negocio, sin contar al dueño.
   *
   * Arranca vacío y no con el valor actual, a propósito: vacío significa «no
   * lo toques», que es lo correcto cuando alguien solo viene a renovarle el
   * mes. Precargarlo haría que cada renovación reescribiera el tope, y un
   * día alguien lo pisaría sin darse cuenta.
   */
  const [vendedores, setVendedores] = useState('');
  const [nota, setNota] = useState('');
  const [dias, setDias] = useState(7);
  const [tipo, setTipo] = useState<TipoCuenta>(cuenta.tipo_cuenta);

  // Ficha de seguimiento: quién es, cómo ubicarlo, a qué se dedica.
  const [contacto, setContacto] = useState(cuenta.contacto);
  const [telefono, setTelefono] = useState(cuenta.telefono);
  const [seDedica, setSeDedica] = useState(cuenta.se_dedica);
  const [notas, setNotas] = useState(cuenta.notas);
  const [confirmaBorrado, setConfirmaBorrado] = useState('');
  const [historial, setHistorial] = useState<AccionAdmin[] | null>(null);
  const [trabajando, setTrabajando] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  /**
   * `contar` arma el mensaje que se lee arriba, en la lista ya recargada, y
   * no un cartel dentro de una hoja que además hay que cerrar a mano. Lo de
   * la comisión se agrega solo, porque vale para cualquier acción que la
   * genere.
   */
  async function correr(
    nombre: string,
    fn: () => Promise<{ data?: any; error: any }>,
    contar?: (data: any) => string,
  ) {
    setTrabajando(nombre);
    setError('');
    try {
      const { data, error: e } = await fn();
      if (e) throw e;

      /**
       * La primera vez que se cobró un referido de verdad, la comisión no se
       * generó —la empresa de Orden estaba borrada y el ingreso no se pudo
       * anotar— y esta pantalla no dijo una palabra: mostró el aviso de
       * contabilidad y cerró como si todo hubiera salido bien.
       *
       * La 063 hizo que la comisión ya no dependa del asiento. Esto es lo
       * otro que faltaba: que si aun así no nace, se vea. Un programa donde
       * la comisión puede no generarse en silencio no es un programa, es una
       * promesa que a veces se cumple.
       */
      const faltoComision = data && 'comision_generada' in data
        && referido !== null && referido.comision === null && data.comision_generada === false;

      // Un código que se había perdido y se recuperó con su comisión es una
      // buena noticia, no un aviso: va en verde, arriba.
      if (data?.por_enlace && data?.comision_generada) {
        onHecho(`${String(data.aviso)} La vas a ver en Socios, en «Por pagar».`);
        return;
      }

      const texto = [
        faltoComision ? `Ojo: NO se generó la comisión de ${referido!.socio}.` : '',
        data?.aviso ? String(data.aviso) : '',
      ].filter(Boolean).join(' ');

      // Un aviso no es un fallo: la cuenta se activó igual. Pero hay que
      // decirlo, o el ingreso propio se pierde sin que nadie se entere. Este
      // sí se queda en la hoja: es algo para mirar, no un «listo».
      if (texto) { setAviso(texto); setTrabajando(''); return; }

      const comision = data?.comision_generada
        ? `Se generó la comisión de ${referido?.socio ?? 'quien lo trajo'}: la vas a ver en Socios, en «Por pagar».`
        : '';

      onHecho([contar?.(data), comision].filter(Boolean).join(' ') || undefined);
    } catch (e: any) {
      setError(mensajeDeError(e, 'No se pudo hacer el cambio.'));
    } finally {
      setTrabajando('');
    }
  }

  const activar = () => correr('activando', async () => {
    const r = await clienteNavegador().rpc('cambiar_plan_cuenta', {
    p_empresa: cuenta.empresa_id,
    p_plan: plan,
    p_meses: meses,
    p_nota: nota,
    p_importe: importe > 0 ? importe : null,
    // Vacío es null, y null en la base significa «dejalo como está». El cero
    // sí viaja como cero: es un trato válido —solo el dueño— y confundirlo
    // con vacío le regalaría vendedores a alguien que no los pagó.
    p_vendedores: vendedores.trim() === '' ? null : Number(vendedores),
    });
    // Al cliente le llega «Tu plan está activo», y al socio su comisión si la
    // ganó. Va aparte y sin esperar: el plan ya quedó activo en la base.
    if (!r.error) avisarActivacion(cuenta.empresa_id);
    return r;
  }, () => `Listo: la cuenta de ${quienEs(cuenta)} quedó activa en el plan ${plan === 'negocio' ? 'Premium' : 'Pro'} por ${meses} ${meses === 1 ? 'mes' : 'meses'}.`);

  const cortar = () => correr('cortando', async () => clienteNavegador().rpc('cambiar_plan_cuenta', {
    p_empresa: cuenta.empresa_id, p_plan: 'gratis', p_meses: 1, p_nota: nota,
    p_importe: null, p_vendedores: null,
  }));

  const estirar = () => correr('estirando', async () => clienteNavegador().rpc('extender_prueba', {
    p_empresa: cuenta.empresa_id, p_dias: dias, p_nota: nota,
  }));

  const cambiarTipo = () => correr('cambiando', async () => clienteNavegador().rpc('cambiar_tipo_cuenta', {
    p_empresa: cuenta.empresa_id, p_tipo: tipo,
  }));

  const guardarFicha = () => correr('ficha', async () => clienteNavegador().rpc('guardar_ficha_cliente', {
    p_empresa: cuenta.empresa_id,
    p_contacto: contacto,
    p_telefono: telefono,
    p_se_dedica: seDedica,
    p_notas: notas,
  }));

  const deshacer = () => correr('deshaciendo', async () =>
    clienteNavegador().rpc('deshacer_ultimo_cambio', { p_empresa: cuenta.empresa_id }));

  // Recibe el código en vez de leerlo del estado: el botón de «anotarlo»
  // de un código rechazado lo pasa directo, sin esperar un re-render.
  const anotarSocio = (codigo: string = codigoSocio) => correr('anotando', async () => clienteNavegador().rpc('asignar_referido', {
    p_empresa: cuenta.empresa_id, p_codigo: codigo, p_nota: '',
  }));

  const desanotarSocio = () => correr('desanotando', async () =>
    clienteNavegador().rpc('quitar_referido', { p_empresa: cuenta.empresa_id }));

  const borrar = () => correr('borrando', async () => clienteNavegador().rpc('borrar_cuenta', {
    p_empresa: cuenta.empresa_id,
    p_confirmacion: confirmaBorrado,
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
      className="fixed inset-0 z-[60] flex items-end justify-center bg-noche/45 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={onCerrar}
    >
      <div
        className="zona-segura-abajo max-h-[90vh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-3xl bg-superficie shadow-tarjeta aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- cabecera pegada arriba: el nombre no se pierde al bajar ---- */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-borde bg-superficie/95 px-5 py-4 backdrop-blur">
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
              <span className="pastilla bg-superficie text-tinta/60">{comoSeLlama(cuenta)}</span>
              <span className="pastilla bg-superficie text-tinta/60">
                {cuenta.tipo_cuenta === 'personal' ? 'Personal' : 'Comercio'}
              </span>
            </div>
            {cuenta.sin_duenio && (
              <p className="mb-3 rounded-xl bg-ambar-claro px-3 py-2 text-[12.5px] font-medium text-ambar">
                Esta cuenta quedó sin dueño: no hay nadie adentro y nadie puede entrar.
                Pasa cuando se borra el usuario desde Supabase.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] sm:grid-cols-3">
              <Dato etiqueta="Estado" valor={cuenta.estado} />
              <Dato etiqueta="Vence" valor={fechaCorta(cuenta.periodo_fin)} />
              <Dato etiqueta="Se registró" valor={fechaCorta(cuenta.creada)} />
              <Dato etiqueta="Última actividad" valor={fechaCorta(cuenta.ultima_actividad)} />
              <Dato etiqueta="Movimientos" valor={String(cuenta.movimientos)} />
              <Dato etiqueta="Capturas de IA" valor={`${cuenta.ia_usada} de ${cuenta.ia_tope}`} />
              {/* Cuánta gente hay y cuánta entra. Si están al tope hay que
                  verlo acá y no enterarse cuando el cliente reclama que no
                  puede sumar a nadie. */}
              {!esPersonal && (
                <Dato
                  etiqueta="Personas"
                  valor={`${cuenta.miembros} de ${cuenta.personas_permitidas}`}
                  detalle={cuenta.tope_vendedores === null
                    ? 'tope del plan'
                    : `${cuenta.tope_vendedores} ${cuenta.tope_vendedores === 1 ? 'vendedor pago' : 'vendedores pagos'}`}
                />
              )}
              {cuenta.como_nos_conocio && (
                <Dato etiqueta="Nos conoció por" valor={cuenta.como_nos_conocio} />
              )}
            </dl>
          </div>

          {/* Si hay teléfono del cliente se le escribe A ÉL. El número de
              Orden solo sirve para abrir el chat con uno mismo, que no es lo
              que hace falta cuando hay que cobrarle a alguien. */}
          {(cuenta.telefono || whatsapp) && (
            <a
              href={`https://wa.me/${(cuenta.telefono || whatsapp || '').replace(/\D/g, '')}?text=${encodeURIComponent(
                `Hola${cuenta.contacto ? ' ' + cuenta.contacto.split(' ')[0] : ''}! Te escribo de Orden por la cuenta "${cuenta.nombre}".`)}`}
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
                type="button" onClick={() => onHecho()}
                className="mt-2 text-[12.5px] font-semibold text-ambar underline"
              >
                Entendido, cerrar
              </button>
            </div>
          )}

          {/* ---- quién es ---- */}
          <div className="rounded-2xl border border-borde p-4">
            <p className="titulo-seccion mb-3">Quién es</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta">Nombre de contacto</label>
                <input
                  className="campo" placeholder="Con quién hablás"
                  value={contacto} onChange={(e) => setContacto(e.target.value)}
                />
              </div>
              <div>
                <label className="etiqueta">WhatsApp</label>
                <input
                  className="campo" inputMode="tel" placeholder="595981234567"
                  value={telefono} onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="etiqueta">A qué se dedica</label>
                <input
                  className="campo" placeholder="Perfumería, taller mecánico, estancia…"
                  value={seDedica} onChange={(e) => setSeDedica(e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="etiqueta">Notas</label>
                <textarea
                  className="campo min-h-[70px]" placeholder="Lo que quieras acordarte de esta persona"
                  value={notas} onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>
            <button className="boton-suave mt-3 w-full py-2.5" onClick={guardarFicha} disabled={ocupado}>
              {trabajando === 'ficha' ? 'Guardando…' : 'Guardar ficha'}
            </button>
            <p className="mt-2 text-[12px] leading-snug text-tinta/50">
              Con el WhatsApp cargado, el botón de arriba le escribe directo a esta persona.
            </p>
          </div>

          {/* ---- quién lo trajo ---- */}
          <QuienLoTrajo
            referido={referido}
            rechazado={rechazado}
            codigo={codigoSocio}
            onCodigo={setCodigoSocio}
            anotar={anotarSocio}
            desanotar={desanotarSocio}
            trabajando={trabajando}
            ocupado={ocupado}
          />

          {/* ---- entró el pago ---- */}
          <div className="rounded-2xl border border-verde/30 bg-verde-claro/25 p-4">
            <p className="titulo-seccion mb-3">Entró el pago</p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="etiqueta">Plan</label>
                <select
                  className="campo" value={plan} disabled={planes.length === 1}
                  onChange={(e) => setPlan(e.target.value as PlanEfectivo)}
                >
                  {planes.map((p) => <option key={p.valor} value={p.valor}>{p.texto}</option>)}
                </select>
              </div>
              <div>
                <label className="etiqueta">Meses</label>
                <input
                  type="number" inputMode="numeric" min={1} max={24} className="campo"
                  value={meses} onChange={(e) => setMeses(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              {/* Los vendedores son cosa de un negocio. En una cuenta
                  personal no hay a quién sumar, así que el campo ni
                  aparece: preguntarlo es hacer dudar al que cobra. */}
              {!esPersonal && (
                <div className="col-span-2">
                  <label className="etiqueta">Cuántos vendedores le habilitás</label>
                  <input
                    type="number" min={0} max={200} inputMode="numeric" className="campo tabular-nums"
                    placeholder={cuenta.tope_vendedores === null ? 'lo que diga el plan' : ''}
                    value={vendedores} onChange={(e) => setVendedores(e.target.value)}
                  />
                  <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">
                    Sin contar al dueño. 190.000 son 2 vendedores; cada uno de más, 60.000.
                    {' '}Vacío deja el tope como está
                    {cuenta.tope_vendedores === null ? ' (hoy: el del plan).' : ` (hoy: ${cuenta.tope_vendedores}).`}
                    {' '}Escribí <strong className="text-tinta/70">-1</strong> para volver al del plan.
                  </p>
                </div>
              )}
              {descuento?.logrado && (
                <div className="col-span-2 rounded-xl bg-verde-claro px-3.5 py-2.5">
                  <p className="text-[13px] font-semibold text-verde-fuerte">
                    {descuento.fase === 'constancia'
                      ? `Mantiene su racha: ${Math.round(descuento.porcentaje)}% de descuento`
                      : `Ganó ${Math.round(descuento.porcentaje)}% de descuento en su primer mes`}
                  </p>
                  <p className="mt-0.5 text-[12px] leading-snug text-verde-fuerte/80">
                    {descuento.fase === 'constancia'
                      ? `Lleva ${descuento.mejor} días seguidos cargando. Cobrale esta renovación con ese descuento.`
                      : `Cargó ${descuento.mejor} días seguidos durante la prueba. Cobrale el primer mes con ese descuento.`}
                  </p>
                </div>
              )}
              <div className="col-span-2">
                <label className="etiqueta">Cuánto transfirió</label>
                <CampoMonto
                  className="campo"
                  placeholder="190.000"
                  valor={importe} alCambiar={setImporte}
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
                  type="number" inputMode="numeric" min={1} max={90} className="campo flex-1"
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

          {/* ---- deshacer ----
              Existe porque pasó: se activó un plan por error sobre una cuenta
              que todavía estaba en prueba, y la prueba se perdió. */}
          {cuenta.puede_deshacer && (
            <div className="rounded-2xl border border-ambar/30 bg-ambar-claro/30 p-4">
              <p className="titulo-seccion mb-1 text-ambar">¿Te equivocaste?</p>
              <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/65">
                Deshace el último cambio de plan y devuelve la cuenta a como estaba: mismo plan,
                mismo estado, mismo vencimiento. Si se había anotado un cobro, ese ingreso se anula.
              </p>
              <button className="boton-suave w-full py-2.5" onClick={deshacer} disabled={ocupado}>
                {trabajando === 'deshaciendo' ? 'Deshaciendo…' : 'Deshacer el último cambio'}
              </button>
            </div>
          )}

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

            <hr className="my-4 border-rojo/15" />

            {/* Borrar de verdad. Pide el nombre exacto escrito a mano: un
                botón rojo se toca por curiosidad, escribir el nombre letra
                por letra no se hace sin querer. */}
            <p className="titulo-seccion mb-1 text-rojo">Borrar la cuenta</p>
            <p className="mb-3 text-[12.5px] leading-relaxed text-tinta/60">
              Se va todo: movimientos, productos, deudas y comprobantes. No hay papelera.
              Para confirmar, escribí <strong className="text-tinta">{cuenta.nombre}</strong>.
            </p>
            <input
              className="campo" placeholder={cuenta.nombre}
              value={confirmaBorrado} onChange={(e) => setConfirmaBorrado(e.target.value)}
            />
            <button
              className="boton-suave mt-2 w-full border-rojo/40 py-2.5 text-rojo hover:bg-rojo-claro disabled:opacity-40"
              onClick={borrar}
              disabled={ocupado || confirmaBorrado.trim() !== cuenta.nombre}
            >
              {trabajando === 'borrando' ? 'Borrando…' : 'Borrar para siempre'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Quién trajo este negocio.
 *
 * Se anota acá, con el código del socio, y se anota UNA VEZ: después la base
 * no deja cambiarlo. Es a propósito —si dos personas dicen haber traído al
 * mismo cliente, la respuesta no puede depender de quién reclame más fuerte—,
 * así que este formulario desaparece en cuanto hay alguien anotado.
 */
function QuienLoTrajo({ referido, rechazado, codigo, onCodigo, anotar, desanotar, trabajando, ocupado }: {
  referido: ReferidoAdmin | null;
  rechazado: CodigoRechazado | null;
  codigo: string;
  onCodigo: (v: string) => void;
  anotar: (codigo?: string) => void;
  desanotar: () => void;
  trabajando: string;
  ocupado: boolean;
}) {
  if (!referido) {
    return (
      <div className="rounded-2xl border border-borde p-4">
        <p className="titulo-seccion mb-1">Quién lo trajo</p>

        {/* Llegó con un enlace y el código se rechazó al registrarse. Antes
            esto no dejaba rastro: el socio perdía la comisión y nadie sabía
            por qué (068). */}
        {rechazado && (
          <div className="mb-3 rounded-xl border border-ambar/30 bg-ambar-claro/40 p-3">
            <p className="text-[13px] font-semibold text-ambar">
              Entró con el enlace de {rechazado.socio ?? 'un código que no existe'} ({rechazado.codigo}), pero no se anotó.
            </p>
            <p className="mt-1 text-[12.5px] leading-snug text-tinta/60">
              La base dijo: «{rechazado.motivo || 'sin motivo'}».
              {rechazado.socio && rechazado.socio_activo === false
                && ` ${rechazado.socio} está desactivado: activalo en «Socios» y volvé a esta ficha.`}
            </p>
            {rechazado.socio && rechazado.socio_activo !== false && (
              <>
                <button
                  type="button" onClick={() => anotar(rechazado.codigo)} disabled={ocupado}
                  className="boton-principal mt-2.5 w-full py-2.5 text-[13.5px]"
                >
                  {trabajando === 'anotando' ? 'Anotando…' : `Anotarlo a ${rechazado.socio}`}
                </button>
                <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">
                  Como entró con su enlace antes de pagar, si ya pagó se genera la comisión por su primer pago.
                </p>
              </>
            )}
          </div>
        )}

        <p className="mb-3 text-[12.5px] leading-snug text-tinta/50">
          Si alguien te trajo este cliente, poné su código. Cuando el cliente pague, la comisión se
          genera sola y aparece en «Socios».
        </p>
        <div className="flex gap-2">
          <input
            className="campo uppercase tracking-widest" placeholder="ABCD1234" maxLength={8}
            value={codigo} onChange={(e) => onCodigo(e.target.value.trim().toUpperCase())}
          />
          <button
            className="boton-suave shrink-0 px-4" onClick={() => anotar()}
            disabled={ocupado || codigo.trim().length < 4}
          >
            {trabajando === 'anotando' ? 'Anotando…' : 'Anotar'}
          </button>
        </div>
      </div>
    );
  }

  const estado = referido.comision === 'pagada' ? 'la comisión ya se le pagó'
    : referido.comision === 'por_pagar' ? 'tiene una comisión por pagar'
    : referido.comision === 'anulada' ? 'su comisión quedó anulada'
    : 'todavía no pagó, así que no hay comisión';

  return (
    <div className="rounded-2xl border border-borde p-4">
      <p className="titulo-seccion mb-1">Quién lo trajo</p>
      <p className="text-[14.5px] font-bold">{referido.socio}</p>
      <p className="mt-0.5 text-[12.5px] text-tinta/50">
        código {referido.codigo} · desde {fechaCorta(referido.desde)} ·{' '}
        {referido.origen === 'link' ? 'por su enlace' : 'anotado a mano'}
      </p>
      <p className="mt-1 text-[12.5px] text-tinta/50">{estado}</p>

      {/* Solo se puede desanotar mientras no haya plata de por medio. La base
          lo exige igual; el botón se esconde para no ofrecer algo que va a
          fallar. */}
      {referido.comision !== 'pagada' && (
        <button
          type="button" onClick={desanotar} disabled={ocupado}
          className="mt-2.5 text-[12.5px] font-semibold text-rojo hover:underline"
        >
          {trabajando === 'desanotando' ? 'Quitando…' : 'Me equivoqué, quitarlo'}
        </button>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor, detalle }: { etiqueta: string; valor: string; detalle?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-tinta/45">{etiqueta}</dt>
      <dd className="mt-0.5 font-semibold">{valor}</dd>
      {detalle && <dd className="text-[11px] font-normal text-tinta/45">{detalle}</dd>}
    </div>
  );
}
