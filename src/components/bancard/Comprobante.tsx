'use client';

import { useTextos } from '@/i18n/cliente';
import { precio } from '@/lib/formato';
import { ContactoDePago } from './ContactoDePago';
import type { OperacionVista } from './tipos';

/**
 * EL COMPROBANTE DE UN PAGO APROBADO.
 *
 * El manual de Bancard («Interfaz de respuesta») manda mostrar fecha y hora,
 * número de pedido (`shop_process_id`), importe y la descripción de la
 * respuesta; y prohíbe mostrar el código de autorización, el código de
 * respuesta, la respuesta extendida y la información de seguridad. Por eso
 * acá no hay número de autorización (lo ve solo la administración en /admin)
 * aunque el pedido original lo nombrara: manda el manual 1.23.
 *
 * Además: qué se pagó, hasta cuándo queda activo, con qué tarjeta (si fue con
 * la guardada), y el contacto.
 */
export function Comprobante({ op, locale, zona }: { op: OperacionVista; locale: string; zona: string }) {
  const t = useTextos();
  const c = t.bancard.comprobante;
  const plan = op.plan === 'basico' || op.plan === 'pro' || op.plan === 'negocio' ? t.plan[op.plan] : op.plan;
  const fechaYHora = new Date(op.fecha).toLocaleString(locale, {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zona,
  });
  const vence = op.vence
    ? new Date(op.vence).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: zona })
    : null;
  // Un cambio de plan (130) no es «Plan Pro mensual»: no pagó un mes de Pro,
  // pagó la diferencia. Dice de qué plan a cuál; «Activo hasta» es la misma
  // fecha de antes, porque el cambio no la mueve.
  const antes = op.tipo === 'cambio' && op.desglose && typeof op.desglose === 'object'
    ? (op.desglose as { plan_antes?: unknown }).plan_antes
    : null;
  const planAntes = antes === 'basico' || antes === 'pro' || antes === 'negocio' ? t.plan[antes] : null;
  const concepto = op.tipo === 'personas'
    ? c.conceptoPersonas(op.personas)
    : op.tipo === 'cambio'
      ? c.conceptoCambio(planAntes, plan, op.plan === 'negocio' ? op.personas : null)
      : c.conceptoPlan(plan, op.periodo === 'anual', op.personas);

  const filas: [string, string][] = [
    [c.fechaYHora, fechaYHora],
    [c.pedido, String(op.operacion)],
    [c.importe, precio(Number(op.importe), 'PYG', locale)],
    [c.descripcion, op.descripcion_respuesta || c.titulo],
    [c.concepto, concepto],
  ];
  if (vence) filas.push([c.activoHasta, vence]);
  if (op.tarjeta?.marca && op.tarjeta.ultimos4) filas.push([c.pagadoCon, c.tarjeta(op.tarjeta.marca, op.tarjeta.ultimos4)]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-verde-claro text-verde-fuerte" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4 4L19 7" />
          </svg>
        </span>
        <p className="text-[18px] font-bold tracking-tight">{c.titulo}</p>
      </div>
      <dl className="divide-y divide-borde rounded-2xl border border-borde">
        {filas.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-[13.5px]">
            <dt className="text-tinta/55">{k}</dt>
            <dd className="text-right font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12.5px] leading-relaxed text-tinta/55">{c.guardalo}</p>
      <ContactoDePago pedido={op.operacion} />
      <p className="text-[12px] font-semibold text-tinta/40">{c.sitio}</p>
    </div>
  );
}
