/**
 * LOS COLORES DEL FORMULARIO DE BANCARD, CON LOS DE ORDEN.
 *
 * El formulario (pago ocasional, catastro, 3D Secure) es un iframe de
 * Bancard: adentro no llegan las clases ni las variables de Orden. La
 * librería deja mandar colores en `createForm(…, { styles })` (manual,
 * «Nuevas opciones de personalización»; la lista de nombres sale de
 * `/checkout/allowed_styles`). Acá se arman a partir del tema que está
 * viendo la persona: oscuro o claro, con el verde de Orden en el botón y en
 * la pestaña del medio de pago.
 *
 * Solo colores, en `#RRGGBB`. Las cuatro opciones de tipo lista (radio de
 * los campos, tamaño y tipo de letra, posición de la etiqueta) NO se mandan:
 * quedan las del Perfil de aplicación del portal (la librería solo sabe
 * validar colores y avisaría por consola).
 *
 * Puro: lo compilan las pruebas y lo usa el componente del navegador.
 */

export interface PaletaBancard {
  /** El fondo del formulario (el de la ventana de Orden). */
  superficie: string;
  /** El fondo de los campos. */
  campo: string;
  texto: string;
  textoSuave: string;
  borde: string;
  verde: string;
  verdeFuerte: string;
  /** El texto sobre el botón verde. */
  sobreVerde: string;
  rojo: string;
}

/** Los 18 colores que acepta el formulario, y nada más. */
export const CLAVES_DE_COLOR = [
  'input-background-color', 'input-text-color', 'input-border-color', 'input-placeholder-color',
  'input-error-color', 'input-cvv-color',
  'button-background-color', 'button-text-color', 'button-border-color',
  'form-background-color', 'form-border-color',
  'header-background-color', 'header-text-color', 'hr-border-color',
  'label-kyc-text-color', 'label-text-color',
  'tab-main-color', 'tab-background-color',
] as const;

/** La paleta clara de Orden (globals.css), por si una variable no se pudo leer. */
export const PALETA_CLARA: PaletaBancard = {
  superficie: '#ffffff',
  campo: '#f3f4f1',
  texto: '#0e0f0c',
  textoSuave: '#454742',
  borde: '#e5e7e1',
  verde: '#48dc82',
  verdeFuerte: '#15803d',
  sobreVerde: '#062a14',
  rojo: '#c0392b',
};

const HEX = /^#[0-9a-f]{6}$/;

/**
 * Una variable del tema («72 220 130», como las escribe globals.css para que
 * Tailwind les pueda poner transparencia) a «#48dc82». Si no se entiende,
 * el respaldo.
 */
export function colorDeVariable(valor: string | null | undefined, respaldo: string): string {
  const partes = String(valor ?? '').trim().split(/[\s,/]+/).filter(Boolean).slice(0, 3);
  if (partes.length !== 3) return respaldo;
  const numeros = partes.map((p) => Number(p));
  if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return respaldo;
  return '#' + numeros.map((n) => n.toString(16).padStart(2, '0')).join('');
}

function color(valor: string, respaldo: string): string {
  const v = String(valor ?? '').trim().toLowerCase();
  return HEX.test(v) ? v : respaldo;
}

export function estilosBancard(paleta: Partial<PaletaBancard>): Record<(typeof CLAVES_DE_COLOR)[number], string> {
  const p: PaletaBancard = {
    superficie: color(paleta.superficie ?? '', PALETA_CLARA.superficie),
    campo: color(paleta.campo ?? '', PALETA_CLARA.campo),
    texto: color(paleta.texto ?? '', PALETA_CLARA.texto),
    textoSuave: color(paleta.textoSuave ?? '', PALETA_CLARA.textoSuave),
    borde: color(paleta.borde ?? '', PALETA_CLARA.borde),
    verde: color(paleta.verde ?? '', PALETA_CLARA.verde),
    verdeFuerte: color(paleta.verdeFuerte ?? '', PALETA_CLARA.verdeFuerte),
    sobreVerde: color(paleta.sobreVerde ?? '', PALETA_CLARA.sobreVerde),
    rojo: color(paleta.rojo ?? '', PALETA_CLARA.rojo),
  };
  return {
    'input-background-color': p.campo,
    'input-text-color': p.texto,
    'input-border-color': p.borde,
    'input-placeholder-color': p.textoSuave,
    'input-error-color': p.rojo,
    'input-cvv-color': p.textoSuave,
    'button-background-color': p.verde,
    'button-text-color': p.sobreVerde,
    'button-border-color': p.verde,
    'form-background-color': p.superficie,
    'form-border-color': p.borde,
    'header-background-color': p.superficie,
    'header-text-color': p.texto,
    'hr-border-color': p.borde,
    'label-kyc-text-color': p.textoSuave,
    'label-text-color': p.textoSuave,
    'tab-main-color': p.verdeFuerte,
    'tab-background-color': p.campo,
  };
}
