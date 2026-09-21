'use client';

import { useRef } from 'react';
import { useLocale } from '@/i18n/cliente';

/**
 * UN CAMPO DE PLATA QUE SE LEE MIENTRAS SE ESCRIBE.
 *
 * Matías: «cuando estoy escribiendo, no tengo que estar contando los ceros
 * para saber cuánto es». Tenía razón y el problema es de los grandes: en
 * guaraníes, «1500000» y «150000» se distinguen contando, y uno se equivoca
 * en su propia contabilidad por un cero.
 *
 * Ahora se agrupa de a miles a medida que se teclea: 1.500.000.
 *
 * POR QUÉ NO ES UN `type="number"`
 *
 * Porque el navegador no deja formatear su contenido: lo que se escribe es
 * lo que se ve. Así que es un campo de texto con `inputMode="decimal"`, que
 * en el teléfono abre igual el teclado numérico, y el formato lo hacemos
 * nosotros.
 *
 * EL CURSOR, QUE ES LA PARTE QUE SIEMPRE SE ROMPE
 *
 * Al reformatear cambia el largo del texto, y si no se hace nada el cursor
 * salta al final. Corregir un dígito del medio se vuelve imposible: escribís
 * uno y terminás al final del número. Se resuelve contando cuántos DÍGITOS
 * había antes del cursor y volviéndolo a poner después de esos mismos
 * dígitos, ignorando los puntos. Esa cuenta no cambia aunque el agrupado sí.
 */
export function CampoMonto({
  valor, alCambiar, className = '', decimales = 0, ...resto
}: {
  /** El número. 0 se muestra vacío: un campo con un cero adentro invita a borrarlo antes de escribir. */
  valor: number;
  alCambiar: (n: number) => void;
  className?: string;
  /** Cuántos decimales admite la moneda. Guaraníes: ninguno. */
  decimales?: number;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  const locale = useLocale();
  const campo = useRef<HTMLInputElement>(null);

  const agrupador = new Intl.NumberFormat(locale);
  // El separador decimal de este idioma, para aceptarlo tal cual se teclea.
  const coma = new Intl.NumberFormat(locale).formatToParts(1.1)
    .find((p) => p.type === 'decimal')?.value ?? ',';

  const mostrar = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return '';
    return agrupador.format(n);
  };

  const soloDigitos = (s: string) => (s.match(/\d/g) ?? []).length;

  function alTipear(e: React.ChangeEvent<HTMLInputElement>) {
    const el = e.target;
    const crudo = el.value;
    const cursor = el.selectionStart ?? crudo.length;
    const digitosAntes = soloDigitos(crudo.slice(0, cursor));

    // Se queda con los dígitos y, si la moneda los admite, un solo decimal.
    const limpio = decimales > 0
      ? crudo.replace(new RegExp(`[^\\d${coma === '.' ? '\\.' : coma}]`, 'g'), '')
      : crudo.replace(/\D/g, '');

    const partes = limpio.split(coma);
    const entero = partes[0] ?? '';
    const decimal = decimales > 0 && partes.length > 1 ? partes[1].slice(0, decimales) : '';
    const numero = Number(`${entero || '0'}.${decimal || '0'}`);

    alCambiar(Number.isFinite(numero) ? numero : 0);

    // Mientras se está escribiendo el decimal («1.500,» o «1.500,5») no se
    // reformatea: hacerlo borraría la coma recién tecleada.
    const escribiendoDecimal = decimales > 0 && limpio.includes(coma);
    const nuevo = escribiendoDecimal
      ? agrupador.format(Number(entero || 0)) + coma + decimal
      : mostrar(numero);

    el.value = nuevo;

    // Devolver el cursor donde estaba, contado en dígitos y no en letras.
    let i = 0, vistos = 0;
    while (i < nuevo.length && vistos < digitosAntes) {
      if (/\d/.test(nuevo[i])) vistos++;
      i++;
    }
    requestAnimationFrame(() => {
      try { el.setSelectionRange(i, i); } catch { /* el campo ya no está */ }
    });
  }

  return (
    <input
      ref={campo}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      className={`tabular-nums ${className}`}
      defaultValue={mostrar(valor)}
      onChange={alTipear}
      {...resto}
    />
  );
}
