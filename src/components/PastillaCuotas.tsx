import { pastillaDeCuotas } from '@/lib/frase-cobros';
import type { ResumenFiado } from '@/lib/tipos';

/**
 * LA PASTILLA DE «TE DEBEN» CUANDO HAY COBROS CON FECHA (127).
 *
 * Una sola, la más urgente: cuotas atrasadas (rojo) → lo que toca cobrar hoy
 * (ámbar) → las que vencen esta semana (ámbar). Cuál va lo decide
 * `pastillaDeCuotas`; los números ya vienen en `resumen_fiado`, que el panel
 * lee de todos modos: no hay lectura nueva.
 *
 * Quien no usa fechas no ve nada: su tarjeta queda como siempre.
 *
 * Sin hooks: la usan páginas de servidor, y por eso los textos y el formato
 * de la plata llegan de afuera.
 */
export function PastillaCuotas({ fiado, plata, textos }: {
  fiado: ResumenFiado | null | undefined;
  plata: (monto: number) => string;
  textos: {
    cuotasAtrasadas: (n: number) => string;
    cobrarHoy: (monto: string) => string;
    cuotasSemana: (n: number) => string;
  };
}) {
  const p = pastillaDeCuotas(fiado);
  if (!p) return null;
  const texto = p.tipo === 'atrasadas' ? textos.cuotasAtrasadas(p.cuantas)
    : p.tipo === 'hoy' ? textos.cobrarHoy(plata(p.monto))
    : textos.cuotasSemana(p.cuantas);
  return (
    <span className={`pastilla ${p.tono === 'rojo' ? 'bg-rojo-claro text-rojo' : 'bg-ambar-claro text-ambar'}`}>
      {texto}
    </span>
  );
}
