'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja, MensajeError, PieHoja } from '@/components/Hoja';
import { useIdioma, useTextos } from '@/i18n/cliente';
import { FICHA } from '@/i18n/idiomas';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { mensajeDeError } from '@/lib/errores';
import { precio } from '@/lib/formato';
import type { Cotizacion } from '@/lib/cotizacion';
import { avisoQueQueda, type AvisoDeBaja } from '@/lib/plan-pantalla';

/**
 * BAJAR DE PLAN (07/10/2026): no se paga, se programa.
 *
 * La regla (migración 130): hoy no se cobra ni se devuelve nada; la cuenta
 * sigue con el plan que ya pagó hasta la próxima renovación, y ese cobro ya
 * es por el plan nuevo. Mientras está programado, el equipo no puede pasar
 * de los lugares del plan nuevo. Se deshace con un toque.
 *
 * Programar y deshacer van por el servidor (`/api/pagos/bancard/plan`, con
 * `plan: null` para deshacer): la función de la base es solo del servidor.
 * Del navegador sale A QUÉ plan; nunca un importe ni una fecha. Lo que se
 * muestra de la renovación lo cotiza la base (`cotizar_plan`) y, al
 * terminar, lo contesta la ruta.
 *
 * Son dos pies de tarjeta, uno para el plan más bajo y otro para el plan
 * actual. Cada uno se dibuja SIEMPRE en su tarjeta, esté o no programada la
 * baja: así el «Listo: …» que queda después de programar o de deshacer no se
 * pierde cuando la pantalla se refresca con el estado nuevo.
 *
 * Ese «Listo» no vive más que el estado que anuncia (revisión 08/10): la
 * baja se programa en una tarjeta y se deshace también desde la otra, y el
 * «Listo: desde la próxima renovación tu plan es Básico» quedaba en verde
 * con la baja ya deshecha. Ver `useAvisoDeBaja`.
 */

type Bajable = 'basico' | 'pro';
type PlanPago = 'basico' | 'pro' | 'negocio';

/** Programar (un plan) o deshacer (null) la baja, por la ruta del servidor. */
function useProgramarPlan(empresaId: string) {
  const t = useTextos();
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function programar(plan: Bajable | null): Promise<{ importe: number | null; plan: PlanPago | null } | null> {
    setOcupado(true);
    setError('');
    try {
      const r = await fetch('/api/pagos/bancard/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: empresaId, plan }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || d?.ok !== true) {
        setError(mensajeDeError(d?.error, t.bancard.cambio.noSePudo));
        return null;
      }
      router.refresh();
      // `plan` es el que la cuenta tiene AHORA, dicho por la base: si en el medio
      // entró un pago que estaba sin confirmar, puede no ser el de la pantalla.
      return {
        importe: typeof d.importe === 'number' ? d.importe : null,
        plan: d.plan === 'basico' || d.plan === 'pro' || d.plan === 'negocio' ? d.plan : null,
      };
    } catch (e) {
      setError(mensajeDeError(e, t.bancard.cambio.noSePudo));
      return null;
    } finally {
      setOcupado(false);
    }
  }

  return { ocupado, error, setError, programar };
}

/**
 * El «Listo: …» de un pie, atado al estado que anuncia. Se escribe con el
 * valor de `programado` que ese aviso promete (true: quedó programada;
 * false: se deshizo). Se muestra enseguida, y se borra solo cuando la
 * pantalla, después de haber mostrado eso, pasa a mostrar otra cosa: la
 * baja se cambió desde la otra tarjeta. La regla está en `avisoQueQueda`.
 */
function useAvisoDeBaja(programado: boolean): [string, (texto: string, para?: boolean) => void] {
  const [guardado, setGuardado] = useState<AvisoDeBaja | null>(null);
  // Lo que vale AHORA se decide al dibujar: un aviso viejo no llega a verse.
  const queda = avisoQueQueda(guardado, programado);
  useEffect(() => {
    if (queda !== guardado) setGuardado(queda);
  }, [queda, guardado]);
  const setAviso = (texto: string, para = programado) => setGuardado(texto ? { texto, para, visto: false } : null);
  return [queda?.texto ?? '', setAviso];
}

function Aviso({ texto }: { texto: string }) {
  if (!texto) return null;
  return <p className="rounded-xl bg-verde-claro/60 px-3 py-2 text-[13px] font-medium leading-relaxed text-verde-fuerte" role="status">{texto}</p>;
}

function Fallo({ texto }: { texto: string }) {
  if (!texto) return null;
  return <p className="rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium leading-relaxed text-rojo" role="alert">{texto}</p>;
}

