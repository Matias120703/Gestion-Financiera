/**
 * LAS MEDIDAS DEL CUERPO (098): el catálogo y las cuentas.
 *
 * Del pedido de Matías: «anotar los pesos» es, en esta vuelta, el peso, la
 * altura y las medidas del cuerpo con su fecha. Una fila de `mediciones` es
 * «el control del 22/09», y acá vive todo lo que se hace con esas filas sin
 * tocar la base: qué rango vale para cada medida, el IMC, cintura/altura y
 * la tarjeta «Inicio · Ahora · Diferencia».
 *
 * Los rangos son los MISMOS que los check de la migración 098. No están para
 * diagnosticar a nadie sino para atajar un error de tipeo («8,5» en vez de
 * «85») antes de mandar. Si se cambia uno acá, se cambia el check, y al
 * revés: la prueba de la base (pruebas/rutinas.test.js) lee este catálogo y
 * prueba el mínimo, el máximo y lo que queda justo afuera.
 *
 * Nada de lo que devuelve este archivo es un texto de pantalla: los nombres
 * de cada medida, de los métodos de grasa y de las categorías del IMC están
 * en el diccionario (t.rutinasComun). El progreso se muestra neutro («−4 cm»):
 * que un cambio sea bueno o malo depende del objetivo de cada persona, y eso
 * quedó fuera de la fase 1.
 *
 * Este archivo NO importa nada del servidor ni de React: se compila suelto
 * para las pruebas (ver "probar:calculos" en package.json).
 */
import type { ClaveMedida, MedidaDef, MetodoGrasa } from './tipos-rutinas';

/**
 * El catálogo, en el orden del formulario. Las 8 «por defecto» aparecen sin
 * tocar nada; pantorrilla y cuello van en «Más medidas».
 *
 * Todas se guardan con un decimal (numeric(4,1) y, la grasa, numeric(3,1)).
 */
export const MEDIDAS: MedidaDef[] = [
  { clave: 'peso_kg', unidad: 'kg', minimo: 20, maximo: 300, decimales: 1, porDefecto: true },
  { clave: 'altura_cm', unidad: 'cm', minimo: 100, maximo: 230, decimales: 1, porDefecto: true },
  { clave: 'cintura_cm', unidad: 'cm', minimo: 40, maximo: 200, decimales: 1, porDefecto: true },
  { clave: 'cadera_cm', unidad: 'cm', minimo: 50, maximo: 200, decimales: 1, porDefecto: true },
  { clave: 'pecho_cm', unidad: 'cm', minimo: 50, maximo: 180, decimales: 1, porDefecto: true },
  // Contraído: es como lo mide el trainer que busca ver el músculo.
  { clave: 'brazo_cm', unidad: 'cm', minimo: 15, maximo: 75, decimales: 1, porDefecto: true },
  { clave: 'muslo_cm', unidad: 'cm', minimo: 30, maximo: 110, decimales: 1, porDefecto: true },
  // Siempre con su método (balanza, plicómetro, cinta u otro): la base no
  // deja uno sin el otro, y dos métodos distintos no se comparan.
  { clave: 'grasa_pct', unidad: '%', minimo: 3, maximo: 70, decimales: 1, porDefecto: true },
  { clave: 'pantorrilla_cm', unidad: 'cm', minimo: 20, maximo: 70, decimales: 1, porDefecto: false },
  { clave: 'cuello_cm', unidad: 'cm', minimo: 25, maximo: 65, decimales: 1, porDefecto: false },
];

/** La definición de cada medida por su clave. */
export const MEDIDA: Record<ClaveMedida, MedidaDef> = MEDIDAS.reduce(
  (acc, m) => { acc[m.clave] = m; return acc; },
  {} as Record<ClaveMedida, MedidaDef>,
);

/** Los métodos del % de grasa: el check de `mediciones.grasa_metodo`. */
export const METODOS_GRASA: MetodoGrasa[] = ['balanza', 'plicometro', 'cinta', 'otro'];

/**
 * Redondea como lo hace la base al guardar en numeric: la mitad se aleja del
 * cero (−1,25 → −1,3, no −1,2 como haría Math.round).
 *
 * Se redondea sobre el número escrito en notación científica y no
 * multiplicando: 1,005 × 100 da 100,49999… en coma flotante y terminaría en
 * 1,00 en vez de 1,01.
 */
export function redondear(valor: number, decimales = 0): number {
  if (!Number.isFinite(valor)) return valor;
  const signo = valor < 0 ? -1 : 1;
  const abs = Math.abs(valor);
  let r: number;
  if (abs !== 0 && abs < 1e-6) {
    r = 0;
  } else {
    const escalado = Math.round(Number(`${abs}e${decimales}`));
    r = Number(`${escalado}e-${decimales}`);
    if (!Number.isFinite(r)) {
      const f = 10 ** decimales;
      r = Math.round(abs * f) / f;
    }
  }
  const final = signo * r;
  // Sin «−0»: se mostraría con signo.
  return final === 0 ? 0 : final;
}

