import type { MotivoNoBorrar } from './tipos';

/**
 * BORRAR EL USUARIO DE UNA PERSONA (129, 07/10/2026). SOLO DE SERVIDOR.
 *
 * Es el único lugar, junto con «Borrar mi cuenta» (`/api/cuenta/borrar`),
 * que le pide a Auth que borre a alguien. Lo usan las dos rutas de
 * `/api/admin/…/borrar`, que ANTES de llegar acá ya comprobaron con la
 * sesión que quien llama administra Orden.
 *
 * Tres pasos, en este orden y sin nada en el medio:
 *
 *   1. La base dice si se puede (`correo_borrable`). Se pregunta acá, pegado
 *      al borrado, y no se confía en lo que mostró la pantalla ni en lo que
 *      se calculó al borrar la cuenta: en el medio la persona pudo crearse
 *      un negocio o unirse a uno, y borrarla lo dejaría sin dueño.
 *   2. Auth la borra. Sin sesión, a propósito: con una sesión puesta, los
 *      candados de una cuenta vencida rechazan el rastro que dejó.
 *   3. Queda la constancia (`anotar_correo_borrado`), que solo anota si el
 *      usuario ya no existe.
 *
 * El correo sale siempre de lo que contestó la base, nunca del navegador.
 *
 * No importa nada de Supabase ni de Next: del cliente de servicio pide solo
 * las dos cosas que usa. Así pruebas/borrar-correo.test.js corre ESTE código
 * contra una base de verdad, con un Auth de mentira que a veces falla.
 */

/** Lo que hace falta del cliente de servicio (`clienteDeServicio()` lo cumple). */
export interface ServicioParaBorrar {
  rpc(funcion: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  auth: { admin: { deleteUser(id: string): PromiseLike<{ error: { status?: number; code?: string } | null }> } };
}

type Servicio = ServicioParaBorrar;

export type MotivoDeServidor = MotivoNoBorrar | 'confirmacion';

export type ResultadoCorreo =
  | { estado: 'borrado' | 'ya_no_estaba'; correo: string }
  | { estado: 'se_queda'; correo: string; motivo: MotivoDeServidor }
  | { estado: 'fallo'; correo: string };

const MOTIVOS: readonly string[] = ['vos', 'administracion', 'otro_negocio', 'socio', 'confirmacion'];

export async function borrarCorreo(servicio: Servicio, p: {
  /** Quien aprieta el botón. La base vuelve a exigir que administre Orden. */
  actor: string;
  usuario: string;
  /** El correo escrito a mano (lista de sueltos). Al borrar una cuenta no va. */
  confirmacion?: string | null;
  origen: 'cuenta' | 'suelto';
  /** El nombre del negocio que se acaba de borrar, para la constancia. */
  cuenta?: string | null;
  /** Solo para nombrarlo si la base no llega a contestar. Viene de la base, no del navegador. */
  correo?: string;
}): Promise<ResultadoCorreo> {
  const conocido = p.correo ?? '';
  try {
    // 1. ¿Se puede, AHORA?
    const { data, error } = await servicio.rpc('correo_borrable', {
      p_actor: p.actor,
      p_usuario: p.usuario,
      p_confirmacion: p.confirmacion ?? null,
    });
    if (error || !data || typeof data !== 'object') {
      console.error('[borrar-correo] correo_borrable', error?.code ?? 'sin respuesta');
      return { estado: 'fallo', correo: conocido };
    }
    const dicho = data as { borrable?: unknown; motivo?: unknown; correo?: unknown };
    const correo = typeof dicho.correo === 'string' && dicho.correo ? dicho.correo : conocido;

    if (dicho.motivo === 'no_existe') return { estado: 'ya_no_estaba', correo: conocido };
    if (typeof dicho.motivo === 'string' && MOTIVOS.includes(dicho.motivo)) {
      return { estado: 'se_queda', correo, motivo: dicho.motivo as MotivoDeServidor };
    }
    // Solo se sigue con un «sí» entero. Un motivo que este código no conoce,
    // o una respuesta rara, es un «no»: queda en la lista para reintentar.
    if (dicho.borrable !== true || dicho.motivo !== null) {
      console.error('[borrar-correo] correo_borrable contestó algo que no se entiende');
      return { estado: 'fallo', correo };
    }

    // 2. Auth lo borra. Sin segundo argumento: borrado de verdad, no «soft».
    const { error: errorAuth } = await servicio.auth.admin.deleteUser(p.usuario);
    if (errorAuth) {
      // Alguien lo borró en el medio: ya no está, que es lo que se quería.
      if (errorAuth.status === 404) return { estado: 'ya_no_estaba', correo };
      // Sin el correo: el registro del servidor no es lugar para datos de nadie.
      console.error('[borrar-correo] auth', errorAuth.status ?? '', errorAuth.code ?? '');
      return { estado: 'fallo', correo };
    }

    // 3. La constancia. Si falla, el usuario ya se borró y eso es lo que hay
    //    que contestar: solo se anota el tropiezo.
    try {
      const { error: errorNota } = await servicio.rpc('anotar_correo_borrado', {
        p_actor: p.actor,
        p_usuario: p.usuario,
        p_correo: correo,
        p_origen: p.origen,
        p_cuenta: p.cuenta ?? null,
      });
      if (errorNota) console.error('[borrar-correo] sin constancia', errorNota.code ?? '');
    } catch {
      console.error('[borrar-correo] sin constancia');
    }

    return { estado: 'borrado', correo };
  } catch (e) {
    console.error('[borrar-correo]', e instanceof Error ? e.name : 'error');
    return { estado: 'fallo', correo: conocido };
  }
}
