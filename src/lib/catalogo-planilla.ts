/**
 * LA LISTA DE PRODUCTOS DE UNA PLANILLA (122, 01/10/2026).
 *
 * Matías: «Muchos negocios se manejan en planillas donde tienen sus
 * productos, costos, ventas. Nadie va a anotar uno por uno sus miles de
 * productos». Productos → «Subir planilla»: el Excel, el CSV o el link de
 * Google Sheets, COMO LO TENGA el negocio. Acá se entiende qué es cada cosa;
 * la pantalla lo muestra para revisar y la base lo guarda por tandas
 * (`importar_productos`, migración 122).
 *
 * Corre en el celular (no importa nada de servidor, React ni exceljs): cambiar
 * una columna o una hoja en la revisión no vuelve a subir nada. Llega un
 * `LibroPlanilla` (planilla.ts), venga del CSV que leyó el navegador o del
 * .xlsx que leyó el servidor.
 *
 * LO QUE ENTIENDE (cada regla con su planilla en
 * pruebas/planillas-catalogo/generar.js):
 *   · los títulos de columna en español, portugués e inglés, con sinónimos
 *     («Descripción», «Artículo», «PVP», «Custo», «Qty»…), en cualquier orden;
 *     el encabezado en dos filas («Precio» combinado sobre «Compra | Venta»);
 *     sin encabezado, adivina por lo que hay en cada columna y lo avisa;
 *   · las columnas que NUNCA son el precio aunque tengan números: total,
 *     ganancia, margen, IVA, descuento…; con y sin IVA, se toma con IVA (en
 *     Paraguay el precio de góndola lo lleva); con dos precios, el de venta
 *     al público, y el mayorista se nombra como no usado;
 *   · los montos como los escribe cada uno: «Gs. 15.000», «₲7.500.-»,
 *     «R$ 12,50», «$1,234.50», «15.000,50». El separador decimal se decide por
 *     columna, y un número de verdad de la celda se usa tal cual;
 *   · las filas que no son productos: títulos, subtítulos de grupo (que pasan
 *     a ser la categoría de lo que sigue), totales, notas, guiones, «N/A»;
 *   · dos tablas lado a lado o una debajo de otra, cada una con lo suyo; y
 *     varias hojas: se usan las que parecen la lista (las de mismo encabezado,
 *     todas), y un registro de ventas no, aunque tenga precio y más filas (21);
 *   · los repetidos dentro de la planilla (mismo código, o sin código el
 *     mismo nombre): queda el último, que es lo corregido más abajo;
 *   · los códigos que Excel rompió («7,79E+12», o el mismo 7790000000000 en
 *     todas las filas) no se usan, y se avisa (22); los ceros de adelante
 *     (000123) no cambian un código de solo cifras (28).
 *
 * NUNCA INVENTA: lo que no entiende queda afuera y se nombra en la revisión
 * (sin nombre, sin precio, columnas no usadas, fórmulas sin calcular, montos
 * negativos que la base no acepta).
 */
import { codigoSinCeros } from './codigo-producto';
import { plegar, textoDeCelda, type CeldaPlanilla, type HojaPlanilla, type LibroPlanilla } from './planilla';

export type CampoCatalogo = 'nombre' | 'codigo' | 'categoria' | 'costo' | 'precio' | 'stock' | 'stock_minimo' | 'unidad';

/** En el orden en que se muestran en la revisión. */
export const CAMPOS_CATALOGO: readonly CampoCatalogo[] = ['nombre', 'codigo', 'categoria', 'costo', 'precio', 'stock', 'stock_minimo', 'unidad'];

/** Los largos de la base (productos, 001 y 122). */
export const LARGOS_CATALOGO = { nombre: 120, categoria: 40, codigo: 60, unidad: 12 } as const;

/** Un producto leído, listo para `importar_productos`. Lo que no vino es null (al actualizar, no se toca). */
export interface FilaCatalogo {
  /** La fila de la planilla (desde 1, como la ve el negocio en Excel). */
  fila: number;
  hoja: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  costo: number | null;
  precio: number | null;
  stock: number | null;
  stock_minimo: number | null;
  unidad: string | null;
  /** Un servicio (un corte, una sesión): sin costo ni stock. */
  servicio: boolean;
  /** Estaba oculta en el Excel (un filtro). */
  oculta?: boolean;
}

/** Una fila que no se carga (o se carga con un aviso), para mostrarla en la revisión. */
export interface ProblemaCatalogo {
  fila: number;
  hoja: string;
  nombre: string;
  /** Lo que decía la celda que falta o molesta («consultar», «s/p»). */
  valor?: string;
  /** Precio menor al costo: los dos montos, para verlo sin abrir la planilla. */
  costo?: number;
  precio?: number;
  /** Repetido: la fila que queda (la de más abajo), y su hoja. */
  queda?: { fila: number; hoja: string };
}

export interface ListaProblemas {
  cuantos: number;
  /** Los primeros (hasta 100): para mostrar, no para contar. */
  ejemplos: ProblemaCatalogo[];
}

export type AvisoCatalogo =
  | { codigo: 'otro_precio_no_usado'; columnas: string[] }
  | { codigo: 'datos_no_usados'; columnas: string[] }
  | { codigo: 'sin_costo' }
  | { codigo: 'formulas_sin_calcular'; columnas: string[] }
  | { codigo: 'filas_ocultas'; cuantas: number; incluidas: boolean }
  | { codigo: 'sin_encabezado' }
  | { codigo: 'recortada' }
  | { codigo: 'nombre_largo'; cuantos: number }
  /**
   * La columna de código no se usa (o algunos de sus códigos): Excel los pasó
   * a notación científica (`cientificos`), o repite el mismo código en
   * productos distintos. Esos productos se emparejan por el nombre (22).
   */
  | { codigo: 'codigos_no_usados'; columnas: string[]; cientificos: boolean };

export interface ColumnaDelBloque {
  /** El título como está escrito (dos filas, juntas: «Precio Compra»); vacío si no tiene. */
  titulo: string;
  /** Un valor de muestra (el primero con algo). */
  ejemplo: string;
  oculta: boolean;
}

/** Una tabla de la planilla: su encabezado, qué columna es cada dato, y cuántos productos dio. */
export interface BloqueCatalogo {
  hoja: string;
  /** Con qué se guarda lo que se cambió a mano (las tablas con el mismo encabezado lo comparten). */
  firma: string;
  /** Filas de la planilla (desde 1). */
  desde: number;
  hasta: number;
  columnas: ColumnaDelBloque[];
  /** Columna (desde 0, dentro de la tabla) de cada dato. Lo que falta no está en la planilla. */
  mapeo: Partial<Record<CampoCatalogo, number>>;
  sinEncabezado: boolean;
  servicio: boolean;
  esCatalogo: boolean;
  usado: boolean;
  /** El título de la tabla (si es la categoría de lo que tiene). */
  titulo: string | null;
  /** Productos y filas sin precio que salieron de acá. */
  filas: number;
}

export interface HojaDelCatalogo {
  nombre: string;
  usada: boolean;
  esCatalogo: boolean;
  /** Productos (con y sin precio) que tiene. */
  filas: number;
}

export interface ResultadoCatalogo {
  hojas: HojaDelCatalogo[];
  bloques: BloqueCatalogo[];
  /** Con nombre y precio: se crean o se actualizan. Sin repetidos. */
  productos: FilaCatalogo[];
  /** Con nombre y sin precio: un producto nuevo no se crea; uno que ya existe actualiza lo demás. */
  sinPrecio: FilaCatalogo[];
  problemas: {
    sin_nombre: ListaProblemas;
    sin_precio: ListaProblemas;
    precio_menor_costo: ListaProblemas;
    repetidos: ListaProblemas;
    /**
     * Un precio, costo o mínimo negativo, o un número de 1.000.000.000.000 o
     * más (la columna de código elegida como precio): la base no lo acepta,
     * así que no se carga. Antes pasaba la revisión y frenaba la tanda (29).
     */
    monto_invalido: ListaProblemas;
  };
  /** Las filas que se dejaron afuera porque no eran productos. */
  descartadas: { titulos: number; totales: number; notas: number };
  /** Los títulos de las columnas que no se usaron (para «No usamos: IVA, Marca»). */
  columnasNoUsadas: string[];
  avisos: AvisoCatalogo[];
}

export interface OpcionesCatalogo {
  /** Las hojas sumadas o sacadas a mano, por nombre. Lo demás, automático. */
  hojas?: Record<string, boolean>;
  /** Por firma de tabla: la columna (desde 0) elegida a mano para cada dato, o null = «no está». */
  mapeo?: Record<string, Partial<Record<CampoCatalogo, number | null>>>;
  /** Las filas ocultas en el Excel (un filtro) se cargan. Por defecto sí, y se avisa. */
  incluirOcultas?: boolean;
  /** Lo que es una tabla que no dice «Servicio» ni «Producto»: la pestaña desde donde se subió. */
  tipo?: 'productos' | 'servicios';
}

