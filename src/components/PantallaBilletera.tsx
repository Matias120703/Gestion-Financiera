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
      {/* ---- el total y cada cuenta, en una sola tarjeta (como Wise) ---- */}
      <section className="tarjeta overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-tinta/55">{b.tuPlata}</p>
            <p className="mt-1.5 truncate font-titulo text-[40px] font-extrabold leading-none tabular-nums tracking-tight">
              {plata(billetera.total)}
            </p>
            <p className="mt-2 text-[12.5px] text-tinta/50">{b.enNCuentas(cuentas.length)}</p>
          </div>
          <BotonOjo oculto={oculto} alCambiar={alternar} clase="shrink-0 bg-arena text-tinta/70 hover:text-tinta" />
        </div>

        {cuentas.length > 0 && (
          <>
            <ul className="px-2">
              {cuentas.map((c) => (
                <FilaCuenta
                  key={c.id}
                  cuenta={c}
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
            </ul>
            <p className="px-5 pb-4 pt-2 text-[12px] text-tinta/45">{b.tocaUnaCuenta}</p>
          </>
        )}
      </section>

      {error && (
        <p className="rounded-2xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
      )}

      {creando ? (
        <div className="tarjeta p-5">
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

      <div className="rounded-3xl border border-borde/70 p-5 text-[12.5px] leading-relaxed text-tinta/60">
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

/** El círculo de cada cuenta: la inicial del banco, o un billete si es efectivo. */
export function IconoCuenta({ cuenta }: { cuenta: CuentaDinero }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-verde-claro text-[15px] font-bold text-verde-fuerte">
      {cuenta.tipo === 'efectivo' ? (
        <svg viewBox="0 0 24 24" className="h-5 w-5" {...trazo} strokeWidth={1.9}>
          <rect x="3" y="6.5" width="18" height="11" rx="2" /><circle cx="12" cy="12" r="2.5" />
        </svg>
      ) : (
        (cuenta.nombre.trim().charAt(0) || '·').toUpperCase()
      )}
    </span>
  );
}

function FilaCuenta({
  cuenta, otras, moneda, plata, ocupado, alAjustar, alTransferir, alEditar, alQuitar,
}: {
  cuenta: CuentaDinero;
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
  const [abierta, setAbierta] = useState(false);
  const [modo, setModo] = useState<'' | 'ajustar' | 'transferir' | 'editar'>('');
  const [valor, setValor] = useState('');
  const [hacia, setHacia] = useState(otras[0]?.id ?? '');
  const numero = (s: string) => aNumero(s, moneda);

  return (
    <li className={`rounded-2xl transition ${abierta ? 'bg-arena' : ''}`}>
      <button
        type="button"
        onClick={() => { setAbierta((v) => !v); setModo(''); }}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-arena"
      >
        <IconoCuenta cuenta={cuenta} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{cuenta.nombre}</span>
          <span className="block truncate text-[12.5px] text-tinta/50">
            {[b.tipos[cuenta.tipo], cuenta.metodos.length > 0
              ? cuenta.metodos.map((m) => metodoVisible(t, m)).join(', ')
              : b.noRecibeNada,
            ].filter((x, i, todos) => todos.indexOf(x) === i).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{plata(Number(cuenta.saldo))}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-tinta/30 transition ${abierta ? 'rotate-90' : ''}`} {...trazo} strokeWidth={2}>
          <path d="m9 6 6 6-6 6" />
        </svg>
      </button>

      {abierta && (
      <div className="px-3 pb-3 pt-1">
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
            <button type="button" className="boton-principal px-4 py-2 text-[13px]" disabled={ocupado}
              onClick={() => { setModo('ajustar'); setValor(''); }}>
              {b.ajustarSaldo}
            </button>
            {otras.length > 0 && (
              <button type="button" className="boton-suave px-4 py-2 text-[13px]" disabled={ocupado}
                onClick={() => { setModo('transferir'); setValor(''); }}>
                {b.transferir}
              </button>
            )}
            <button type="button" className="boton-suave px-4 py-2 text-[13px]" disabled={ocupado}
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
      )}
    </li>
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
