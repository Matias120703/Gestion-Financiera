import Link from 'next/link';
import type { Racha } from '@/lib/tipos';
import type { Textos } from '@/i18n';

/**
 * La racha, en dos formas.
 *
 * Regla de diseño: la racha NUNCA regaña. Cuando está en riesgo dice qué se
 * puede perder y cómo evitarlo; no dice "fallaste". Un contador que castiga
 * a las ocho de la mañana logra que la app se desinstale, no que se use.
 *
 * Cuando no hay racha, tampoco muestra un cero grande: invita a empezar.
 */

const trazo = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

const Llama = (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...trazo}>
    <path d="M12 22c3.9 0 6.5-2.5 6.5-6 0-4.3-4-6.4-4.6-10.5-1.6 1.3-2.4 3-2.4 4.6 0 .7-.6 1.1-1.1.7C9.4 9.9 9 8.7 9 7.4 7.2 9 5.5 11.2 5.5 14c0 3.6 2.6 6 6.5 6Z" />
  </svg>
);

/** Pastilla chica, para la barra superior o una tarjeta. */
export function PastillaRacha({ racha, t }: { racha: Racha; t: Textos }) {
  if (racha.dias === 0) return null;

  const tono = racha.en_riesgo
    ? 'bg-ambar-claro text-ambar'
    : 'bg-verde-claro text-verde-fuerte';

  return (
    <span className={`pastilla ${tono}`} title={t.racha.mejor(racha.mejor)}>
      {Llama}
      {racha.dias}
    </span>
  );
}

/** Tarjeta completa, para el panel y el cierre. */
export function TarjetaRacha({ racha, t }: { racha: Racha; t: Textos }) {
  // Nada que contar todavía: no ocupamos espacio con un cero.
  if (racha.dias === 0 && racha.dias_activos === 0) {
    return (
      <Link href="/cierre" className="tarjeta flex items-center gap-3 p-4 transition hover:border-verde/50">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-arena text-tinta/35">
          {Llama}
        </span>
        <p className="text-[14px] font-semibold text-tinta/60">{t.racha.ninguna}</p>
      </Link>
    );
  }

  const enRiesgo = racha.en_riesgo;

  return (
    <Link
      href="/cierre"
      className={`tarjeta flex items-center gap-3.5 p-4 transition hover:border-verde/50 ${
        enRiesgo ? 'border-ambar/40 bg-ambar-claro/40' : ''
      }`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
        enRiesgo ? 'bg-ambar text-white' : 'bg-verde-claro text-verde-fuerte'
      }`}>
        {Llama}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold tracking-tight">{t.racha.dias(racha.dias)}</p>
        <p className="mt-0.5 text-[12.5px] font-semibold leading-snug text-tinta/50">
          {enRiesgo ? t.racha.enRiesgo(racha.dias) : t.racha.mejor(racha.mejor)}
        </p>
      </div>
    </Link>
  );
}
