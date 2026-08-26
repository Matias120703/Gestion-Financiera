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
    <PaginaLegal titulo="Privacidad" actualizado="24 de agosto de 2026">
      <Apartado titulo="Lo corto">
        <p>
          Orden guarda la contabilidad de tu negocio para mostrártela. No vendemos
          tus datos, no se los pasamos a nadie para publicidad y no miramos tus números
          salvo que nos lo pidas para resolver un problema puntual.
        </p>
        <p>
          Podés llevarte todo en un Excel cuando quieras, y podés borrar tu cuenta y
          todos tus datos vos mismo, desde Ajustes, sin escribirle a nadie.
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
          <><strong className="text-tinta">OpenAI.</strong> Cuando usás la carga por voz, foto o texto, ese
            contenido se le manda para interpretarlo. No se usa para entrenar sus modelos.
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

      <Apartado titulo="Tus derechos">
        <Lista items={[
          <><strong className="text-tinta">Verlo todo.</strong> Está en la app, y podés bajar tu historial
            completo en Excel.</>,
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
          Orden es una herramienta de trabajo y no está pensada para menores de edad.
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
