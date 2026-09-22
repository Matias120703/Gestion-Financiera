import { fondoDeTarjeta } from '@/lib/colores-cuenta';

/** «Efectivo» y «efectivo» son lo mismo: sin tildes ni mayúsculas. */
const plano = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
import type { CuentaDinero } from '@/lib/tipos';

/**
 * UNA CUENTA COMO TARJETA DE BANCO (094).
 *
 * Matías: «quiero que se vea como una tarjeta real, así como una tarjeta de
 * crédito o de débito. Y con el color en toda la tarjeta, para que se
 * distinga más y resalte».
 *
 * Tiene la forma de una tarjeta de verdad (la proporción de la norma de las
 * tarjetas bancarias, 85,6 × 54 mm) pintada entera del color de la cuenta,
 * con el chip, el nombre arriba y el saldo abajo, donde se lo busca en una
 * tarjeta.
 *
 * NO IMITA A NINGÚN BANCO NI A NINGUNA MARCA
 *
 * El color es el que la persona eligió o el que reconocimos por el nombre,
 * y nada más: ni logos, ni el dibujo de ninguna red de tarjetas. Es la
 * tarjeta de Orden para esa cuenta, no una copia de la del banco.
 *
 * El efectivo no tiene chip —no es una tarjeta que se pase por ningún
 * lado—: lleva un billete. La billetera digital, un teléfono.
 */
export function TarjetaCuenta({
  cuenta, tipo, saldo, className = '',
}: {
  cuenta: CuentaDinero;
  /** «Banco», «Efectivo», «Billetera», en el idioma de quien mira. */
  tipo: string;
  /** El saldo ya escrito, o los puntitos si los montos están ocultos. */
  saldo: string;
  className?: string;
}) {
  // Una cuenta que se llama como su tipo —«Efectivo», de tipo efectivo— no
  // necesita la etiqueta: diría lo mismo dos veces, en pantalla y en voz alta.
  const conEtiqueta = plano(cuenta.nombre) !== plano(tipo);

  return (
    <div
      className={`relative isolate flex aspect-[1.586] flex-col justify-between overflow-hidden rounded-[18px] p-4 text-white shadow-[0_10px_24px_-12px_rgba(0,0,0,0.55)] ${className}`}
      style={{ background: fondoDeTarjeta(cuenta) }}
    >
      {/* El brillo de una tarjeta de plástico: dos círculos grandes, apenas
          más claros, que rompen el color liso. Detrás de todo. */}
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-14 -z-10 h-40 w-40 rounded-full bg-white/[0.09]" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-2 -z-10 h-36 w-36 rounded-full bg-white/[0.06]" />
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-white/[0.07] to-transparent" />

      {/* LA TARJETA MISMA REPARTE EL ESPACIO, SIN CAJA DE ALTO 100%.
          Había una caja adentro con `h-full`, y en el iPhone (WebKit) ese
          100% salía más alto que la tarjeta: el saldo, que va abajo, quedaba
          afuera y cortado. En Chrome no pasaba. Ahora el reparto lo hace la
          tarjeta, y si algo no entra la tarjeta crece en vez de cortarlo. */}
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-[15px] font-bold leading-tight tracking-tight">{cuenta.nombre}</p>
          {/* Oscurece en vez de aclarar: sobre blanco al 15% la letra no
              llegaba al contraste mínimo en ningún color. Y cede lugar: nunca
              ocupa más de un 45% del ancho, así el nombre no se corta. */}
          {conEtiqueta && (
            <span className="max-w-[45%] shrink-0 truncate rounded-full bg-black/20 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-white">
              {tipo}
            </span>
          )}
        </div>

        <Emblema tipo={cuenta.tipo} />

        {/* `leading-tight` y no `leading-none`: con el recorte de `truncate`,
            un alto de línea igual al de la letra le come las puntas. */}
        <p className="truncate font-titulo text-[21px] font-extrabold leading-tight tabular-nums tracking-tight">
          {saldo}
        </p>
    </div>
  );
}

/** El chip de la tarjeta, o lo que hace sus veces en efectivo y billetera. */
function Emblema({ tipo }: { tipo: CuentaDinero['tipo'] }) {
  if (tipo === 'efectivo') {
    return (
      <svg aria-hidden viewBox="0 0 40 26" className="h-[22px] w-[34px] text-white/80">
        <rect x="1" y="1" width="38" height="24" rx="4" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="20" cy="13" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 7v2M33 17v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (tipo === 'billetera') {
    return (
      <svg aria-hidden viewBox="0 0 26 34" className="h-[26px] w-[20px] text-white/80">
        <rect x="1.5" y="1.5" width="23" height="31" rx="4.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.8" />
        <path d="M10 28h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  // El chip de una tarjeta bancaria: dorado claro, con sus contactos.
  return (
    <svg aria-hidden viewBox="0 0 40 30" className="h-[26px] w-[34px]">
      <rect x="0.5" y="0.5" width="39" height="29" rx="6" fill="#E3C977" />
      <rect x="0.5" y="0.5" width="39" height="14" rx="6" fill="#F3E2A6" fillOpacity="0.7" />
      <path d="M14 0.5v29M26 0.5v29M0.5 10h13.5M26 10h13.5M0.5 20h13.5M26 20h13.5M14 15h12"
        stroke="#8C7433" strokeOpacity="0.55" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
