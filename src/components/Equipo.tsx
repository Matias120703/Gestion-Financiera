'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clienteNavegador } from '@/lib/supabase/cliente';
import { useTextos, useLocale } from '@/i18n/cliente';
import { fechaLegible } from '@/lib/formato';
import { mensajeDeError } from '@/lib/errores';
import { NOMBRE_ROL } from '@/lib/permisos';
import type { Miembro } from '@/lib/tipos';

/**
 * El equipo del negocio, con la baja.
 *
 * Reglas que aplica la base y que acá solo se reflejan para no mostrar
 * botones que van a fallar:
 *   · al propietario no se lo saca;
 *   · nadie se saca a sí mismo;
 *   · un administrador no puede sacar a otro administrador.
 *
 * Lo que se le dice a la persona antes de confirmar importa tanto como la
 * regla: que sacar a alguien NO borra lo que cargó. Sin esa frase, un dueño
 * puede no dar de baja a un empleado que se fue por miedo a perder las
 * ventas del mes.
 */
export function ListaEquipo({
  miembros, empresaId, miUserId, miRol,
}: {
  miembros: Miembro[];
  empresaId: string;
  miUserId: string;
  miRol: string;
}) {
  const t = useTextos();
  const locale = useLocale();
  const router = useRouter();
  const [quitando, setQuitando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const soyAdmin = miRol === 'propietario' || miRol === 'admin';

  function sePuedeQuitar(m: Miembro): boolean {
    if (!soyAdmin) return false;
    if (m.user_id === miUserId) return false;
    if (m.rol === 'propietario') return false;
    // Un admin solo saca vendedores; el propietario saca a cualquiera.
    if (miRol === 'admin' && m.rol === 'admin') return false;
    return true;
  }

  async function quitar(m: Miembro) {
    if (!window.confirm(t.equipo.quitarConfirmar(m.nombre))) return;

    setQuitando(m.user_id);
    setError('');
    setMensaje('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('quitar_miembro', {
        p_empresa: empresaId,
        p_user: m.user_id,
      });
      if (e) throw e;
      setMensaje(t.equipo.quitado(m.nombre));
      router.refresh();
      setTimeout(() => setMensaje(''), 4000);
    } catch (e: any) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setQuitando(null);
    }
  }

  return (
    <div>
      <ul className="divide-y divide-borde">
        {miembros.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tinta text-[13px] font-bold text-white">
              {m.nombre.charAt(0).toUpperCase()}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">
                {m.nombre}
                {m.user_id === miUserId && (
                  <span className="ml-1.5 text-[12px] font-normal text-tinta/40">{t.equipo.vos}</span>
                )}
              </p>
              <p className="text-[12px] text-tinta/45">
                {t.equipo.desde} {fechaLegible(m.created_at.slice(0, 10), true, locale)}
              </p>
            </div>

            <span className={`pastilla shrink-0 ${
              m.rol === 'propietario' ? 'bg-verde-claro text-verde-fuerte' : 'bg-arena text-tinta/55'
            }`}>
              {NOMBRE_ROL[m.rol] ?? m.rol}
            </span>

            {sePuedeQuitar(m) && (
              <button
                type="button"
                onClick={() => quitar(m)}
                disabled={quitando === m.user_id}
                title={t.equipo.quitar}
                aria-label={`${t.equipo.quitar}: ${m.nombre}`}
                className="icono-toque shrink-0 text-tinta/35 hover:bg-rojo-claro hover:text-rojo disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
                     strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
                  <path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
                  <path d="M10.5 11v5.5M13.5 11v5.5" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>

      {(mensaje || error) && (
        <div className="px-4 pb-3 pt-1">
          {mensaje && <p className="text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
          {error && (
            <p className="rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Rotar el código de invitación.
 *
 * Va al lado de la baja a propósito: sacar a alguien que se sabe el código
 * de memoria y puede volver a entrar es media baja. Solo el propietario,
 * porque cambiarlo deja afuera a todos los que lo tuvieran anotado.
 */
export function RotarCodigo({ empresaId, esPropietario }: { empresaId: string; esPropietario: boolean }) {
  const t = useTextos();
  const router = useRouter();
  const [rotando, setRotando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  if (!esPropietario) {
    return <p className="mt-3 text-[12px] text-tinta/40">{t.equipo.soloPropietario}</p>;
  }

  async function rotar() {
    if (!window.confirm(t.equipo.rotarConfirmar)) return;

    setRotando(true);
    setError('');
    setMensaje('');
    try {
      const supabase = clienteNavegador();
      const { error: e } = await supabase.rpc('rotar_codigo_acceso', { p_empresa: empresaId });
      if (e) throw e;
      setMensaje(t.equipo.rotarListo);
      router.refresh();
      setTimeout(() => setMensaje(''), 4000);
    } catch (e: any) {
      setError(mensajeDeError(e, t.errores.generico));
    } finally {
      setRotando(false);
    }
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={rotar} disabled={rotando} className="boton-texto text-tinta/50">
        {rotando ? t.comun.guardando : t.equipo.rotar}
      </button>
      {mensaje && <p className="mt-1.5 text-[13px] font-semibold text-verde-fuerte">{mensaje}</p>}
      {error && (
        <p className="mt-1.5 rounded-xl bg-rojo-claro px-3 py-2 text-[13px] font-medium text-rojo">{error}</p>
      )}
    </div>
  );
}
