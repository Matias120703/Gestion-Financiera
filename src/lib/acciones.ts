import type { FichaDictada, Producto, ProductoDictado } from './tipos';

/**
 * LO QUE LA VOZ HACE ADEMÁS DE CARGAR PLATA
 *
 * El dueño lo pidió así: «que el audio sirva para todo». El micrófono de
 * siempre entiende también productos del catálogo, clientes y turnos (los
 * turnos tienen su propio archivo, turno-voz.ts).
 *
 * Acá se limpia lo que devuelve el modelo antes de mostrarlo. Nada de esto
 * guarda: lo entendido va a una pantalla de revisión, y se guarda recién
 * cuando la persona confirma, con las mismas funciones que las pantallas de
 * siempre.
 *
 * Este archivo NO importa nada del servidor a propósito: es lo que se prueba.
 */

const numero = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

/**
 * Un producto o servicio dictado.
 *
 * Para cambiar el precio o el stock hace falta uno REAL del catálogo: un id
 * inventado no llega a la pantalla, y nunca se toca otro producto «por las
 * dudas». Si no se reconoce cuál es, se hace elegir.
 */
export function sanearProducto(datos: unknown, catalogo: Producto[]): {
  producto: ProductoDictado;
  aviso: string | null;
} {
  const d: any = datos && typeof datos === 'object' ? datos : {};
  const p: any = d.producto && typeof d.producto === 'object' ? d.producto : {};

  const existente = typeof p.producto_id === 'string'
    ? catalogo.find((x) => x.id === p.producto_id)
    : undefined;
  const accion: ProductoDictado['accion'] = p.accion === 'precio' || p.accion === 'stock' ? p.accion : 'crear';
  let aviso: string | null = texto(d.aviso, 200) || null;

  if (accion !== 'crear' && !existente) {
    aviso = 'No encontré ese producto en tu catálogo. Elegilo vos.';
  }
  if (accion === 'stock' && existente && !existente.controla_stock) {
    aviso = `«${existente.nombre}» es un servicio: no lleva stock.`;
  }

  const nombre = texto(p.nombre, 120) || existente?.nombre || '';

  // Lo que ya está no se crea dos veces. La base lo rechazaría igual —el
  // nombre es único por negocio—, pero con un error que no dice cuál era.
  if (accion === 'crear' && nombre) {
    const igual = catalogo.find((x) => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
    if (igual) {
      aviso = `Ya tenés «${igual.nombre}» en el catálogo. Si querés cambiarle el precio o el stock, decilo así.`;
    }
  }

  return {
    aviso,
    producto: {
      accion,
      producto_id: existente?.id ?? null,
      nombre,
      es_servicio: accion === 'crear' ? p.es_servicio === true : existente ? !existente.controla_stock : false,
      precio: numero(p.precio),
      costo: numero(p.costo),
      cantidad: numero(p.cantidad),
      categoria: texto(p.categoria, 40) || existente?.categoria || 'General',
    },
  };
}

/** Un cliente nuevo dictado. Sin nombre no hay a quién guardar: se pide. */
export function sanearFicha(datos: unknown): { ficha: FichaDictada; aviso: string | null } {
  const d: any = datos && typeof datos === 'object' ? datos : {};
  const f: any = d.ficha && typeof d.ficha === 'object' ? d.ficha : {};
  const nombre = texto(d.contraparte, 80);
  return {
    aviso: nombre ? (texto(d.aviso, 200) || null) : 'No entendí el nombre del cliente. Escribilo vos.',
    ficha: { nombre, telefono: texto(f.telefono, 40), notas: texto(f.notas, 1000) },
  };
}
