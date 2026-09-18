'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceDeSocio } from '@/lib/referido';
import type { PanelSocio, RetiroSocio } from '@/lib/tipos';
import { useTextos, useLocale } from '@/i18n/cliente';
import { Rico } from '@/components/Rico';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const num = (v: unknown) => Number(v ?? 0);

function fechaCorta(iso: string | null, locale: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' });
}

/**
 * RECOMENDÁ ORDEN Y GANÁ.
 *
 * La promesa se dice completa y en la primera pantalla, incluido lo que NO
 * pasa: se cobra una sola vez, por el primer pago. Un programa de referidos
 * que insinúa una renta para siempre y después paga una vez no genera un
 * socio: genera alguien que cuenta por ahí que Orden no le pagó.
 *
 * La comisión en plata no se calcula acá. Sale de la base en el momento en
 * que el cliente traído paga de verdad (migración 060), y esta pantalla solo
 * muestra lo que hay.
 */
export function PantallaRecomendar({ panel }: { panel: PanelSocio }) {
  const t = useTextos();
  const r = t.recomendar;
  const locale = useLocale();
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState('');

  async function pedirCodigo() {
    setPidiendo(true);
    setError('');
    try {
      const { error: e } = await clienteNavegador().rpc('mi_codigo_socio');
      if (e) throw e;
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, r.noSeGeneroCodigo));
    } finally {
      setPidiendo(false);
    }
  }

  if (!panel.tiene_codigo) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-2">
        <Promesa />
        {error && (
          <p className="rounded-xl bg-rojo-claro px-3.5 py-2.5 text-[13px] font-medium text-rojo">{error}</p>
        )}
        <button
          type="button" onClick={pedirCodigo} disabled={pidiendo}
          className="boton-principal w-full py-3 text-[15px]"
        >
          {pidiendo ? r.generando : r.quieroMiEnlace}
        </button>
        <p className="text-center text-[12.5px] text-tinta/45">
          {r.noTeCompromete}
        </p>
      </div>
    );
  }

  const enlace = enlaceDeSocio(panel.codigo);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div>
        <h1 className="text-[20px] font-titulo font-extrabold tracking-tight">{r.titulo}</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/55">
          {r.bajada}
        </p>
      </div>

      {!panel.activo && (
        <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
          {r.pausado}
        </p>
      )}

      <Compartir enlace={enlace} codigo={panel.codigo} />

      <Ideas enlace={enlace} />

      <div className="grid grid-cols-2 gap-3">
        <Cuadro titulo={r.trajiste} valor={String(panel.traidos)} detalle={r.cuentasCreadas(panel.traidos)} />
        <Cuadro titulo={r.pagaron} valor={String(panel.pagaron)} detalle={r.deEsasCuentas} />
        <Cuadro
          titulo={r.tuSaldo} valor={dinero(num(panel.por_pagar), 'PYG')}
          detalle={num(panel.por_pagar) > 0 ? r.paraRetirar : r.nadaPendiente}
          tono={num(panel.por_pagar) > 0 ? 'verde' : undefined}
        />
        <Cuadro titulo={r.yaCobraste} valor={dinero(num(panel.pagado), 'PYG')} detalle={r.enTotal} />
      </div>

      <PedirCobro panel={panel} />

      <Retiros retiros={panel.retiros ?? []} />

      <DondeCobro datos={panel} />

      <div className="rounded-2xl border border-borde bg-superficie">
        <p className="border-b border-borde px-4 py-3 text-[14.5px] font-bold">{r.losQueTrajiste}</p>
        {panel.referidos.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] leading-relaxed text-tinta/45">
            {r.nadieEntro}<br />
            {r.mandaselo}
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {panel.referidos.map((ref, i) => {
              const estado = ref.estado === 'pagada' ? { texto: r.estadoPagada, clase: 'bg-verde-claro text-verde-fuerte' }
                : ref.estado === 'por_pagar' ? { texto: r.estadoPorPagar, clase: 'bg-verde-claro text-verde-fuerte' }
                : ref.estado === 'anulada' ? { texto: r.estadoAnulada, clase: 'bg-arena text-tinta/55' }
                : { texto: r.estadoSinPagar, clase: 'bg-arena text-tinta/55' };

              return (
                <li key={`${ref.negocio}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{ref.negocio}</p>
                    <p className="mt-0.5 text-[12.5px] text-tinta/45">
                      {r.entroEl(fechaCorta(ref.desde, locale))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {num(ref.monto) > 0 && (
                      <p className="text-[14px] font-bold tabular-nums">{dinero(num(ref.monto), 'PYG')}</p>
                    )}
                    <span className={`pastilla mt-0.5 ${estado.clase}`}>{estado.texto}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Promesa chica />
    </div>
  );
}

/** La promesa, entera y sin letra chica. */
function Promesa({ chica = false }: { chica?: boolean }) {
  const r = useTextos().recomendar;
  return (
    <div className={`rounded-2xl border border-verde/30 bg-verde-claro/25 ${chica ? 'p-4' : 'p-5'}`}>
      {!chica && (
        <>
          <h1 className="text-[20px] font-titulo font-extrabold tracking-tight">{r.promesaTitulo}</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/70">
            <Rico texto={r.promesaBajada} negrita="text-tinta" />
          </p>
        </>
      )}
      <ul className={`${chica ? '' : 'mt-3'} space-y-1.5 text-[13px] leading-relaxed text-tinta/65`}>
        <li><Rico texto={r.promesaUnaVez} negrita="text-tinta" /></li>
        <li><Rico texto={r.promesaDeVerdad} negrita="text-tinta" /></li>
        <li>{r.promesaSinTope}</li>
        <li>{r.promesaNoVale}</li>
      </ul>
    </div>
  );
}

/** El enlace y el código, listos para pegar en un WhatsApp. */
function Compartir({ enlace, codigo }: { enlace: string; codigo: string }) {
  const r = useTextos().recomendar;
  const [copiado, setCopiado] = useState('');

  async function copiar(texto: string, cual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(''), 1800);
    } catch {
      // Sin portapapeles el texto igual está a la vista. Ver PanelSocios.
    }
  }

  const mensaje = r.mensajeWhatsApp(enlace);

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="etiqueta">{r.tuEnlace}</p>
      <p className="mt-1 break-all rounded-xl bg-arena px-3 py-2.5 text-[13.5px] font-semibold">
        {enlace}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button" onClick={() => copiar(enlace, 'enlace')}
          className="boton-suave py-2.5 text-[13.5px]"
        >
          {copiado === 'enlace' ? r.copiado : r.copiarEnlace}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank" rel="noopener noreferrer"
          className="boton-principal flex items-center justify-center gap-2 py-2.5 text-[13.5px]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
            <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
          {r.mandarPorWhatsApp}
        </a>
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-tinta/50">
        {r.siPrefiereEscribirlo}{' '}
        <button
          type="button" onClick={() => copiar(codigo, 'codigo')}
          className="font-bold tracking-wider text-tinta underline decoration-dotted"
        >
          {copiado === 'codigo' ? r.codigoCopiado : codigo}
        </button>
        {r.loPuedePoner}
      </p>
    </div>
  );
}

/**
 * COBRAR: RETIRAR DEL SALDO.
 *
 * Las comisiones suman a un saldo y el socio elige cuánto retirar (070). Del
 * cuaderno de Matías: «al hacer click en cobrar, me sale para poner la
 * cantidad; al darle Continuar, le tiene que salir el mensaje de que en 24 a
 * 48 horas en días hábiles se le estará pagando».
 *
 * El botón hace dos cosas: deja el retiro anotado en la base y le manda un
 * push a la administración en el momento.
 *
 * LO QUE SE VALIDA ACÁ Y LO QUE NO
 *
 * El mínimo y el saldo se revisan en la pantalla solo para avisar antes de
 * tocar. La regla de verdad está en `solicitar_retiro()`: la pantalla puede
 * estar desactualizada, la base no.
 *
 * LO QUE SE PROMETE SE PROMETE ENTERO
 *
 * «24 a 48 horas hábiles», dicho así, con la palabra hábiles a la vista. Un
 * pedido hecho un viernes a la noche se paga el martes, y es mejor que eso
 * lo sepa antes de esperarlo el sábado.
 */
function PedirCobro({ panel }: { panel: Extract<PanelSocio, { tiene_codigo: true }> }) {
  const t = useTextos();
  const r = t.recomendar;
  const locale = useLocale();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState('');
  const [pedido, setPedido] = useState<number | null>(null);

  const saldo = num(panel.por_pagar);
  const minimo = num(panel.minimo ?? 120000);
  // Solo dígitos: «150.000» y «150000» son lo mismo.
  const monto = Number(texto.replace(/\D/g, '')) || 0;

  // Sin datos bancarios el retiro no se puede resolver, así que la base lo
  // rechaza. Se dice acá antes de que toque, no después.
  const sinDatos = !panel.cuenta.trim() && !panel.cobra_en.trim();
  const esperando = panel.retiro_pedido;

  async function pedir() {
    setError('');
    if (monto < minimo) { setError(r.errorMinimo(dinero(minimo, 'PYG'))); return; }
    if (monto > saldo) { setError(r.errorMaximo(dinero(saldo, 'PYG'))); return; }

    setPidiendo(true);
    try {
      const respuesta = await fetch('/api/socio/cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos?.error || r.noSePidioCobro);
      setPedido(monto);
      setAbierto(false);
      setTexto('');
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, r.noSePidioCobro));
    } finally {
      setPidiendo(false);
    }
  }

  // Ya pidió: la única respuesta que quiere es cuándo le llega.
  if (pedido !== null || esperando) {
    const cuanto = pedido ?? num(esperando?.monto);
    return (
      <div className="rounded-2xl border border-verde/30 bg-verde-claro/30 p-4">
        <p className="text-[14.5px] font-bold text-verde-fuerte">{r.cobroPedido}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-tinta/65">
          <Rico texto={r.vasARecibir(dinero(cuanto, 'PYG'))} negrita="text-tinta" />
        </p>
        {esperando?.pedido_at && (
          <p className="mt-2 text-[12.5px] text-tinta/45">
            {r.loPedisteEl(fechaCorta(esperando.pedido_at, locale))}
          </p>
        )}
      </div>
    );
  }

  // Un botón de cobrar en cero es una promesa vacía.
  if (saldo <= 0) return null;

  const llega = saldo >= minimo;

  return (
    <div className="rounded-2xl border border-verde/30 bg-verde-claro/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold">{r.tenesParaCobrar(dinero(saldo, 'PYG'))}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/60">
            {sinDatos ? r.primeroCompleta : !llega ? r.minimoParaRetirar(dinero(minimo, 'PYG')) : r.loPedis}
          </p>
        </div>
        {!abierto && (
          <button
            type="button" onClick={() => { setAbierto(true); setError(''); }}
            disabled={sinDatos || !llega}
            className="boton-principal shrink-0 px-5 py-2.5 text-[14px]"
          >
            {r.pedirMiCobro}
          </button>
        )}
      </div>

      {abierto && (
        <div className="mt-3.5 rounded-2xl bg-superficie p-3.5">
          <label className="block">
            <span className="etiqueta">{r.cuantoRetirar}</span>
            <div className="mt-1 flex gap-2">
              <input
                className="campo py-2.5 text-[16px] font-semibold tabular-nums"
                inputMode="numeric" autoFocus placeholder={dinero(minimo, 'PYG')}
                value={monto > 0 ? monto.toLocaleString(locale) : texto.replace(/\D/g, '')}
                onChange={(e) => { setTexto(e.target.value); setError(''); }}
              />
              <button
                type="button" onClick={() => { setTexto(String(saldo)); setError(''); }}
                className="boton-suave shrink-0 px-3.5 text-[13.5px]"
              >
                {r.todo}
              </button>
            </div>
          </label>
          <p className="mt-1.5 text-[12px] text-tinta/50">
            {r.minimoMaximo(dinero(minimo, 'PYG'), dinero(saldo, 'PYG'))}
          </p>
          {monto >= minimo && monto <= saldo && (
            <p className="mt-1 text-[12.5px] font-medium text-verde-fuerte">
              {r.teQueda(dinero(saldo - monto, 'PYG'))}
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={pedir} disabled={pidiendo || monto <= 0}
              className="boton-principal flex-1 py-2.5 text-[14px]"
            >
              {pidiendo ? r.pidiendo : r.continuar}
            </button>
            <button
              type="button" onClick={() => { setAbierto(false); setTexto(''); setError(''); }}
              disabled={pidiendo} className="boton-suave px-4 py-2.5 text-[14px]"
            >
              {t.comun.cancelar}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">
          {error}
        </p>
      )}
    </div>
  );
}

/** Lo que ya retiró: pedido, pagado o rechazado con el motivo a la vista. */
function Retiros({ retiros }: { retiros: RetiroSocio[] }) {
  const r = useTextos().recomendar;
  const locale = useLocale();
  if (retiros.length === 0) return null;

  return (
    <div className="rounded-2xl border border-borde bg-superficie">
      <p className="border-b border-borde px-4 py-3 text-[14.5px] font-bold">{r.tusRetiros}</p>
      <ul className="divide-y divide-borde">
        {retiros.map((x) => {
          const estado = x.estado === 'pagado' ? { texto: r.retiroPagado, clase: 'bg-verde-claro text-verde-fuerte' }
            : x.estado === 'rechazado' ? { texto: r.retiroRechazado, clase: 'bg-rojo-claro text-rojo' }
            : { texto: r.retiroPedido, clase: 'bg-ambar-claro text-ambar' };
          return (
            <li key={x.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold tabular-nums">{dinero(num(x.monto), 'PYG')}</p>
                <p className="mt-0.5 text-[12.5px] text-tinta/45">
                  {fechaCorta(x.resuelto_at ?? x.pedido_at, locale)}
                </p>
                {x.estado === 'rechazado' && x.nota && (
                  <p className="mt-0.5 text-[12.5px] text-rojo">{r.motivo(x.nota)}</p>
                )}
              </div>
              <span className={`pastilla shrink-0 ${estado.clase}`}>{estado.texto}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Dónde le transferimos.
 *
 * Eran cuatro datos metidos en una sola línea de texto: «Banco Familiar,
 * alias 0984158986». Al momento de pagar había que leer esa frase y adivinar
 * qué parte era el banco, cuál el alias y a nombre de quién estaba la cuenta
 * —y faltaba la cédula, que todos los bancos de acá piden igual—.
 *
 * Ahora son los mismos cuatro campos que pide cualquier formulario de
 * transferencia, en el mismo orden en que se llenan.
 *
 * Ninguno es obligatorio: alguien puede tener solo una billetera, y exigirle
 * un número de cuenta que no tiene lo dejaría sin poder guardar nada.
 */
function DondeCobro({ datos }: {
  datos: { banco: string; titular: string; cuenta: string; documento: string; cobra_en: string };
}) {
  const t = useTextos();
  const r = t.recomendar;
  const router = useRouter();
  const [banco, setBanco] = useState(datos.banco);
  const [titular, setTitular] = useState(datos.titular);
  const [cuenta, setCuenta] = useState(datos.cuenta);
  const [documento, setDocumento] = useState(datos.documento);
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  const cambio = banco !== datos.banco || titular !== datos.titular
    || cuenta !== datos.cuenta || documento !== datos.documento;

  // Lo que había escrito antes de que esto fueran cuatro campos. Se muestra
  // hasta que complete los nuevos: borrarlo sería perderle el único dato que
  // teníamos para pagarle.
  const viejo = !banco && !cuenta && datos.cobra_en ? datos.cobra_en : '';

  async function guardar() {
    setGuardando(true);
    setError('');
    try {
      const { error: e } = await clienteNavegador().rpc('guardar_donde_cobro', {
        p_banco: banco, p_titular: titular, p_cuenta: cuenta, p_documento: documento,
      });
      if (e) throw e;
      setListo(true);
      setTimeout(() => setListo(false), 2000);
      router.refresh();
    } catch (e: any) {
      setError(mensajeDeError(e, t.gastos.noSePudoGuardar));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="text-[14.5px] font-bold">{r.dondeTransferimos}</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">
        {r.completaloUnaVez}
      </p>

      {viejo && (
        <p className="mt-3 rounded-xl bg-arena px-3 py-2 text-[12.5px] leading-snug text-tinta/55">
          {r.antesHabiasEscrito} <span className="font-semibold text-tinta">{viejo}</span>
        </p>
      )}

      <div className="mt-3 space-y-3">
        <Campo
          etiqueta={r.banco} valor={banco} onChange={setBanco}
          ejemplo={r.bancoEjemplo}
        />
        <Campo
          etiqueta={r.titular} valor={titular} onChange={setTitular}
          ejemplo={r.titularEjemplo}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta={r.cuenta} valor={cuenta} onChange={setCuenta}
            ejemplo={r.cuentaEjemplo}
          />
          <Campo
            etiqueta={r.documento} valor={documento} onChange={setDocumento}
            ejemplo={r.documentoEjemplo}
          />
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[12.5px] font-medium text-rojo">{error}</p>
      )}

      <button
        type="button" onClick={guardar} disabled={guardando || !cambio}
        className="boton-principal mt-3.5 w-full py-2.5 text-[14px]"
      >
        {guardando ? t.comun.guardando : listo ? r.guardado : r.guardarMisDatos}
      </button>
    </div>
  );
}

function Campo({ etiqueta, valor, onChange, ejemplo }: {
  etiqueta: string; valor: string; onChange: (v: string) => void; ejemplo: string;
}) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      <input
        className="campo mt-1 py-2.5 text-[14.5px]" value={valor}
        onChange={(e) => onChange(e.target.value)} placeholder={ejemplo}
      />
    </label>
  );
}

function Cuadro({ titulo, valor, detalle, tono }: {
  titulo: string; valor: string; detalle: string; tono?: 'verde';
}) {
  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-tinta/45">{titulo}</p>
      <p className={`mt-1.5 text-[20px] font-bold leading-none tabular-nums ${
        tono === 'verde' ? 'text-verde-fuerte' : 'text-tinta'
      }`}>
        {valor}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-tinta/50">{detalle}</p>
    </div>
  );
}

/**
 * QUÉ DECIRLE A CADA UNO.
 *
 * Matías: «quiero ayudar a las personas con ideas de qué pueden decir, si es
 * para un negocio o para una persona». El que no sabe qué escribir no
 * escribe: el enlace queda ahí sin usarse. Esto le da el mensaje hecho para
 * cada situación, listo para copiar o mandar por WhatsApp, con su enlace ya
 * adentro.
 *
 * Arranca plegado: el que ya sabe qué decir no tiene que pasar por encima de
 * cuatro mensajes para llegar a sus números.
 */
function Ideas({ enlace }: { enlace: string }) {
  const r = useTextos().recomendar;
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(-1);

  async function copiar(texto: string, cual: number) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(-1), 1800);
    } catch {
      // Sin portapapeles el texto igual está a la vista, para copiarlo a mano.
    }
  }

  return (
    <div className="tarjeta overflow-hidden">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[14.5px] font-bold">{r.ideasTitulo}</span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-tinta/55">{r.ideasBajada}</span>
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-verde-fuerte">
          {abierto ? r.ideasVerMenos : r.ideasVerMas}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde/70 px-4 py-4 aparecer">
          {r.ideas.map((idea, i) => {
            const mensaje = idea.mensaje(enlace);
            return (
              <div key={idea.situacion} className="rounded-2xl bg-arena p-3.5">
                <p className="text-[13px] font-bold">{idea.situacion}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/70">«{mensaje}»</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button" onClick={() => copiar(mensaje, i)}
                    className="boton-suave px-3.5 py-1.5 text-[12.5px]"
                  >
                    {copiado === i ? r.copiado : r.ideasCopiar}
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="boton-principal px-3.5 py-1.5 text-[12.5px]"
                  >
                    {r.mandarPorWhatsApp}
                  </a>
                </div>
              </div>
            );
          })}

          <p className="text-[12.5px] leading-relaxed text-tinta/50">{r.ideasConsejo}</p>
        </div>
      )}
    </div>
  );
}
