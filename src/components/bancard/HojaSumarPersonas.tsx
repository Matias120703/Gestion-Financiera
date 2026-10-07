'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { precio } from '@/lib/formato';
import type { Cotizacion } from '@/lib/cotizacion';
import { SelectorPersonas } from './SelectorPersonas';
import { FormularioBancard } from './FormularioBancard';
import { ResultadoDelPago } from './EstadoDelPago';
import { ContactoDePago } from './ContactoDePago';

/** Lo que devuelve `cotizar_personas` (124): el prorrateo de sumar personas a un Premium vigente. */
interface Prorrateo {
  personas_antes: number;
  personas: number;
  personas_sumadas: number;
  dias_restantes: number;
  dias_del_periodo: number;
  precio_por_persona: number;
  importe: number;
  total: number;
  moneda: 'PYG';
}

export interface DatosDelEquipo {
  empresaId: string;
  entorno: 'staging' | 'produccion';
  urlScript: string;
  origen: string;
  zona: string;
  conPix: boolean;
  periodo: 'mensual' | 'anual';
  /** Las personas por las que hoy se cobra el plan (tope + 1). */
  contratadas: number;
  /** Cuántas personas tiene hoy el equipo. */
  miembros: number;
  /** El tope del plan (15). */
  max: number;
  /** La tarjeta guardada de la cuenta, o null. */
  tarjeta: { id: number; marca: string | null; ultimos4: string | null } | null;
  /** La baja programada para la próxima renovación, si la hay: sumar la cancela (03/10/2026). */
  proxima?: number | null;
}

type Paso = 'elegir' | 'abriendo' | 'formulario' | 'cobrando' | 'tresds' | 'resultado';

/**
 * «SUMAR PERSONAS» A UN PREMIUM PAGO POR BANCARD.
 *
 * La regla (propuesta a Matías, pregunta 8 del contrato): sumar se paga en el
 * momento, prorrateado por los días que faltan del período (`cotizar_personas`,
 * 124: mensual sobre 30 días, anual sobre 365 y 11 meses), y desde la próxima
 * renovación las personas nuevas entran en el precio del plan. Si el pago se
 * rechaza, no cambia nada.
 *
 * Del navegador viaja solo QUÉ se paga (`tipo: 'personas'` y la cantidad en
 * total); el importe lo vuelve a calcular la base al crear la operación.
 * Después es el mismo camino que cualquier pago: el formulario de Bancard, o
 * la tarjeta guardada con «Pagar con mi Visa •••• 0016», y el resultado se le
 * pregunta al servidor hasta saberlo.
 */
