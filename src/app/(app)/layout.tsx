import { contextoObligatorio } from '@/lib/sesion';
import { BarraSuperior, NavInferior, NavLateral } from '@/components/Navegacion';
import { BotonCaptura } from '@/components/CapturaInteligente';
import { AvisoCuenta } from '@/components/AvisoCuenta';
import { AvisoMonedaVista } from '@/components/AvisoMonedaVista';
import { CandadoCuenta } from '@/components/CandadoCuenta';
import { ProveedorZona } from '@/lib/zona';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await contextoObligatorio();
  // Vencida: no se puede cargar nada. Es la misma señal que ya usa
  // `AvisoCuenta` para la franja roja; acá además tapa el contenido.
  const bloqueada = !(ctx.limites?.escritura ?? true);

  return (
    // La zona envuelve TODO el layout y no solo `children`: el botón de
    // captura vive acá afuera y también necesita saber qué día es hoy.
    <ProveedorZona zona={ctx.zonaHoraria}>
    <div className="flex min-h-screen">
      <NavLateral empresa={ctx.empresa} esAdmin={ctx.esAdmin} administraOrden={ctx.administraOrden} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior
          empresa={ctx.empresa}
          empresas={ctx.empresas}
          nombreUsuario={ctx.miembro.nombre}
          rol={ctx.miembro.rol}
        />

        <main className="flex-1 px-4 pb-28 pt-5 lg:px-7 lg:pb-10">
          <div className="mx-auto w-full max-w-6xl">
            {/* Va en el layout y no en cada pantalla: la cuenta vencida no es
                un asunto del panel ni de gastos, es del sistema entero. */}
            <AvisoCuenta
              puedeCargar={ctx.limites?.escritura ?? true}
              enPrueba={ctx.suscripcion?.en_prueba ?? false}
              diasRestantes={ctx.suscripcion?.dias_restantes ?? 99}
            />
            {/* Mientras haya una vista de moneda encendida hay que decirlo en
                todas las pantallas, no solo en Ajustes. Alguien que ve
                «US$ 685» sin saber que está mirando convertido lee un número
                que no es el de su caja. Va acá por lo mismo que el aviso de
                cuenta vencida: no es asunto de una pantalla, es del sistema. */}
            <AvisoMonedaVista vista={ctx.vista} />
            <CandadoCuenta bloqueada={bloqueada}>{children}</CandadoCuenta>
          </div>
        </main>

        {/* Con la cuenta vencida no se ofrece ni el micrófono: activar el
            plan es la única acción, y mostrar un botón que igual va a
            rechazar la carga es prometer algo que no se cumple. */}
        {!bloqueada && (
          <BotonCaptura
            empresaId={ctx.empresa.id}
            moneda={ctx.empresa.moneda}
            guardaComprobantes={ctx.limites?.adjuntos ?? false}
            tipoCuenta={ctx.empresa.tipo_cuenta}
          />
        )}
        <NavInferior tipo={ctx.empresa.tipo_cuenta} rubro={ctx.empresa.rubro} esAdmin={ctx.esAdmin} administraOrden={ctx.administraOrden} />
      </div>
    </div>
    </ProveedorZona>
  );
}
