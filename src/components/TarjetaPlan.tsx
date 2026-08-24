import Link from 'next/link';
import type { EstadoDelPlan, PlanEfectivo } from '@/lib/tipos';
import type { Textos } from '@/i18n';

/**
 * Estado del plan, en resumen.
 *
 * Aparece en Ajustes y sirve para una sola cosa: que la persona sepa en qué
 * situación está y qué pasa después. Nada de letra chica.
 *
 * Cuando la prueba está por vencer se pone ámbar, pero el texto sigue siendo
 * tranquilizador: al vencer no se pierde ningún dato. Asustar para vender
 * funciona una vez y quema al cliente.
 */
export function TarjetaPlan({
  plan, suscripcion, uso, t,
}: {
  plan: PlanEfectivo;
  suscripcion: EstadoDelPlan;
  uso: { usados: number; tope: number };
  moneda: string;
  locale: string;
  t: Textos;
}) {
  const nombre = plan === 'negocio' ? t.plan.negocio : plan === 'pro' ? t.plan.pro : t.plan.gratis;
  const porVencer = suscripcion.en_prueba && suscripcion.dias_restantes <= 3;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[17px] font-bold tracking-tight">{nombre}</span>
        {suscripcion.en_prueba && (
          <span className={`pastilla ${porVencer ? 'bg-ambar-claro text-ambar' : 'bg-verde-claro text-verde-fuerte'}`}>
            {t.plan.diasDePrueba(suscripcion.dias_restantes)}
          </span>
        )}
        {suscripcion.cancela_al_vencer && !suscripcion.en_prueba && (
          <span className="pastilla bg-ambar-claro text-ambar">{t.plan.cancelarCuando}</span>
        )}
      </div>

      {suscripcion.en_prueba && (
        <p className="text-[13px] leading-relaxed text-tinta/55">{t.plan.pruebaVence}</p>
      )}

      {!suscripcion.en_prueba && plan === 'gratis' && suscripcion.ya_uso_prueba && (
        <p className="text-[13px] leading-relaxed text-tinta/55">{t.plan.vencidaDetalle}</p>
      )}

      {/* El contador de capturas solo se muestra donde se puede alcanzar. En
          un plan con 3000 por mes, nadie mira este número. */}
      {uso.tope > 0 && uso.tope <= 100 && (
        <p className="text-[13px] font-semibold text-tinta/60">
          {uso.usados >= uso.tope
            ? t.plan.capturasAgotadas
            : t.plan.capturasUsadas(uso.usados, uso.tope)}
        </p>
      )}

      <Link href="/plan" className="boton-suave inline-flex">
        {plan === 'gratis' ? t.plan.elegir : t.plan.gestionar}
      </Link>

      <p className="text-[12px] leading-relaxed text-tinta/40">
        El plan lo determina el sistema de suscripciones mirando el estado y el periodo
        pagado. No se puede cambiar desde la aplicación.
      </p>
    </div>
  );
}
