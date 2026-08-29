import Link from 'next/link';
import { textos } from '@/i18n';

/**
 * La franja que avisa cómo viene la suscripción.
 *
 * Existe por una razón concreta: cuando la cuenta vence, PostgreSQL rechaza
 * todo intento de cargar. Sin este aviso, la persona se enteraría chocando
 * contra un error rojo justo cuando iba a anotar una venta —el peor momento
 * posible— y sin entender qué pasó ni qué hacer.
 *
 * Aparece en tres estados y en ninguno más:
 *
 *   · VENCIDA. No se puede cargar. Se dice qué SÍ se puede (mirar todo,
 *     bajar el Excel), porque lo primero que piensa alguien al ver un aviso
 *     así es «¿perdí mis datos?».
 *   · POR VENCER, tres días o menos. Antes de eso sería ruido: quedan
 *     dieciséis pantallas más importantes que un recordatorio de cobro.
 *   · ÚLTIMO DÍA, aparte, porque «mañana» y «en tres días» no se leen igual.
 *
 * Con la cuenta al día no se muestra nada. Una franja permanente pidiendo
 * plata convierte el producto en un cartel publicitario.
 */
export function AvisoCuenta({
  puedeCargar, enPrueba, diasRestantes,
}: {
  puedeCargar: boolean;
  enPrueba: boolean;
  /** Días enteros que faltan. Negativo o cero significa vencida. */
  diasRestantes: number;
}) {
  const t = textos();
  if (!puedeCargar) {
    return (
      <Franja
        tono="rojo"
        titulo={t.pantallas.pruebaTermino}
        detalle={t.pantallas.pruebaTerminoDetalle}
        accion={t.pantallas.verPlanes}
      />
    );
  }

  if (!enPrueba || diasRestantes > 3) return null;

  if (diasRestantes <= 0) {
    return (
      <Franja
        tono="ambar"
        titulo={t.pantallas.ultimoDia}
        detalle={t.pantallas.ultimoDiaDetalle}
        accion={t.pantallas.activarMiPlan}
      />
    );
  }

  return (
    <Franja
      tono="ambar"
      titulo={t.pantallas.quedanDias(diasRestantes)}
      detalle={t.pantallas.quedanDiasDetalle}
      accion={t.pantallas.verPlanes}
    />
  );
}

function Franja({
  tono, titulo, detalle, accion,
}: {
  tono: 'rojo' | 'ambar';
  titulo: string;
  detalle: string;
  accion: string;
}) {
  const estilo = tono === 'rojo'
    ? 'border-rojo/25 bg-rojo-claro/50'
    : 'border-ambar/25 bg-ambar-claro/50';
  const texto = tono === 'rojo' ? 'text-rojo' : 'text-ambar';

  return (
    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${estilo}`}>
      <div className="min-w-0">
        <p className={`text-[14.5px] font-bold ${texto}`}>{titulo}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-tinta/65">{detalle}</p>
      </div>
      <Link href="/plan" className="boton-principal shrink-0 px-4 py-2 text-[13.5px]">
        {accion}
      </Link>
    </div>
  );
}
