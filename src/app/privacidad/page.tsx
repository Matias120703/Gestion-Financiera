import type { Metadata } from 'next';
import { Apartado, Lista, PaginaLegal } from '@/components/PaginaLegal';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Privacidad · Orden',
  description: 'Qué datos guarda Orden, dónde, por cuánto tiempo y cómo se borran.',
};

/**
 * POLÍTICA DE PRIVACIDAD
 *
 * Escrita sobre lo que Orden REALMENTE hace, no copiada de una plantilla.
 * Cada afirmación de acá se corresponde con algo del código: los proveedores
 * son los que están en `.env.example`, la retención es la que aplican las
 * migraciones, y el borrado es el de `borrar_datos_de_usuario()`.
 *
 * Si mañana se agrega un proveedor —otra pasarela, otro servicio de correo—
 * hay que tocar este archivo en el mismo cambio. Una política que no dice la
 * verdad es peor que no tenerla.
 *
 * NO SOY ABOGADO. Esto cubre lo que hace el sistema con honestidad, pero
 * antes de cobrarle a alguien conviene que un profesional lo revise contra
 * la ley que te aplique.
 */
export default function Privacidad() {
  return (
    <PaginaLegal titulo="Privacidad" actualizado="22 de septiembre de 2026">
      <Apartado titulo="Lo corto">
        <p>
          Orden guarda la contabilidad de tu negocio para mostrártela. No vendemos
          tus datos, no se los pasamos a nadie para publicidad y no miramos tus números
          salvo que nos lo pidas para resolver un problema puntual.
        </p>
        <p>
          Podés llevarte tus ventas, gastos y cobros en un Excel cuando quieras, y podés
          borrar tu cuenta y todos tus datos vos mismo, desde Ajustes, sin escribirle a nadie.
        </p>
      </Apartado>

      <Apartado titulo="Qué guardamos">
        <Lista items={[
          <><strong className="text-tinta">Tu correo.</strong> Para que puedas entrar y para mandarte
            avisos si los activaste.</>,
          <><strong className="text-tinta">Lo que cargás del negocio:</strong> ventas, gastos, productos,
            costos, precios y stock. Es el servicio.</>,
          <><strong className="text-tinta">Las fotos de comprobantes</strong> que subas. Se guardan en un
            depósito privado: solo se ven con un enlace temporal que se genera cuando vos las abrís.</>,
          <><strong className="text-tinta">Lo que dictás por voz,</strong> convertido a texto. El audio no
            se guarda: se transcribe y se descarta.</>,
          <><strong className="text-tinta">Tus preferencias:</strong> idioma, zona horaria y qué avisos querés.</>,
          <><strong className="text-tinta">Datos técnicos mínimos</strong> de los envíos y los errores, para
            saber si algo se rompió.</>,
        ]} />
        <p>
          No pedimos ni guardamos tu documento, tu dirección ni datos de tarjetas.
          Si en algún momento cobramos suscripciones, los datos del pago los maneja
          la pasarela: nosotros no los vemos ni los almacenamos.
        </p>
      </Apartado>

      <Apartado titulo="Dónde está">
        <p>
          Los datos viven en Supabase (base de datos y archivos), sobre infraestructura
          de Amazon Web Services en Estados Unidos. La aplicación corre en Vercel.
        </p>
        <p>
          Cada negocio está separado dentro de la base de datos, no en la pantalla:
          aunque alguien manipule su navegador, no puede leer los datos de otro. Las
          personas que trabajan en tu negocio como vendedores no pueden recuperar
          costos, márgenes ni ganancias — esa información no sale del servidor para ellas.
        </p>
      </Apartado>

      <Apartado titulo="Con quién compartimos algo">
        <p>
          Solo con lo que hace falta para que la aplicación funcione, y solo lo necesario:
        </p>
        <Lista items={[
          <><strong className="text-tinta">OpenAI.</strong> Cuando usás la carga por voz, foto o texto
            —también al dictar un turno, con el nombre y el teléfono del cliente—, ese contenido se le
            manda para interpretarlo. No se usa para entrenar sus modelos.
            Si no usás esa función, no se le manda nada.</>,
          <><strong className="text-tinta">Resend.</strong> Tu correo, para poder enviarte los mensajes de la
            cuenta y el resumen semanal.</>,
          <><strong className="text-tinta">Supabase y Vercel.</strong> Alojan la base de datos y la aplicación.</>,
        ]} />
        <p>
          Nada más. No hay rastreadores de publicidad, ni píxeles de redes sociales,
          ni venta de datos a terceros.
        </p>
      </Apartado>

      <Apartado titulo="Por cuánto tiempo">
        <p>
          Mientras tengas la cuenta. Tu historial no se borra solo: justamente sirve
          para poder mirar hacia atrás.
        </p>
        <p>
          Cuando borrás tu cuenta, se borra de verdad. No queda una copia «marcada como
          borrada»: las filas desaparecen de la base y las fotos se eliminan del depósito.
          Lo único que puede sobrevivir un tiempo son las copias de seguridad
          automáticas, que se rotan solas.
        </p>
      </Apartado>

      <Apartado titulo="Qué pasa si trabajás en el negocio de otro">
        <p>
          Si te sumaste al negocio de otra persona con un código de invitación, lo que
          cargues ahí es del negocio, no tuyo. Si borrás tu cuenta, salís del equipo y
          esas ventas y gastos se quedan: son la contabilidad de ese negocio.
        </p>
        <p>
          Y al revés: si sos dueño de un negocio donde hay más gente trabajando, no vas
          a poder borrar tu cuenta sin sacarlos antes. No queremos dejar sin sistema —ni
          sin sus números— a personas que están trabajando.
        </p>
      </Apartado>

      {/* Rutinas y medidas (098, 099). Cada frase sale de las migraciones:
          quién puede llamar cada función, qué devuelve `rutina_por_token`,
          qué hace `eliminar_cliente` al archivar (099: borra medidas, ficha
          de consentimiento y «Salud y lesiones»; conserva rutinas y cargas)
          y que `guardar_cliente` (099) no junta a dos personas distintas con
          datos de entrenamiento por un teléfono repetido. */}
      <Apartado titulo="Si sos personal trainer: rutinas y medidas">
        <p>
          Si tu negocio es de entrenamiento, Orden guarda además lo que cargás de tus
          clientes para entrenarlos. Son datos de ellos que vos guardás acá: vos decidís
          qué anotar.
        </p>
        <Lista items={[
          <><strong className="text-tinta">Las rutinas:</strong> días, ejercicios, series, repeticiones,
            cargas, descansos y tus notas, con el historial de cómo fueron subiendo las cargas. También
            tu lista de ejercicios, con su «cómo se hace» y el link al video si lo pusiste.</>,
          <><strong className="text-tinta">Las medidas del cuerpo:</strong> peso, altura, contornos y
            porcentaje de grasa, con la fecha de cada control. Para anotarlas hay que confirmar antes que
            el cliente —o su madre, padre o tutor si es menor— está de acuerdo, y Orden guarda cuándo se
            confirmó y quién lo hizo.</>,
          <><strong className="text-tinta">«Salud y lesiones»:</strong> lo que escribas en la ficha del
            cliente, para que quien lo entrena sepa de la rodilla operada antes de empezar.</>,
        ]} />
        <p>
          <strong className="text-tinta">Quién lo ve.</strong> Las medidas las anotan y las ven solo
          el dueño y los administradores del negocio: alguien del equipo que no es administrador
          no puede sacarlas ni pidiéndolas a mano, porque la regla está en la base de datos y
          no en la pantalla. «Salud y lesiones» la ve todo el equipo del negocio, porque cualquiera
          que entrene a esa persona tiene que saberlo. Fuera de tu negocio, nadie.
        </p>
        <p>
          <strong className="text-tinta">El link del cliente.</strong> Cada cliente tiene un link para
          ver su rutina sin crear una cuenta. Muestra el nombre del negocio, su nombre de pila y la
          rutina vigente, y nada más: nunca su apellido, su teléfono, sus medidas, «Salud y lesiones»,
          sus pagos ni sus rutinas anteriores. Los buscadores no lo guardan, y al abrir un video no se
          le pasa la dirección del link a YouTube ni a Instagram. Lo que el cliente marca como hecho
          queda solo en su celular: el link no escribe nada en Orden. Podés cambiarlo (el viejo deja
          de andar) o apagarlo cuando quieras, y con la cuenta vencida podés apagar todos los links de
          una vez. Si la cuenta lleva más de 30 días vencida, los links dejan de mostrar la rutina.
        </p>
        <p>
          <strong className="text-tinta">La inteligencia artificial.</strong> Las medidas, «Salud y
          lesiones» y las rutinas que tenés guardadas no se le mandan a OpenAI. Leer una rutina que
          pegás o escribís en un renglón lo hace Orden solo, sin inteligencia artificial. Lo único que
          llega a OpenAI es lo que vos dictás o escribís en la carga por voz, foto o texto, como
          cualquier otro dictado: si ahí dictás una lesión, esa frase pasa por OpenAI para
          convertirse en texto.
        </p>
        <p>
          <strong className="text-tinta">Una ficha por persona.</strong> Si cargás a alguien nuevo con
          el teléfono de un cliente que ya tiene rutinas o medidas y otro nombre, Orden no los junta en
          una sola ficha: te pregunta si es la misma persona y, si no lo es, la ficha nueva queda sin
          ese teléfono. Así nadie hereda las lesiones, las medidas ni el consentimiento de otro.
        </p>
        <p>
          <strong className="text-tinta">El Excel.</strong> Las rutinas, las medidas y «Salud y
          lesiones» no van en el Excel que bajás desde Ajustes: se ven en la carpeta de cada cliente,
          dentro de la app.
        </p>
        <p>
          <strong className="text-tinta">Cómo se borra.</strong>
        </p>
        <Lista items={[
          <>Un control de medidas lo borran el dueño o un administrador desde el progreso del cliente,
            y se borra de verdad.</>,
          <>«Salud y lesiones» se corrige o se vacía desde la ficha del cliente.</>,
          <>Las rutinas en preparación y las plantillas se borran. La vigente y las anteriores quedan
            como la historia del cliente.</>,
          <>Si eliminás a un cliente que tiene rutinas o medidas, Orden lo archiva en vez de borrarlo,
            y en ese mismo paso borra sus medidas, su consentimiento y «Salud y lesiones»; su link deja
            de andar en ese momento. Sus rutinas y el historial de sus cargas quedan como tu historia de
            trabajo, y no se ven en ningún link. Si esa persona vuelve, vuelve a dar su consentimiento
            antes de que le anotes medidas.</>,
          <>Vaciar el negocio desde Ajustes no toca nada de esto. Todo —rutinas, medidas, links e
            historial— se borra de verdad cuando borrás tu cuenta.</>,
        ]} />
      </Apartado>

      <Apartado titulo="Tus derechos">
        <Lista items={[
          <><strong className="text-tinta">Verlo todo.</strong> Está en la app, y podés bajar tus ventas,
            gastos y cobros en Excel. Las rutinas, las medidas y «Salud y lesiones» de tus clientes no
            van en ese Excel: se ven en la carpeta de cada uno.</>,
          <><strong className="text-tinta">Corregirlo.</strong> Podés editar o anular cualquier movimiento.</>,
          <><strong className="text-tinta">Empezar de cero.</strong> Desde Ajustes podés vaciar el negocio
            sin borrar tu cuenta.</>,
          <><strong className="text-tinta">Irte.</strong> Desde Ajustes podés borrar tu cuenta y todo lo
            que tengas cargado, vos mismo y en el momento.</>,
        ]} />
      </Apartado>

      <Apartado titulo="Seguridad, sin exagerar">
        <p>
          Las reglas de acceso están aplicadas en la base de datos y no en los botones
          de la pantalla, que es lo que hace que sigan valiendo aunque alguien intente
          saltárselas. Las contraseñas las maneja Supabase y nunca las vemos.
        </p>
        <p>
          Dicho eso: ningún sistema es infalible. Si alguna vez pasara algo que afecte
          tus datos, te lo vamos a decir.
        </p>
      </Apartado>

      <Apartado titulo="Menores">
        <p>
          Orden es una herramienta de trabajo y no está pensada para que la usen menores de edad.
        </p>
        <p>
          Si sos personal trainer y entrenás a menores, sus medidas las cargás vos, con el acuerdo de
          su madre, padre o tutor, que Orden te pide confirmar antes de anotar la primera. Esas medidas
          se borran como las de cualquier cliente: desde su progreso, o al eliminarlo.
        </p>
      </Apartado>

      <Apartado titulo="Cambios y contacto">
        <p>
          Si esto cambia, cambia la fecha de arriba. Si el cambio es importante, te
          avisamos dentro de la aplicación.
        </p>
        <p>
          Para cualquier duda sobre tus datos, escribinos desde la sección de ayuda en
          Ajustes.
        </p>
      </Apartado>
    </PaginaLegal>
  );
}
