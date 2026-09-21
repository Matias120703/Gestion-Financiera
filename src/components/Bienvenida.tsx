import type { Textos } from '@/i18n/textos/es';

/**
 * QUIÉN ENTRÓ, Y A QUÉ HORA.
 *
 * Matías pidió una bienvenida en el panel. Lo que se abre primero todos los
 * días no puede empezar con una cifra a secas: antes del número hay alguien.
 *
 * SOLO EL PRIMER NOMBRE
 *
 * «Buen día, Matías» y no «Buen día, Matías Aranda Romero». El nombre
 * completo es el de un formulario; el primero es el que usa la gente. Y si
 * alguien se cargó con un nombre largo, el saludo no se parte en dos líneas.
 *
 * LA HORA ES LA DE LA EMPRESA, NO LA DEL SERVIDOR
 *
 * El servidor está en São Paulo y la persona en Asunción: una hora de
 * diferencia alcanza para desearle buenas tardes a las once y media de la
 * mañana. Se calcula con la zona horaria de la cuenta, que es la misma que
 * usa la base para decidir qué día es hoy.
 *
 * SE DIBUJA EN EL SERVIDOR, A PROPÓSITO
 *
 * Podría mirar el reloj del navegador, pero entonces el saludo aparecería un
 * instante después que el resto, o cambiaría solo delante de los ojos. El
 * panel ya se arma en cada visita, así que el saludo viene con él y listo.
 * Quien deje la pestaña abierta toda la tarde va a ver «buenas tardes» hasta
 * que vuelva a entrar, y eso no le rompe nada a nadie.
 */
export function Bienvenida({ nombre, zona, t }: {
  nombre: string;
  zona: string;
  t: Textos;
}) {
  const primero = nombre.trim().split(/\s+/)[0] ?? '';
  if (primero === '') return null;

  const hora = horaEn(zona);
  const saludo = hora < 6 ? t.panel.saludoNoche
    : hora < 12 ? t.panel.saludoManana
      : hora < 19 ? t.panel.saludoTarde
        : t.panel.saludoNoche;

  return (
    <p className="text-[19px] font-titulo font-extrabold tracking-tight">
      {saludo}, <span className="text-verde-fuerte">{primero}</span>
    </p>
  );
}

/** La hora del reloj de esa zona, de 0 a 23. */
function horaEn(zona: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-US', {
      timeZone: zona, hour: 'numeric', hour12: false,
    }).format(new Date());
    // `hour12: false` puede devolver «24» a medianoche según el motor.
    return Number(h) % 24;
  } catch {
    // Una zona horaria inválida no puede dejar sin panel a nadie: ante la
    // duda, la hora de acá.
    return new Date().getHours();
  }
}
