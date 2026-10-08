'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { precio } from '@/lib/formato';
import { recalcular, type Cotizacion } from '@/lib/cotizacion';
import { DesglosePago } from './DesglosePago';
import { SelectorPersonas } from './SelectorPersonas';
import { FormularioBancard } from './FormularioBancard';
import { ResultadoDelPago } from './EstadoDelPago';
import { ContactoDePago } from './ContactoDePago';
import { HojaGuardarTarjeta } from './HojaGuardarTarjeta';

export interface DatosDelPago {
  empresaId: string;
  plan: 'basico' | 'pro' | 'negocio';
  periodo: 'mensual' | 'anual';
  /** Como lo ve la persona: «Premium». */
  nombrePlan: string;
  entorno: 'staging' | 'produccion';
  /** La librería del formulario y el origen de Bancard en ese entorno (los arma el servidor). */
  urlScript: string;
  origen: string;
  /** Solo el Premium de un negocio: con cuántas personas arranca el selector. */
  personasInicial: number | null;
  /** Renovación de un Premium con cantidad: la cantidad no se elige acá. */
  personasFijas: boolean;
  /** Si el plan ya está pago con fecha futura (ISO): «este pago le suma otro período». */
  yaPagoHasta: string | null;
  zona: string;
  conPix: boolean;
  /** La tarjeta guardada de la cuenta (marca y últimos cuatro), o null. */
  tarjeta?: { id: number; marca: string | null; ultimos4: string | null } | null;
  /**
   * Algo que hay que leer antes de pagar, en ámbar. Hoy: al pagar el plan que
   * se programó para la renovación, el plan cambia en ese momento (130).
   */
  aviso?: string | null;
}

type Paso = 'desglose' | 'abriendo' | 'formulario' | 'cobrando' | 'tresds' | 'resultado';

/**
 * «PAGAR CON TARJETA O QR»: la ventana de pago, en tres pasos.
 *
 *   1. LO QUE SE COBRA. La base cotiza (`cotizar_plan`, con el descuento que
 *      corresponda y las personas del Premium). En el Premium, el selector
 *      de cuántas personas: el precio cambia al instante (`recalcular`).
 *   2. EL FORMULARIO DE BANCARD. El servidor vuelve a cotizar, congela el
 *      importe en una operación y pide el formulario (`/api/pagos/bancard/pago`).
 *      Del navegador sale solo qué se paga, nunca cuánto.
 *      O, CON LA TARJETA GUARDADA, «Pagar con mi Visa •••• 0016»: el
 *      servidor cobra con el token (`/api/pagos/bancard/cobrar`) y contesta
 *      cómo quedó; si el banco pide 3D Secure, su formulario se abre acá.
 *      Sin tarjeta, «Guardar mi tarjeta y que se cobre sola»: el catastro
 *      en una hoja encima, y al guardarla se cobra con ella.
 *   3. EL RESULTADO. Se le pregunta al servidor hasta saberlo: comprobante,
 *      el texto de Bancard si se rechazó, o «estamos confirmando».
 *
 * Cerrar con la ✕ no revierte nada: la operación queda viva; si se vuelve a
 * abrir lo mismo en 10 minutos se reusa el mismo formulario, y si no, la
 * conciliación la consulta y la cierra.
 */
