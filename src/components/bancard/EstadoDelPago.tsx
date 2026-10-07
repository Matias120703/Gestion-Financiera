'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hoja } from '@/components/Hoja';
import { useTextos } from '@/i18n/cliente';
import { mensajeDeError } from '@/lib/errores';
import { Comprobante } from './Comprobante';
import { ContactoDePago } from './ContactoDePago';
import { FormularioBancard } from './FormularioBancard';
import { estaViva, type OperacionVista } from './tipos';

/**
 * ¿QUÉ PASÓ CON EL PAGO? Lo pregunta al servidor (`/api/pagos/bancard/estado`)
 * hasta saberlo, o hasta que pasa el tiempo.
 *
 * NUNCA SE CREE LO QUE DIJO EL FORMULARIO NI LA DIRECCIÓN (un
 * `?status=payment_success` se puede escribir a mano): el estado lo dice la
 * base, que solo cambia con la confirmación firmada de Bancard o con lo que
 * Bancard contesta a la consulta.
 */
export function useEstadoDelPago(
  operacion: number | null,
  { cadaMs = 2_000, hastaMs = 30_000, inicial = null }: { cadaMs?: number; hastaMs?: number; inicial?: OperacionVista | null } = {},
) {
  const [op, setOp] = useState<OperacionVista | null>(inicial);
  const [agotado, setAgotado] = useState(false);
  const [error, setError] = useState('');
  const [noExiste, setNoExiste] = useState(false);
  // Para volver a preguntar desde cero (después de un 3D Secure).
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!operacion) return;
    let vivo = true;
    let reloj: number | undefined;
    const inicio = Date.now();
    setAgotado(false);
    setError('');
    setNoExiste(false);

    async function mirar() {
      try {
        const r = await fetch(`/api/pagos/bancard/estado?op=${operacion}`, { cache: 'no-store' });
        const datos = await r.json().catch(() => null);
        if (!vivo) return;
        if (r.ok && datos && typeof datos === 'object' && 'operacion' in datos) {
          setOp(datos as OperacionVista);
          if (!estaViva((datos as OperacionVista).estado)) return;
        } else if (r.status === 404 || r.status === 400) {
          setError(typeof datos?.error === 'string' ? mensajeDeError(datos.error, '') : '');
          setNoExiste(true);
          return;
        }
      } catch {
        // Un corte: se vuelve a preguntar.
      }
      if (!vivo) return;
      if (Date.now() - inicio >= hastaMs) {
        setAgotado(true);
        return;
      }
      reloj = window.setTimeout(mirar, cadaMs);
    }

    // Aunque ya se sepa el final se pregunta una vez: si el pago entró por la
    // confirmación y nadie le preguntó todavía a Bancard, esa consulta es la
    // que marca un ítem de la lista de tests del portal (ver la ruta).
    mirar();
    return () => {
      vivo = false;
      if (reloj !== undefined) window.clearTimeout(reloj);
    };
  }, [operacion, vuelta]); // eslint-disable-line react-hooks/exhaustive-deps

  return { op, agotado, error, noExiste, volverAMirar: () => setVuelta((v) => v + 1) };
}

/**
 * EL RESULTADO: comprobante si se pagó; el texto de Bancard si se rechazó;
 * «estamos confirmando» mientras no se sabe. Lo usan la ventana de pago y la
 * pantalla de vuelta (`/plan/pago/[op]`).
 */