/**
 * EL PIE DE LA TARJETA DE UN PLAN MÁS BAJO que el que la cuenta tiene pago.
 *
 *   · Sin nada programado: «Bajar al Básico desde la renovación», que abre
 *     una hoja chica con lo que va a pasar y «Programar el cambio». Si el
 *     equipo de hoy no entra en ese plan, en vez del botón va el porqué.
 *   · Programado: desde cuándo rige, y «Deshacer». Los últimos días antes de
 *     renovar el servidor manda además el botón para pagarlo a mano
 *     (`children`), con el aviso de que al pagar el plan cambia ahí mismo.
 *   · Con un pago sin terminar no se programa ni se deshace (la base tampoco
 *     deja): deshacer con la renovación ya iniciada por el plan programado
 *     terminaba en dos cobros.
 */
export function PieBajarDePlan({
  empresaId, plan, planActual, programado, fecha, periodo, lugares, capturas, miembros, enCurso, bajaDePersonas = null, children,
}: {
  empresaId: string;
  /** El plan de esta tarjeta: más bajo que el actual. */
  plan: Bajable;
  planActual: 'pro' | 'negocio';
  /** ¿Es el que quedó programado para la próxima renovación? */
  programado: boolean;
  /** Desde cuándo rige, ya escrito («5 de noviembre»): el día del cobro automático si lo hay; si no, el del vencimiento. */
  fecha: string;
  /** El período de la cuenta: sobre ese se cobra la renovación. */
  periodo: 'mensual' | 'anual';
  /** Lo que trae el plan de esta tarjeta. */
  lugares: number;
  capturas: number;
  /** Cuántas personas tiene hoy el equipo. */
  miembros: number;
  /** Hay un pago sin terminar. */
  enCurso: boolean;
  /** La baja de personas que el Premium tenía programada: programar el plan la cancela. */
  bajaDePersonas?: number | null;
  /** «Renovar con tarjeta o QR» del plan programado, cuando ya se puede pagar a mano. */
  children?: React.ReactNode;
}) {
  const t = useTextos();
  const q = t.bancard.cambio;
  const h = t.bancard.hoja;
  const locale = FICHA[useIdioma()].locale;
  const { ocupado, error, setError, programar } = useProgramarPlan(empresaId);
  const [abierta, setAbierta] = useState(false);
  const [aviso, setAviso] = useAvisoDeBaja(programado);
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const [sinPrecio, setSinPrecio] = useState('');

  const nombre = t.plan[plan];
  const nombreActual = t.plan[planActual];
  const gs = (n: number) => precio(Number(n), 'PYG', locale);
  const anual = periodo === 'anual';

  // Cuánto va a pagar desde la renovación: lo cotiza la base al abrir la
  // hoja, con el descuento que la cuenta tiene hoy.
  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    setCot(null);
    setSinPrecio('');
    (async () => {
      const r = await clienteNavegador().rpc('cotizar_plan', {
        p_empresa: empresaId, p_plan: plan, p_periodo: periodo, p_personas: null,
      });
      if (!vivo) return;
      if (r.error || !r.data) setSinPrecio(mensajeDeError(r.error, h.noSeCotizo));
      else setCot(r.data as Cotizacion);
    })();
    return () => { vivo = false; };
  }, [abierta]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirmar() {
    const r = await programar(plan);
    if (!r) return;
    setAbierta(false);
    setAviso(q.listo(nombre), true);
  }

  async function deshacer() {
    const r = await programar(null);
    if (!r) return;
    setAviso(q.deshecho(r.plan ? t.plan[r.plan] : nombreActual, r.importe !== null ? gs(r.importe) : null), false);
  }

  const noEntra = miembros > lugares;

  return (
    <div className="space-y-2">
      {programado ? (
        <>
          <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[13px] font-medium leading-relaxed text-ambar">
            {q.programado(nombre, fecha)}
          </p>
          {children && (
            <>
              {children}
              <p className="text-[12.5px] leading-relaxed text-tinta/60">{q.alPagarCambia(nombre)}</p>
            </>
          )}
          {enCurso ? (
            <p className="text-[12.5px] leading-relaxed text-tinta/60">{q.esperaElPago}</p>
          ) : (
            <button type="button" className="boton-suave w-full" onClick={deshacer} disabled={ocupado}>
              {q.deshacer}
            </button>
          )}
        </>
      ) : noEntra ? (
        <p className="text-[13px] leading-relaxed text-tinta/65">{q.equipoGrande(nombre, h.personas(lugares), miembros)}</p>
      ) : enCurso ? (
        <p className="text-[12.5px] leading-relaxed text-tinta/60">{q.esperaElPago}</p>
      ) : (
        <button type="button" className="boton-suave w-full" onClick={() => { setError(''); setAviso(''); setAbierta(true); }}>
          {q.bajar(nombre)}
        </button>
      )}

      <Aviso texto={aviso} />
      {!abierta && <Fallo texto={error} />}

      {abierta && (
        <Hoja
          titulo={q.bajarTitulo(nombre)}
          onCerrar={() => { if (!ocupado) setAbierta(false); }}
          bloqueada={ocupado}
          cerrarConVelo={false}
          tamano="chico"
          pie={(
            <PieHoja>
              <button type="button" className="boton-principal min-h-[48px]" onClick={confirmar} disabled={ocupado || !cot}>
                {q.programar}
              </button>
            </PieHoja>
          )}
        >
          <div className="space-y-2.5 text-[13.5px] leading-relaxed text-tinta/70">
            {cot ? (
              <p className="font-medium text-tinta">
                {Number(cot.total) < Number(cot.subtotal)
                  ? q.bajarDetalleConDescuento(nombreActual, nombre, gs(cot.subtotal), gs(cot.total), anual, cot.descuento_fase === 'constancia')
                  : q.bajarDetalle(nombreActual, nombre, gs(cot.subtotal), anual)}
              </p>
            ) : !sinPrecio ? (
              <p className="py-2 text-center font-semibold text-tinta/50" aria-live="polite">{h.cargando}</p>
            ) : null}
            <p>{q.programado(nombre, fecha)}</p>
            <p>{q.bajarIncluye(nombre, h.personas(lugares), capturas)}</p>
            <p>{q.bajarTope(h.personas(lugares))}</p>
            <p>{q.sinDevolucion}</p>
            {bajaDePersonas !== null && (
              <p className="font-medium text-ambar">{q.cancelaBajaDePersonas(bajaDePersonas)}</p>
            )}
          </div>
          <MensajeError texto={sinPrecio || error} />
        </Hoja>
      )}
    </div>
  );
}

