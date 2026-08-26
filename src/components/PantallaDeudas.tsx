'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useLocale, useTextos } from '@/i18n/cliente';
import { dinero, fechaLegible } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { Vacio } from '@/components/Piezas';
import type { Deuda, PagoDeuda, ResumenDeudas, TipoDeuda } from '@/lib/tipos';

/**
 * Nombre traducible del tipo de deuda.
 *
 * Vive acá y no en `lib/deudas.ts` porque ese archivo lee de la base y
 * arrastra `next/headers`, que solo existe en el servidor. Importarlo desde
 * un componente cliente rompía la compilación entera.
 */
function etiquetaTipo(
  tipo: string,
  t: { tipoTarjeta: string; tipoPrestamo: string; tipoProveedor: string; tipoOtro: string },
): string {
  if (tipo === 'tarjeta') return t.tipoTarjeta;
  if (tipo === 'prestamo') return t.tipoPrestamo;
  if (tipo === 'proveedor') return t.tipoProveedor;
  return t.tipoOtro;
}

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/**
 * DEUDAS
 *
 * La pantalla se ordena por urgencia, no por monto: lo vencido primero, lo
 * que vence pronto después. Quien entra acá no viene a admirar el total,
 * viene a saber qué tiene que pagar y cuándo.
 *
 * El saldo nunca se edita a mano. Solo baja registrando pagos, y cada pago
 * queda con su fecha. Si se pudiera escribir el saldo directo, el historial
 * de pagos dejaría de explicarlo y no habría forma de saber cuál de los dos
 * dice la verdad.
 */
export function PantallaDeudas({
  empresaId, moneda, deudas, resumen, puedeEditar,
}: {
  empresaId: string;
  moneda: string;
  deudas: Deuda[];
  resumen: ResumenDeudas;
  puedeEditar: boolean;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [creando, setCreando] = useState(false);
  const [pagando, setPagando] = useState<Deuda | null>(null);
  const [aviso, setAviso] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t.deudas.titulo}</h1>
          <p className="mt-0.5 text-[13px] font-semibold text-tinta/45">{t.deudas.subtitulo}</p>
        </div>
        {puedeEditar && (
          <button type="button" onClick={() => setCreando(true)} className="boton-principal">
            {t.deudas.nueva}
          </button>
        )}
      </header>

      {aviso && (
        <p className="rounded-xl bg-verde-claro px-4 py-3 text-[14px] font-semibold text-verde-fuerte">{aviso}</p>
      )}

      {/* ---------------- El resumen ---------------- */}
      {deudas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="tarjeta p-4">
            <p className="titulo-seccion">{t.deudas.totalDebido}</p>
            <p className="mt-1.5 text-[24px] font-bold tracking-tight tabular-nums">
              {plata(Number(resumen.total_debido))}
            </p>
          </div>

          <div className={`tarjeta p-4 ${resumen.vencidas > 0 ? 'border-rojo/40 bg-rojo-claro/40' : ''}`}>
            <p className="titulo-seccion">{t.deudas.proximoVence}</p>
            <p className="mt-1.5 text-[17px] font-bold tracking-tight">
              {resumen.proximo_vencimiento
                ? fechaLegible(resumen.proximo_vencimiento, true, locale)
                : t.deudas.sinVencimiento}
            </p>
            {resumen.vencidas > 0 && (
              <p className="mt-1 text-[12.5px] font-bold text-rojo">
                {t.deudas.vencidas(resumen.vencidas)}
              </p>
            )}
          </div>

          <div className={`tarjeta p-4 ${resumen.vence_pronto > 0 ? 'border-ambar/40 bg-ambar-claro/40' : ''}`}>
            <p className="titulo-seccion">{t.deudas.vencePronto(resumen.vence_pronto)}</p>
            <p className="mt-1.5 text-[17px] font-bold tracking-tight tabular-nums">
              {plata(Number(resumen.monto_pronto))}
            </p>
          </div>
        </div>
      )}

      {/* ---------------- La lista ---------------- */}
      {deudas.length === 0 ? (
        <div className="tarjeta">
          <Vacio titulo={t.deudas.vacio} detalle={t.deudas.vacioDetalle} />
        </div>
      ) : (
        <div className="space-y-3">
          {deudas.map((d) => (
            <TarjetaDeuda
              key={d.id}
              deuda={d}
              moneda={moneda}
              puedeEditar={puedeEditar}
              alPagar={() => setPagando(d)}
            />
          ))}
        </div>
      )}

      {creando && (
        <FormularioDeuda
          empresaId={empresaId}
          moneda={moneda}
          onCerrar={() => setCreando(false)}
        />
      )}

      {pagando && (
        <FormularioPago
          deuda={pagando}
          moneda={moneda}
          onCerrar={() => setPagando(null)}
          onListo={(mensaje) => { setAviso(mensaje); setTimeout(() => setAviso(''), 6000); }}
        />
      )}
    </div>
  );
}

