'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Confirmar } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { precio } from '@/lib/formato';
import { HojaGuardarTarjeta } from './HojaGuardarTarjeta';
import { HojaPagar, type DatosDelPago } from './HojaPagar';

export interface TarjetaVista {
  id: number;
  marca: string | null;
  ultimos4: string | null;
}

/** Lo que `bancard_estado` dice del débito (125). */
export interface DebitoVista {
  activo: boolean;
  estado: 'al_dia' | 'reintentando' | 'requiere_3ds' | 'pausado' | string;
  /** 'AAAA-MM-DD' o null: el próximo cobro (el anterior al vencimiento, o el reintento). */
  fecha_cobro: string | null;
  importe: number | null;
  intentos: number;
  ultimo_error: string | null;
  bloqueada: boolean;
}

/** 'AAAA-MM-DD' → «13 de noviembre». Es una fecha, no un instante: sin zona. */
function fechaCorta(iso: string, locale: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(iso);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(a, m - 1, d)));
}

/**
 * LA TARJETA GUARDADA, EN /plan.
 *
 * Sin tarjeta: «Guardar mi tarjeta para el cobro de cada mes». Con tarjeta:
 * cuál es (marca y últimos cuatro: es lo único que Orden guarda), cuándo es
 * el próximo cobro y cuánto, o qué pasó si no se pudo cobrar, con «Cobrar
 * ahora» para destrabarlo; y «Cambiar» y «Quitar». Quitar rige en el acto:
 * el servidor apaga el débito antes de hablar con Bancard.
 */
export function TarjetaGuardada({
  empresaId, entorno, urlScript, origen, zona, anual, tarjeta, debito, renovacion,
}: {
  empresaId: string;
  entorno: 'staging' | 'produccion';
  urlScript: string;
  origen: string;
  zona: string;
  anual: boolean;
  tarjeta: TarjetaVista | null;
  debito: DebitoVista | null;
  /** Lo que se cobra si toca «Cobrar ahora» (el plan que paga); null si no hay plan pago. */
  renovacion: DatosDelPago | null;
}) {
  const t = useTextos();
  const k = t.bancard.tarjeta;
  const locale = FICHA[useIdioma()].locale;
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  async function quitar() {
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/tarjeta', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: empresaId }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.ok !== true) {
        setError(typeof d?.error === 'string' ? d.error : k.noSeQuito);
        return;
      }
      setQuitando(false);
      setAviso(d.pendienteEnBancard ? k.quitadaPendiente : k.quitada);
      router.refresh();
    } catch {
      setError(k.noSeQuito);
    } finally {
      setOcupado(false);
    }
  }

  const estado = debito?.estado ?? 'al_dia';
  const conProblema = !!tarjeta && (debito?.bloqueada || estado === 'pausado' || estado === 'reintentando' || estado === 'requiere_3ds');

  let linea: { texto: string; ambar: boolean } | null = null;
  if (tarjeta && debito) {
    const errorTexto = debito.ultimo_error ? k.noPudimos(debito.ultimo_error) : k.noPudimosSinDetalle;
    if (debito.bloqueada) linea = { texto: k.bloqueada, ambar: true };
    else if (estado === 'requiere_3ds') linea = { texto: k.requiere3ds, ambar: true };
    else if (estado === 'pausado') linea = { texto: `${errorTexto} ${k.pausado}`, ambar: true };
    else if (estado === 'reintentando') {
      linea = { texto: `${errorTexto}${debito.fecha_cobro ? ` ${k.reintentamos(fechaCorta(debito.fecha_cobro, locale))}` : ''}`, ambar: true };
    } else if (debito.fecha_cobro) {
      linea = {
        texto: k.proximoCobro(fechaCorta(debito.fecha_cobro, locale), debito.importe !== null ? precio(Number(debito.importe), 'PYG', locale) : null),
        ambar: false,
      };
    } else linea = { texto: k.sinPlan, ambar: false };
  }

  return (
    <div className="tarjeta p-4">
      <p className="titulo-seccion mb-1.5">{k.titulo}</p>
      {tarjeta ? (
        <>
          <p className="text-[15px] font-bold">
            {tarjeta.marca && tarjeta.ultimos4 ? k.tuTarjeta(tarjeta.marca, tarjeta.ultimos4) : k.sinMarca}
          </p>
          {linea && (
            <p className={`mt-1.5 text-[13px] leading-relaxed ${linea.ambar ? 'rounded-xl bg-ambar-claro px-3 py-2 font-medium text-ambar' : 'text-tinta/65'}`}>
              {linea.texto}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {conProblema && renovacion && estado !== 'requiere_3ds' && (
              <button type="button" className="boton-principal px-4 py-2 text-[13.5px]" onClick={() => setCobrando(true)}>
                {k.cobrarAhora}
              </button>
            )}
            <button type="button" className="boton-suave px-4 py-2 text-[13.5px]" onClick={() => setGuardando(true)}>{k.cambiar}</button>
            <button type="button" className="boton-suave px-4 py-2 text-[13.5px] text-rojo" onClick={() => setQuitando(true)}>{k.quitar}</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-tinta/65">{k.cuando}</p>
          <button type="button" className="boton-suave mt-3 px-4 py-2 text-[13.5px]" onClick={() => setGuardando(true)}>
            {anual ? k.guardarAnual : k.guardar}
          </button>
        </>
      )}
      {aviso && <p className="mt-3 rounded-xl bg-verde-claro/60 px-3 py-2 text-[13px] font-medium text-verde-fuerte" role="status">{aviso}</p>}
      {error && <p className="mt-3 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo" role="alert">{error}</p>}

      {guardando && (
        <HojaGuardarTarjeta
          empresaId={empresaId}
          entorno={entorno}
          urlScript={urlScript}
          origen={origen}
          zona={zona}
          anual={anual}
          onCerrar={() => setGuardando(false)}
          onGuardada={() => { setGuardando(false); setAviso(''); router.refresh(); }}
        />
      )}
      {quitando && (
        <Confirmar
          titulo={k.quitarTitulo}
          detalle={k.quitarDetalle}
          si={k.quitar}
          onSi={quitar}
          onNo={() => { if (!ocupado) setQuitando(false); }}
          ocupado={ocupado}
          peligro
          error={error}
        />
      )}
      {cobrando && renovacion && (
        <HojaPagar datos={{ ...renovacion, tarjeta }} onCerrar={() => setCobrando(false)} />
      )}
    </div>
  );
}
