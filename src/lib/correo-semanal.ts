import { dinero, fechaLegible } from './formato';
import { diccionario } from '@/i18n/diccionarios';
import { FICHA, esIdioma, IDIOMA_POR_DEFECTO } from '@/i18n/idiomas';

/**
 * El HTML del resumen semanal.
 *
 * Escrito a mano, con estilos en línea y tablas. No es 2005: es que los
 * clientes de correo siguen sin soportar flexbox, grid ni hojas de estilo
 * externas, y Gmail borra los <style> del <head> en varias vistas. Un
 * componente de React bonito llegaría roto a la mitad de las bandejas.
 *
 * Se manda también en texto plano. Un correo solo-HTML tiene mucha más
 * chance de caer en spam.
 */

export interface DatosSemana {
  negocio: string;
  nombrePersona: string;
  moneda: string;
  idioma: string;
  desde: string;
  hasta: string;
  ventas: number;
  gastos: number;
  /** null cuando quien lo recibe no puede ver rentabilidad. */
  ganancia: number | null;
  cantidadVentas: number;
  mejorDia: { fecha: string; monto: number } | null;
  masVendido: { nombre: string; unidades: number } | null;
  sitio: string;
}

const TINTA = '#0d1b16';
const VERDE = '#17795a';
const SUAVE = '#6b7a73';
const BORDE = '#e3e7e4';

export function asuntoSemanal(datos: DatosSemana): string {
  const t = diccionario(datos.idioma);
  return t.email.asuntoSemanal(datos.negocio);
}

export function textoSemanal(datos: DatosSemana): string {
  const t = diccionario(datos.idioma);
  const locale = FICHA[esIdioma(datos.idioma) ? datos.idioma : IDIOMA_POR_DEFECTO].locale;
  const plata = (n: number) => dinero(n, datos.moneda, true, locale);

  const lineas = [
    t.email.hola(datos.nombrePersona),
    '',
    t.email.resumenIntro,
    '',
    `${t.email.vendido}: ${plata(datos.ventas)} (${datos.cantidadVentas} ${t.email.ventas})`,
    `${t.email.gastado}: ${plata(datos.gastos)}`,
  ];

  if (datos.ganancia !== null) lineas.push(`${t.email.ganancia}: ${plata(datos.ganancia)}`);
  if (datos.mejorDia) {
    lineas.push('', `${t.email.mejorDia}: ${fechaLegible(datos.mejorDia.fecha, false, locale)} · ${plata(datos.mejorDia.monto)}`);
  }
  if (datos.masVendido) {
    lineas.push(`${t.email.masVendido}: ${datos.masVendido.nombre}`);
  }

  lineas.push('', `${t.email.abrir}: ${datos.sitio}/panel`, '', t.email.bajarse);
  return lineas.join('\n');
}

export function htmlSemanal(datos: DatosSemana): string {
  const t = diccionario(datos.idioma);
  const locale = FICHA[esIdioma(datos.idioma) ? datos.idioma : IDIOMA_POR_DEFECTO].locale;
  const plata = (n: number) => dinero(n, datos.moneda, true, locale);

  const filas: string[] = [
    fila(t.email.vendido, plata(datos.ventas), `${datos.cantidadVentas} ${t.email.ventas}`, VERDE),
    fila(t.email.gastado, plata(datos.gastos), '', TINTA),
  ];

  if (datos.ganancia !== null) {
    filas.push(fila(t.email.ganancia, plata(datos.ganancia), '', datos.ganancia >= 0 ? VERDE : '#c0392b', true));
  }

  const extras: string[] = [];
  if (datos.mejorDia) {
    extras.push(dato(t.email.mejorDia,
      `${fechaLegible(datos.mejorDia.fecha, false, locale)} · ${plata(datos.mejorDia.monto)}`));
  }
  if (datos.masVendido) {
    extras.push(dato(t.email.masVendido, escapar(datos.masVendido.nombre)));
  }

  return `<!doctype html>
<html lang="${escapar(datos.idioma)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asuntoSemanal(datos))}</title></head>
<body style="margin:0;padding:0;background:#f6f7f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f5;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid ${BORDE};border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <tr><td style="padding:24px 24px 4px;">
    <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${SUAVE};">
      ${escapar(datos.negocio)}
    </p>
    <h1 style="margin:6px 0 0;font-size:20px;line-height:1.25;color:${TINTA};">
      ${escapar(t.email.asuntoSemanal(datos.negocio))}
    </h1>
    <p style="margin:6px 0 0;font-size:13px;color:${SUAVE};">
      ${escapar(fechaLegible(datos.desde, false, locale))} — ${escapar(fechaLegible(datos.hasta, true, locale))}
    </p>
  </td></tr>

  <tr><td style="padding:18px 24px 0;">
    <p style="margin:0 0 14px;font-size:14px;line-height:1.5;color:${TINTA};">
      ${escapar(t.email.hola(datos.nombrePersona))} ${escapar(t.email.resumenIntro)}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${filas.join('')}</table>
  </td></tr>

  ${extras.length ? `<tr><td style="padding:6px 24px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${extras.join('')}</table>
  </td></tr>` : ''}

  <tr><td style="padding:22px 24px 26px;">
    <a href="${escapar(datos.sitio)}/panel"
       style="display:inline-block;background:${VERDE};color:#ffffff;text-decoration:none;
              font-size:14px;font-weight:700;padding:11px 20px;border-radius:10px;">
      ${escapar(t.email.abrir)}
    </a>
  </td></tr>

  <tr><td style="padding:0 24px 22px;border-top:1px solid ${BORDE};">
    <p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:${SUAVE};">
      ${escapar(t.email.bajarse)}
    </p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function fila(etiqueta: string, valor: string, detalle: string, color: string, fuerte = false): string {
  return `<tr>
    <td style="padding:9px 0;border-bottom:1px solid ${BORDE};">
      <span style="font-size:13.5px;color:${SUAVE};font-weight:${fuerte ? 700 : 600};">${escapar(etiqueta)}</span>
      ${detalle ? `<br><span style="font-size:11.5px;color:${SUAVE};">${escapar(detalle)}</span>` : ''}
    </td>
    <td align="right" style="padding:9px 0;border-bottom:1px solid ${BORDE};">
      <span style="font-size:${fuerte ? '19px' : '16px'};font-weight:700;color:${color};">${escapar(valor)}</span>
    </td>
  </tr>`;
}

function dato(etiqueta: string, valor: string): string {
  return `<tr>
    <td style="padding:7px 0;"><span style="font-size:12.5px;color:${SUAVE};font-weight:600;">${escapar(etiqueta)}</span></td>
    <td align="right" style="padding:7px 0;"><span style="font-size:13px;font-weight:700;color:${TINTA};">${valor}</span></td>
  </tr>`;
}

/**
 * Escapa lo que se mete en el HTML.
 *
 * El nombre del negocio y el de los productos los escribe la persona. Sin
 * esto, un producto llamado `</td><script>` rompería el correo, y peor: en
 * algunos clientes de escritorio el HTML de un correo se interpreta.
 */
function escapar(texto: string): string {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
