/**
 * Las librerías puras del campo (100): `src/lib/agricultura.ts` y
 * `src/lib/liquidacion.ts`, sobre `.compilado/`.
 *
 * Lo que importa acá:
 *
 *   · la campaña sugerida tiene que ser la que dice el productor para esa
 *     fecha («Zafra 2026/27» en octubre, «Safrinha 27» en febrero);
 *   · la conversión de moneda que la persona escribe («el dólar está a
 *     6.000») tiene que dar el mismo número en las dos direcciones: 2.400.000
 *     guaraníes son 400 dólares, y 400 dólares son 2.400.000 guaraníes;
 *   · un reparto, sea de un gasto entre campañas o de un papel de la
 *     cooperativa entre dos lotes, suma EXACTO lo que se repartió. Nunca
 *     aparece un centavo ni desaparece uno;
 *   · el ejemplo canónico del contrato (5.8) cuadra peso por peso: 30.000
 *     kg a 415 → bruto 12.450, descuentos 1.040, deuda 4.800, grano 4.980,
 *     neto 1.630;
 *   · el año seco: si el silo descontó más que el bruto, no se manda un
 *     neto negativo; se topa lo compensado de las deudas y lo que falta
 *     sigue como deuda.
 */
const A = require('../.compilado/agricultura.js');
const L = require('../.compilado/liquidacion.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a.length > 140 ? a.slice(0, 137) + '...' : a);
}
const suma = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