export function HojaSumarPersonas({ datos, onCerrar }: { datos: DatosDelEquipo; onCerrar: () => void }) {
  const t = useTextos();
  const q = t.bancard.equipo;
  const h = t.bancard.hoja;
  const k = t.bancard.tarjeta;
  const locale = FICHA[useIdioma()].locale;
  const router = useRouter();

  const minimo = Math.min(datos.contratadas + 1, datos.max);
  const [paso, setPaso] = useState<Paso>('elegir');
  const [personas, setPersonas] = useState(minimo);
  const [cot, setCot] = useState<Prorrateo | null>(null);
  const [renovacion, setRenovacion] = useState<Cotizacion | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<{ operacion: number; processId: string; importe: number } | null>(null);
  const [tresDs, setTresDs] = useState<{ operacion: number; processId: string } | null>(null);
  const [operacion, setOperacion] = useState<number | null>(null);
  const [pagada, setPagada] = useState(false);
  const pedido = useRef(0);

  // La base cotiza cada cantidad: cuánto se paga hoy y cuánto es la
  // renovación con esas personas. Una respuesta vieja no pisa a una nueva.
  useEffect(() => {
    const n = ++pedido.current;
    setCot(null);
    setError('');
    (async () => {
      const bd = clienteNavegador();
      const [hoy, despues] = await Promise.all([
        bd.rpc('cotizar_personas', { p_empresa: datos.empresaId, p_personas: personas }),
        bd.rpc('cotizar_plan', { p_empresa: datos.empresaId, p_plan: 'negocio', p_periodo: datos.periodo, p_personas: personas }),
      ]);
      if (n !== pedido.current) return;
      if (hoy.error || !hoy.data) {
        setError(mensajeDeError(hoy.error, h.noSeCotizo));
        return;
      }
      setCot(hoy.data as Prorrateo);
      setRenovacion(despues.error || !despues.data ? null : despues.data as Cotizacion);
    })();
  }, [personas]); // eslint-disable-line react-hooks/exhaustive-deps

  const cuerpo = () => JSON.stringify({ empresa: datos.empresaId, tipo: 'personas', personas });

  async function abrir() {
    if (!cot) return;
    setPaso('abriendo');
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/pago', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo() });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.yaPagada) {
        setOperacion(Number(d.yaPagada));
        setPaso('resultado');
        return;
      }
      if (r.ok && typeof d?.processId === 'string') {
        setAbierto({ operacion: Number(d.operacion), processId: d.processId, importe: Number(d.importe) });
        setPaso('formulario');
        return;
      }
      setError(mensajeDeError(d?.error, h.noSeAbrio));
    } catch (e) {
      setError(mensajeDeError(e, h.noSeAbrio));
    }
    setPaso('elegir');
  }

  async function cobrar() {
    if (!cot) return;
    setPaso('cobrando');
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/cobrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo() });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.yaPagada) {
        setOperacion(Number(d.yaPagada));
        setPaso('resultado');
        return;
      }
      if (r.ok && d?.estado === 'en_3ds' && typeof d.processId === 'string') {
        setTresDs({ operacion: Number(d.operacion), processId: d.processId });
        setPaso('tresds');
        return;
      }
      if (r.ok && (d?.estado === 'pagada' || d?.estado === 'rechazada' || d?.estado === 'incierta')) {
        setOperacion(Number(d.operacion));
        setPaso('resultado');
        return;
      }
      setError(r.ok && d?.estado === 'vencida' ? k.noSeCobroConGuardada : mensajeDeError(d?.error, k.noSeCobroConGuardada));
    } catch (e) {
      setError(mensajeDeError(e, k.noSeCobroConGuardada));
    }
    setPaso('elegir');
  }

  function cerrar() {
    onCerrar();
    if (pagada) router.refresh();
  }

  const anual = datos.periodo === 'anual';
  const etiquetaPagar = datos.conPix ? t.bancard.boton.pagarConPix : t.bancard.boton.pagar;
  const tarjeta = datos.tarjeta;

  const pie = paso === 'resultado' ? (
    <PieHoja>
      <button type="button" className={`${pagada ? 'boton-principal' : 'boton-suave'} min-h-[48px]`} onClick={cerrar}>
        {pagada ? t.bancard.resultado.listo : t.comun.cerrar}
      </button>
    </PieHoja>
  ) : paso === 'formulario' ? (
    <PieHoja>
      <button type="button" className="boton-suave min-h-[48px]" onClick={() => { setAbierto(null); setPaso('elegir'); }}>
        {h.volver}
      </button>
    </PieHoja>
  ) : paso === 'cobrando' || paso === 'tresds' ? null : (
    <PieHoja>
      <button type="button" className="boton-principal min-h-[48px]" onClick={abrir} disabled={!cot || paso === 'abriendo'}>
        {paso === 'abriendo' ? h.abriendo : etiquetaPagar}
      </button>
      {tarjeta && (
        <button type="button" className="boton-suave min-h-[48px]" onClick={cobrar} disabled={!cot || paso === 'abriendo'}>
          {k.pagarConGuardada(tarjeta.marca || k.sinMarca, tarjeta.ultimos4 || '····')}
        </button>
      )}
    </PieHoja>
  );

  return (
    <Hoja
      titulo={q.sumarTitulo}
      subtitulo={datos.entorno === 'staging' ? t.bancard.pruebas.ambienteDePrueba : undefined}
      onCerrar={cerrar}
      bloqueada={paso === 'abriendo' || paso === 'cobrando'}
      cerrarConVelo={false}
      tamano="medio"
      pie={pie}
    >
      {paso === 'resultado' && operacion !== null ? (
        <ResultadoDelPago
          operacion={operacion}
          locale={locale}
          zona={datos.zona}
          onPagada={() => setPagada(true)}
          onProbarDeNuevo={() => { setOperacion(null); setAbierto(null); setTresDs(null); setPaso('elegir'); }}
        />
      ) : paso === 'formulario' && abierto ? (
        <div className="space-y-3">
          <p className="text-[15px] font-bold tabular-nums">{h.vasAPagar(precio(abierto.importe, 'PYG', locale))}</p>
          <FormularioBancard
            espacio="Checkout"
            processId={abierto.processId}
            entorno={datos.entorno}
            urlScript={datos.urlScript}
            origen={datos.origen}
            onTermino={() => { setOperacion(abierto.operacion); setPaso('resultado'); }}
          />
          <p className="text-[12px] leading-relaxed text-tinta/50">{h.formularioSeguro}</p>
          <ContactoDePago pedido={abierto.operacion} />
        </div>
      ) : paso === 'tresds' && tresDs ? (
        <div className="space-y-3">
          <p className="text-[15px] font-bold">{t.bancard.tresDs.titulo}</p>
          <p className="text-[13px] leading-relaxed text-tinta/60">{t.bancard.tresDs.detalle}</p>
          <FormularioBancard
            espacio="Charge3DS"
            processId={tresDs.processId}
            entorno={datos.entorno}
            urlScript={datos.urlScript}
            origen={datos.origen}
            onTermino={() => { setOperacion(tresDs.operacion); setPaso('resultado'); }}
          />
          <ContactoDePago pedido={tresDs.operacion} />
        </div>
      ) : paso === 'cobrando' ? (
        <div className="flex items-center gap-3 rounded-2xl border border-borde p-4" aria-live="polite">
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-verde border-t-transparent" aria-hidden />
          <p className="text-[14px] font-semibold leading-relaxed">{k.cobrando}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <SelectorPersonas
            valor={personas}
            min={minimo}
            max={datos.max}
            miembros={datos.miembros}
            onCambio={setPersonas}
          />

          {cot ? (
            <div className="rounded-2xl border border-borde p-4">
              <p className="text-[13px] font-semibold text-tinta/60">{q.sumadas(cot.personas_sumadas)}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[26px] font-titulo font-extrabold tracking-tight tabular-nums">{precio(cot.importe, 'PYG', locale)}</span>
                <span className="text-[12.5px] font-semibold text-tinta/45">{h.seCobraEnGuaranies}</span>
              </p>
              <div className="mt-2 space-y-1 text-[12.5px] leading-relaxed text-tinta/60">
                <p>{q.sePagaHoy(precio(cot.importe, 'PYG', locale), cot.dias_restantes)}</p>
                {renovacion && <p>{q.desdeProxima(precio(renovacion.subtotal, 'PYG', locale), anual)}</p>}
                <p>{q.entranYa}</p>
                {typeof datos.proxima === 'number' && datos.proxima < personas && (
                  <p className="font-medium text-ambar">{q.cancelaBaja(datos.proxima)}</p>
                )}
              </div>
            </div>
          ) : !error ? (
            <p className="py-4 text-center text-[13.5px] font-semibold text-tinta/50" aria-live="polite">{h.cargando}</p>
          ) : null}

          <MensajeError texto={error} />
          <ContactoDePago />
        </div>
      )}
    </Hoja>
  );
}