export function HojaPagar({ datos, onCerrar }: { datos: DatosDelPago; onCerrar: () => void }) {
  const t = useTextos();
  const h = t.bancard.hoja;
  const k = t.bancard.tarjeta;
  const idioma = useIdioma();
  const locale = FICHA[idioma].locale;
  const router = useRouter();

  const [paso, setPaso] = useState<Paso>('desglose');
  const [base, setBase] = useState<Cotizacion | null>(null);
  const [personas, setPersonas] = useState<number>(datos.personasInicial ?? 0);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<{ operacion: number; processId: string; importe: number } | null>(null);
  const [tresDs, setTresDs] = useState<{ operacion: number; processId: string } | null>(null);
  const [operacion, setOperacion] = useState<number | null>(null);
  const [pagada, setPagada] = useState(false);
  const [tarjeta, setTarjeta] = useState(datos.tarjeta ?? null);
  const [guardar, setGuardar] = useState(false);

  // 1. La cotización de la base, una vez al abrir.
  useEffect(() => {
    let vivo = true;
    (async () => {
      const pedir = (personas: number | null) => clienteNavegador().rpc('cotizar_plan', {
        p_empresa: datos.empresaId,
        p_plan: datos.plan,
        p_periodo: datos.periodo,
        p_personas: personas,
      });
      let { data, error: e } = await pedir(datos.personasInicial);
      // Si el equipo creció desde que se dibujó la pantalla, la cantidad de
      // arranque puede quedar por debajo del mínimo: se cotiza con el tope
      // (siempre válido) y el selector arranca en el mínimo que dice la base.
      let alMinimo = false;
      if ((e || !data) && datos.personasInicial !== null && !datos.personasFijas) {
        ({ data, error: e } = await pedir(15));
        alMinimo = true;
      }
      if (!vivo) return;
      if (e || !data) {
        setError(mensajeDeError(e, h.noSeCotizo));
        return;
      }
      const cot = data as Cotizacion;
      setBase(cot);
      if (cot.personas !== null) setPersonas(alMinimo && cot.personas_min !== null ? cot.personas_min : cot.personas);
    })();
    return () => { vivo = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cot = useMemo(() => (base ? recalcular(base, personas) : null), [base, personas]);
  const llevaPersonas = base?.personas_incluidas !== null && base?.personas_incluidas !== undefined;

  const fecha = (iso: string) => new Date(iso).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: datos.zona,
  });

  // 2. Abrir el formulario.
  async function abrir() {
    if (!cot) return;
    setPaso('abriendo');
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa: datos.empresaId,
          tipo: 'plan',
          plan: datos.plan,
          periodo: datos.periodo,
          personas: llevaPersonas ? cot.personas : null,
        }),
      });
      const respuesta = await r.json().catch(() => null);
      if (r.ok && respuesta?.yaPagada) {
        setOperacion(Number(respuesta.yaPagada));
        setPaso('resultado');
        return;
      }
      if (r.ok && typeof respuesta?.processId === 'string') {
        setAbierto({ operacion: Number(respuesta.operacion), processId: respuesta.processId, importe: Number(respuesta.importe) });
        setPaso('formulario');
        return;
      }
      setError(mensajeDeError(respuesta?.error, h.noSeAbrio));
    } catch (e) {
      setError(mensajeDeError(e, h.noSeAbrio));
    }
    setPaso('desglose');
  }

  // 2 bis. Cobrar con la tarjeta guardada. El servidor contesta cómo quedó;
  // lo que se muestra después sale igual de /estado (nunca de esta respuesta).
  async function cobrar() {
    if (!cot) return;
    setPaso('cobrando');
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/cobrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa: datos.empresaId,
          tipo: 'plan',
          plan: datos.plan,
          periodo: datos.periodo,
          personas: llevaPersonas ? cot.personas : null,
        }),
      });
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
    setPaso('desglose');
  }

  function cerrar() {
    onCerrar();
    if (pagada) router.refresh();
  }

  const anual = datos.periodo === 'anual';
  const etiquetaPagar = datos.conPix ? t.bancard.boton.pagarConPix : t.bancard.boton.pagar;

  const pie = paso === 'resultado' ? (
    <PieHoja>
      <button type="button" className={`${pagada ? 'boton-principal' : 'boton-suave'} min-h-[48px]`} onClick={cerrar}>
        {pagada ? t.bancard.resultado.listo : t.comun.cerrar}
      </button>
    </PieHoja>
  ) : paso === 'formulario' ? (
    <PieHoja>
      <button type="button" className="boton-suave min-h-[48px]" onClick={() => { setAbierto(null); setPaso('desglose'); }}>
        {h.volver}
      </button>
    </PieHoja>
  ) : paso === 'cobrando' || paso === 'tresds' ? null : (
    <PieHoja>
      <button type="button" className="boton-principal min-h-[48px]" onClick={abrir} disabled={!cot || paso === 'abriendo'}>
        {paso === 'abriendo' ? h.abriendo : etiquetaPagar}
      </button>
      {tarjeta ? (
        <button type="button" className="boton-suave min-h-[48px]" onClick={cobrar} disabled={!cot || paso === 'abriendo'}>
          {k.pagarConGuardada(tarjeta.marca || k.sinMarca, tarjeta.ultimos4 || '····')}
        </button>
      ) : (
        <button
          type="button"
          className="min-h-[44px] text-[13px] font-semibold text-verde-fuerte underline-offset-2 hover:underline disabled:opacity-50"
          onClick={() => setGuardar(true)}
          disabled={!cot || paso === 'abriendo'}
        >
          {anual ? k.guardarYPagarAnual : k.guardarYPagar}
        </button>
      )}
    </PieHoja>
  );

  return (
    <Hoja
      titulo={h.titulo(datos.nombrePlan)}
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
          onProbarDeNuevo={() => { setOperacion(null); setAbierto(null); setTresDs(null); setPaso('desglose'); }}
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
          {!cot && !error && (
            <p className="py-6 text-center text-[13.5px] font-semibold text-tinta/50" aria-live="polite">{h.cargando}</p>
          )}

          {cot && llevaPersonas && cot.personas_min !== null && cot.personas_max !== null && cot.personas_incluidas !== null && (
            <div className="space-y-2">
              <SelectorPersonas
                valor={cot.personas ?? cot.personas_min}
                min={cot.personas_min}
                max={cot.personas_max}
                miembros={cot.miembros}
                fijo={datos.personasFijas}
                onCambio={setPersonas}
              />
              <p className="text-[12.5px] leading-relaxed text-tinta/60">
                {h.incluye(cot.personas_incluidas)}{' '}
                {cot.precio_por_persona !== null && h.cadaPersonaMas(precio(cot.precio_por_persona, 'PYG', locale))}
              </p>
            </div>
          )}

          {cot && <DesglosePago cot={cot} nombrePlan={datos.nombrePlan} locale={locale} />}

          {cot && (
            <div className="space-y-1.5 text-[12.5px] leading-relaxed text-tinta/60">
              {datos.yaPagoHasta && new Date(datos.yaPagoHasta).getTime() > Date.now()
                ? <p>{h.yaPagoHasta(fecha(datos.yaPagoHasta))}</p>
                : null}
              <p>{h.activoHasta(fecha(cot.vence_hasta))}</p>
              {datos.aviso && <p className="font-medium text-ambar">{datos.aviso}</p>}
              <p>{h.seCobraEnGuaranies}</p>
            </div>
          )}

          <MensajeError texto={error} />
          <ContactoDePago />
        </div>
      )}

      {guardar && (
        <HojaGuardarTarjeta
          empresaId={datos.empresaId}
          entorno={datos.entorno}
          urlScript={datos.urlScript}
          origen={datos.origen}
          zona={datos.zona}
          antes={k.guardarYPagarDetalle}
          despues={k.guardarYPagarDetalle}
          onCerrar={() => setGuardar(false)}
          onGuardada={(g) => {
            setTarjeta({ id: g.tarjeta, marca: g.marca, ultimos4: g.ultimos4 });
            setGuardar(false);
            void cobrar();
          }}
        />
      )}
    </Hoja>
  );
}