// ═══════════════════════════════════════════════════════════
console.log('\n── 1 · La campaña sugerida por la fecha ──');
{
  ok('octubre es la zafra que cruza el año', A.sugerirCampana('2026-10-15', 'es'), 'Zafra 2026/27');
  ok('septiembre ya es zafra', A.sugerirCampana('2026-09-01', 'es'), 'Zafra 2026/27');
  ok('diciembre también', A.sugerirCampana('2026-12-31', 'es'), 'Zafra 2026/27');
  ok('en portugués, corta', A.sugerirCampana('2026-10-15', 'pt'), 'Safra 26/27');
  ok('enero es la zafriña del año en curso', A.sugerirCampana('2027-01-20', 'es'), 'Zafriña 2027');
  ok('marzo también', A.sugerirCampana('2027-03-31', 'es'), 'Zafriña 2027');
  ok('safrinha en portugués', A.sugerirCampana('2027-02-10', 'pt'), 'Safrinha 27');
  ok('abril es invierno', A.sugerirCampana('2027-04-01', 'es'), 'Invierno 2027');
  ok('agosto también', A.sugerirCampana('2027-08-31', 'es'), 'Invierno 2027');
  ok('inverno en portugués', A.sugerirCampana('2027-06-15', 'pt'), 'Inverno 27');
  ok('el cambio de siglo no rompe el corto', A.sugerirCampana('2099-10-01', 'pt'), 'Safra 99/00');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 2 · Cultivos y sacas ──');
{
  ok('ocho cultivos, «otro» al final', A.CULTIVOS.map((c) => c.clave),
    ['soja', 'maiz', 'trigo', 'sesamo', 'mandioca', 'cana', 'hortalizas', 'otro']);
  ok('soja, maíz y trigo hablan en sacas', A.CULTIVOS.filter((c) => c.sacas).map((c) => c.clave), ['soja', 'maiz', 'trigo']);
  ok('600 kg/ha son 10 sacas', A.sacasPorHa(600), 10);
  ok('3.006 kg/ha son 50,1 sacas', A.sacasPorHa(3006), 50.1);
  ok('573 kg/ha son 9,6 sacas (un decimal)', A.sacasPorHa(573), 9.6);
  ok('una clave desconocida cae en «otro»', A.cultivoDe('marciano').clave, 'otro');
  ok('el nombre guardado vuelve a su ficha, en los dos idiomas',
    [A.cultivoPorNombre('Soja').clave, A.cultivoPorNombre('milho').clave, A.cultivoPorNombre('Gergelim').clave, A.cultivoPorNombre('').clave],
    ['soja', 'maiz', 'sesamo', 'otro']);
  ok('el nombre en portugués', A.nombreCultivo('sesamo', 'pt'), 'Gergelim');
  ok('y en cualquier otro idioma, español', A.nombreCultivo('maiz', 'en'), 'Maíz');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 3 · El precio en la unidad de cada uno ──');
{
  ok('en dólares se habla por tonelada', A.unidadDePrecio('USD'), 't');
  ok('en guaraníes, por kilo', A.unidadDePrecio('PYG'), 'kg');
  ok('reales, pesos y euros, por tonelada', ['BRL', 'ARS', 'EUR'].map(A.unidadDePrecio), ['t', 't', 't']);
  ok('415 US$/t se guarda tal cual', A.precioPorTonelada(415, 't'), 415);
  ok('2.500 Gs/kg se guarda por tonelada', A.precioPorTonelada(2500, 'kg'), 2500000);
  ok('y vuelve por kilo', A.precioEnUnidad(2500000, 'kg'), 2500);
  ok('ida y vuelta con decimales', A.precioEnUnidad(A.precioPorTonelada(0.415, 'kg'), 'kg'), 0.415);
  ok('ida y vuelta por tonelada', A.precioEnUnidad(A.precioPorTonelada(415.5, 't'), 't'), 415.5);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 4 · La otra moneda y el cambio en las dos direcciones ──');
{
  ok('la otra del guaraní es el dólar', A.otraMoneda('PYG'), 'USD');
  ok('la otra del dólar es el guaraní', A.otraMoneda('USD'), 'PYG');
  ok('la otra de cualquier otra también es el guaraní', A.otraMoneda('BRL'), 'PYG');

  // Negocio en dólares que pagó 2.400.000 guaraníes con el dólar a 6.000.
  const c1 = A.cambioDesde('USD', 'PYG', 6000);
  ok('negocio USD, pagó en Gs: el cambio es 1/6.000 con diez decimales', c1, 0.0001666667);
  ok('2.400.000 al 6.000 son 400 dólares', A.convertir(2400000, c1), 400);
  ok('convertirDesde junta las dos cosas', A.convertirDesde('USD', 'PYG', 2400000, 6000), { monto: 400, cambio: 0.0001666667 });

  // Negocio en guaraníes que pagó 400 dólares.
  const c2 = A.cambioDesde('PYG', 'USD', 6000);
  ok('negocio PYG, pagó en US$: el cambio es el dólar tal cual', c2, 6000);
  ok('400 dólares son 2.400.000 guaraníes', A.convertir(400, c2), 2400000);

  ok('otra pareja: se escribe directo cuántos propia vale 1 original', A.cambioDesde('BRL', 'USD', 5.2), 5.2);
  ok('y se redondea a dos decimales', A.convertir(100, 5.237), 523.7);
  ok('un cambio con ruido de coma flotante redondea bien', A.convertir(1.005, 1), 1.01);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 5 · Avisos en los bordes: avisan, y bloquean solo lo imposible ──');
{
  ok('3.000 ha no avisa', A.avisoHectareas(3000), 'ok');
  ok('3.001 ha avisa', A.avisoHectareas(3001), 'aviso');
  ok('0 ha bloquea (la base lo rechaza)', A.avisoHectareas(0), 'bloqueo');
  ok('más de 50.000 bloquea (el check)', A.avisoHectareas(50001), 'bloqueo');

  ok('soja a 500 kg/ha no avisa', A.avisoRinde('soja', 500), 'ok');
  ok('soja a 499 avisa', A.avisoRinde('soja', 499), 'aviso');
  ok('soja a 5.000 no avisa', A.avisoRinde('soja', 5000), 'ok');
  ok('soja a 5.001 avisa', A.avisoRinde('soja', 5001), 'aviso');
  ok('maíz a 9.000 no avisa', A.avisoRinde('maiz', 9000), 'ok');
  ok('sésamo a 1.501 avisa', A.avisoRinde('sesamo', 1501), 'aviso');
  ok('sésamo a 100 no avisa: un año seco no es un error', A.avisoRinde('sesamo', 100), 'ok');
  ok('la caña no tiene rango: 56.000 no avisa', A.avisoRinde('cana', 56000), 'ok');
  ok('sin rinde todavía, nada', A.avisoRinde('soja', 0), 'ok');

  ok('soja a 250 no avisa', A.avisoPrecio('soja', 250), 'ok');
  ok('soja a 249 avisa', A.avisoPrecio('soja', 249), 'aviso');
  ok('soja a 600 no avisa', A.avisoPrecio('soja', 600), 'ok');
  ok('soja a 601 avisa', A.avisoPrecio('soja', 601), 'aviso');
  ok('precio negativo bloquea', A.avisoPrecio('soja', -1), 'bloqueo');
  ok('el maíz no tiene rango', A.avisoPrecio('maiz', 5000), 'ok');

  ok('humedad 25 no avisa', A.avisoHumedad(25), 'ok');
  ok('25,1 avisa', A.avisoHumedad(25.1), 'aviso');
  ok('41 bloquea', A.avisoHumedad(41), 'bloqueo');
  ok('4 bloquea', A.avisoHumedad(4), 'bloqueo');

  ok('dólar a 5.000 no avisa', A.avisoDolar(5000), 'ok');
  ok('dólar a 9.000 no avisa', A.avisoDolar(9000), 'ok');
  ok('dólar a 4.999 avisa', A.avisoDolar(4999), 'aviso');
  ok('dólar a 9.001 avisa', A.avisoDolar(9001), 'aviso');
  ok('dólar a 3.000 avisa (no bloquea)', A.avisoDolar(3000), 'aviso');
  ok('dólar a 2.999 bloquea', A.avisoDolar(2999), 'bloqueo');
  ok('dólar a 20.000 avisa', A.avisoDolar(20000), 'aviso');
  ok('dólar a 20.001 bloquea', A.avisoDolar(20001), 'bloqueo');
  ok('60.000 (un cero de más) bloquea', A.avisoDolar(60000), 'bloqueo');
  ok('nada escrito bloquea', A.avisoDolar(NaN), 'bloqueo');
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 6 · Merma y retención ──');
{
  ok('30.000 brutos y 28.665 netos: merma 4,5 %', A.merma(30000, 28665), 4.5);
  ok('sin brutos no hay merma', A.merma(null, 28665), null);
  ok('brutos en cero tampoco', A.merma(0, 100), null);
  ok('la retención sugerida es el 1,5 % del bruto', A.retencionSugerida(12450), 186.75);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 7 · Repartir un gasto entre campañas por hectáreas ──');
{
  const campanas = [
    { id: 'norte', hectareas: 50 },
    { id: 'sur', hectareas: 30 },
    { id: 'este', hectareas: 20 },
  ];
  const r = A.repartirPorHectareas(1000, campanas);
  ok('proporcional a las hectáreas', r, [{ id: 'norte', monto: 500 }, { id: 'sur', monto: 300 }, { id: 'este', monto: 200 }]);
  ok('Σ exacta', suma(r.map((x) => x.monto)), 1000);

  // 100 entre tres partes iguales: 33,33 + 33,33 + 33,33 = 99,99; el centavo va a la más grande.
  const r2 = A.repartirPorHectareas(100, [{ id: 'a', hectareas: 10 }, { id: 'b', hectareas: 10.5 }, { id: 'c', hectareas: 10 }]);
  ok('el resto del redondeo va a la más grande', r2.find((x) => x.id === 'b').monto > r2.find((x) => x.id === 'a').monto, true);
  ok('y la suma sigue exacta', suma(r2.map((x) => x.monto)), 100);

  // Con pesos iguales, el resto va a la primera.
  const r3 = A.repartirPorHectareas(100, [{ id: 'a', hectareas: 10 }, { id: 'b', hectareas: 10 }, { id: 'c', hectareas: 10 }]);
  ok('pesos iguales: 33,34 + 33,33 + 33,33', r3.map((x) => x.monto), [33.34, 33.33, 33.33]);

  // Si alguna no tiene hectáreas, en partes iguales.
  const r4 = A.repartirPorHectareas(90, [{ id: 'a', hectareas: 50 }, { id: 'b', hectareas: null }, { id: 'c', hectareas: 20 }]);
  ok('sin hectáreas en alguna: partes iguales', r4.map((x) => x.monto), [30, 30, 30]);

  ok('una sola campaña se lleva todo', A.repartirPorHectareas(123.45, [{ id: 'a', hectareas: 7 }]), [{ id: 'a', monto: 123.45 }]);
  ok('ninguna campaña: nada', A.repartirPorHectareas(100, []), []);

  // Muchos centavos raros: la suma nunca se mueve.
  const r5 = A.repartirPorHectareas(3333.33, [{ id: 'a', hectareas: 17 }, { id: 'b', hectareas: 23 }, { id: 'c', hectareas: 7 }, { id: 'd', hectareas: 1 }]);
  ok('centavos raros, Σ exacta', suma(r5.map((x) => x.monto)), 3333.33);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 8 · El ejemplo canónico del contrato (5.8), peso por peso ──');
{
  const papel = {
    fecha: '2027-04-12',
    comprador: 'Cooperativa',
    precioTonelada: 415,
    descuentos: [
      { categoria: 'Secado y acopio', monto: 502 },
      { categoria: 'Fletes', monto: 360 },
      { categoria: 'Retención de IVA', monto: 178 },
    ],
    deudas: [{ deuda_id: 'agrofertil', lote_id: 'norte', monto: 4800 }],
    grano: [{ categoria: 'Arrendamiento', monto: 4980, descripcion: '12.000 kg del dueño a 0,415' }],
    partesKg: [{ lote_id: 'norte', kg: 30000 }],
  };
  ok('el bruto de 30.000 kg a 415', L.brutoDe(30000, 415), 12450);
  ok('el neto del papel', L.netoDe(papel), 1630);

  const r = L.repartirLiquidacion(papel);
  ok('totales del papel', [r.bruto, r.descuentos, r.compensado, r.grano, r.neto], [12450, 1040, 4800, 4980, 1630]);
  ok('una sola parte, con la forma exacta de p_partes', r.partes, [{
    lote_id: 'norte',
    kg: 30000,
    descuentos: [
      { categoria: 'Secado y acopio', monto: 502 },
      { categoria: 'Fletes', monto: 360 },
      { categoria: 'Retención de IVA', monto: 178 },
    ],
    deudas: [{ deuda_id: 'agrofertil', monto: 4800 }],
    grano: [{ categoria: 'Arrendamiento', monto: 4980, descripcion: '12.000 kg del dueño a 0,415' }],
  }]);
  ok('los números de la parte', r.porParte, [{ lote_id: 'norte', kg: 30000, bruto: 12450, descuentos: 1040, compensado: 4800, grano: 4980, neto: 1630 }]);
  ok('cuadraba: topar no cambia nada', L.toparCompensaciones(papel), { papel, sinCompensar: [], neto: 1630 });
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 9 · Dos campañas en un papel: Σ de las partes = el papel ──');
{
  const papel = {
    fecha: '2027-04-12',
    comprador: 'Cooperativa',
    precioTonelada: 415,
    descuentos: [
      { categoria: 'Secado y acopio', monto: 502 },
      { categoria: 'Fletes', monto: 360 },
      { categoria: 'Retención de IVA', monto: 178 },
    ],
    deudas: [
      { deuda_id: 'agrofertil', lote_id: 'norte', monto: 4800 },
      { deuda_id: 'gasoil', lote_id: 'sur', monto: 100 },
      { deuda_id: 'vieja', lote_id: null, monto: 50 },
    ],
    grano: [{ categoria: 'Arrendamiento', monto: 4980, descripcion: '12.000 kg del dueño a 0,415' }],
    partesKg: [{ lote_id: 'norte', kg: 20000 }, { lote_id: 'sur', kg: 10000 }],
  };
  const r = L.repartirLiquidacion(papel);
  const [norte, sur] = r.porParte;

  ok('cada campaña recibe su bruto', [norte.bruto, sur.bruto], [8300, 4150]);
  ok('el secado se prorratea por kilos, resto a la última', r.partes.map((p) => p.descuentos[0].monto), [334.67, 167.33]);
  ok('el flete también', r.partes.map((p) => p.descuentos[1].monto), [240, 120]);
  ok('la retención: 118,67 + 59,33', r.partes.map((p) => p.descuentos[2].monto), [118.67, 59.33]);
  ok('el grano también', r.partes.map((p) => p.grano[0].monto), [3320, 1660]);
  // Norte tiene 8.300 − 693,34 − 3.320 = 4.286,66 de lugar: la deuda de
  // Agrofértil lo llena y el resto pasa a Sur. Entera en Norte (como era
  // antes) dejaba esa parte en −563 y la base rechazaba el papel.
  ok('cada deuda llena primero su campaña y lo que no entra pasa a la otra',
    r.partes.map((p) => p.deudas), [[{ deuda_id: 'agrofertil', monto: 4286.66 }],
      [{ deuda_id: 'agrofertil', monto: 513.34 }, { deuda_id: 'gasoil', monto: 100 }, { deuda_id: 'vieja', monto: 50 }]]);
  ok('ninguna parte queda en negativo', r.porParte.map((p) => p.neto), [0, 1480]);

  ok('Σ brutos = bruto del papel', suma([norte.bruto, sur.bruto]), r.bruto);
  ok('Σ descuentos = los del papel, peso por peso', suma([norte.descuentos, sur.descuentos]), 1040);
  ok('Σ compensado', suma([norte.compensado, sur.compensado]), 4950);
  ok('Σ grano', suma([norte.grano, sur.grano]), 4980);
  ok('Σ netos = neto del papel', suma([norte.neto, sur.neto]), r.neto);
  ok('y el neto del papel es bruto − todo', r.neto, 12450 - 1040 - 4950 - 4980);
  ok('cada parte cuadra sola (la constraint de la base)',
    r.porParte.every((p) => Math.abs(p.bruto - p.descuentos - p.compensado - p.grano - p.neto) < 0.01), true);
  ok('netoDe dice lo mismo', L.netoDe(papel), r.neto);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 10 · Centavos raros: nunca aparece ni desaparece uno ──');
{
  const papel = {
    fecha: '2027-04-12', comprador: 'Silo', precioTonelada: 0.415 * 1000,
    descuentos: [{ categoria: 'Secado y acopio', monto: 100 }, { categoria: 'Fletes', monto: 0.01 }],
    deudas: [],
    grano: [{ categoria: 'Arrendamiento', monto: 33.33, descripcion: '' }],
    partesKg: [{ lote_id: 'a', kg: 3333 }, { lote_id: 'b', kg: 3333 }, { lote_id: 'c', kg: 3334 }],
  };
  const r = L.repartirLiquidacion(papel);
  ok('Σ descuentos exacta', suma(r.partes.flatMap((p) => p.descuentos.map((d) => d.monto))), 100.01);
  ok('un descuento de un centavo no se parte en ceros: va entero a una parte',
    r.partes.flatMap((p) => p.descuentos.filter((d) => d.categoria === 'Fletes').map((d) => d.monto)), [0.01]);
  ok('ningún descuento en cero (la base lo rechaza)', r.partes.every((p) => p.descuentos.every((d) => d.monto > 0)), true);
  ok('Σ grano exacta', suma(r.partes.flatMap((p) => p.grano.map((g) => g.monto))), 33.33);
  ok('Σ netos = neto', suma(r.porParte.map((p) => p.neto)), r.neto);
}

// ═══════════════════════════════════════════════════════════
console.log('\n── 11 · El año seco: topar lo compensado ──');
{
  // Cosechó poco: 5.000 kg a 415 = 2.075 de bruto, y debía 4.800 a Agrofértil
  // más 1.000 al gasoil. Descuentos 300 y alquiler en grano 500.
  const papel = {
    fecha: '2027-04-12', comprador: 'Cooperativa', precioTonelada: 415,
    descuentos: [{ categoria: 'Secado y acopio', monto: 300 }],
    deudas: [
      { deuda_id: 'agrofertil', lote_id: 'norte', monto: 4800 },
      { deuda_id: 'gasoil', lote_id: 'norte', monto: 1000 },
    ],
    grano: [{ categoria: 'Arrendamiento', monto: 500, descripcion: '' }],
    partesKg: [{ lote_id: 'norte', kg: 5000 }],
  };
  ok('así como viene, el neto es negativo', L.netoDe(papel), 2075 - 300 - 5800 - 500);

  const t = L.toparCompensaciones(papel);
  ok('el neto topado es cero', t.neto, 0);
  ok('la primera deuda se lleva lo que hay (2.075 − 300 − 500 = 1.275)', t.papel.deudas, [{ deuda_id: 'agrofertil', lote_id: 'norte', monto: 1275 }]);
  ok('lo que faltó sigue como deuda, deuda por deuda',
    t.sinCompensar, [{ deuda_id: 'agrofertil', monto: 3525 }, { deuda_id: 'gasoil', monto: 1000 }]);
  ok('el papel topado se reparte y cuadra', L.repartirLiquidacion(t.papel).neto, 0);
  ok('descuentos y grano no se tocan', [t.papel.descuentos, t.papel.grano], [papel.descuentos, papel.grano]);
  ok('el original no se modificó', papel.deudas[0].monto, 4800);

  // Si descuentos + grano ya superan el bruto, no hay deuda que topar: el
  // neto sigue negativo y la pantalla lo dice.
  const peor = { ...papel, descuentos: [{ categoria: 'Secado y acopio', monto: 2000 }] };
  const t2 = L.toparCompensaciones(peor);
  ok('descuentos solos superan el bruto: todas las deudas a cero', t2.papel.deudas, []);
  ok('y el neto sigue negativo', t2.neto, 2075 - 2000 - 500);

  // Una parte justa: la deuda entra entera y el neto queda en cero (canje puro).
  const justo = { ...papel, deudas: [{ deuda_id: 'agrofertil', lote_id: 'norte', monto: 1275 }] };
  ok('neto cero exacto no se topa', L.toparCompensaciones(justo), { papel: justo, sinCompensar: [], neto: 0 });
}

// ------------------------------------------------------------
// El reparto no deja ninguna parte en negativo ni pierde centavos
// ------------------------------------------------------------
{
  // 0,05 entre diez partes, una de 1 kg: con «el resto a la última» salía
  // −0,04 en la chica y la suma daba 0,09.
  const partesKg = Array.from({ length: 9 }, (_, i) => ({ lote_id: 'l' + i, kg: 1000 })).concat([{ lote_id: 'chica', kg: 1 }]);
  const papel = { fecha: '2027-04-10', comprador: 'Coop', precioTonelada: 415,
    descuentos: [{ categoria: 'Fletes', monto: 0.05 }], deudas: [], grano: [], partesKg };
  const r = L.repartirLiquidacion(papel);
  const cuotas = r.partes.flatMap((x) => x.descuentos.map((d) => d.monto));
  ok('mayor resto: la suma es exactamente 0,05', suma(cuotas), 0.05);
  ok('mayor resto: ninguna cuota negativa', cuotas.every((c) => c > 0), true);

  // Una deuda de Norte en un papel donde Norte trae pocos kilos: no entra
  // entera en su parte (415 de bruto), el resto pasa a Sur y ninguna parte
  // queda en negativo. El papel entero cierra igual que antes.
  const dos = { fecha: '2027-04-10', comprador: 'Coop', precioTonelada: 415,
    descuentos: [], grano: [],
    deudas: [{ deuda_id: 'agrofertil', lote_id: 'norte', monto: 4800 }],
    partesKg: [{ lote_id: 'norte', kg: 1000 }, { lote_id: 'sur', kg: 29000 }] };
  const r2 = L.repartirLiquidacion(dos);
  ok('la deuda llena primero su campaña', r2.partes[0].deudas, [{ deuda_id: 'agrofertil', monto: 415 }]);
  ok('lo que no entra pasa a la otra', r2.partes[1].deudas, [{ deuda_id: 'agrofertil', monto: 4385 }]);
  ok('ninguna parte con neto negativo', r2.porParte.map((x) => x.neto), [0, 12035 - 4385]);
  ok('lo compensado en total es la deuda entera', r2.compensado, 4800);
  ok('y el neto del papel no cambia', r2.neto, 12450 - 4800);

  // Con descuentos, el lugar de cada parte es su bruto menos lo suyo.
  const conDesc = { ...dos, descuentos: [{ categoria: 'Secado y acopio', monto: 300 }] };
  const r3 = L.repartirLiquidacion(conDesc);
  ok('con descuentos: todas las partes en cero o más', r3.porParte.every((x) => x.neto >= 0), true);
  ok('con descuentos: el papel cierra', r3.neto, 12450 - 300 - 4800);
}

console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