/**
 * EL PIE DE LA TARJETA DEL PLAN ACTUAL. Con una baja programada, en vez de
 * «Renovar» va «Seguir con el Pro», que la deshace (renovar a mano el plan
 * de hoy no es lo que la persona pidió, y con un pago en curso no se toca).
 * Sin nada programado dibuja lo de siempre, que llega en `children`.
 *
 * `detalle` es para la cuenta que YA NO VE BANCARD y tiene una baja
 * programada (revisión 08/10): la tarjeta del plan más bajo vuelve al
 * WhatsApp y no dice nada de la baja, así que acá va a qué plan pasa y desde
 * cuándo, arriba del botón. Deshacer anda igual: la ruta lo permite siempre.
 */
export function PieDelPlanActual({
  empresaId, plan, programado, enCurso, detalle = null, children,
}: {
  empresaId: string;
  /** El plan que la cuenta tiene pago hoy. */
  plan: 'basico' | 'pro' | 'negocio';
  /** Hay una baja de plan programada para la próxima renovación. */
  programado: boolean;
  enCurso: boolean;
  /** «Desde la renovación (5 de noviembre) tu plan pasa a Básico», cuando no lo dice otra tarjeta. */
  detalle?: string | null;
  /** El pie de siempre: renovar con tarjeta o QR, y la transferencia. */
  children?: React.ReactNode;
}) {
  const t = useTextos();
  const q = t.bancard.cambio;
  const locale = FICHA[useIdioma()].locale;
  const { ocupado, error, programar } = useProgramarPlan(empresaId);
  const [aviso, setAviso] = useAvisoDeBaja(programado);
  const nombre = t.plan[plan];

  async function seguir() {
    const r = await programar(null);
    if (!r) return;
    setAviso(q.deshecho(r.plan ? t.plan[r.plan] : nombre, r.importe !== null ? precio(r.importe, 'PYG', locale) : null), false);
  }

  return (
    <div className="space-y-2">
      {programado && detalle && (
        <p className="rounded-xl bg-ambar-claro px-3 py-2 text-[13px] font-medium leading-relaxed text-ambar">{detalle}</p>
      )}
      {!programado ? children : enCurso ? (
        <p className="text-[12.5px] leading-relaxed text-tinta/60">{q.esperaElPago}</p>
      ) : (
        <button type="button" className="boton-principal w-full" onClick={seguir} disabled={ocupado}>
          {q.seguirCon(nombre)}
        </button>
      )}
      <Aviso texto={aviso} />
      <Fallo texto={error} />
    </div>
  );
}