type Celda = CeldaPlanilla | null;
type Fila = Celda[];

// ─────────────────────────── el nombre para comparar ───────────────────────────

/**
 * Las tildes de las vocales que se sacan, y la Ñ y la Ç que bajan a
 * minúscula (sin depender del idioma de la base). La MISMA lista que
 * `clave_producto()` en la migración 122: una prueba pasa las mismas frases
 * por las dos.
 */
const CON_TILDE = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜáàâãäéèêëíìîïóòôõöúùûüÑÇ';
const SIN_TILDE = 'AAAAAEEEEIIIIOOOOOUUUUaaaaaeeeeiiiiooooouuuuñç';
const ESPACIOS = new Set([0xa0, 0x2007, 0x202f, 0x09, 0x0a, 0x0d].map((n) => String.fromCharCode(n)));
const INVISIBLES = new Set([0x200b, 0x2060, 0xfeff].map((n) => String.fromCharCode(n)));
/** Algún espacio raro o invisible (si no hay, limpiar es solo juntar espacios). */
const RE_RARO = new RegExp(`[${[...ESPACIOS, ...INVISIBLES].join('')}]`);
/** Los espacios duros y finos (para los montos). */
const RE_ESPACIO_DURO = new RegExp(`[${String.fromCharCode(0xa0, 0x2007, 0x202f)}]`, 'g');

/**
 * El nombre para comparar: minúsculas, sin tilde en las vocales (español y
 * portugués: «Azucar» y «Azúcar» son el mismo; la ñ y la ç se quedan), el
 * espacio duro de WhatsApp y los finos como espacios, los de ancho cero
 * como nada, y los espacios seguidos como uno. Igual que `clave_producto()`.
 */
export function claveProducto(nombre: string): string {
  let s = '';
  for (const ch of nombre ?? '') {
    if (INVISIBLES.has(ch)) continue;
    if (ESPACIOS.has(ch)) { s += ' '; continue; }
    const i = CON_TILDE.indexOf(ch);
    s += i >= 0 ? SIN_TILDE[i] : ch;
  }
  return s.toLowerCase().replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '');
}

/** El nombre limpio, como lo deja el diálogo (y sin espacios invisibles): igual que la base. */
export function limpiarNombre(nombre: string): string {
  if (!RE_RARO.test(nombre ?? '')) return (nombre ?? '').replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '');
  let s = '';
  for (const ch of nombre ?? '') {
    if (INVISIBLES.has(ch)) continue;
    s += ESPACIOS.has(ch) ? ' ' : ch;
  }
  return s.replace(/ {2,}/g, ' ').replace(/^ +| +$/g, '');
}

// ─────────────────────────── los montos ───────────────────────────

const RE_SIN_DATO = /^(?:consultar(?: precio)?|a consultar|s\/?p|sin precio|n\/?a|na|#n\/?a|#[a-z0-9/!?]+|-+|—|–|x|\?+|null|none|no|ninguno)$/i;
// Lo que acompaña a un monto: la moneda, la unidad, el «.-» del final.
const RE_MONEDA = /(?:gs\.?|₲|r\$|us\$|u\$s|\$|usd|pyg|brl|guaran[ií]es|reales|unidades|unid\.?|un\.?|u\.|\.-$)/gi;

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/**
 * «Gs. 15.000» → 15000; «R$ 12,50» → 12.5; «$1,234.50» → 1234.5;
 * «consultar», «s/p», «-» → null. `decimal`: el separador que decidió la
 * columna (`separadorDeColumna`). Sin él, cada valor por su cuenta: con los
 * dos separadores el último es el decimal; uno repetido es de miles; uno
 * solo con exactamente tres cifras detrás (y algo adelante que no sea 0) es
 * de miles («15.000» es quince mil; «0,500» es medio). Hasta dos decimales,
 * como guarda la base.
 */
export function leerMonto(v: string | number | null | undefined, decimal?: ',' | '.'): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? redondear2(v) : null;
  // Lo de casi todas: cifras solas («15000»).
  if (/^\d{1,15}$/.test(v)) return Number(v);
  let s = String(v).replace(RE_ESPACIO_DURO, ' ').trim();
  if (!s || RE_SIN_DATO.test(s)) return null;
  s = s.replace(RE_MONEDA, '').replace(/\s+/g, '');
  if (!/^-?[\d.,]*\d[\d.,]*$/.test(s)) return null;
  const negativo = s.startsWith('-');
  if (negativo) s = s.slice(1);
  s = s.replace(/^[.,]+|[.,]+$/g, '');
  if (!s) return null;
  const puntos = (s.match(/\./g) ?? []).length;
  const comas = (s.match(/,/g) ?? []).length;
  let dec: ',' | '.' | null = null;
  if (decimal && ((decimal === ',' && comas <= 1) || (decimal === '.' && puntos <= 1))) {
    dec = decimal;
  } else if (puntos && comas) {
    dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
  } else if (puntos + comas === 1) {
    const sep = puntos ? '.' : ',';
    const [entera, detras] = s.split(sep);
    dec = detras.length === 3 && entera !== '' && !/^0+$/.test(entera) ? null : sep;
  }
  const miles = dec === ',' ? /\./g : dec === '.' ? /,/g : /[.,]/g;
  let limpio = s.replace(miles, '');
  if (dec === ',') limpio = limpio.replace(',', '.');
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return redondear2(negativo ? -n : n);
}

/**
 * El separador decimal de una columna, si lo dice: un «1.234,56» (el último
 * de los dos), un «1.234.567» (el repetido es de miles) o un «12,5» (una o
 * dos cifras, o más de tres, detrás de uno solo). Si no lo dice nadie, null.
 */
export function separadorDeColumna(textos: readonly string[]): ',' | '.' | null {
  let coma = 0;
  let punto = 0;
  for (const t of textos) {
    const s = t.replace(RE_MONEDA, '').replace(RE_ESPACIO_DURO, '').replace(/\s/g, '').replace(/^[.,-]+|[.,-]+$/g, '');
    if (!/^[\d.,]+$/.test(s)) continue;
    const p = (s.match(/\./g) ?? []).length;
    const c = (s.match(/,/g) ?? []).length;
    if (p && c) { if (s.lastIndexOf(',') > s.lastIndexOf('.')) coma++; else punto++; continue; }
    if (p > 1) { coma++; continue; }
    if (c > 1) { punto++; continue; }
    if (p + c === 1) {
      const detras = s.split(p ? '.' : ',')[1];
      if (detras.length !== 3) { if (p) punto++; else coma++; }
    }
  }
  if (!coma && !punto) return null;
  return coma >= punto ? ',' : '.';
}

// ─────────────────────────── los títulos de columna ───────────────────────────

interface Reconocido {
  campo: CampoCatalogo;
  /** 1 el mejor; con dos candidatos gana el de menor prioridad. */
  prioridad: number;
  /** Otro precio de venta (mayorista, oferta): si no se usa, se avisa. */
  alterno?: boolean;
  /** El título dice que son servicios («Servicio», «Serviço»). */
  servicio?: boolean;
}
type Titulo = Reconocido | 'nunca' | null;

