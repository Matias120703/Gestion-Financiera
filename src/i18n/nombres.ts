/**
 * Datos guardados en español que se muestran en el idioma de cada uno.
 *
 * Ver el comentario de `categorias` en textos/es.ts: se guarda siempre
 * igual, se traduce al mostrar. Este archivo no importa nada del servidor,
 * así que sirve tanto en páginas de servidor como en componentes del
 * navegador.
 */
import type { Textos } from './diccionarios';

/** El nombre de una categoría, en el idioma de quien la mira. */
export function categoriaVisible(t: Textos, nombre: string | null | undefined): string {
  if (!nombre) return '';
  return t.categorias[nombre] ?? nombre;
}

/** La forma de pago guardada (`efectivo`, `tarjeta`…), como se lee. */
export function metodoVisible(t: Textos, metodo: string | null | undefined): string {
  if (!metodo) return '';
  return t.metodos[metodo] ?? metodo;
}
