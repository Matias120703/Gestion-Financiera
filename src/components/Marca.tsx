/**
 * EL LOGO DE ORDEN.
 *
 * Es el mismo dibujo que `public/iconos/icono.svg`, o sea el mismo que queda
 * en la pantalla de inicio del celular cuando alguien instala la app. Eso es
 * todo el motivo de que este archivo exista: antes la web dibujaba a mano un
 * cuadradito verde con una «o» minúscula, repetido en cinco lugares, que no
 * se parecía en nada al ícono de verdad. Quien instalaba Orden veía una marca
 * en el teléfono y otra en la web.
 *
 * Va como SVG en línea y no como <img>: así se pinta con los colores que
 * hagan falta según dónde esté, escala sin pesar nada y no suma un pedido más
 * a la red. Si algún día cambia el dibujo, cambia acá y en icono.svg — son
 * los dos únicos lugares.
 */
export function Marca({
  clase = 'h-9 w-9',
  sobreOscuro = false,
}: {
  clase?: string;
  /**
   * Sobre un fondo oscuro el cuadrado del ícono desaparece —es casi del mismo
   * color— así que ahí se muestra solo el anillo, en verde claro. No es otro
   * logo: es el mismo, sin la parte que sobra.
   */
  sobreOscuro?: boolean;
}) {
  return (
    <svg viewBox="0 0 512 512" className={clase} role="img" aria-label="Orden">
      <defs>
        {/* El mismo degradado del ícono y del logo que escucha (LogoVoz). */}
        <linearGradient id="marca-anillo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7cf0a8" />
          <stop offset="55%" stopColor="#48dc82" />
          <stop offset="100%" stopColor="#1f9d57" />
        </linearGradient>
      </defs>
      {!sobreOscuro && <rect width="512" height="512" rx="112" fill="#121212" />}
      <circle cx="256" cy="256" r="132" fill="none" stroke="url(#marca-anillo)" strokeWidth={46} />
      {/* La luz que en la pantalla de voz recorre el anillo, acá quieta. */}
      <path
        d="M132 211A132 132 0 0 1 301 132" fill="none" stroke="#eafff1"
        strokeWidth={15} strokeLinecap="round" opacity={0.92}
      />
      <path d="M256 190v132" strokeWidth={26} strokeLinecap="round" stroke="#f3f5f2" />
    </svg>
  );
}

/** El logo con el nombre al lado, que es como se muestra en las cabeceras. */
export function MarcaConNombre({
  sobreOscuro = false,
  clase = 'h-9 w-9',
}: {
  sobreOscuro?: boolean;
  clase?: string;
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Marca clase={clase} sobreOscuro={sobreOscuro} />
      <span className="text-[17px] font-bold tracking-tight">Orden</span>
    </span>
  );
}
