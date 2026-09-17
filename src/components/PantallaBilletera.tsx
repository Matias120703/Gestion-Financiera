'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { decimalesDe, dinero } from '@/lib/formato';
import { useOcultarMontos } from '@/lib/ocultar-montos';
import { useLocale, useTextos } from '@/i18n/cliente';
import { metodoVisible } from '@/i18n/nombres';
import type { Billetera, CuentaDinero, TipoCuentaDinero } from '@/lib/tipos';

const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'credito', 'otro'] as const;
const TIPOS: TipoCuentaDinero[] = ['banco', 'efectivo', 'billetera'];

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

/** El ojo que tapa y destapa los montos. */
export function BotonOjo({ oculto, alCambiar, clase = '' }: { oculto: boolean; alCambiar: () => void; clase?: string }) {
  const t = useTextos();
  return (
    <button
      type="button" onClick={alCambiar}
      aria-label={oculto ? t.billetera.mostrarMontos : t.billetera.ocultarMontos}
      className={`grid h-9 w-9 place-items-center rounded-full transition active:scale-90 ${clase}`}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo}>
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
        <circle cx="12" cy="12" r="3" />
        {oculto && <path d="M4 4l16 16" />}
      </svg>
    </button>
  );
}

/**
 * LA BILLETERA (074).
 *
 * Del cuaderno de Matías: la tarjeta con «Banco ATLAS · Gs 755.409» y el
 * ojito; y «cada banco tiene un monto diferente».
 *
 * EL SALDO SE MUEVE SOLO
 *
 * Cada cuenta dice qué formas de pago recibe. Lo que se carga en efectivo va
 * a «Efectivo»; lo cobrado por transferencia, al banco que la reciba. Eso lo
 * resuelve la base al guardar el movimiento: acá no se calcula nada.
 *
 * Y se dice la verdad: los bancos de acá no se conectan con ninguna app. Si
 * el número no coincide con el del banco, «Ajustar saldo» lo corrige con un
 * ajuste fechado, sin reescribir la historia.
 */
