'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { dinero } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { enlaceDeSocio } from '@/lib/referido';
import type { PanelSocio } from '@/lib/tipos';

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const num = (v: unknown) => Number(v ?? 0);

function fechaCorta(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: '2-digit' });
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
      setError(mensajeDeError(e, 'No se pudo generar tu código.'));
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
          {pidiendo ? 'Generando…' : 'Quiero mi enlace'}
        </button>
        <p className="text-center text-[12.5px] text-tinta/45">
          No te compromete a nada. Es un enlace tuyo, lo usás si querés.
        </p>
      </div>
    );
  }

  const enlace = enlaceDeSocio(panel.codigo);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight">Recomendá Orden</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-tinta/55">
          Pasá tu enlace. Cuando alguien crea su cuenta con él y paga su primer mes, la mitad de
          ese pago es tuya.
        </p>
      </div>

      {!panel.activo && (
        <p className="rounded-xl bg-ambar-claro px-3.5 py-2.5 text-[13px] font-medium text-ambar">
          Tu código está pausado: por ahora no suma referidos nuevos. Escribinos y lo vemos.
        </p>
      )}

      <Compartir enlace={enlace} codigo={panel.codigo} />

      <div className="grid grid-cols-2 gap-3">
        <Cuadro titulo="Trajiste" valor={String(panel.traidos)} detalle={
          panel.traidos === 1 ? 'cuenta creada con tu enlace' : 'cuentas creadas con tu enlace'} />
        <Cuadro titulo="Pagaron" valor={String(panel.pagaron)} detalle="de esas cuentas" />
        <Cuadro
          titulo="Te deben" valor={dinero(num(panel.por_pagar), 'PYG')}
          detalle={num(panel.por_pagar) > 0 ? 'se paga por transferencia' : 'nada pendiente'}
          tono={num(panel.por_pagar) > 0 ? 'verde' : undefined}
        />
        <Cuadro titulo="Ya cobraste" valor={dinero(num(panel.pagado), 'PYG')} detalle="en total" />
      </div>

      <DondeCobro datos={panel} />

      <div className="rounded-2xl border border-borde bg-superficie">
        <p className="border-b border-borde px-4 py-3 text-[14.5px] font-bold">Los que trajiste</p>
        {panel.referidos.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] leading-relaxed text-tinta/45">
            Todavía nadie entró con tu enlace.<br />
            Mandáselo a alguien que anota sus ventas en un cuaderno.
          </p>
        ) : (
          <ul className="divide-y divide-borde">
            {panel.referidos.map((r, i) => {
              const estado = r.estado === 'pagada' ? { texto: 'ya te lo pagamos', clase: 'bg-verde-claro text-verde-fuerte' }
                : r.estado === 'por_pagar' ? { texto: 'te lo vamos a pagar', clase: 'bg-ambar-claro text-ambar' }
                : r.estado === 'anulada' ? { texto: 'se anuló el pago', clase: 'bg-arena text-tinta/55' }
                : { texto: 'todavía no pagó', clase: 'bg-arena text-tinta/55' };

              return (
                <li key={`${r.negocio}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">{r.negocio}</p>
                    <p className="mt-0.5 text-[12.5px] text-tinta/45">
                      entró el {fechaCorta(r.desde)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {num(r.monto) > 0 && (
                      <p className="text-[14px] font-bold tabular-nums">{dinero(num(r.monto), 'PYG')}</p>
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
  return (
    <div className={`rounded-2xl border border-verde/30 bg-verde-claro/25 ${chica ? 'p-4' : 'p-5'}`}>
      {!chica && (
        <>
          <h1 className="text-[20px] font-bold tracking-tight">Recomendá Orden y ganá</h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-tinta/70">
            Conocés negocios que anotan todo en un cuaderno. Pasales tu enlace: cuando uno crea su
            cuenta y paga su primer mes, <strong className="text-tinta">la mitad de ese pago es
            tuya</strong>.
          </p>
        </>
      )}
      <ul className={`${chica ? '' : 'mt-3'} space-y-1.5 text-[13px] leading-relaxed text-tinta/65`}>
        <li>· Se cobra <strong className="text-tinta">una sola vez</strong> por cada negocio, sobre
          su primer pago. Lo que pague después ya no entra.</li>
        <li>· Se cobra cuando el negocio <strong className="text-tinta">paga de verdad</strong>, no
          cuando crea la cuenta ni cuando prueba gratis.</li>
        <li>· Te lo transferimos a donde nos digas. No hay tope: podés traer uno o veinte.</li>
        <li>· No vale traerte a vos mismo ni al negocio donde trabajás.</li>
      </ul>
    </div>
  );
}

/** El enlace y el código, listos para pegar en un WhatsApp. */
function Compartir({ enlace, codigo }: { enlace: string; codigo: string }) {
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

  const mensaje = `Te paso Orden, lo uso para anotar las ventas y los gastos del negocio y ver la ganancia del día. Entrá por acá: ${enlace}`;

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="etiqueta">Tu enlace</p>
      <p className="mt-1 break-all rounded-xl bg-arena px-3 py-2.5 text-[13.5px] font-semibold">
        {enlace}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button
          type="button" onClick={() => copiar(enlace, 'enlace')}
          className="boton-suave py-2.5 text-[13.5px]"
        >
          {copiado === 'enlace' ? 'Copiado' : 'Copiar enlace'}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
          target="_blank" rel="noopener noreferrer"
          className="boton-principal flex items-center justify-center gap-2 py-2.5 text-[13.5px]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" {...trazo}>
            <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.2-5.2A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
          Mandar por WhatsApp
        </a>
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-tinta/50">
        Si prefiere escribirlo a mano, tu código es{' '}
        <button
          type="button" onClick={() => copiar(codigo, 'codigo')}
          className="font-bold tracking-wider text-tinta underline decoration-dotted"
        >
          {copiado === 'codigo' ? '¡copiado!' : codigo}
        </button>
        . Lo puede poner al crear su cuenta.
      </p>
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
      setError(mensajeDeError(e, 'No se pudo guardar.'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="rounded-2xl border border-borde bg-superficie p-4">
      <p className="text-[14.5px] font-bold">Dónde te transferimos</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-tinta/50">
        Completalo una vez. Cuando te toque cobrar, no te lo vamos a tener que pedir.
      </p>

      {viejo && (
        <p className="mt-3 rounded-xl bg-arena px-3 py-2 text-[12.5px] leading-snug text-tinta/55">
          Antes habías escrito: <span className="font-semibold text-tinta">{viejo}</span>
        </p>
      )}

      <div className="mt-3 space-y-3">
        <Campo
          etiqueta="Banco o billetera" valor={banco} onChange={setBanco}
          ejemplo="Banco Familiar, Ueno, Tigo Money…"
        />
        <Campo
          etiqueta="A nombre de" valor={titular} onChange={setTitular}
          ejemplo="Como figura en la cuenta"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Cuenta o alias" valor={cuenta} onChange={setCuenta}
            ejemplo="Número o alias"
          />
          <Campo
            etiqueta="CI o RUC" valor={documento} onChange={setDocumento}
            ejemplo="Del titular"
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
        {guardando ? 'Guardando…' : listo ? 'Guardado' : 'Guardar mis datos'}
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