/** Lo que se escribió en el campo, pasado a número. Acepta coma o punto. */
function aNumero(valor: number | string | null | undefined): number | null | 'invalido' {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 'invalido';
  const s = valor.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return 'invalido';
  return Number(s);
}

export type ValidacionMedida =
  /** `valor` ya redondeado como lo guarda la base; null si el campo quedó vacío (todas son optativas). */
  | { ok: true; valor: number | null }
  | { ok: false; motivo: 'no_es_numero' | 'bajo' | 'alto'; minimo: number; maximo: number };

/**
 * ¿La base va a aceptar este valor? Redondea primero, como hace la columna
 * antes de mirar el check: 19,96 kg se guarda 20,0 y vale; 19,94 no.
 */
export function validarMedida(clave: ClaveMedida, valor: number | string | null | undefined): ValidacionMedida {
  const def = MEDIDA[clave];
  if (!def) throw new Error(`Medida desconocida: ${clave}`);
  const n = aNumero(valor);
  if (n === null) return { ok: true, valor: null };
  if (n === 'invalido') return { ok: false, motivo: 'no_es_numero', minimo: def.minimo, maximo: def.maximo };
  const r = redondear(n, def.decimales);
  if (r < def.minimo) return { ok: false, motivo: 'bajo', minimo: def.minimo, maximo: def.maximo };
  if (r > def.maximo) return { ok: false, motivo: 'alto', minimo: def.minimo, maximo: def.maximo };
  return { ok: true, valor: r };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * El IMC: peso ÷ altura², con un decimal. Se redondea acá y la categoría se
 * saca de este mismo número, para que la pantalla nunca muestre «25,0 ·
 * Normal» por un 24,96 que se ve redondeado.
 */
export function imc(pesoKg: number | null | undefined, alturaCm: number | null | undefined): number | null {
  const p = num(pesoKg), a = num(alturaCm);
  if (p === null || a === null || p <= 0 || a <= 0) return null;
  const m = a / 100;
  return redondear(p / (m * m), 1);
}

export type CategoriaImc = 'bajo' | 'normal' | 'sobrepeso' | 'obesidad';

/**
 * Las categorías de la OMS para adultos: menos de 18,5 · hasta 24,9 · hasta
 * 29,9 · 30 o más. No valen para menores de 18 (la OMS usa percentiles) ni
 * distinguen músculo de grasa: la pantalla decide si la muestra.
 */
export function categoriaImc(valor: number | null | undefined): CategoriaImc | null {
  const v = num(valor);
  if (v === null || v <= 0) return null;
  if (v < 18.5) return 'bajo';
  if (v < 25) return 'normal';
  if (v < 30) return 'sobrepeso';
  return 'obesidad';
}

/**
 * Cintura ÷ altura, con dos decimales. Es el mejor indicador para un
 * trainer: el mismo corte para todos («tu cintura, menos de la mitad de tu
 * altura»: menos de 0,50).
 */
export function cinturaAltura(cintura: number | null | undefined, altura: number | null | undefined): number | null {
  const c = num(cintura), a = num(altura);
  if (c === null || a === null || c <= 0 || a <= 0) return null;
  return redondear(c / a, 2);
}

/** Cintura ÷ cadera, con dos decimales. Un dato chico, al costado. */
export function cinturaCadera(cintura: number | null | undefined, cadera: number | null | undefined): number | null {
  const c = num(cintura), k = num(cadera);
  if (c === null || k === null || c <= 0 || k <= 0) return null;
  return redondear(c / k, 2);
}

/**
 * Lo mínimo que hace falta de cada control: la fecha y las columnas que
 * tenga. `Medicion` (tipos-rutinas.ts) entra tal cual; los números pueden
 * llegar como texto si alguna vez viajan por un numeric sin convertir.
 */
export type ControlParaCuentas = { fecha: string; grasa_metodo?: MetodoGrasa | string | null }
  & Partial<Record<ClaveMedida, number | string | null>>;

/** Los controles de la fecha más vieja a la más nueva, sin tocar la lista original. */
function porFecha<T extends { fecha: string }>(mediciones: readonly T[]): T[] {
  return [...mediciones].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/**
 * El último valor de una medida: para el placeholder «la última: 78,4» y
 * para comparar al anotar. Con `antesDe`, el último anterior a esa fecha
 * (el control que se está editando no cuenta contra sí mismo).
 */
export function ultimoValor(
  mediciones: readonly ControlParaCuentas[],
  clave: ClaveMedida,
  antesDe?: string,
): { valor: number; fecha: string } | null {
  const lista = porFecha(mediciones);
  for (let i = lista.length - 1; i >= 0; i--) {
    const m = lista[i];
    if (antesDe && m.fecha >= antesDe) continue;
    const v = num(m[clave]);
    if (v !== null) return { valor: v, fecha: m.fecha };
  }
  return null;
}

export interface InicioAhora {
  inicio: number;
  ahora: number;
  /**
   * ahora − inicio, redondeada a los decimales de la medida. null cuando hay
   * un solo control con esa medida: no hay contra qué comparar, y un «0»
   * diría que no cambió.
   */
  diferencia: number | null;
  fechaInicio: string;
  fechaAhora: string;
  /** Solo en el % de grasa: el método de los dos controles comparados. */
  metodo?: MetodoGrasa | null;
}

export type ClaveProgreso = ClaveMedida | 'imc';

/**
 * La tarjeta «Inicio · Ahora · Diferencia» de cada medida que tenga datos.
 *
 * - «Inicio» es el primer control que tiene esa medida y «Ahora» el último
 *   que la tiene: si el último control fue solo de peso, la cintura sigue
 *   mostrando la del control anterior.
 * - La altura no es progreso: toma el último control que la tenga, en las
 *   dos puntas y sin diferencia. Un centímetro de más por un error de cinta
 *   no tiene que aparecer como «creció».
 * - El % de grasa compara solo controles del mismo método: «Ahora» es el
 *   último, e «Inicio» el primero hecho con el mismo método que ese. Una
 *   balanza y un plicómetro dan números distintos para el mismo cuerpo.
 * - El IMC sale del peso de cada punta con la altura del último control que
 *   la tenga.
 */
export function inicioContraAhora(
  mediciones: readonly ControlParaCuentas[],
): Partial<Record<ClaveProgreso, InicioAhora>> {
  const lista = porFecha(mediciones);
  const res: Partial<Record<ClaveProgreso, InicioAhora>> = {};

  for (const def of MEDIDAS) {
    const con = lista.filter((m) => num(m[def.clave]) !== null);
    if (con.length === 0) continue;
    const ultimo = con[con.length - 1];

    if (def.clave === 'altura_cm') {
      const v = num(ultimo.altura_cm) as number;
      res.altura_cm = { inicio: v, ahora: v, diferencia: null, fechaInicio: ultimo.fecha, fechaAhora: ultimo.fecha };
      continue;
    }

    let primero = con[0];
    let metodo: MetodoGrasa | null | undefined;
    if (def.clave === 'grasa_pct') {
      metodo = (ultimo.grasa_metodo ?? null) as MetodoGrasa | null;
      primero = con.find((m) => (m.grasa_metodo ?? null) === metodo) ?? ultimo;
    }

    const inicio = num(primero[def.clave]) as number;
    const ahora = num(ultimo[def.clave]) as number;
    const mismo = primero === ultimo;
    res[def.clave] = {
      inicio,
      ahora,
      diferencia: mismo ? null : redondear(ahora - inicio, def.decimales),
      fechaInicio: primero.fecha,
      fechaAhora: ultimo.fecha,
      ...(def.clave === 'grasa_pct' ? { metodo } : {}),
    };
  }

  const altura = res.altura_cm?.ahora ?? null;
  const peso = res.peso_kg;
  if (altura !== null && peso) {
    const i = imc(peso.inicio, altura), a = imc(peso.ahora, altura);
    if (i !== null && a !== null) {
      res.imc = {
        inicio: i,
        ahora: a,
        diferencia: peso.diferencia === null ? null : redondear(a - i, 1),
        fechaInicio: peso.fechaInicio,
        fechaAhora: peso.fechaAhora,
      };
    }
  }
  return res;
}

/**
 * ¿Pedir «¿Seguro?» antes de guardar? Cuando el valor nuevo se aleja mucho
 * del anterior, lo más probable es un error de tipeo («8,5» por «85»):
 * más de 5 kg de peso, más de 5 puntos de grasa, más de 3 cm de altura o
 * más del 10 % en un perímetro. No frena: solo pregunta.
 */
export function seAlejaMucho(clave: ClaveMedida, anterior: number | null | undefined, nuevo: number | null | undefined): boolean {
  const a = num(anterior), n = num(nuevo);
  if (a === null || n === null) return false;
  const dif = Math.abs(redondear(n - a, 1));
  if (clave === 'peso_kg') return dif > 5;
  if (clave === 'grasa_pct') return dif > 5;
  if (clave === 'altura_cm') return dif > 3;
  return a > 0 && dif / a > 0.1;
}
