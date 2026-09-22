'use client';

import { useEffect, useRef } from 'react';
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
 *
 * CUANDO EL MONTO LO CAMBIA OTRO
 *
 * El campo se escribe solo mientras la persona teclea, así que React no lo
 * vuelve a dibujar y el cursor queda quieto. Pero a veces el monto lo pone un
 * botón —«retirar todo», «pagar la cuota entera»— y entonces sí hay que
 * escribirlo. Se distingue guardando el último número que ESTE campo informó:
 * si el que llega de afuera no es ese, vino de otro lado y se dibuja.
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
  const informado = useRef(valor);

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
    let crudo = el.value;
    const cursor = el.selectionStart ?? crudo.length;

    // En el iPhone, el teclado decimal trae el separador de la Región del
    // teléfono y no el del idioma de la app: con el teléfono en inglés solo
    // hay punto, y el punto acá es de miles. Si se acaba de apretar un punto y
    // todavía no hay decimal, ese punto (solo ese, no los de miles que ya
    // estaban) es la coma.
    if (decimales > 0 && coma !== '.' && !crudo.includes(coma) && cursor > 0
        && crudo[cursor - 1] === '.' && (e.nativeEvent as InputEvent).data === '.') {
      crudo = crudo.slice(0, cursor - 1) + coma + crudo.slice(cursor);
    }
    const digitosAntes = soloDigitos(crudo.slice(0, cursor));

    // Se queda con los dígitos y, si la moneda los admite, un solo decimal.
    const limpio = decimales > 0
      ? crudo.replace(new RegExp(`[^\\d${coma === '.' ? '\\.' : coma}]`, 'g'), '')
      : crudo.replace(/\D/g, '');

    const partes = limpio.split(coma);
    const entero = partes[0] ?? '';
    const decimal = decimales > 0 && partes.length > 1 ? partes[1].slice(0, decimales) : '';
    const numero = Number(`${entero || '0'}.${decimal || '0'}`);

    informado.current = Number.isFinite(numero) ? numero : 0;
    alCambiar(informado.current);

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

  // Un monto que cambió sin pasar por el teclado: lo puso un botón.
  useEffect(() => {
    if (valor === informado.current) return;
    informado.current = valor;
    const el = campo.current;
    if (el) el.value = mostrar(valor);
    // `mostrar` se rearma en cada render y meterlo acá haría que el efecto
    // corriera siempre; lo que importa es el número, que es lo que se compara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor]);

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
