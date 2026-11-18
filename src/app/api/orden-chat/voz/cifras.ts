// La transcripción a veces escribe los montos en letras («veinticinco mil»);
// la app entiende cifras, así que se pasan a número («25000»). «Palos» y
// «medio» quedan como están: la app ya los entiende («2 palos», «medio palo»).
const VALOR: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
};
const sinTilde = (p: string) => p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const esNumero = (p: string) => sinTilde(p) in VALOR;
const esEscala = (p: string) => ['mil', 'millon', 'millones'].includes(sinTilde(p));

export function numerosEnCifras(texto: string): string {
  const partes = texto.split(/(\s+)/); // conserva los espacios
  const palabras = partes.map((p) => p.replace(/[.,;:!?¿¡]+$/, ''));
  const salida: string[] = [];
  let i = 0;
  while (i < partes.length) {
    const p = palabras[i];
    // Una corrida de números: «ciento cincuenta mil», «dos millones quinientos mil», «treinta y cinco mil».
    // «un»/«una» solos no cuentan («un almuerzo»), solo si sigue otro número («un millón»).
    const sigue = (k: number) => palabras[k + 2] ?? '';
    // «mil» suelto cuenta como 1000 («mil de pan»), pero no después de una cifra («25 mil» queda igual).
    const milSuelto = sinTilde(p ?? '') === 'mil' && !/\d$/.test(palabras[i - 2] ?? '');
    const arranca = p && (milSuelto || (esNumero(p) && (!['un', 'una'].includes(sinTilde(p)) || esNumero(sigue(i)) || esEscala(sigue(i)))));
    if (!arranca) {
      salida.push(partes[i]);
      i++;
      continue;
    }
    let total = 0;
    let grupo = 0;
    let j = i;
    let fin = i;
    while (j < partes.length) {
      const w = palabras[j];
      if (/^\s+$/.test(partes[j])) { j++; continue; }
      const s = sinTilde(w);
      if (esNumero(w)) grupo += VALOR[s];
      else if (s === 'mil') { total += (grupo || 1) * 1000; grupo = 0; }
      else if (s === 'millon' || s === 'millones') { total += (grupo || 1) * 1_000_000; grupo = 0; }
      else if (s === 'y' && esNumero(sigue(j))) { j++; continue; }
      else break;
      fin = j;
      // La puntuación al final de una palabra corta la corrida («…mil, y…»).
      if (partes[j] !== w) break;
      j++;
    }
    const resto = partes[fin].slice(palabras[fin].length); // puntuación pegada a la última palabra
    salida.push(String(total + grupo) + resto);
    i = fin + 1;
  }
  return salida.join('');
}