/** Una deuda: cuánto falta, cuándo vence y cuánto lleva pagado. */
function TarjetaDeuda({
  deuda, moneda, puedeEditar, alPagar,
}: {
  deuda: Deuda;
  moneda: string;
  puedeEditar: boolean;
  alPagar: () => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const [verPagos, setVerPagos] = useState(false);

  const plata = (n: number) => dinero(n, moneda, true, locale);
  const dias = deuda.dias_para_vencer;

  // El vencimiento en palabras. Es lo que la persona lee primero, así que se
  // dice en días —«vence en 3 días»— y no solo con una fecha que hay que
  // calcular mentalmente contra hoy.
  const cuando = deuda.saldada
    ? t.deudas.saldada
    : dias === null
      ? t.deudas.sinVencimiento
      : dias < 0
        ? t.deudas.vencioHace(Math.abs(dias))
        : t.deudas.venceEn(dias);

  const tono = deuda.saldada
    ? 'text-tinta/40'
    : deuda.vencida
      ? 'text-rojo'
      : dias !== null && dias <= 7
        ? 'text-ambar'
        : 'text-tinta/50';

  return (
    <div className={`tarjeta p-4 ${deuda.vencida ? 'border-rojo/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[16px] font-bold tracking-tight">{deuda.nombre}</h2>
            <span className="pastilla bg-arena text-tinta/55">
              {etiquetaTipo(deuda.tipo, t.deudas)}
            </span>
          </div>
          {deuda.acreedor && (
            <p className="mt-0.5 text-[13px] text-tinta/50">{deuda.acreedor}</p>
          )}
          <p className={`mt-1 text-[13px] font-bold ${tono}`}>{cuando}</p>
        </div>

        <div className="text-right">
          <p className="titulo-seccion">{t.deudas.saldo}</p>
          <p className="text-[22px] font-bold tracking-tight tabular-nums">
            {plata(Number(deuda.saldo))}
          </p>
          <p className="text-[12px] text-tinta/40">
            {t.deudas.de} {plata(Number(deuda.monto_original))}
          </p>
        </div>
      </div>

      {/* Cuánto lleva pagado. La barra hace que se vea el progreso, que es lo
          que sostiene las ganas de seguir pagando. */}
      <div className="mt-3">
        <div className="h-2 overflow-hidden rounded-full bg-arena">
          <div
            className={`h-full rounded-full ${deuda.saldada ? 'bg-verde' : 'bg-verde/70'}`}
            style={{ width: `${Math.min(100, Number(deuda.avance))}%` }}
          />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-[12px] font-semibold text-tinta/45">
          <span>{plata(Number(deuda.pagado))} · {Number(deuda.avance)} %</span>
          {deuda.cuotas_totales && (
            <span>{t.deudas.cuotaDe(deuda.cuotas_pagadas, deuda.cuotas_totales)}</span>
          )}
        </div>
      </div>

      {deuda.notas && (
        <p className="mt-2.5 text-[12.5px] italic leading-relaxed text-tinta/50">{deuda.notas}</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        {puedeEditar && !deuda.saldada && (
          <button type="button" onClick={alPagar} className="boton-principal">
            {t.deudas.pagar}
          </button>
        )}
        <button type="button" onClick={() => setVerPagos((v) => !v)} className="boton-texto text-tinta/50">
          {t.deudas.verPagos}
        </button>
      </div>

      {verPagos && <ListaPagos deudaId={deuda.id} moneda={moneda} />}
    </div>
  );
}

/** Historial de pagos. Se pide recién al desplegarlo. */
function ListaPagos({ deudaId, moneda }: { deudaId: string; moneda: string }) {
  const t = useTextos();
  const locale = useLocale();
  const [estado, setEstado] = useState<'cargando' | 'error' | PagoDeuda[]>('cargando');

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const supabase = clienteNavegador();
        const { data, error } = await supabase.rpc('pagos_de_deuda', { p_deuda: deudaId });
        if (!vivo) return;
        setEstado(error || data == null ? 'error' : (data as PagoDeuda[]));
      } catch {
        if (vivo) setEstado('error');
      }
    })();

    return () => { vivo = false; };
  }, [deudaId]);

  if (estado === 'cargando') {
    return <p className="mt-3 text-[13px] text-tinta/40">{t.comun.cargando}</p>;
  }
  if (estado === 'error') {
    return <p className="mt-3 text-[13px] text-ambar">{t.errores.generico}</p>;
  }
  if (estado.length === 0) {
    return <p className="mt-3 text-[13px] text-tinta/40">{t.deudas.sinPagos}</p>;
  }

  return (
    <ul className="mt-3 divide-y divide-borde border-t border-borde">
      {estado.map((p) => (
        <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-[13px] text-tinta/55">
            {fechaLegible(p.fecha, true, locale)}
            {p.nota && <span className="ml-1.5 italic text-tinta/40">· {p.nota}</span>}
          </span>
          <span className="text-[13.5px] font-bold tabular-nums">
            {dinero(Number(p.monto), moneda, true, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Alta de una deuda. */
function FormularioDeuda({
  empresaId, moneda, onCerrar,
}: {
  empresaId: string;
  moneda: string;
  onCerrar: () => void;
}) {
  const t = useTextos();
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDeuda>('tarjeta');
  const [nombre, setNombre] = useState('');
  const [acreedor, setAcreedor] = useState('');
  const [monto, setMonto] = useState('');
  const [saldo, setSaldo] = useState('');
  const [cuotas, setCuotas] = useState('');
  const [montoCuota, setMontoCuota] = useState('');
  const [vence, setVence] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const puede = nombre.trim().length > 0 && Number(monto) > 0;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { error: err } = await supabase.rpc('crear_deuda', {
        p_empresa: empresaId,
        p_nombre: nombre.trim(),
        p_tipo: tipo,
        p_acreedor: acreedor.trim(),
        p_monto: Number(monto),
        // Vacío significa «todavía no pagué nada», que es lo normal.
        p_saldo: saldo === '' ? null : Number(saldo),
        p_cuotas_totales: cuotas === '' ? null : Number(cuotas),
        p_monto_cuota: montoCuota === '' ? null : Number(montoCuota),
        p_vence_el: vence || null,
        p_notas: notas.trim(),
      });
      if (err) throw err;
      router.refresh();
      onCerrar();
    } catch (err: any) {
      setError(mensajeDeError(err, t.errores.generico));
      setGuardando(false);
    }
  }

  const TIPOS: [TipoDeuda, string][] = [
    ['tarjeta', t.deudas.tipoTarjeta],
    ['prestamo', t.deudas.tipoPrestamo],
    ['proveedor', t.deudas.tipoProveedor],
    ['otro', t.deudas.tipoOtro],
  ];

  return (
    <Hoja onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-3.5">
        <h2 className="text-[19px] font-bold tracking-tight">{t.deudas.nueva}</h2>

        <div className="flex flex-wrap gap-2">
          {TIPOS.map(([v, etiqueta]) => (
            <button
              key={v} type="button" onClick={() => setTipo(v)}
              className={tipo === v ? 'chip-encendido' : 'chip-apagado'}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="etiqueta">{t.deudas.nombre}</span>
          <input className="campo" required maxLength={80} placeholder={t.deudas.nombreEjemplo}
                 value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </label>

        <label className="block">
          <span className="etiqueta">{t.deudas.acreedor}</span>
          <input className="campo" maxLength={80} placeholder={t.deudas.acreedorEjemplo}
                 value={acreedor} onChange={(e) => setAcreedor(e.target.value)} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta">{t.deudas.montoTotal} ({moneda})</span>
            <input className="campo" required inputMode="numeric" min={1}
                   value={monto} onChange={(e) => setMonto(e.target.value)} />
          </label>

          <label className="block">
            <span className="etiqueta">{t.deudas.saldoActual}</span>
            <input className="campo" inputMode="numeric" placeholder={monto || '0'}
                   value={saldo} onChange={(e) => setSaldo(e.target.value)} />
          </label>
        </div>
        <p className="-mt-1 text-[12px] leading-relaxed text-tinta/45">{t.deudas.saldoAyuda}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="etiqueta">{t.deudas.cuotas}</span>
            <input className="campo" inputMode="numeric" min={1}
                   value={cuotas} onChange={(e) => setCuotas(e.target.value)} />
          </label>

          <label className="block">
            <span className="etiqueta">{t.deudas.montoCuota}</span>
            <input className="campo" inputMode="numeric"
                   value={montoCuota} onChange={(e) => setMontoCuota(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="etiqueta">{t.deudas.vence}</span>
          <input className="campo" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </label>

        <label className="block">
          <span className="etiqueta">{t.deudas.notas}</span>
          <input className="campo" maxLength={200} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>

        {error && (
          <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="boton-suave flex-1">{t.comun.cancelar}</button>
          <button className="boton-principal flex-1" disabled={!puede || guardando}>
            {guardando ? t.comun.guardando : t.deudas.guardar}
          </button>
        </div>
      </form>
    </Hoja>
  );
}

/** Registrar un pago. */
function FormularioPago({
  deuda, moneda, onCerrar, onListo,
}: {
  deuda: Deuda;
  moneda: string;
  onCerrar: () => void;
  onListo: (mensaje: string) => void;
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  // Se propone la cuota si la deuda las tiene: es lo que se paga casi siempre.
  const [monto, setMonto] = useState(deuda.monto_cuota ? String(deuda.monto_cuota) : '');
  const [metodo, setMetodo] = useState('efectivo');
  const [crearGasto, setCrearGasto] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const plata = (n: number) => dinero(n, moneda, true, locale);

  async function pagar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const supabase = clienteNavegador();
      const { data, error: err } = await supabase.rpc('registrar_pago_deuda', {
        p_deuda: deuda.id,
        p_monto: Number(monto),
        p_fecha: null,
        p_crear_gasto: crearGasto,
        p_metodo: metodo,
        p_nota: '',
      });
      if (err) throw err;

      const sobrante = Number(data?.sobrante ?? 0);
      const mensaje = data?.saldada
        ? t.deudas.pagoSaldada
        : t.deudas.pagoListo(plata(Number(data?.saldo ?? 0)));

      onListo(sobrante > 0 ? `${t.deudas.sobrante(plata(sobrante))} ${mensaje}` : mensaje);
      router.refresh();
      onCerrar();
    } catch (err: any) {
      setError(mensajeDeError(err, t.errores.generico));
      setGuardando(false);
    }
  }

  const METODOS: [string, string][] = [
    ['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'],
    ['tarjeta', 'Tarjeta'], ['otro', 'Otro'],
  ];

  return (
    <Hoja onCerrar={onCerrar}>
      <form onSubmit={pagar} className="space-y-3.5">
        <div>
          <h2 className="text-[19px] font-bold tracking-tight">{t.deudas.pagar}</h2>
          <p className="mt-0.5 text-[13.5px] text-tinta/55">
            {deuda.nombre} · {t.deudas.saldo} {plata(Number(deuda.saldo))}
          </p>
        </div>

        <label className="block">
          <span className="etiqueta">{t.deudas.cuantoPagaste} ({moneda})</span>
          <input className="campo" required inputMode="numeric" autoFocus
                 value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>

        <div>
          <span className="etiqueta">{t.deudas.comoPagaste}</span>
          <div className="flex flex-wrap gap-2">
            {METODOS.map(([v, etiqueta]) => (
              <button
                key={v} type="button" onClick={() => setMetodo(v)}
                className={metodo === v ? 'chip-encendido' : 'chip-apagado'}
              >
                {etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* La casilla está marcada por defecto porque, para quien usa Orden,
            esa plata salió de su bolsillo y espera verla en sus gastos.
            Quien lleva la contabilidad fina la desmarca. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-borde p-3">
          <input
            type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-[#17795a]"
            checked={crearGasto} onChange={(e) => setCrearGasto(e.target.checked)}
          />
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold">{t.deudas.crearGasto}</span>
            <span className="mt-0.5 block text-[12.5px] leading-relaxed text-tinta/50">
              {t.deudas.crearGastoDetalle}
            </span>
          </span>
        </label>

        {error && (
          <p className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCerrar} className="boton-suave flex-1">{t.comun.cancelar}</button>
          <button className="boton-principal flex-1" disabled={Number(monto) <= 0 || guardando}>
            {guardando ? t.comun.guardando : t.deudas.pagar}
          </button>
        </div>
      </form>
    </Hoja>
  );
}

/**
 * La hoja emergente, con las reglas de globals.css: por encima de la barra
 * (z-60) y con altura máxima para que se pueda deslizar.
 */
function Hoja({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-tinta/45 backdrop-blur-[2px] sm:items-center sm:px-4"
      onClick={onCerrar}
    >
      <div
        className="zona-segura-abajo max-h-[88vh] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-3xl bg-white p-5 shadow-tarjeta aparecer sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-borde sm:hidden" />
        {children}
      </div>
    </div>
  );
}
