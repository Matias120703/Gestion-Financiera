import Link from 'next/link';
import { textos } from '@/i18n';
import { FranjaGratis } from '@/components/FranjaGratis';

/**
 * La franja que avisa cómo viene la suscripción.
 *
 * Cuando la cuenta ya está vencida, esta franja convive con el candado de
 * pantalla completa (`CandadoCuenta`, en el layout): el candado tapa el
 * contenido en cualquier pantalla que no sea /plan, y acá se muestra el
 * mismo mensaje arriba, en /plan, donde la persona ya está viendo cómo
 * pagar.
 *
 * Aparece en cuatro estados y en ninguno más:
 *
 *   · VENCIDA. No se puede usar nada: hay que activar el plan. Desde la 110
 *     (28/09/2026) solo la ve un negocio: la personal nunca queda sin carga.
 *   · POR VENCER, tres días o menos. Antes de eso sería ruido: quedan
 *     dieciséis pantallas más importantes que un recordatorio de cobro.
 *   · ÚLTIMO DÍA, aparte, porque «mañana» y «en tres días» no se leen igual.
 *     En la personal, los dos dicen que pasa al plan Gratis y qué se cierra.
 *   · PASÓ A GRATIS (110), solo la cuenta personal, durante los 7 días que
 *     siguen al fin de la prueba o del Pro. Antes la franja se iba y la app
 *     cambiaba sin decir nada. Es neutra, se puede cerrar y se va sola.
 *
 * Con la cuenta al día no se muestra nada. Una franja permanente pidiendo
 * plata convierte el producto en un cartel publicitario.
 */
export async function AvisoCuenta({
  puedeCargar, enPrueba, diasRestantes,
  esPersonal = false, gratisPersonal = false, finDelPlan = null, terminoLaPrueba = false,
}: {
  puedeCargar: boolean;
  enPrueba: boolean;
  /** Días enteros que faltan. Negativo o cero significa vencida. */
  diasRestantes: number;
  /** La cuenta personal: al terminar pasa a Gratis, no al candado (110). */
  esPersonal?: boolean;
  /** Ya está en el plan Gratis personal (lo decide la base, 110). */
  gratisPersonal?: boolean;
  /** Cuándo terminó la prueba o el Pro (`suscripcion.periodo_fin`). */
  finDelPlan?: string | null;
  /** Si lo que terminó fue la prueba (y no un Pro pagado). */
  terminoLaPrueba?: boolean;
}) {
  const t = await textos();
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

  // El día que pasa a Gratis, y los seis siguientes.
  //
  // Se puede pasar a Gratis antes de `periodo_fin`: una 'morosa' (o una
  // 'vencida' que puso el webhook) es Gratis sin mirar la fecha
  // (plan_efectivo_calculado, 009:160-175). Con la cuenta del fin del plan
  // daba negativo y la franja no salía hasta esa fecha, días después de que
  // el menú y el micrófono ya habían cambiado. Mientras la fecha no llega,
  // cuenta como el primer día (28/09/2026). La clave sigue siendo
  // `periodo_fin`: cerrada una vez, no vuelve.
  if (gratisPersonal && finDelPlan) {
    const dias = Math.max(0, (Date.now() - Date.parse(finDelPlan)) / 86_400_000);
    if (dias < 7) {
      return (
        <FranjaGratis
          clave={finDelPlan}
          titulo={terminoLaPrueba ? t.planGratis.aviso.gratisTituloPrueba : t.planGratis.aviso.gratisTituloPro}
          detalle={t.planGratis.aviso.gratisDetalle}
          accion={t.planGratis.aviso.verQueCambio}
          cerrar={t.planGratis.aviso.cerrar}
        />
      );
    }
  }

  if (!enPrueba || diasRestantes > 3) return null;

  if (diasRestantes <= 0) {
    return (
      <Franja
        tono="ambar"
        titulo={t.pantallas.ultimoDia}
        detalle={esPersonal ? t.planGratis.aviso.ultimoDiaDetalle : t.pantallas.ultimoDiaDetalle}
        accion={t.pantallas.activarMiPlan}
      />
    );
  }

  return (
    <Franja
      tono="ambar"
      titulo={t.pantallas.quedanDias(diasRestantes)}
      detalle={esPersonal ? t.planGratis.aviso.quedanDiasDetalle : t.pantallas.quedanDiasDetalle}
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
