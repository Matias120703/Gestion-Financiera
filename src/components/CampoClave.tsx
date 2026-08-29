'use client';

import { useId, useState } from 'react';
import { useTextos } from '@/i18n/cliente';

/**
 * UN CAMPO DE CONTRASEÑA CON EL OJITO PARA LEERLA
 *
 * Existe porque escribir a ciegas en un celular es la forma más común de
 * quedarse afuera de tu propia cuenta: te equivocás en una letra, no lo ves,
 * y el sistema te dice «contraseña incorrecta» sin decirte por qué. Después
 * de dos intentos la persona cree que perdió la cuenta.
 *
 * Tres detalles que no son adorno:
 *
 *   · El ojito arranca APAGADO. Mostrar la contraseña por defecto sería peor
 *     que no tener el botón: mucha gente se registra con alguien al lado.
 *   · El botón no es parte del formulario (`type="button"`). Sin eso, en
 *     algunos navegadores tocar el ojito manda el formulario.
 *   · Al mostrarla se avisa a los lectores de pantalla con `aria-pressed`,
 *     porque para quien no ve el campo el cambio no existiría.
 */
export default function CampoClave({
  etiqueta, valor, alCambiar, autoComplete = 'current-password',
  id, requerido = true, marcador,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (v: string) => void;
  autoComplete?: 'current-password' | 'new-password';
  id?: string;
  requerido?: boolean;
  marcador?: string;
}) {
  const t = useTextos();
  const generado = useId();
  const campoId = id ?? generado;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="etiqueta" htmlFor={campoId}>{etiqueta}</label>
      <div className="relative">
        <input
          id={campoId}
          type={visible ? 'text' : 'password'}
          className="campo pr-11"
          required={requerido}
          minLength={6}
          autoComplete={autoComplete}
          placeholder={marcador ?? t.acceso.minimoSeis}
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t.acceso.ocultarClave : t.acceso.mostrarClave}
          title={visible ? t.acceso.ocultarClave : t.acceso.mostrarClave}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-tinta/40 transition hover:text-tinta/70"
        >
          <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none"
               stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 12s3.6-6.5 9.5-6.5S21.5 12 21.5 12s-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z" />
            <circle cx="12" cy="12" r="2.9" />
            {!visible && <path d="m4 20 16-16" />}
          </svg>
        </button>
      </div>
    </div>
  );
}