/** Sin tildes, en minúsculas, la puntuación como espacio: «Cód.» → «cod», «Precio c/IVA» → «precio c iva». */
function normalizarTitulo(t: string): string {
  return plegar(t).replace(/[^a-z0-9%#]+/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lo que nunca es costo, precio ni stock, aunque tenga números (03, 09, 19).
const RE_NUNCA = new RegExp([
  '%', '#',
  '\\b(?:total|totales|totais|importe|importes|subtotal|valorizado|valorizacion|invertido|inversion|investido)\\b',
  '\\bvalor (?:en |de |del |do |em )?(?:stock|estoque|inventario)\\b',
  '\\b(?:stock|inventory) value\\b',
  '\\b(?:ganancia|ganancias|utilidad|margen|margem|markup|rentabilidad|lucro|beneficio)\\b',
  '\\b(?:descuento|descuentos|desconto|bonificacion|comision|comissao)\\b',
  '\\b(?:fecha|fechas|vencimiento|vence|validade|lote|date)\\b',
  '\\b(?:proveedor|proveedores|fornecedor|supplier|vendor|marca|marcas|brand|fabricante)\\b',
  '\\b(?:observacion|observaciones|observacao|obs|nota|notas|comentario|comentarios|ubicacion|deposito|estante|gondola|imagen|imagenes|foto|fotos|link|url|activo|ativo|estado|status|cliente|clientes|vendedor|factura|telefono|email)\\b',
  '^(?:n|no|nro|nº|num|numero|orden|fila|linea)$',
].join('|'));
// El IVA solo, sin decir de qué monto (un «IVA» con 10, 5, EXENTA; el «Tax» de un POS).
const RE_SOLO_IVA = /\b(?:iva|impuesto|impuestos|imposto|icms|tasa|alicuota|tax|vat)\b/;
// Lo que tiene un registro de ventas y no una lista de productos (14, 21):
// el cliente o la factura de cada venta, o una columna que es SOLO la fecha
// («Fecha», «Fecha de venta»). «Fecha de vencimiento» o «Fecha act.» no: las
// tiene la lista de una farmacia o de un almacén.
const RE_REGISTRO = /\b(?:cliente|clientes|factura|facturas|vendedor|vendedora|recibo|comprador|comprobante|customer|invoice)\b|^(?:fecha|fechas|date|data|dia|fecha (?:de )?(?:la )?(?:venta|compra|emision|operacion|factura))$/;
const RE_SIN_IVA = /\b(?:s iva|sin iva|s imp|neto|sem imposto|sem iva|sin impuesto|sin impuestos|liquido)\b/;
// El monto que dice que lleva el IVA (3b, 3c): «Precio c/IVA», «IVA incl.», «Precio final».
const RE_CON_IVA = /\b(?:c iva|con iva|com iva|iva incl|iva incluido|iva incluso|iva inc|incl iva|inc iva|c imp|con impuestos?|com impostos?|final|incl tax|inc tax|tax incl|with tax|gross)\b/;
// Otro precio de venta, que no es el de góndola: el mayorista (también
// «Precio x mayor», «Precio mayor», «Wholesale», el de la caja cerrada), la
// oferta, la tarjeta, el de antes (02, 24).
const RE_ALTERNO = /\b(?:mayorista|mayor|atacado|wholesale|bulk|dealer|reseller|distributor|caja|bulto|fardo|oferta|promo|promocion|promocao|lista 2|precio 2|tarjeta|credito|cuotas|revendedor|reventa|distribuidor|especial|dolar|dolares|usd|us|anterior|viejo|antiguo)\b/;

const CACHE_TITULOS = new Map<string, Titulo>();

/** Qué dato es una columna por su título, o 'nunca' (total, ganancia, IVA…), o null (no se sabe). */
export function tituloDeColumna(titulo: string): Titulo {
  const t = normalizarTitulo(titulo);
  if (!t) return null;
  const guardado = CACHE_TITULOS.get(t);
  if (guardado !== undefined) return guardado;
  const r = clasificar(t);
  CACHE_TITULOS.set(t, r);
  return r;
}

function clasificar(t: string): Titulo {
  if (RE_NUNCA.test(t)) return 'nunca';
  const deMonto = /\b(?:costo|costos|custo|cost|precio|precios|preco|precos|price|pvp|valor)\b/.test(t);
  if (RE_SOLO_IVA.test(t) && !deMonto) return 'nunca';

  // Stock mínimo antes que stock (19). El «reorder point» de un POS en inglés (23).
  if (/\b(?:stock|estoque|existencia) ?(?:min|minimo|minima)\b|^(?:min|minimo|minima|min stock|minimum|minimo stock)$|punto de (?:pedido|reposicion)|\breponer\b|estoque minimo|\breorder (?:point|level)\b|\bmin(?:imum)? (?:stock|qty|quantity)\b/.test(t)) {
    return { campo: 'stock_minimo', prioridad: 1 };
  }
  if (/\b(?:codigo|codigos|cod|ean|ean13|gtin|upc|sku|barras|barcode|plu)\b/.test(t)) return { campo: 'codigo', prioridad: 1 };
  if (/^(?:ref|referencia|id|code|item code|interno)$/.test(t)) return { campo: 'codigo', prioridad: 2 };

  // Con y sin IVA, se toma con IVA (19): el que lo dice gana al que no dice
  // nada («Precio Unitario | Precio c/IVA», 3b), y el que dice «sin», pierde.
  const prioridadIva = RE_SIN_IVA.test(t) ? 2 : RE_CON_IVA.test(t) ? 0.5 : 1;
  // Costo antes que precio: «Precio de compra» es lo que cuesta (03); en
  // inglés, «Purchase Price», «supply_price», «Buy Price» (23).
  if (/\b(?:costo|costos|custo|custos|cost|costs|compra|compras|purchase|purchasing|supply|buy|buying)\b/.test(t)) {
    return { campo: 'costo', prioridad: prioridadIva };
  }
  if (/\b(?:precio|precios|preco|precos|price|prices|pvp|pvc|venta|ventas|vta|venda|vendas|al publico|publico|minorista|varejo|contado|tarifa|retail|sale)\b/.test(t) || /^p ?v$/.test(t)) {
    if (RE_ALTERNO.test(t)) return { campo: 'precio', prioridad: 3, alterno: true };
    return { campo: 'precio', prioridad: prioridadIva };
  }
  if (/\bvalor\b/.test(t)) return { campo: 'precio', prioridad: RE_ALTERNO.test(t) ? 3 : 2, alterno: RE_ALTERNO.test(t) || undefined };

  if (/\b(?:stock|existencia|existencias|cantidad|cantidades|cant|inventario|inventory|unidades|disponible|disponibles|saldo|estoque|quantidade|qtd|qtde|qty|quantity|on hand|in stock|qt)\b/.test(t)) {
    return { campo: 'stock', prioridad: 1 };
  }
  if (/\bsub ?(?:rubro|rubros|familia|categoria|categorias|grupo|linea|linha|category|departamento)\b/.test(t)) return { campo: 'categoria', prioridad: 2 };
  if (/\b(?:categoria|categorias|rubro|rubros|familia|familias|grupo|grupos|departamento|depto|seccion|secao|linea|linha|category|department|clase|tipo|type)\b/.test(t)) {
    return { campo: 'categoria', prioridad: 1 };
  }
  if (/^(?:unidad|unid|un|u m|um|unidad de medida|unidad medida|medida|unidade|unidade de medida|unit|uom|presentacion|embalaje)$/.test(t)) {
    return { campo: 'unidad', prioridad: 1 };
  }
  // El nombre: «Producto», «Artículo», «Nombre» antes que «Descripción» o
  // «Item» (con «Nombre» y «Descripción», la descripción es el texto largo).
  const servicio = /\b(?:servicio|servicios|servico|servicos|service|services)\b/.test(t);
  if (servicio || /\b(?:producto|productos|articulo|articulos|mercaderia|mercaderias|mercadoria|produto|produtos|product|products)\b/.test(t)
    || /^(?:nombre|nome|name)$/.test(t)) {
    return { campo: 'nombre', prioridad: 1, servicio: servicio || undefined };
  }
  if (/\b(?:descripcion|descripciones|descricao|description|nombre|nome|item|items|name|detalle|concepto)\b/.test(t)) return { campo: 'nombre', prioridad: 2 };
  return null;
}

// ─────────────────────────── las celdas ───────────────────────────

const txt = (c: Celda | undefined): string => textoDeCelda(c);
const llena = (c: Celda | undefined): boolean => !!c && (txt(c) !== '' || !!c.sinCalcular);
/** ¿Es un número? El de la celda, o un texto que se lee como monto («Gs. 15.000», «12,5»). */
function esNumero(c: Celda | undefined): boolean {
  if (!c) return false;
  if (typeof c.numero === 'number') return true;
  if (c.sinCalcular) return true;
  const t = txt(c);
  return t !== '' && /\d/.test(t) && leerMonto(t) !== null;
}

/** ¿Una fila de títulos? Texto solo, al menos dos datos reconocidos y alguno que la haga una lista. */
function reconocerFila(f: Fila, desde = 0, hasta = f.length): { k: number; r: Reconocido }[] | null {
  const hallados: { k: number; r: Reconocido }[] = [];
  let llenas = 0;
  for (let k = desde; k < hasta; k++) {
    const c = f[k];
    if (!llena(c)) continue;
    llenas++;
    if (typeof c?.numero === 'number' || c?.sinCalcular) return null;
    const t = txt(c);
    if (/^[\d\s.,$₲-]+$/.test(t)) return null;
    const r = tituloDeColumna(t);
    if (r && r !== 'nunca') hallados.push({ k, r });
  }
  if (llenas < 2) return null;
  const campos = new Set(hallados.map((h) => h.r.campo));
  if (campos.size < 2) return null;
  if (!campos.has('nombre') && !(campos.has('precio') && campos.has('codigo')) && !(campos.has('codigo') && campos.has('stock'))) return null;
  return hallados;
}

// ─────────────────────────── las filas que no son productos ───────────────────────────

const RE_TOTAL = /^(?:total|totales|total general|sub ?total|suma|totais|totaliza|importe total)\b/i;
const RE_NOTA = /^(?:actualizad|actualizacion|precios? (?:sujetos?|con|sin|vigentes?|validos?)|vigente|lista vigente|valid|nota|notas|obs\b|observaci|fuente|generado|impreso|pagina|página|elaborado|consult|whatsapp|tel[eé.:]|cel[ulr.:]|direcci|e-?mail|correo|www\.|https?:|hoja \d|page \d|atualizad|preços|precos)/i;
const RE_BASURA = /^(?:[-–—_.·*xX?]+|n\/?a|s\/?n|#n\/?a|null|ninguno|sin nombre|sin datos|vacio|vacío)$/i;

/**
 * ¿Un subtítulo de grupo («BEBIDAS», «Lácteos:» en negrita, o «Ferretería»
 * combinada a lo ancho de la tabla, centrada y con color, 27)?
 */
function esSubtitulo(c: Celda): boolean {
  const t = txt(c);
  if (!t || t.length > 40 || RE_BASURA.test(t) || RE_TOTAL.test(t) || RE_NOTA.test(t)) return false;
  const letras = t.replace(/[^\p{L}]/gu, '');
  if (letras.length < 2) return false;
  return !!c?.negrita || !!c?.combinada || letras === letras.toUpperCase() || /:\s*$/.test(t);
}

// ─────────────────────────── las tablas de una hoja ───────────────────────────

interface Encabezado {
  /** Fila del primer título y fila donde empiezan los datos (índices de `filas`). */
  fila: number;
  datos: number;
  /** Columnas de la tabla [desde, hasta). */
  desde: number;
  hasta: number;
  titulos: string[];
}

/** «Precio» arriba de «Compra | Venta» → «Precio Compra», «Precio Venta» (16). */
function combinarTitulos(arriba: Fila, abajo: Fila, desde: number, hasta: number): string[] {
  const out: string[] = [];
  let grupo = '';
  for (let k = desde; k < hasta; k++) {
    const a = txt(arriba[k]);
    const b = txt(abajo[k]);
    if (a && b) {
      if (a === b) { out.push(a); grupo = ''; } else { out.push(`${a} ${b}`); grupo = a; }
    } else if (b) {
      out.push(grupo ? `${grupo} ${b}` : b);
    } else {
      out.push(a);
      grupo = '';
    }
  }
  return out;
}

/** ¿La fila de abajo del encabezado es su segunda fila de títulos? */
function esSegundaFilaDeTitulos(arriba: Fila, abajo: Fila | undefined, desde: number, hasta: number): boolean {
  if (!abajo) return false;
  let llenas = 0;
  let iguales = 0;
  let debajoDeHueco = 0;
  for (let k = desde; k < hasta; k++) {
    if (!llena(abajo[k])) continue;
    if (esNumero(abajo[k])) return false;
    llenas++;
    if (txt(abajo[k]) === txt(arriba[k])) iguales++;
    else if (!llena(arriba[k])) debajoDeHueco++;
  }
  return llenas >= 2 && (iguales >= 1 || debajoDeHueco >= 1);
}

/** Los encabezados de una hoja, de arriba abajo; dos tablas lado a lado son dos (13). */
function encabezadosDe(filas: Fila[], ancho: number): Encabezado[] {
  const out: Encabezado[] = [];
  for (let r = 0; r < filas.length; r++) {
    const f = filas[r];
    if (!reconocerFila(f, 0, ancho)) continue;
    // ¿Varias tablas en la misma fila? Tramos de títulos separados por columnas vacías.
    const tramos: [number, number][] = [];
    let k = 0;
    while (k < ancho) {
      while (k < ancho && !llena(f[k])) k++;
      const ini = k;
      while (k < ancho && llena(f[k])) k++;
      if (k > ini) tramos.push([ini, k]);
    }
    const propios = tramos.filter(([a, b]) => reconocerFila(f, a, b)?.some((h) => h.r.campo === 'nombre'));
    const partes: [number, number][] = propios.length >= 2
      // Cada tabla, hasta donde empieza la siguiente.
      ? propios.map(([a], i) => [a, i + 1 < propios.length ? propios[i + 1][0] : ancho])
      : [[0, ancho]];
    let datos = r + 1;
    for (const [a, b] of partes) {
      const dosFilas = esSegundaFilaDeTitulos(f, filas[r + 1], a, b);
      const titulos = dosFilas
        ? combinarTitulos(f, filas[r + 1], a, b)
        : Array.from({ length: b - a }, (_, i) => txt(f[a + i]));
      out.push({ fila: r, datos: dosFilas ? r + 2 : r + 1, desde: a, hasta: b, titulos });
      if (dosFilas) datos = r + 2;
    }
    r = datos - 1;
  }
  return out;
}

// ─────────────────────────── qué columna es cada dato ───────────────────────────

interface Estadistica {
  llenas: number;
  numeros: number;
  textos: number;
  /** Textos que parecen un código (8 a 14 cifras). */
  codigos: number;
  enteros: number;
  distintos: number;
  largoTexto: number;
  mediana: number;
  sinCalcular: number;
  ejemplo: string;
}

function estadisticas(filas: Fila[], col: number): Estadistica {
  let llenas = 0, numeros = 0, textos = 0, codigos = 0, enteros = 0, largoTexto = 0, sinCalcular = 0;
  let ejemplo = '';
  const vistos = new Set<string>();
  const valores: number[] = [];
  for (const f of filas) {
    const c = f[col];
    if (!llena(c)) continue;
    llenas++;
    if (c?.sinCalcular) { sinCalcular++; numeros++; continue; }
    const t = txt(c);
    if (!ejemplo) ejemplo = t;
    vistos.add(t);
    if (/^\d{8,14}$/.test(t)) codigos++;
    if (esNumero(c)) {
      numeros++;
      const n = typeof c?.numero === 'number' ? c.numero : leerMonto(t);
      if (n !== null) { valores.push(n); if (Number.isInteger(n)) enteros++; }
    } else {
      textos++;
      largoTexto += t.length;
    }
  }
  valores.sort((a, b) => a - b);
  return {
    llenas, numeros, textos, codigos, enteros, distintos: vistos.size,
    largoTexto: textos ? largoTexto / textos : 0,
    mediana: valores.length ? valores[Math.floor(valores.length / 2)] : 0,
    sinCalcular, ejemplo,
  };
}

/** ¿Lo que hay en la columna sirve para ese dato? */
function sirve(campo: CampoCatalogo, e: Estadistica): boolean {
  if (e.llenas === 0) return campo !== 'nombre';
  if (campo === 'nombre') return e.textos / e.llenas >= 0.6;
  if (campo === 'costo' || campo === 'precio' || campo === 'stock' || campo === 'stock_minimo') return e.numeros / e.llenas >= 0.5;
  return true;
}

const ORDEN_ASIGNAR: CampoCatalogo[] = ['nombre', 'codigo', 'precio', 'costo', 'stock', 'stock_minimo', 'categoria', 'unidad'];

/** El mapeo de una tabla con encabezado: por título, mirando que el contenido sirva. */
function mapeoPorTitulos(titulos: string[], stats: Estadistica[], aMano: Partial<Record<CampoCatalogo, number | null>> | undefined) {
  const mapeo: Partial<Record<CampoCatalogo, number>> = {};
  const usadas = new Set<number>();
  for (const campo of CAMPOS_CATALOGO) {
    const v = aMano?.[campo];
    if (v === undefined) continue;
    if (v !== null && Number.isInteger(v) && v >= 0 && v < titulos.length && !usadas.has(v)) { mapeo[campo] = v; usadas.add(v); }
  }
  const reconocidos = titulos.map((t) => tituloDeColumna(t));
  for (const campo of ORDEN_ASIGNAR) {
    if (aMano && campo in aMano) continue;
    let mejor = -1;
    let prioridad = Infinity;
    reconocidos.forEach((r, k) => {
      if (!r || r === 'nunca' || r.campo !== campo || usadas.has(k)) return;
      if (!sirve(campo, stats[k])) return;
      if (r.prioridad < prioridad) { prioridad = r.prioridad; mejor = k; }
    });
    if (mejor >= 0) { mapeo[campo] = mejor; usadas.add(mejor); }
  }
  return { mapeo, reconocidos };
}

/** Sin encabezado (17): por lo que hay en cada columna. */
function mapeoPorContenido(stats: Estadistica[], aMano: Partial<Record<CampoCatalogo, number | null>> | undefined) {
  const mapeo: Partial<Record<CampoCatalogo, number>> = {};
  const usadas = new Set<number>();
  const libre = (k: number) => !usadas.has(k) && stats[k].llenas > 0;
  if (aMano) {
    for (const campo of CAMPOS_CATALOGO) {
      const v = aMano[campo];
      if (v !== undefined && v !== null && Number.isInteger(v) && v >= 0 && v < stats.length && !usadas.has(v)) { mapeo[campo] = v; usadas.add(v); }
    }
  }
  const elegir = (campo: CampoCatalogo, k: number) => {
    if (aMano && campo in aMano) return;
    if (k >= 0 && libre(k)) { mapeo[campo] = k; usadas.add(k); }
  };
  // El código: casi todo de 8 a 14 cifras, sin repetir.
  elegir('codigo', stats.findIndex((e, k) => libre(k) && e.codigos / e.llenas >= 0.8 && e.distintos / e.llenas >= 0.9));
  // El nombre: el texto más largo.
  let nombre = -1;
  stats.forEach((e, k) => {
    if (!libre(k) || e.textos / e.llenas < 0.6) return;
    if (nombre < 0 || e.largoTexto > stats[nombre].largoTexto) nombre = k;
  });
  elegir('nombre', nombre);
  // Los números: los dos de mediana más alta son plata (el mayor, casi siempre, es el precio);
  // uno de enteros chicos es el stock.
  const numericas = stats.map((e, k) => k).filter((k) => libre(k) && stats[k].numeros / stats[k].llenas >= 0.8);
  numericas.sort((a, b) => stats[b].mediana - stats[a].mediana);
  let plata = numericas;
  let stock = -1;
  const ultima = numericas[numericas.length - 1];
  if (numericas.length >= 2 && stats[ultima].enteros === stats[ultima].numeros && stats[ultima].mediana * 10 <= stats[numericas[0]].mediana) {
    stock = ultima;
    plata = numericas.slice(0, -1);
  }
  plata = plata.slice(0, 2);
  return { mapeo, usadas, plata, stock, elegir };
}

// ─────────────────────────── leer ───────────────────────────

const RE_HOJA_GENERICA = /^(?:hoja|sheet|planilha|pagina|tabla|tabela|libro|datos|dados|productos?|produtos?|lista|listado|catalogo|stock|estoque|inventario|precios?|precos?|articulos?|items?|mercaderias?|base|export|exportar|reporte|report|hoja de calculo)?\s*\d*$/;
const RE_HOJA_VIEJA = /\b(?:viejo|vieja|anterior|copia|backup|old|respaldo|borrador|antigua|antiguo)\b/;

const normalizarUnidad = (u: string): string => {
  const t = plegar(u).replace(/[^a-z0-9]/g, '');
  if (!t) return '';
  if (/^(?:u|un|und|unid|unidad|unidades|uni|unit|units|pza|pieza|piezas|ud)$/.test(t)) return 'un';
  if (/^(?:kg|kgs|kilo|kilos|kilogramo|kilogramos)$/.test(t)) return 'kg';
  if (/^(?:l|lt|lts|litro|litros)$/.test(t)) return 'lt';
  if (/^(?:g|gr|grs|gramo|gramos)$/.test(t)) return 'g';
  if (/^(?:ml|cc)$/.test(t)) return 'ml';
  if (/^(?:m|mt|mts|metro|metros)$/.test(t)) return 'm';
  return limpiarNombre(u).slice(0, LARGOS_CATALOGO.unidad);
};

/**
 * Un código que Excel pasó a notación científica al guardar el CSV: lo que
 * mostraba la celda en formato General («7,79E+12», «7.79123E+12»). Excel
 * siempre escribe el signo del exponente: «12E5» sin signo puede ser un
 * código de verdad y queda (22).
 */
const RE_CIENTIFICO = /^\d+(?:[.,]\d+)?e[+-]\d+$/i;
/** Ese mismo código vuelto a abrir y guardado como .xlsx: 12 cifras o más que terminan en seis ceros (7790000000000). */
const RE_REDONDEADO = /^\d{6,}0{6}$/;

/** El código tal como está, sin mirar si Excel lo rompió (para contar en la columna). */
function codigoCrudo(c: Celda | undefined): string | null {
  if (!llena(c) || c?.sinCalcular) return null;
  // Los ceros de adelante que muestra Excel (formato «000000»: 000123) son
  // parte del código: el sistema de caja lo exporta así (28).
  if (typeof c?.numero === 'number' && /^0\d+$/.test(c.texto)) return c.texto.slice(0, LARGOS_CATALOGO.codigo);
  if (typeof c?.numero === 'number' && Number.isInteger(c.numero) && c.numero >= 0) {
    return c.numero.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 }).slice(0, LARGOS_CATALOGO.codigo);
  }
  const t = limpiarNombre(txt(c));
  if (!t || RE_BASURA.test(t)) return null;
  return t.slice(0, LARGOS_CATALOGO.codigo);
}

/**
 * El código como texto: el número de la celda sin decimales ni notación
 * científica (01), con sus ceros de adelante (28). Un «7,79E+12» no es un
 * código: la fila se empareja por el nombre (22).
 */
function leerCodigo(c: Celda | undefined): string | null {
  const t = codigoCrudo(c);
  return t && !RE_CIENTIFICO.test(t) ? t : null;
}

/** Lo más que guarda la base en un monto: numeric(14,2) (122). */
const TOPE_MONTO = 1e12;

/** Una fila leída, con la tabla de donde salió y lo que decía su precio si no se entendió. */
interface FilaLeida extends FilaCatalogo {
  tabla: BloqueInterno;
  valorPrecio?: string;
}

/** Lo que se va juntando de una hoja (y se suma solo si la hoja se usa). */
interface Acumulado {
  sinNombre: ProblemaCatalogo[];
  montoInvalido: ProblemaCatalogo[];
  descartadas: { titulos: number; totales: number; notas: number };
  formulas: Set<string>;
  ocultasIncluidas: number;
  ocultasAfuera: number;
  largos: number;
}

const acumuladoVacio = (): Acumulado => ({
  sinNombre: [], montoInvalido: [], descartadas: { titulos: 0, totales: 0, notas: 0 }, formulas: new Set(), ocultasIncluidas: 0, ocultasAfuera: 0, largos: 0,
});

interface BloqueInterno extends BloqueCatalogo {
  filasLeidas: FilaLeida[];
  noUsadas: string[];
  alternos: string[];
  desconocidas: string[];
  conCosto: boolean;
  /** Tiene la fecha, el cliente o la factura de cada fila: un registro de ventas (14, 21). */
  registro: boolean;
  /** La columna de código que no se usa, o cuyos «7,79E+12» no se usan (22). */
  codigosRotos: { columna: string; cientificos: boolean } | null;
}

/**
 * ¿La columna de código está rota? (22). Excel la pasó a notación
 * científica en la mayoría de las filas, o el mismo código se repite en
 * productos distintos en muchas (el 7790000000000 de todas, o un «Cód.
 * rubro» que es el mismo para toda la sección). Un código repetido aislado
 * (08: el mismo código, otro nombre, más abajo) no la rompe: es un repetido.
 */
function columnaDeCodigoRota(datos: Fila[], k: number, colNombre: number): { rota: boolean; cientificos: number } {
  const porCodigo = new Map<string, { nombres: Set<string>; filas: number }>();
  let conCodigo = 0;
  let cientificos = 0;
  for (const f of datos) {
    const codigo = codigoCrudo(f[k]);
    if (!codigo) continue;
    conCodigo++;
    if (RE_CIENTIFICO.test(codigo) || RE_REDONDEADO.test(codigo)) cientificos++;
    const nombre = claveProducto(txt(f[colNombre]));
    if (!nombre) continue;
    const x = porCodigo.get(codigo) ?? { nombres: new Set<string>(), filas: 0 };
    x.nombres.add(nombre);
    x.filas++;
    porCodigo.set(codigo, x);
  }
  let deMas = 0;
  for (const x of porCodigo.values()) if (x.nombres.size > 1) deMas += x.filas - 1;
  const rota = conCodigo > 0 && (cientificos * 2 >= conCodigo || (deMas >= 3 && deMas * 10 >= conCodigo));
  return { rota, cientificos };
}

type MapeoAMano = Partial<Record<CampoCatalogo, number | null>> | undefined;

/** Lee una tabla: qué columna es cada dato y sus filas de datos, con lo que cada una tiene. */
function leerBloque(
  hoja: HojaPlanilla, enc: Encabezado | null, desdeFila: number, hastaFila: number,
  desdeCol: number, hastaCol: number, opciones: OpcionesCatalogo, acc: Acumulado,
): BloqueInterno {
  const filas = hoja.filas;
  const ocultas = new Set(hoja.filasOcultas ?? []);
  const colOcultas = new Set(hoja.columnasOcultas ?? []);
  const datos = filas.slice(desdeFila, hastaFila).map((f) => f.slice(desdeCol, hastaCol));
  const ancho = hastaCol - desdeCol;
  const stats = Array.from({ length: ancho }, (_, k) => estadisticas(datos, k));
  const titulos = enc ? enc.titulos : Array.from({ length: ancho }, () => '');
  const firma = enc ? `t:${titulos.map((t) => normalizarTitulo(t)).join('|')}` : `c:${hoja.nombre}:${desdeFila}`;
  const aMano: MapeoAMano = opciones.mapeo?.[firma];

  let mapeo: Partial<Record<CampoCatalogo, number>>;
  let reconocidos: Titulo[] = titulos.map(() => null);
  if (enc) {
    const m = mapeoPorTitulos(titulos, stats, aMano);
    mapeo = m.mapeo;
    reconocidos = m.reconocidos;
  } else {
    const m = mapeoPorContenido(stats, aMano);
    mapeo = m.mapeo;
    // De dos columnas de plata, la que casi siempre es mayor es el precio (17).
    const [a, b] = m.plata;
    if (a !== undefined && b !== undefined) {
      let mayorA = 0;
      let mayorB = 0;
      for (const f of datos) {
        const x = typeof f[a]?.numero === 'number' ? f[a]?.numero ?? null : leerMonto(txt(f[a]));
        const y = typeof f[b]?.numero === 'number' ? f[b]?.numero ?? null : leerMonto(txt(f[b]));
        if (x === null || y === null) continue;
        if (x > y) mayorA++; else if (y > x) mayorB++;
      }
      m.elegir('precio', mayorA >= mayorB ? a : b);
      m.elegir('costo', mayorA >= mayorB ? b : a);
    } else if (a !== undefined) {
      m.elegir('precio', a);
    }
    if (m.stock >= 0) m.elegir('stock', m.stock);
  }

  // Un registro de ventas (14, 21): la «Cantidad» de cada venta no es el stock.
  const esRegistro = titulos.some((t) => RE_REGISTRO.test(normalizarTitulo(t)));
  if (esRegistro && aMano?.stock === undefined) delete mapeo.stock;

  // Los códigos que Excel rompió (22): la columna entera, si casi toda está
  // rota (no se usa: los productos se emparejan por el nombre), o los
  // «7,79E+12» sueltos (leerCodigo los deja afuera). Elegida a mano, se usa.
  let codigosRotos: BloqueInterno['codigosRotos'] = null;
  if (mapeo.codigo !== undefined && mapeo.nombre !== undefined) {
    const k = mapeo.codigo;
    const { rota, cientificos } = columnaDeCodigoRota(datos, k, mapeo.nombre);
    if (rota && aMano?.codigo === undefined) {
      delete mapeo.codigo;
      codigosRotos = { columna: titulos[k] ?? '', cientificos: cientificos > 0 };
    } else if (cientificos > 0 && datos.some((f) => RE_CIENTIFICO.test(codigoCrudo(f[k]) ?? ''))) {
      codigosRotos = { columna: titulos[k] ?? '', cientificos: true };
    }
  }

  // Servicio o producto: lo dice el título del nombre; si no, la pestaña (20).
  const tituloNombre = mapeo.nombre !== undefined ? normalizarTitulo(titulos[mapeo.nombre]) : '';
  const diceServicio = /\b(?:servicio|servicios|servico|servicos|service|services)\b/.test(tituloNombre);
  const diceProducto = /\b(?:producto|productos|produto|produtos|articulo|articulos|mercaderia|mercadoria|product|products)\b/.test(tituloNombre);
  const servicio = diceServicio
    ? true
    : diceProducto || mapeo.stock !== undefined || mapeo.costo !== undefined
      ? false
      : opciones.tipo === 'servicios';

  // ¿Es una lista? Con nombre, y con precio o costo; o con stock o código si no es un registro (14).
  const esCatalogo = mapeo.nombre !== undefined && (mapeo.precio !== undefined || mapeo.costo !== undefined
    || ((mapeo.stock !== undefined || mapeo.codigo !== undefined) && !esRegistro));

  // El título de la tabla, justo arriba del encabezado: la categoría de lo que tiene (13).
  let titulo: string | null = null;
  if (enc && enc.fila > 0) {
    const arriba = filas[enc.fila - 1].slice(desdeCol, hastaCol).filter((c) => llena(c));
    if (arriba.length === 1 && !esNumero(arriba[0])) {
      const t = txt(arriba[0]);
      if (t.length <= 40 && !/\d/.test(t) && !tituloDeColumna(t) && !RE_NOTA.test(t) && !RE_BASURA.test(t)) titulo = t;
    }
  }

  // Lo que no se usó, y por qué: otro precio de venta se avisa; un título que
  // no se conoce también; lo que nunca es un dato (IVA, total) va callado.
  const usadas = new Set(Object.values(mapeo));
  const noUsadas: string[] = [];
  const alternos: string[] = [];
  const desconocidas: string[] = [];
  // Lo que pesa el precio elegido: el «c/IVA» (0,5) deja callado al que no dice nada (3b).
  const elegido = mapeo.precio !== undefined ? reconocidos[mapeo.precio] : null;
  const prioridadElegida = elegido && elegido !== 'nunca' && elegido.campo === 'precio' ? elegido.prioridad : 1;
  titulos.forEach((t, k) => {
    if (usadas.has(k) || !t || stats[k].llenas === 0) return;
    noUsadas.push(t);
    const r = reconocidos[k];
    // Otro precio que quedó afuera se avisa con su nombre: el mayorista, o el
    // «Venta» de una planilla donde «Precio» es lo que paga el negocio (pesan
    // lo mismo y ganó el primero). Si el precio ya se eligió a mano, no: ahí
    // el negocio ya decidió. El «sin IVA», el que no dice nada al lado de un
    // «c/IVA» o un «Valor» suelto tampoco: es el mismo precio, otra cuenta (19, 3b).
    if (r && r !== 'nunca' && r.campo === 'precio' && (r.alterno || (aMano?.precio === undefined && r.prioridad <= prioridadElegida && sirve('precio', stats[k])))) alternos.push(t);
    else if (r === null) desconocidas.push(t);
  });

  const bloque: BloqueInterno = {
    hoja: hoja.nombre, firma, desde: desdeFila + 1, hasta: hastaFila,
    columnas: titulos.map((t, k) => ({ titulo: t, ejemplo: stats[k].ejemplo, oculta: colOcultas.has(desdeCol + k) })),
    mapeo, sinEncabezado: !enc, servicio, esCatalogo, usado: false, titulo, filas: 0,
    filasLeidas: [], noUsadas, alternos, desconocidas, conCosto: mapeo.costo !== undefined,
    registro: esRegistro, codigosRotos,
  };
  if (!esCatalogo) return bloque;

  // El separador decimal, por columna (de los textos: un número de la celda no lo necesita).
  const decimales: Partial<Record<CampoCatalogo, ',' | '.' | null>> = {};
  for (const campo of ['costo', 'precio', 'stock', 'stock_minimo'] as CampoCatalogo[]) {
    const k = mapeo[campo];
    if (k === undefined) continue;
    const textos: string[] = [];
    for (const f of datos) if (f[k] && typeof f[k]?.numero !== 'number' && !f[k]?.sinCalcular) textos.push(txt(f[k]));
    decimales[campo] = separadorDeColumna(textos);
  }
  const monto = (f: Fila, campo: CampoCatalogo): { n: number | null; texto: string; sinCalcular: boolean } => {
    const k = mapeo[campo];
    if (k === undefined) return { n: null, texto: '', sinCalcular: false };
    const c = f[k];
    if (c?.sinCalcular) return { n: null, texto: '', sinCalcular: true };
    if (typeof c?.numero === 'number') return { n: leerMonto(c.numero), texto: txt(c), sinCalcular: false };
    const t = txt(c);
    return { n: leerMonto(t, decimales[campo] ?? undefined), texto: t, sinCalcular: false };
  };

  let grupo: string | null = null;
  const leidas: { fila: FilaLeida; soloNombre: boolean }[] = [];
  const colNombre = mapeo.nombre as number;
  for (let i = 0; i < datos.length; i++) {
    const f = datos[i];
    const r = desdeFila + i;
    let primera: Celda = null;
    let cuantas = 0;
    for (const c of f) if (llena(c)) { cuantas++; if (!primera) primera = c; }
    if (!cuantas) continue;

    // Una sola celda de texto: un total, un subtítulo de grupo o una nota.
    if (cuantas === 1 && !esNumero(primera)) {
      const t = txt(primera);
      const k = f.indexOf(primera);
      if (RE_TOTAL.test(t)) { acc.descartadas.totales++; continue; }
      if ((k === colNombre || k === 0) && esSubtitulo(primera)) {
        grupo = t.replace(/:\s*$/, '').trim().slice(0, LARGOS_CATALOGO.categoria);
        acc.descartadas.titulos++;
        continue;
      }
      // Un texto suelto fuera de la columna del nombre (el «Resumen» de 13) tampoco es un producto.
      if (RE_NOTA.test(t) || t.length > 60 || k !== colNombre) { acc.descartadas.notas++; continue; }
    }

    let nombre = limpiarNombre(txt(f[colNombre]));
    if (RE_BASURA.test(nombre)) nombre = '';
    if (nombre && RE_TOTAL.test(nombre)) { acc.descartadas.totales++; continue; }

    const precio = monto(f, 'precio');
    const costo = monto(f, 'costo');
    const stock = monto(f, 'stock');
    const minimo = monto(f, 'stock_minimo');
    const codigo = mapeo.codigo !== undefined ? leerCodigo(f[mapeo.codigo]) : null;
    for (const [campo, m] of [['precio', precio], ['costo', costo], ['stock', stock]] as const) {
      const k = mapeo[campo];
      if (m.sinCalcular && k !== undefined) acc.formulas.add(titulos[k] || campo);
    }
    const conDatos = precio.n !== null || costo.n !== null || stock.n !== null || codigo !== null;

    if (!nombre) {
      // Sin nombre y con un precio o un código: no se sabe qué es (12).
      if (precio.n !== null || costo.n !== null || codigo !== null) {
        acc.sinNombre.push({ fila: r + 1, hoja: hoja.nombre, nombre: '', valor: codigo ?? (precio.texto || costo.texto || undefined) });
      } else {
        acc.descartadas.notas++;
      }
      continue;
    }
    if (nombre.length > LARGOS_CATALOGO.nombre) { nombre = nombre.slice(0, LARGOS_CATALOGO.nombre).trim(); acc.largos++; }

    // Un monto que la base no acepta (negativo, o de 1.000.000.000.000 o
    // más): no se carga y se dice acá. Antes pasaba la revisión («se carga
    // igual») y frenaba la tanda entera al guardar, siempre la misma (29).
    // Un servicio no lleva costo, stock ni mínimo: solo cuenta su precio.
    const montos = servicio ? [precio] : [precio, costo, minimo];
    let malo = montos.find((m) => m.n !== null && (m.n < 0 || m.n >= TOPE_MONTO));
    if (!malo && !servicio && stock.n !== null && Math.abs(stock.n) >= TOPE_MONTO) malo = stock;
    if (malo) {
      acc.montoInvalido.push({ fila: r + 1, hoja: hoja.nombre, nombre, valor: malo.texto || undefined });
      continue;
    }

    const categoriaCol = mapeo.categoria !== undefined ? limpiarNombre(txt(f[mapeo.categoria])) : '';
    const categoria = (categoriaCol && !RE_BASURA.test(categoriaCol) ? categoriaCol : '') || grupo || titulo || null;
    const unidad = mapeo.unidad !== undefined ? normalizarUnidad(txt(f[mapeo.unidad])) || null : null;

    const leida: FilaLeida = {
      fila: r + 1, hoja: hoja.nombre, codigo, nombre,
      categoria: categoria ? categoria.slice(0, LARGOS_CATALOGO.categoria) : null,
      costo: servicio ? null : costo.n,
      precio: precio.n,
      stock: servicio ? null : stock.n,
      stock_minimo: servicio ? null : minimo.n,
      unidad, servicio, tabla: bloque,
    };
    if (ocultas.has(r)) leida.oculta = true;
    if (precio.n === null && precio.texto) leida.valorPrecio = precio.texto;
    leidas.push({ fila: leida, soloNombre: !conDatos });
  }

  // Lo que queda abajo de todo con solo un nombre (una firma, una aclaración) no es un producto (03, 13).
  let ultimaConDatos = -1;
  leidas.forEach((l, i) => { if (!l.soloNombre) ultimaConDatos = i; });
  leidas.forEach((l, i) => {
    if (l.soloNombre && i > ultimaConDatos) { acc.descartadas.notas++; return; }
    if (l.fila.oculta && opciones.incluirOcultas === false) { acc.ocultasAfuera++; return; }
    if (l.fila.oculta) acc.ocultasIncluidas++;
    bloque.filasLeidas.push(l.fila);
  });
  return bloque;
}

/** Las tablas de una hoja. */
function tablasDeHoja(hoja: HojaPlanilla, opciones: OpcionesCatalogo, acc: Acumulado): BloqueInterno[] {
  const filas = hoja.filas;
  let ancho = 0;
  for (const f of filas) if (f.length > ancho) ancho = f.length;
  if (!ancho) return [];
  const encabezados = encabezadosDe(filas, ancho);
  if (!encabezados.length) {
    // Sin títulos (17): toda la hoja es una tabla, si tiene nombre y plata.
    if (filas.filter((f) => f.some((c) => llena(c))).length < 2) return [];
    const propio = acumuladoVacio();
    const b = leerBloque(hoja, null, 0, filas.length, 0, ancho, opciones, propio);
    // Sin nombre ni plata no es una lista (una portada, 02).
    if (!b.esCatalogo || b.mapeo.precio === undefined) return [];
    sumar(acc, propio);
    return [b];
  }
  return encabezados.map((e, i) => {
    // Hasta el próximo encabezado que pise sus columnas (20, y el «Resumen» de 13).
    const siguiente = encabezados.slice(i + 1).find((o) => o.fila > e.fila && o.desde < e.hasta && o.hasta > e.desde);
    return leerBloque(hoja, e, e.datos, siguiente ? siguiente.fila : filas.length, e.desde, e.hasta, opciones, acc);
  });
}

function sumar(a: Acumulado, b: Acumulado) {
  a.sinNombre.push(...b.sinNombre);
  a.montoInvalido.push(...b.montoInvalido);
  a.descartadas.titulos += b.descartadas.titulos;
  a.descartadas.totales += b.descartadas.totales;
  a.descartadas.notas += b.descartadas.notas;
  b.formulas.forEach((x) => a.formulas.add(x));
  a.ocultasIncluidas += b.ocultasIncluidas;
  a.ocultasAfuera += b.ocultasAfuera;
  a.largos += b.largos;
}

function lista(problemas: ProblemaCatalogo[]): ListaProblemas {
  return { cuantos: problemas.length, ejemplos: problemas.slice(0, 100) };
}

/**
 * Qué hace a una fila la misma que otra: el código (000123 y 123 son el
 * mismo, como en la base: `codigo_sin_ceros`), o sin código el nombre (la clave).
 */
export const claveDeFila = (f: Pick<FilaCatalogo, 'codigo' | 'nombre'>) => (f.codigo ? `c:${codigoSinCeros(f.codigo)}` : `n:${claveProducto(f.nombre)}`);

/**
 * Una hoja que por su nombre es un registro y no la lista: «Ventas», «Ventas
 * Septiembre», «Movimientos», «Registro de ventas» (21). «Precios de venta»
 * no: empieza por lo que es.
 */
const RE_HOJA_REGISTRO = /^(?:ventas?|vendas?|sales|movimientos?|movimentos?|registros?|historial|historico|facturas?|facturacion|faturamento|pedidos|transacciones|transacoes|diario|caja diaria)\b/;

/**
 * Lee la lista de productos de una planilla. `opciones`: lo que se tocó en la
 * revisión (hojas, columnas, filas ocultas, la pestaña). Es puro y rápido
 * (20.000 filas en una fracción de segundo): la revisión lo vuelve a correr
 * con cada cambio.
 */
export function leerCatalogo(libro: LibroPlanilla, opciones: OpcionesCatalogo = {}): ResultadoCatalogo {
  const hojasLibro = (libro?.hojas ?? []).slice(0, 20);

  const principalDe = (bs: BloqueInterno[]) => {
    let mejor: BloqueInterno | null = null;
    for (const b of bs) if (b.esCatalogo && (!mejor || b.filasLeidas.length > mejor.filasLeidas.length)) mejor = b;
    return mejor;
  };
  const firmaDe = (bs: BloqueInterno[]) => principalDe(bs)?.firma ?? '';

  // Cada hoja, una vez: sus tablas y lo que juntó.
  const leidas = hojasLibro.map((h) => {
    const acc = acumuladoVacio();
    const bloques = tablasDeHoja(h, opciones, acc);
    const deLista = bloques.filter((b) => b.esCatalogo);
    const filas = deLista.reduce((s, b) => s + b.filasLeidas.length, 0);
    // Los productos DISTINTOS: un registro de ventas repite el mismo muchas veces (21).
    const distintos = new Set(deLista.flatMap((b) => b.filasLeidas.map(claveDeFila))).size;
    // Un registro: su tabla tiene la fecha o el cliente de cada fila, o la hoja se llama «Ventas» (21).
    const nombre = plegar(h.nombre).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const registro = !!principalDe(bloques)?.registro || RE_HOJA_REGISTRO.test(nombre);
    return { hoja: h, acc, bloques, filas, distintos, registro, esLista: filas > 0 };
  });

  // Por defecto: la de más productos distintos, y las que tienen su mismo
  // encabezado (02). Una «copia» o «viejo», no. Un registro de ventas
  // tampoco, si hay otra lista: tiene precio, y crece todos los días hasta
  // tener más filas que el catálogo; elegido, el precio salía de la venta y el
  // stock de lo vendido (21). Con los chips se puede sumar igual.
  const vieja = (nombre: string) => RE_HOJA_VIEJA.test(plegar(nombre));
  const candidatas = leidas.filter((x) => x.esLista);
  let elegibles = candidatas.filter((x) => !vieja(x.hoja.nombre));
  if (!elegibles.length) elegibles = candidatas;
  const listas = elegibles.filter((x) => !x.registro);
  if (listas.length) elegibles = listas;
  const mayor = elegibles.reduce<typeof leidas[number] | null>((m, x) => (!m || x.distintos > m.distintos ? x : m), null);
  const firmaMayor = mayor ? firmaDe(mayor.bloques) : '';
  const conRegistros = !!mayor?.registro;
  const usada = leidas.map((x) => {
    if (!x.esLista) return false;
    if (opciones.hojas && x.hoja.nombre in opciones.hojas) return !!opciones.hojas[x.hoja.nombre];
    if (x === mayor) return true;
    return !vieja(x.hoja.nombre) && (!x.registro || conRegistros) && firmaDe(x.bloques) === firmaMayor;
  });
  // Las listas de verdad (sin los registros): con dos o más, el nombre de la hoja es la categoría (02).
  const cuantasListas = leidas.filter((x) => x.esLista && !x.registro).length;

  // Lo de las hojas usadas: sus filas (con el nombre de la hoja como
  // categoría, si hay varias listas y la hoja no se llama «Hoja1», 02; un
  // registro sumado con los chips no le pone «Ventas» a nadie, 21).
  const acc = acumuladoVacio();
  const todas: FilaLeida[] = [];
  const bloques: BloqueInterno[] = [];
  leidas.forEach((x, i) => {
    const generica = RE_HOJA_GENERICA.test(plegar(x.hoja.nombre).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim());
    const categoriaHoja = cuantasListas >= 2 && !generica && !x.registro ? limpiarNombre(x.hoja.nombre).slice(0, LARGOS_CATALOGO.categoria) : null;
    for (const b of x.bloques) {
      b.usado = usada[i] && b.esCatalogo;
      bloques.push(b);
      if (!b.usado) continue;
      for (const f of b.filasLeidas) {
        if (!f.categoria && categoriaHoja) f.categoria = categoriaHoja;
        todas.push(f);
      }
    }
    if (usada[i]) sumar(acc, x.acc);
  });

  // Los repetidos: queda el último, que es lo corregido más abajo (08).
  const claves = todas.map(claveDeFila);
  const ultima = new Map<string, number>();
  claves.forEach((c, i) => ultima.set(c, i));
  const repetidos: ProblemaCatalogo[] = [];
  const productos: FilaCatalogo[] = [];
  const sinPrecio: FilaCatalogo[] = [];
  const problemasSinPrecio: ProblemaCatalogo[] = [];
  const menorCosto: ProblemaCatalogo[] = [];
  const porTabla = new Map<BloqueInterno, number>();
  todas.forEach((f, i) => {
    const queda = ultima.get(claves[i]) as number;
    if (queda !== i) {
      repetidos.push({ fila: f.fila, hoja: f.hoja, nombre: f.nombre, valor: f.codigo ?? undefined, queda: { fila: todas[queda].fila, hoja: todas[queda].hoja } });
      return;
    }
    porTabla.set(f.tabla, (porTabla.get(f.tabla) ?? 0) + 1);
    const fila: FilaCatalogo = {
      fila: f.fila, hoja: f.hoja, codigo: f.codigo, nombre: f.nombre, categoria: f.categoria, costo: f.costo,
      precio: f.precio, stock: f.stock, stock_minimo: f.stock_minimo, unidad: f.unidad, servicio: f.servicio,
    };
    if (f.oculta) fila.oculta = true;
    if (fila.precio === null) {
      sinPrecio.push(fila);
      problemasSinPrecio.push({ fila: f.fila, hoja: f.hoja, nombre: f.nombre, valor: f.valorPrecio });
      return;
    }
    if (fila.costo !== null && fila.precio < fila.costo) menorCosto.push({ fila: f.fila, hoja: f.hoja, nombre: f.nombre, costo: fila.costo, precio: fila.precio });
    productos.push(fila);
  });

  // Los avisos.
  const usados = bloques.filter((b) => b.usado);
  const sinRepetir = (xs: string[]) => [...new Set(xs)];
  const avisos: AvisoCatalogo[] = [];
  const alternos = sinRepetir(usados.flatMap((b) => b.alternos));
  if (alternos.length) avisos.push({ codigo: 'otro_precio_no_usado', columnas: alternos });
  const desconocidas = sinRepetir(usados.flatMap((b) => b.desconocidas));
  if (desconocidas.length) avisos.push({ codigo: 'datos_no_usados', columnas: desconocidas });
  const deProductos = usados.filter((b) => !b.servicio && b.filasLeidas.length);
  if (deProductos.length && !deProductos.some((b) => b.conCosto)) avisos.push({ codigo: 'sin_costo' });
  if (acc.formulas.size) avisos.push({ codigo: 'formulas_sin_calcular', columnas: [...acc.formulas] });
  if (acc.ocultasIncluidas) avisos.push({ codigo: 'filas_ocultas', cuantas: acc.ocultasIncluidas, incluidas: true });
  else if (acc.ocultasAfuera) avisos.push({ codigo: 'filas_ocultas', cuantas: acc.ocultasAfuera, incluidas: false });
  if (usados.some((b) => b.sinEncabezado)) avisos.push({ codigo: 'sin_encabezado' });
  if (leidas.some((x, i) => usada[i] && x.hoja.recortada)) avisos.push({ codigo: 'recortada' });
  if (acc.largos) avisos.push({ codigo: 'nombre_largo', cuantos: acc.largos });
  const rotos = usados.flatMap((b) => (b.codigosRotos ? [b.codigosRotos] : []));
  if (rotos.length) {
    avisos.push({ codigo: 'codigos_no_usados', columnas: sinRepetir(rotos.map((x) => x.columna).filter(Boolean)), cientificos: rotos.some((x) => x.cientificos) });
  }

  return {
    hojas: leidas.map((x, i) => ({ nombre: x.hoja.nombre, usada: usada[i], esCatalogo: x.esLista, filas: x.filas })),
    bloques: bloques.map((b) => ({
      hoja: b.hoja, firma: b.firma, desde: b.desde, hasta: b.hasta, columnas: b.columnas, mapeo: b.mapeo,
      sinEncabezado: b.sinEncabezado, servicio: b.servicio, esCatalogo: b.esCatalogo, usado: b.usado, titulo: b.titulo,
      filas: b.usado ? porTabla.get(b) ?? 0 : b.filasLeidas.length,
    })),
    productos,
    sinPrecio,
    problemas: {
      sin_nombre: lista(acc.sinNombre),
      sin_precio: lista(problemasSinPrecio),
      precio_menor_costo: lista(menorCosto),
      repetidos: lista(repetidos),
      monto_invalido: lista(acc.montoInvalido),
    },
    descartadas: acc.descartadas,
    columnasNoUsadas: sinRepetir(usados.flatMap((b) => b.noUsadas)),
    avisos,
  };
}

/** Lo que viaja a `importar_productos` de cada fila (sin la hoja ni la marca de oculta). */
export interface FilaParaGuardar {
  fila: number;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  costo: number | null;
  precio: number | null;
  stock: number | null;
  stock_minimo: number | null;
  unidad: string | null;
  servicio: boolean;
}

export function filaParaGuardar(f: FilaCatalogo): FilaParaGuardar {
  return {
    fila: f.fila, codigo: f.codigo, nombre: f.nombre, categoria: f.categoria, costo: f.costo, precio: f.precio,
    stock: f.stock, stock_minimo: f.stock_minimo, unidad: f.unidad, servicio: f.servicio,
  };
}

/** Cuántas filas entran en una tanda de `importar_productos` (= `tope_importar_productos()` de la 122). */
export const TANDA_IMPORTAR = 1000;
/** Cuántas filas se cotejan por pedido (= el tope de `cotejar_productos`). */
export const TANDA_COTEJAR = 5000;