export function PantallaBilletera({
  empresaId, moneda, billetera,
}: {
  empresaId: string;
  moneda: string;
  billetera: Billetera;
}) {
  const t = useTextos();
  const b = t.billetera;
  const locale = useLocale();
  const router = useRouter();
  const [oculto, alternar] = useOcultarMontos();
  const [creando, setCreando] = useState(billetera.cuentas.length === 0);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const plata = (n: number) => (oculto ? '••••••' : dinero(n, moneda, true, locale));

  async function correr(fn: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
    setTrabajando(true);
    setError('');
    try {
      const { error: e } = await fn();
      if (e) throw e;
      router.refresh();
      return true;
    } catch (e) {
      setError(mensajeDeError(e, t.errores.generico));
      return false;
    } finally {
      setTrabajando(false);
    }
  }

  const sb = () => clienteNavegador();
  const cuentas = billetera.cuentas;

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      {/* ---- el total ---- */}
      <div className="relative overflow-hidden rounded-3xl bg-noche p-5 text-white shadow-tarjeta">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-2xl"
          style={{ background: 'radial-gradient(circle, #3ddc9a, transparent 65%)' }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/55">{b.tuPlata}</p>
            <p className="mt-1.5 text-[32px] font-bold leading-none tabular-nums tracking-tight">
              {plata(billetera.total)}
            </p>
            <p className="mt-2 text-[12.5px] text-white/55">{b.enNCuentas(cuentas.length)}</p>
          </div>
          <BotonOjo oculto={oculto} alCambiar={alternar} clase="bg-white/10 text-white hover:bg-white/15" />
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
      )}

      {/* ---- cada cuenta, como una tarjeta ---- */}
      <div className="grid gap-3 sm:grid-cols-2">
        {cuentas.map((c, i) => (
          <TarjetaCuenta
            key={c.id}
            cuenta={c}
            indice={i}
            otras={cuentas.filter((x) => x.id !== c.id)}
            moneda={moneda}
            plata={plata}
            ocupado={trabajando}
            alAjustar={(real, nota) => correr(() => sb().rpc('ajustar_saldo_cuenta', {
              p_empresa: empresaId, p_cuenta: c.id, p_saldo_real: real, p_nota: nota,
            }))}
            alTransferir={(hacia, monto) => correr(() => sb().rpc('transferir_entre_cuentas', {
              p_empresa: empresaId, p_desde: c.id, p_hacia: hacia, p_monto: monto, p_nota: '',
            }))}
            alEditar={(d) => correr(() => sb().rpc('guardar_cuenta_dinero', {
              p_empresa: empresaId, p_nombre: d.nombre, p_tipo: d.tipo, p_saldo_inicial: 0,
              p_metodos: d.metodos, p_id: c.id,
            }))}
            alQuitar={() => {
              if (confirm(b.confirmarQuitar(c.nombre))) {
                correr(() => sb().rpc('quitar_cuenta_dinero', { p_empresa: empresaId, p_id: c.id }));
              }
            }}
          />
        ))}
      </div>

      {creando ? (
        <div className="rounded-2xl border border-borde bg-superficie p-4">
          <p className="text-[15px] font-bold">{cuentas.length === 0 ? b.primeraCuenta : b.nuevaCuenta}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/55">{b.nuevaCuentaDetalle}</p>
          <FormularioCuenta
            moneda={moneda}
            ocupado={trabajando}
            conSaldo
            alCancelar={cuentas.length > 0 ? () => setCreando(false) : undefined}
            alGuardar={async (d) => {
              const listo = await correr(() => sb().rpc('guardar_cuenta_dinero', {
                p_empresa: empresaId, p_nombre: d.nombre, p_tipo: d.tipo,
                p_saldo_inicial: d.saldo, p_metodos: d.metodos, p_id: null,
              }));
              if (listo) setCreando(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreando(true)} className="boton-suave w-full py-3 text-[14px]">
          + {b.agregarCuenta}
        </button>
      )}

      <div className="rounded-2xl bg-arena p-4 text-[12.5px] leading-relaxed text-tinta/60">
        <p className="font-semibold text-tinta/75">{b.comoSeMueve}</p>
        <p className="mt-1">{b.comoSeMueveDetalle}</p>
        <p className="mt-2">{b.sinConexionBancos}</p>
        <Link href="/movimientos" className="mt-2 inline-block font-semibold text-verde-fuerte hover:underline">
          {b.verHistorial}
        </Link>
      </div>
    </div>
  );
}

/** Colores de tarjeta, uno por cuenta: que el Familiar y el Itaú no se confundan de un vistazo. */
const FONDOS = [
  'linear-gradient(135deg, #0f5c44 0%, #17795a 55%, #3ddc9a 130%)',
  'linear-gradient(135deg, #1e1b4b 0%, #4338ca 60%, #818cf8 130%)',
  'linear-gradient(135deg, #3b0764 0%, #7e22ce 60%, #e879f9 130%)',
  'linear-gradient(135deg, #0c4a6e 0%, #0369a1 60%, #38bdf8 130%)',
  'linear-gradient(135deg, #431407 0%, #c2410c 60%, #fb923c 130%)',
];

