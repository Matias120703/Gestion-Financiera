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
      {!sobreOscuro && <rect width="512" height="512" rx="112" fill="#0d1b16" />}
      <circle
        cx="256" cy="256" r="132" fill="none"
        stroke={sobreOscuro ? '#3ddc9a' : '#17795a'} strokeWidth={46}
      />
      <path
        d="M256 190v132" strokeWidth={26} strokeLinecap="round"
        stroke={sobreOscuro ? '#ffffff' : '#e6f4ee'}
      />
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
