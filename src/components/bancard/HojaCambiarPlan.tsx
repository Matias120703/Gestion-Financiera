'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { precio } from '@/lib/formato';
import type { CotizacionDeCambio } from '@/lib/cotizacion';
import { debitoSigueVigente } from '@/lib/plan-pantalla';
import { SelectorPersonas } from './SelectorPersonas';
import { FormularioBancard } from './FormularioBancard';
import { ResultadoDelPago } from './EstadoDelPago';
import { ContactoDePago } from './ContactoDePago';

export interface DatosDelCambio {
  empresaId: string;
  /** A qué plan se sube. Cuánto se paga y sobre qué período lo dice la base. */
  plan: 'pro' | 'negocio';
  entorno: 'staging' | 'produccion';
  urlScript: string;
  origen: string;
  zona: string;
  conPix: boolean;
  /** Si sube al Premium: con cuántas personas arranca el selector. Si no, null. */
  personasInicial: number | null;
  /** El tope de personas del Premium (15). */
  personasMax: number;
  /** La tarjeta guardada de la cuenta, o null. */
  tarjeta: { id: number; marca: string | null; ultimos4: string | null } | null;
  /** Con el débito al día: qué día se cobra sola la próxima renovación ('AAAA-MM-DD'). Si no, null. */
  fechaDelDebito: string | null;
  /** Hay una baja programada (de plan o de personas): subir la cancela. */
  hayBajaProgramada: boolean;
  /** El período elegido arriba, en el selector: si no es el de la cuenta, la hoja dice sobre cuál calcula. */
  periodoElegido: 'mensual' | 'anual';
  /** Las tarjetas de planes muestran el cartel de un descuento ganado, y este pago no lo lleva. */
  conCartelDeDescuento: boolean;
}

type Paso = 'elegir' | 'abriendo' | 'formulario' | 'cobrando' | 'tresds' | 'resultado';

/** 'AAAA-MM-DD' → «5 de noviembre». Es una fecha, no un instante: sin zona. */
function diaDelCobro(iso: string, locale: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(iso);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(a, m - 1, d)));
}

/**
 * «CAMBIAR AL PRO» / «CAMBIAR AL PREMIUM»: SUBIR DE PLAN CON DÍAS PAGOS
 * (07/10/2026). Hasta acá esa tarjeta mandaba al WhatsApp.
 *
 * La regla (migración 130): se paga hoy la diferencia de lista entre los dos
 * planes por los días que faltan, sin descuento; la fecha de renovación no
 * cambia; el plan nuevo se activa cuando se confirma el pago.
 *
 * ANTES DE PAGAR SE LEE TODO: cuánto se paga hoy y por qué días, que el plan
 * sigue venciendo el mismo día, cuánto se va a pagar desde la renovación
 * (con y sin el descuento, si lo tiene) y qué día se cobra sola si hay una
 * tarjeta guardada. Todos los números son de la base (`cotizar_cambio`).
 *
 * Del navegador viaja solo A QUÉ se cambia (`tipo: 'cambio'`, el plan y, si
 * es el Premium, cuántas personas). Ni cuánto, ni sobre qué período, ni
 * hasta cuándo: eso lo pone la base al crear la operación.
 *
 * SE VUELVE A COTIZAR JUSTO ANTES DE COBRAR. Con la tarjeta guardada el
 * cobro sale en el acto, sin el paso «Vas a pagar Gs. …» del formulario. Si
 * entre abrir la hoja y tocar el botón la cuenta se renovó (el cobro
 * automático del día anterior al vencimiento, o un pago desde otro
 * teléfono), la hoja mostraba un día de diferencia y se cobraba un mes
 * entero. Por eso los dos botones pasan primero por `sigueIgual`: la misma
 * lectura de la base, hecha un instante antes; si cambió el importe o la
 * fecha, se muestra lo nuevo y hace falta otro toque.
 *
 * Después es el camino de cualquier pago: el formulario de Bancard, o la
 * tarjeta guardada con su 3D Secure, y el resultado se le pregunta al
 * servidor hasta saberlo.
 */