function TarjetaCuenta({
  cuenta, indice, otras, moneda, plata, ocupado, alAjustar, alTransferir, alEditar, alQuitar,
}: {
  cuenta: CuentaDinero;
  indice: number;
  otras: CuentaDinero[];
  moneda: string;
  plata: (n: number) => string;
  ocupado: boolean;
  alAjustar: (real: number, nota: string) => Promise<boolean>;
  alTransferir: (hacia: string, monto: number) => Promise<boolean>;
  alEditar: (d: { nombre: string; tipo: TipoCuentaDinero; metodos: string[] }) => Promise<boolean>;
  alQuitar: () => void;
}) {
  const t = useTextos();
  const b = t.billetera;
  const [modo, setModo] = useState<'' | 'ajustar' | 'transferir' | 'editar'>('');
  const [valor, setValor] = useState('');
  const [hacia, setHacia] = useState(otras[0]?.id ?? '');
  const numero = (s: string) => aNumero(s, moneda);

  return (
    <div className="overflow-hidden rounded-3xl border border-borde bg-superficie shadow-tarjeta">
      <div className="relative p-4 text-white" style={{ background: FONDOS[indice % FONDOS.length] }}>
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[13px] font-bold uppercase tracking-[0.12em]">{cuenta.nombre}</p>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[10.5px] font-semibold">
            {b.tipos[cuenta.tipo]}
          </span>
        </div>
        <p className="mt-5 text-[26px] font-bold leading-none tabular-nums tracking-tight">{plata(Number(cuenta.saldo))}</p>
        <p className="mt-2 truncate text-[11.5px] text-white/70">
          {cuenta.metodos.length > 0
            ? b.recibe(cuenta.metodos.map((m) => metodoVisible(t, m)).join(', '))
            : b.noRecibeNada}
        </p>
      </div>

      <div className="px-4 py-3">
        {(Number(cuenta.entro_mes) > 0 || Number(cuenta.salio_mes) > 0) && (
          <p className="text-[12.5px] text-tinta/55">
            {b.esteMes}{' '}
            <span className="font-semibold text-verde-fuerte">+{plata(Number(cuenta.entro_mes))}</span>
            {' · '}
            <span className="font-semibold text-rojo">−{plata(Number(cuenta.salio_mes))}</span>
          </p>
        )}

        {modo === '' && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="boton-suave px-3 py-1.5 text-[12.5px]" disabled={ocupado}
              onClick={() => { setModo('ajustar'); setValor(''); }}>
              {b.ajustarSaldo}
            </button>
            {otras.length > 0 && (
              <button type="button" className="boton-suave px-3 py-1.5 text-[12.5px]" disabled={ocupado}
                onClick={() => { setModo('transferir'); setValor(''); }}>
                {b.transferir}
              </button>
            )}
            <button type="button" className="boton-suave px-3 py-1.5 text-[12.5px]" disabled={ocupado}
              onClick={() => setModo('editar')}>
              {b.editar}
            </button>
          </div>
        )}

        {modo === 'ajustar' && (
          <div className="mt-2 space-y-2">
            <label className="block">
              <span className="etiqueta">{b.cuantoDiceTuBanco}</span>
              <input className="campo mt-1 py-2 text-[15px] tabular-nums" inputMode="decimal" autoFocus
                value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,-]/g, ''))} />
            </label>
            <p className="text-[12px] leading-snug text-tinta/50">{b.ajustarDetalle}</p>
            <div className="flex gap-2">
              <button type="button" className="boton-principal flex-1 py-2 text-[13.5px]"
                disabled={ocupado || valor.trim() === ''}
                onClick={async () => { if (await alAjustar(numero(valor), '')) setModo(''); }}>
                {t.comun.guardar}
              </button>
              <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => setModo('')}>
                {t.comun.cancelar}
              </button>
            </div>
          </div>
        )}

        {modo === 'transferir' && (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="etiqueta">{b.cuanto}</span>
                <input className="campo mt-1 py-2 text-[15px] tabular-nums" inputMode="decimal" autoFocus
                  value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} />
              </label>
              <label className="block">
                <span className="etiqueta">{b.hacia}</span>
                <select className="campo mt-1 py-2" value={hacia} onChange={(e) => setHacia(e.target.value)}>
                  {otras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                </select>
              </label>
            </div>
            <p className="text-[12px] leading-snug text-tinta/50">{b.transferirDetalle}</p>
            <div className="flex gap-2">
              <button type="button" className="boton-principal flex-1 py-2 text-[13.5px]"
                disabled={ocupado || numero(valor) <= 0 || !hacia}
                onClick={async () => { if (await alTransferir(hacia, numero(valor))) setModo(''); }}>
                {b.transferir}
              </button>
              <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => setModo('')}>
                {t.comun.cancelar}
              </button>
            </div>
          </div>
        )}

        {modo === 'editar' && (
          <div className="mt-1">
            <FormularioCuenta
              moneda={moneda}
              inicial={cuenta}
              ocupado={ocupado}
              alCancelar={() => setModo('')}
              alGuardar={async (d) => { if (await alEditar(d)) setModo(''); }}
            />
            <button type="button" onClick={alQuitar} disabled={ocupado}
              className="mt-2 text-[12.5px] font-semibold text-tinta/40 hover:text-rojo">
              {b.quitar}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormularioCuenta({
  moneda, inicial, ocupado, conSaldo = false, alGuardar, alCancelar,
}: {
  moneda: string;
  inicial?: CuentaDinero;
  ocupado: boolean;
  conSaldo?: boolean;
  alGuardar: (d: { nombre: string; tipo: TipoCuentaDinero; metodos: string[]; saldo: number }) => void;
  alCancelar?: () => void;
}) {
  const t = useTextos();
  const b = t.billetera;
  const [nombre, setNombre] = useState(inicial?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCuentaDinero>(inicial?.tipo ?? 'banco');
  const [metodos, setMetodos] = useState<string[]>(inicial?.metodos ?? ['transferencia']);
  const [saldo, setSaldo] = useState('');

  const elegirTipo = (x: TipoCuentaDinero) => {
    setTipo(x);
    // Lo que casi siempre corresponde, para no hacer pensar a nadie.
    if (!inicial) setMetodos(x === 'efectivo' ? ['efectivo'] : x === 'banco' ? ['transferencia', 'tarjeta'] : ['otro']);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {TIPOS.map((x) => (
          <button key={x} type="button" onClick={() => elegirTipo(x)}
            className={x === tipo ? 'chip-encendido' : 'chip-apagado'}>
            {b.tipos[x]}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="etiqueta">{b.nombre}</span>
        <input className="campo mt-1" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)}
          placeholder={tipo === 'efectivo' ? b.nombreEfectivo : tipo === 'banco' ? b.nombreBanco : b.nombreBilletera} />
      </label>

      {conSaldo && (
        <label className="block">
          <span className="etiqueta">{b.cuantoTenesHoy}</span>
          <input className="campo mt-1 tabular-nums" inputMode="decimal" value={saldo}
            onChange={(e) => setSaldo(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder={dinero(0, moneda)} />
        </label>
      )}

      <div>
        <span className="etiqueta">{b.queEntraAca}</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {METODOS.map((m) => {
            const on = metodos.includes(m);
            return (
              <button key={m} type="button"
                onClick={() => setMetodos(on ? metodos.filter((x) => x !== m) : [...metodos, m])}
                className={on ? 'chip-encendido' : 'chip-apagado'}>
                {metodoVisible(t, m)}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{b.queEntraAcaDetalle}</p>
      </div>

      <div className="flex gap-2">
        <button type="button" className="boton-principal flex-1 py-2.5" disabled={ocupado || nombre.trim() === ''}
          onClick={() => alGuardar({ nombre: nombre.trim(), tipo, metodos, saldo: aNumero(saldo, moneda) })}>
          {ocupado ? t.comun.guardando : t.comun.guardar}
        </button>
        {alCancelar && (
          <button type="button" className="boton-suave px-4 py-2.5" onClick={alCancelar} disabled={ocupado}>
            {t.comun.cancelar}
          </button>
        )}
      </div>
    </div>
  );
}

/** «755.409» en guaraníes; «1.250,50» o «1250.50» en una moneda con centavos. */
function aNumero(s: string, moneda: string): number {
  const limpio = s.trim();
  if (!limpio) return 0;
  const negativo = limpio.startsWith('-');
  const sinSigno = limpio.replace('-', '');
  const n = decimalesDe(moneda) === 0
    ? Number(sinSigno.replace(/[.,]/g, ''))
    : Number(sinSigno.includes(',') ? sinSigno.replace(/\./g, '').replace(',', '.') : sinSigno);
  return (negativo ? -1 : 1) * (Number.isFinite(n) ? n : 0);
}
