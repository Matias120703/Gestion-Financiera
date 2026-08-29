import type { Metadata } from 'next';
import { Apartado, Lista, PaginaLegal } from '@/components/PaginaLegal';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Términos · Orden',
  description: 'Las condiciones de uso de Orden, en castellano y sin vueltas.',
};

/**
 * TÉRMINOS DEL SERVICIO
 *
 * Escritos para que se entiendan. Un texto legal que la persona no puede leer
 * no la protege ni te protege: si el día que hay un problema nadie sabía qué
 * decía, no sirvió de nada.
 *
 * Lo que dice acá tiene que coincidir con lo que hace el sistema:
 *   · el largo de la prueba según el tipo de cuenta → migración 016,
 *     `dias_de_prueba()`: 20 días un comercio, 14 una cuenta personal
 *   · caer a gratis al vencer → `plan_efectivo_calculado()`
 *   · los topes de cada plan → `limites_plan()`
 *
 * NO SOY ABOGADO. Antes de cobrarle a alguien, que un profesional lo revise
 * contra la ley de tu país — sobre todo la parte de responsabilidad y la de
 * defensa del consumidor.
 */
export default function Terminos() {
  return (
    <PaginaLegal titulo="Términos del servicio" actualizado="24 de agosto de 2026">
      <Apartado titulo="Qué es esto">
        <p>
          Orden es una herramienta para registrar las ventas y los gastos de tu negocio
          y ver cuánto ganás. Al crear una cuenta aceptás lo que dice esta página.
        </p>
        <p>
          Está pensada para personas que trabajan por su cuenta y para negocios chicos.
        </p>
      </Apartado>

      <Apartado titulo="Tu cuenta">
        <Lista items={[
          'Tenés que dar un correo real y una contraseña, y cuidar esa contraseña.',
          'Lo que se haga desde tu cuenta se considera hecho por vos.',
          <>Si sumás gente a tu negocio con el código de invitación, sos responsable de a
            quién se lo pasás. Podés sacarlos y cambiar el código cuando quieras.</>,
        ]} />
      </Apartado>

      <Apartado titulo="Prueba gratis y planes">
        <p>
          Toda cuenta nueva arranca con <strong className="text-tinta">plan Pro y sin pedir
          tarjeta</strong>: <strong className="text-tinta">20 días</strong> si es un negocio y{' '}
          <strong className="text-tinta">14 días</strong> si es una cuenta personal. Un comercio
          necesita ver un pedazo de mes suyo antes de decidir; quien anota sus gastos lo sabe
          antes. Cuando terminan, la cuenta pasa sola al plan gratis.
        </p>
        <p>
          <strong className="text-tinta">Al pasar a gratis no perdés ningún dato.</strong> Seguís
          viendo todo tu historial y podés seguir cargando a mano. Lo que se limita es la
          carga por voz y foto, los comprobantes guardados y la descarga en Excel.
        </p>
        <p>
          Los precios y qué incluye cada plan están en la aplicación. Si suben, te
          avisamos antes de que se aplique a tu cuenta.
        </p>
      </Apartado>

      <Apartado titulo="Pagos">
        <p>
          Si contratás un plan pago, se cobra por el periodo que elijas (mensual o anual)
          y por adelantado. El cobro lo procesa una pasarela de pagos: nosotros no vemos
          ni guardamos los datos de tu tarjeta ni de tu cuenta.
        </p>
        <p>
          Podés cancelar cuando quieras. Al cancelar seguís teniendo el plan hasta que
          termine el periodo que ya pagaste, y después la cuenta pasa a gratis.
        </p>
      </Apartado>

      <Apartado titulo="Tus datos son tuyos">
        <p>
          Lo que cargás es tuyo. Podés bajarlo en Excel cuando quieras y podés borrarlo
          todo desde Ajustes.
        </p>
        <p>
          Nosotros solo lo usamos para prestarte el servicio. Cómo lo tratamos está en la{' '}
          <a href="/privacidad" className="font-semibold text-verde underline">política de privacidad</a>.
        </p>
      </Apartado>

      <Apartado titulo="Qué no se puede hacer">
        <Lista items={[
          'Usar Orden para algo ilegal.',
          'Intentar entrar a los datos de otro negocio o romper las protecciones del sistema.',
          'Revender el servicio o hacerlo pasar por propio.',
          'Cargar contenido que no tengas derecho a subir.',
        ]} />
        <p>
          Si pasa algo de esto podemos suspender la cuenta. Salvo que haya un motivo
          grave, avisamos antes y damos tiempo de bajar los datos.
        </p>
      </Apartado>

      <Apartado titulo="Lo que Orden no es">
        <p>
          <strong className="text-tinta">Orden no es un contador ni un asesor financiero.</strong> Te
          muestra tus propios números ordenados. No damos consejos de inversión ni te
          decimos en qué poner tu plata, y lo que muestra la aplicación no reemplaza a un
          profesional cuando lo necesitás.
        </p>
        <p>
          <strong className="text-tinta">Tampoco es un sistema de facturación legal.</strong> Los
          comprobantes que exige tu país los seguís emitiendo por donde corresponda.
        </p>
        <p>
          Las decisiones que tomes mirando estos números son tuyas.
        </p>
      </Apartado>

      <Apartado titulo="Disponibilidad">
        <p>
          Hacemos lo posible para que el servicio esté siempre disponible, pero puede
          haber cortes por mantenimiento o por fallas de los proveedores. No prometemos
          un porcentaje de disponibilidad.
        </p>
        <p>
          La carga por voz y foto depende de un servicio externo: si ese servicio se cae,
          esa función puede dejar de andar temporalmente. Cargar a mano sigue funcionando
          siempre.
        </p>
      </Apartado>

      <Apartado titulo="Responsabilidad">
        <p>
          Orden se presta tal como está. Ponemos todo el cuidado en que los números sean
          correctos —hay controles en la base de datos justamente para eso— pero no
          respondemos por decisiones comerciales que tomes ni por lucro cesante.
        </p>
        <p>
          Si algo sale mal por nuestra culpa, nuestra responsabilidad no supera lo que
          nos hayas pagado en los últimos doce meses.
        </p>
        <p>
          Esto no limita los derechos que te dé la ley de defensa del consumidor de tu país.
        </p>
      </Apartado>

      <Apartado titulo="Cerrar la cuenta">
        <p>
          Podés borrar tu cuenta cuando quieras desde Ajustes. Es inmediato e
          irreversible: bajate el Excel antes si querés guardar tu historial.
        </p>
        <p>
          Si sos dueño de un negocio donde trabaja más gente, primero tenés que sacarlos
          del equipo. No borramos la contabilidad de personas que siguen trabajando.
        </p>
      </Apartado>

      <Apartado titulo="Cambios">
        <p>
          Si estos términos cambian, cambia la fecha de arriba y avisamos dentro de la
          aplicación cuando el cambio sea importante. Seguir usando Orden después de eso
          significa que los aceptás.
        </p>
      </Apartado>

      <Apartado titulo="Contacto">
        <p>
          Para cualquier consulta, escribinos desde la sección de ayuda en Ajustes.
        </p>
      </Apartado>
    </PaginaLegal>
  );
}