export function HojaCambiarPlan({ datos, onCerrar }: { datos: DatosDelCambio; onCerrar: () => void }) {
  const t = useTextos();
  const q = t.bancard.cambio;
  const h = t.bancard.hoja;
  const k = t.bancard.tarjeta;
  const locale = FICHA[useIdioma()].locale;
  const router = useRouter();

  const conPersonas = datos.plan === 'negocio';
  const [paso, setPaso] = useState<Paso>('elegir');
  const [personas, setPersonas] = useState<number | null>(conPersonas ? datos.personasInicial : null);
  const [cot, setCot] = useState<CotizacionDeCambio | null>(null);
  const [error, setError] = useState('');
  /** «El importe cambió»: lo que dijo la segunda cotización, justo antes de cobrar. */
  const [cambio, setCambio] = useState('');
  const [abierto, setAbierto] = useState<{ operacion: number; processId: string; importe: number } | null>(null);
  const [tresDs, setTresDs] = useState<{ operacion: number; processId: string } | null>(null);
  const [operacion, setOperacion] = useState<number | null>(null);
  const [pagada, setPagada] = useState(false);
  /**
   * Entre qué cantidades se elige, dicho por la última cotización: el
   * selector se queda quieto mientras llega la siguiente (cada toque en − o +
   * vuelve a cotizar, y sin esto desaparecía un instante).
   */
  const [limites, setLimites] = useState<{ min: number; max: number; miembros: number; incluidas: number | null; porPersona: number | null } | null>(null);
  const pedido = useRef(0);
  const probeElMinimo = useRef(false);

  /** La única fuente del importe: la base. */
  const cotizar = (cuantas: number | null) => clienteNavegador().rpc('cotizar_cambio', {
    p_empresa: datos.empresaId,
    p_plan: datos.plan,
    p_personas: cuantas,
  });

  // La base cotiza al abrir y cada vez que cambia la cantidad de personas.
  // Una respuesta vieja no pisa a una nueva.
  useEffect(() => {
    const n = ++pedido.current;
    setCot(null);
    setError('');
    setCambio('');
    (async () => {
      const r = await cotizar(personas);
      if (n !== pedido.current) return;
      if (!r.error && r.data) {
        const nueva = r.data as CotizacionDeCambio;
        setCot(nueva);
        if (nueva.personas_min !== null && nueva.personas_max !== null) {
          setLimites({
            min: nueva.personas_min, max: nueva.personas_max, miembros: nueva.miembros,
            incluidas: nueva.personas_incluidas, porPersona: nueva.precio_por_persona,
          });
        }
        return;
      }
      // Si el equipo creció desde que se dibujó la pantalla, la cantidad de
      // arranque quedó por debajo del mínimo: se cotiza una vez con el tope
      // (siempre válido) para saber el mínimo que dice la base.
      if (conPersonas && !probeElMinimo.current) {
        probeElMinimo.current = true;
        const tope = await cotizar(datos.personasMax);
        if (n !== pedido.current) return;
        const minimo = tope.error || !tope.data ? null : (tope.data as CotizacionDeCambio).personas_min;
        if (typeof minimo === 'number' && minimo !== personas) {
          setPersonas(minimo);
          return;
        }
      }
      setError(mensajeDeError(r.error, h.noSeCotizo));
    })();
  }, [personas]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * ¿Lo que muestra la hoja sigue siendo lo que se va a cobrar? Vuelve a
   * pedirle la cotización a la base y compara el importe y la fecha. Si
   * cambió algo, deja lo nuevo a la vista y contesta que no: no se cobra sin
   * que la persona lo lea y toque otra vez. No viaja ningún importe.
   */
  async function sigueIgual(): Promise<boolean> {
    if (!cot) return false;
    const r = await cotizar(personas);
    if (r.error || !r.data) {
      setCot(null);
      setError(mensajeDeError(r.error, h.noSeCotizo));
      return false;
    }
    const nueva = r.data as CotizacionDeCambio;
    const mismoImporte = Number(nueva.importe) === Number(cot.importe);
    const mismaFecha = new Date(nueva.vence_hasta).getTime() === new Date(cot.vence_hasta).getTime();
    if (mismoImporte && mismaFecha) return true;
    setCot(nueva);
    setCambio(mismoImporte ? q.cambioLaFecha : q.cambioElImporte(precio(Number(nueva.importe), 'PYG', locale)));
    return false;
  }

  const cuerpo = () => JSON.stringify({
    empresa: datos.empresaId, tipo: 'cambio', plan: datos.plan, personas: conPersonas ? personas : null,
  });

  async function abrir() {
    if (!cot) return;
    setPaso('abriendo');
    setError('');
    setCambio('');
    try {
      if (!(await sigueIgual())) {
        setPaso('elegir');
        return;
      }
      const r = await fetch('/api/pagos/bancard/pago', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo() });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.yaPagada) {
        setOperacion(Number(d.yaPagada));
        setPaso('resultado');
        return;
      }
      if (r.ok && typeof d?.processId === 'string') {
        // Si hace un rato se abrió y se dejó el formulario de este mismo
        // cambio, el servidor devuelve ESE (por diez minutos), con el importe
        // de entonces. Si en el medio la cuenta se renovó, ese formulario
        // cobra otra cosa que lo recién cotizado, y pagarlo deja la plata
        // anotada sin cambiar el plan. No se abre: se espera a que se cierre.
        if (Number(d.importe) !== Number(cot.importe)) {
          setError(h.enCurso);
          setPaso('elegir');
          return;
        }
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
    setCambio('');
    try {
      if (!(await sigueIgual())) {
        setPaso('elegir');
        return;
      }
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

  const nombre = (plan: string) => (plan === 'basico' || plan === 'pro' || plan === 'negocio' ? t.plan[plan] : plan);
  const gs = (n: number) => precio(Number(n), 'PYG', locale);
  const fecha = (iso: string) => new Date(iso).toLocaleDateString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: datos.zona,
  });
  const etiquetaPagar = datos.conPix ? t.bancard.boton.pagarConPix : t.bancard.boton.pagar;
  const tarjeta = datos.tarjeta;
  const anual = cot?.periodo === 'anual';
  const conDescuento = cot ? Number(cot.renovacion_hoy) < Number(cot.renovacion) : false;

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
      titulo={q.subirTitulo(nombre(datos.plan))}
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
          <p className="text-[15px] font-bold tabular-nums">{h.vasAPagar(gs(abierto.importe))}</p>
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
          {conPersonas && limites && personas !== null && (
            <div className="space-y-2">
              <SelectorPersonas
                valor={personas}
                min={limites.min}
                max={limites.max}
                miembros={limites.miembros}
                onCambio={setPersonas}
              />
              {limites.incluidas !== null && (
                <p className="text-[12.5px] leading-relaxed text-tinta/60">
                  {h.incluye(limites.incluidas)}{' '}
                  {limites.porPersona !== null && h.cadaPersonaMas(gs(limites.porPersona))}
                </p>
              )}
            </div>
          )}

          {cambio && (
            <p role="status" className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13.5px] font-semibold leading-relaxed text-ambar">
              {cambio}
            </p>
          )}

          {cot ? (
            <div className="rounded-2xl border border-borde p-4">
              <p className="text-[13px] font-semibold text-tinta/60">{q.deA(nombre(cot.plan_antes), nombre(cot.plan))}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-[26px] font-titulo font-extrabold tracking-tight tabular-nums">{gs(cot.importe)}</span>
                <span className="text-[12.5px] font-semibold text-tinta/45">{h.seCobraEnGuaranies}</span>
              </p>
              <div className="mt-2.5 space-y-1.5 text-[13px] leading-relaxed text-tinta/70">
                {/* 1. Cuánto se paga hoy, y por qué días. */}
                <p>
                  {cot.dias_cobrados < cot.dias_pagos ? q.sePagaHoyEntero(gs(cot.importe), anual)
                    : cot.dias_gratis > 0 ? q.sePagaHoyDias(gs(cot.importe), cot.dias_cobrados)
                    : q.sePagaHoy(gs(cot.importe), cot.dias_restantes)}
                  {cot.dias_gratis > 0 && ` ${q.pruebaNoSeCobra(cot.dias_gratis)}`}
                </p>
                {datos.periodoElegido !== cot.periodo && <p>{q.otroPeriodo(anual)}</p>}
                {/* 2. La fecha no cambia. */}
                <p>{q.mismaFecha(fecha(cot.vence_hasta))}</p>
                {/* 3. Cuánto va a pagar desde la renovación, y cuándo se le cobra. */}
                <p>
                  {conDescuento
                    ? q.desdeProximaConDescuento(gs(cot.renovacion), gs(cot.renovacion_hoy), anual, cot.descuento_fase === 'constancia')
                    : q.desdeProxima(gs(cot.renovacion), anual)}
                  {/* La fecha del cobro automático la leyó la página al dibujarse. Si
                      al volver a cotizar la cuenta ya se renovó, es la del
                      vencimiento anterior (un cobro que ya salió): no se dice. */}
                  {tarjeta && datos.fechaDelDebito && debitoSigueVigente(datos.fechaDelDebito, cot.vence_hasta, datos.zona) && ` ${q.debito(
                    diaDelCobro(datos.fechaDelDebito, locale),
                    tarjeta.marca && tarjeta.ultimos4 ? k.tuTarjeta(tarjeta.marca, tarjeta.ultimos4) : null,
                  )}`}
                </p>
                {(conDescuento || datos.conCartelDeDescuento) && <p>{conDescuento ? q.sinDescuento : q.sinDescuentoHoy}</p>}
                <p>{q.seActiva}</p>
                {datos.hayBajaProgramada && <p className="font-medium text-ambar">{q.cancelaLoProgramado}</p>}
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