export function ResultadoDelPago({
  operacion, inicial = null, locale, zona, onProbarDeNuevo, onPagada,
}: {
  operacion: number;
  inicial?: OperacionVista | null;
  locale: string;
  zona: string;
  /** Si está, el rechazo ofrece «Probar de nuevo». */
  onProbarDeNuevo?: () => void;
  /** Se llama una vez, cuando se confirma el pago. */
  onPagada?: () => void;
}) {
  const t = useTextos();
  const r = t.bancard.resultado;
  const { op, agotado, error, noExiste } = useEstadoDelPago(operacion, { inicial });
  const avisado = useRef(false);

  useEffect(() => {
    if (op?.estado === 'pagada' && !avisado.current) {
      avisado.current = true;
      onPagada?.();
    }
  }, [op?.estado]); // eslint-disable-line react-hooks/exhaustive-deps

  if (noExiste) {
    return <p role="alert" className="rounded-xl bg-rojo-claro px-3 py-2.5 text-[13px] font-medium text-rojo">{error || r.noExiste}</p>;
  }

  if (op?.estado === 'pagada') return <Comprobante op={op} locale={locale} zona={zona} />;

  if (op?.estado === 'rechazada' || op?.estado === 'vencida' || op?.estado === 'revertida') {
    const texto = op.estado === 'rechazada'
      ? (op.descripcion_respuesta ? r.rechazado(op.descripcion_respuesta) : r.rechazadoSinDetalle)
      : op.estado === 'revertida' ? r.revertido : r.noSeCompleto;
    return (
      <div className="space-y-4">
        <p role="alert" className="rounded-xl bg-ambar-claro px-3 py-2.5 text-[13.5px] font-medium leading-relaxed text-ambar">{texto}</p>
        {onProbarDeNuevo && op.estado !== 'revertida' && (
          <button type="button" className="boton-principal min-h-[48px] w-full" onClick={onProbarDeNuevo}>
            {r.probarDeNuevo}
          </button>
        )}
        <ContactoDePago pedido={op.operacion} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-borde p-4" aria-live="polite">
        {!agotado && (
          <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-verde border-t-transparent" aria-hidden />
        )}
        <p className="text-[14px] font-semibold leading-relaxed">{agotado ? r.noVuelvasAPagar : r.confirmando}</p>
      </div>
      <ContactoDePago pedido={operacion} />
    </div>
  );
}

/**
 * EN /plan, SI QUEDÓ UN PAGO SIN CONFIRMAR (la persona cerró la ventana, o
 * pagó con QR y volvió). Pregunta un rato; si se confirma, refresca la
 * pantalla con el plan nuevo.
 *
 * Si lo que espera es un 3D SECURE (el banco quiere que la persona confirme
 * el cobro con la tarjeta guardada: el que pidió ella, o el automático de la
 * tarea diaria), «Confirmar el pago» abre el formulario del banco acá
 * mismo, con el `process_id` que la base le entrega solo a quien administra
 * la cuenta. Al terminar se vuelve a preguntar qué pasó.
 */
export function PagoEnCurso({ operacion, estado, tresDs = null }: {
  operacion: number;
  estado: string;
  /** Con qué abrir el formulario de 3D Secure, si la operación lo espera y todavía está a tiempo. */
  tresDs?: { entorno: 'staging' | 'produccion'; urlScript: string; origen: string } | null;
}) {
  const t = useTextos();
  const e = t.bancard.enCurso;
  const router = useRouter();
  const { op, volverAMirar } = useEstadoDelPago(operacion, { cadaMs: 3_000, hastaMs: 30_000 });
  const [confirmando, setConfirmando] = useState(false);
  const pagada = op?.estado === 'pagada';
  const terminada = op ? !estaViva(op.estado) : false;
  const en3ds = (op?.estado ?? estado) === 'en_3ds';
  const puedeConfirmar = en3ds && tresDs !== null && typeof op?.process_id === 'string' && op.process_id !== '';

  useEffect(() => {
    if (pagada) router.refresh();
  }, [pagada]); // eslint-disable-line react-hooks/exhaustive-deps

  if (terminada && !pagada) return null;

  return (
    <div className={`tarjeta p-4 ${pagada ? 'border-verde/50 bg-verde-claro/40' : ''}`}>
      <p className={`text-[15px] font-bold ${pagada ? 'text-verde-fuerte' : ''}`}>
        {pagada ? e.confirmado : en3ds ? e.tresDs : e.titulo}
      </p>
      {!pagada && <p className="mt-1.5 text-[13px] leading-relaxed text-tinta/60">{en3ds ? t.bancard.tresDs.detalle : e.detalle}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {puedeConfirmar && (
          <button type="button" className="boton-principal px-4 py-2 text-[13.5px]" onClick={() => setConfirmando(true)}>
            {t.bancard.tresDs.confirmar}
          </button>
        )}
        <Link href={`/plan/pago/${operacion}`} className="inline-block text-[13px] font-semibold text-verde-fuerte">
          {e.ver}
        </Link>
      </div>
      {confirmando && tresDs && typeof op?.process_id === 'string' && (
        <Hoja
          titulo={t.bancard.tresDs.titulo}
          subtitulo={tresDs.entorno === 'staging' ? t.bancard.pruebas.ambienteDePrueba : undefined}
          onCerrar={() => { setConfirmando(false); volverAMirar(); }}
          cerrarConVelo={false}
          tamano="medio"
        >
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-tinta/60">{t.bancard.tresDs.detalle}</p>
            <FormularioBancard
              espacio="Charge3DS"
              processId={op.process_id}
              entorno={tresDs.entorno}
              urlScript={tresDs.urlScript}
              origen={tresDs.origen}
              onTermino={() => { setConfirmando(false); volverAMirar(); }}
            />
            <p className="text-[12px] leading-relaxed text-tinta/50">{t.bancard.tresDs.esperando}</p>
            <ContactoDePago pedido={operacion} />
          </div>
        </Hoja>
      )}
    </div>
  );
}
