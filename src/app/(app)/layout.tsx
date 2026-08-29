import { contextoObligatorio } from '@/lib/sesion';
import { BarraSuperior, NavInferior, NavLateral } from '@/components/Navegacion';
import { BotonCaptura } from '@/components/CapturaInteligente';
import { AvisoCuenta } from '@/components/AvisoCuenta';

export const dynamic = 'force-dynamic';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await contextoObligatorio();

  return (
    <div className="flex min-h-screen">
      <NavLateral empresa={ctx.empresa} />

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
            {children}
          </div>
        </main>

        {/* `guardaComprobantes` sale del plan que calculó la base, no de una
            comprobación local. Si estuviera mal, la función `adjuntar()`
            rechazaría igual: esto solo evita intentar una subida que va a
            fallar y hacerle perder tiempo a la persona. */}
        <BotonCaptura
          empresaId={ctx.empresa.id}
          moneda={ctx.empresa.moneda}
          guardaComprobantes={ctx.limites?.adjuntos ?? false}
          tipoCuenta={ctx.empresa.tipo_cuenta}
        />
        <NavInferior tipo={ctx.empresa.tipo_cuenta} rubro={ctx.empresa.rubro} />
      </div>
    </div>
  );
}
