/**
 * «ACTIVÁ LOS AVISOS» (23/09): cuándo aparece, a quién y qué le promete.
 *
 * La lógica es pura (lib/invitar-avisos.ts) y se prueba con números: los
 * tres días, el máximo de tres, el «nunca más» del bloqueo y la vez por
 * sesión sin localStorage. Lo que dice la hoja se lee de las fuentes: que
 * cada caso tenga su texto en español y en portugués, y que ningún ejemplo
 * prometa un aviso que no existe.
 */
const fs = require('fs');
const I = require('../.compilado/invitar-avisos.js');
const { fichaDe, LISTA_RUBROS } = require('../.compilado/rubros.js');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a);
}

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 8, 23, 15, 0, 0);
const vacio = { ...I.HISTORIAL_VACIO };
const debe = (estado, historial, ahora = AHORA, yaEnEstaSesion = false) =>
  I.debeInvitar({ estado, historial, ahora, yaEnEstaSesion });

// --- Solo cuando hay algo que hacer ---
{
  ok('apagado: se ofrece', debe('apagado', vacio), true);
  ok('iPhone sin instalar: se ofrece (con la guía)', debe('iphone-sin-instalar', vacio), true);
  for (const e of ['cargando', 'sin-configurar', 'no-soportado', 'bloqueado', 'encendido']) {
    ok(`${e}: no se ofrece`, debe(e, vacio), false);
  }
}

// --- Tres días entre una y otra ---
{
  const una = I.anotarInvitacion(vacio, AHORA);
  ok('anotar suma una vez y guarda cuándo', [una.veces, una.ultima], [1, AHORA]);
  ok('al rato, no', debe('apagado', una, AHORA + 60 * 1000), false);
  ok('a los 2 días y 23 horas, todavía no', debe('apagado', una, AHORA + 3 * DIA - 60 * 60 * 1000), false);
  ok('a los 3 días justos, sí', debe('apagado', una, AHORA + 3 * DIA), true);
  ok('la constante es 3', I.DIAS_ENTRE_INVITACIONES, 3);
}

// --- Tres veces como mucho ---
{
  let h = vacio;
  let t = AHORA;
  const mostradas = [];
  for (let i = 0; i < 6; i++) {
    if (debe('apagado', h, t)) { mostradas.push(i); h = I.anotarInvitacion(h, t); }
    t += 3 * DIA;
  }
  ok('en seis intentos a tres días, aparece solo tres veces', mostradas, [0, 1, 2]);
  ok('la tercera es la última', h.veces, 3);
  ok('a los 30 días de la tercera, igual no', debe('apagado', h, t + 30 * DIA), false);
  ok('el máximo es 3', I.MAXIMO_DE_INVITACIONES, 3);
}

// --- Bloqueado desde la hoja: nunca más ---
{
  const h = I.noVolverAInvitar(I.anotarInvitacion(vacio, AHORA));
  ok('bloqueada desde la hoja: ni a los 10 días, aunque el estado vuelva a apagado',
    debe('apagado', h, AHORA + 10 * DIA), false);
}

// --- Una vez por sesión, siempre ---
{
  ok('ya salió en esta sesión: no, aunque tenga permiso', debe('apagado', vacio, AHORA, true), false);
  ok('sin localStorage (null) y primera vez en la sesión: sí', debe('apagado', null), true);
  ok('sin localStorage y ya salió en la sesión: no', debe('apagado', null, AHORA, true), false);
}

// --- Lo guardado se lee sin confiar ---
{
  ok('nada guardado', I.leerHistorialInvitacion(null), vacio);
  ok('texto roto', I.leerHistorialInvitacion('{no es json'), vacio);
  ok('otro tipo', I.leerHistorialInvitacion('"hola"'), vacio);
  ok('números raros', I.leerHistorialInvitacion('{"veces":-4,"ultima":"ayer"}'), vacio);
  ok('lo bueno se respeta', I.leerHistorialInvitacion(JSON.stringify({ veces: 2, ultima: AHORA, nunca: false })),
    { veces: 2, ultima: AHORA, nunca: false });
  ok('«nunca» se respeta aunque lo demás esté roto', I.leerHistorialInvitacion('{"veces":"x","nunca":true}').nunca, true);
  const ida = I.anotarInvitacion(vacio, AHORA);
  ok('ida y vuelta por JSON', I.leerHistorialInvitacion(JSON.stringify(ida)), ida);
}

// --- A quién y con qué ejemplos: los avisos que le llegan de verdad ---
{
  const caso = (rubro, tipo, esAdmin, enPrueba) => {
    const f = fichaDe(rubro, tipo);
    return I.casoDeInvitacion({
      esPersonal: tipo === 'personal', esAdmin, enPrueba,
      cierraElDia: f.secciones['/cierre'], tieneAgenda: f.secciones['/agenda'],
      agendaDeAlumnos: f.agendaDeAlumnos,
    });
  };
  // [dueño en prueba, equipo en prueba, dueño pagado, equipo pagado]
  const esperado = {
    comercio:      ['negocio', null, 'negocio', null],
    servicios:     ['negocioAgenda', 'equipoAgenda', 'negocioAgenda', 'equipoAgenda'],
    clases:        ['alumnos', 'equipoAlumnos', 'alumnos', 'equipoAlumnos'],
    entrenamiento: ['alumnos', 'equipoAlumnos', 'alumnos', 'equipoAlumnos'],
    // Al campo solo le llega el fin de la prueba: pagado, no se le pide nada.
    agricultura:   ['campo', null, null, null],
    ganaderia:     ['campo', null, null, null],
  };
  for (const f of LISTA_RUBROS) {
    ok(`${f.clave}: dueño y equipo, en prueba y pagado`, [
      caso(f.clave, 'emprendedor', true, true), caso(f.clave, 'emprendedor', false, true),
      caso(f.clave, 'emprendedor', true, false), caso(f.clave, 'emprendedor', false, false),
    ], esperado[f.clave]);
  }
  ok('cuenta personal: al dueño sí (en prueba o pagada), al invitado no',
    [caso(null, 'personal', true, true), caso(null, 'personal', true, false), caso(null, 'personal', false, true)],
    ['personal', 'personal', null]);

  // La línea de la prueba se suma solo en prueba.
  const tx = {
    ejemplos: { negocio: ['día'], negocioAgenda: ['día', 'turnos'], alumnos: ['clases'], campo: ['fin de prueba'],
      personal: ['gasto'], equipoAgenda: ['turnos'], equipoAlumnos: ['clases'] },
    prueba: { negocio: 'PRUEBA', negocioAgenda: 'PRUEBA', alumnos: 'PRUEBA', personal: 'PRUEBA' },
  };
  ok('comercio en prueba: el día y la prueba', I.ejemplosDeInvitacion(tx, 'negocio', true), ['día', 'PRUEBA']);
  ok('comercio pagado: no promete el fin de la prueba', I.ejemplosDeInvitacion(tx, 'negocio', false), ['día']);
  ok('profe pagado: solo las clases', I.ejemplosDeInvitacion(tx, 'alumnos', false), ['clases']);
  ok('el equipo nunca lleva la línea de la prueba', I.ejemplosDeInvitacion(tx, 'equipoAgenda', true), ['turnos']);
  ok('no toca la lista original', (I.ejemplosDeInvitacion(tx, 'personal', true), tx.ejemplos.personal), ['gasto']);
}

// --- Los textos, en los dos idiomas, y sin promesas falsas ---
{
  const leer = (r) => fs.readFileSync(r, 'utf8');
  const bloque = (fuente) => {
    const i = fuente.indexOf('  invitarAvisos: {');
    const j = fuente.indexOf('\n  },\n', i);
    return i < 0 || j < 0 ? '' : fuente.slice(i, j);
  };
  const es = bloque(leer('src/i18n/textos/es.ts'));
  const pt = bloque(leer('src/i18n/textos/pt.ts'));
  ok('el bloque existe en es y pt', [es.length > 0, pt.length > 0], [true, true]);

  const claves = ['titulo', 'intro', 'activar', 'activando', 'ahoraNo', 'seApagan', 'listo', 'noSeActivaron',
    'bloqueadoTitulo', 'bloqueadoAndroid', 'bloqueadoIphone', 'bloqueadoCompu', 'bloqueadoDespues',
    'entendido', 'iphoneTitulo', 'iphone'];
  const casos = ['negocio', 'negocioAgenda', 'alumnos', 'campo', 'personal', 'equipoAgenda', 'equipoAlumnos'];
  for (const [nombre, b] of [['es', es], ['pt', pt]]) {
    ok(`${nombre}: todas las claves`, claves.filter((c) => !new RegExp(`\\n    ${c}: '`).test(b)), []);
    ok(`${nombre}: un ejemplo por caso`, casos.filter((c) => !new RegExp(`\\n      ${c}: \\[\\n        '`).test(b)), []);
  }
  ok('el título que pidió Matías', [es.includes("titulo: 'Activá los avisos'"), pt.includes("titulo: 'Ative os avisos'")], [true, true]);

  // Avisos que NO existen hoy: nada de vencimientos, cuotas, cosechas ni
  // rutinas. Si alguien los agrega a la hoja, que agregue antes el aviso.
  const prometeDeMas = /vence|vencimiento|cuota|cosecha|rutina|medir|venc|mensalidade|colheita|medir/i;
  ok('ningún ejemplo promete un aviso que no existe (es)', prometeDeMas.test(es.slice(es.indexOf('ejemplos'), es.indexOf('activar:'))), false);
  ok('ningún ejemplo promete un aviso que no existe (pt)', prometeDeMas.test(pt.slice(pt.indexOf('ejemplos'), pt.indexOf('activar:'))), false);
  // Al campo solo le llega el fin de la prueba: ni el resumen del día ni el
  // plan activado (que hoy sale solo si la administración activa a mano).
  const campoEs = es.slice(es.indexOf('campo: ['), es.indexOf('personal: ['));
  ok('al campo no se le promete el resumen del día', /mañana, cómo|a la noche/i.test(campoEs), false);
  ok('nadie promete el aviso del plan activado',
    [/plan queda activo/i.test(es), /plano fica ativo/i.test(pt)], [false, false]);

  // La prueba vive aparte, para sumarse solo en prueba: ninguna lista de
  // `ejemplos` salvo la del campo (que solo aparece en prueba) la nombra.
  for (const [nombre, b, palabra] of [['es', es, /prueba/i], ['pt', pt, /teste/i]]) {
    // Sin los comentarios: el que explica la lista del campo dice «prueba».
    const limpio = b.replace(/\n\s*\/\/[^\n]*/g, '');
    const desde = limpio.indexOf('ejemplos: {');
    const ejemplos = limpio.slice(desde, limpio.indexOf('\n    },', desde));
    const sinCampo = ejemplos.slice(0, ejemplos.indexOf('campo: [')) + ejemplos.slice(ejemplos.indexOf('personal: ['));
    ok(`${nombre}: la prueba no está en las listas fijas`, palabra.test(sinCampo), false);
    const prueba = b.slice(b.indexOf('prueba: {'), b.indexOf('activar:'));
    ok(`${nombre}: la línea de la prueba de cada dueño`,
      ['negocio', 'negocioAgenda', 'alumnos', 'personal'].filter((c) => !new RegExp(`\n      ${c}: '`).test(prueba)), []);
  }

  // La jerga del trainer dice «sesiones».
  const ent = leer('src/i18n/textos/entrenamiento.ts');
  ok('el trainer lee sesiones en la invitación', /invitarAvisos: \{\n    ejemplos: \{\n      alumnos: \[\n        '[^']*sesiones/.test(ent)
    && /sessões você tem amanhã/.test(ent), true);
}

// --- Las piezas, enchufadas ---
{
  const leer = (r) => fs.readFileSync(r, 'utf8');
  const pref = leer('src/components/Preferencias.tsx');
  const hoja = leer('src/components/InvitarAvisos.tsx');
  const panel = leer('src/app/(app)/panel/page.tsx');
  const push = leer('src/lib/push-cliente.ts');

  ok('Ajustes usa el mismo hook', pref.includes('usePush()') && !pref.includes('requestPermission'), true);
  ok('el permiso se pide en un solo lugar', push.includes('Notification.requestPermission()'), true);
  ok('la hoja pide con el mismo activar()', hoja.includes('usePush()') && hoja.includes('await activar()'), true);
  ok('la hoja sigue la regla de las hojas (z-60, 88vh, zona segura)',
    hoja.includes('fixed inset-0 z-[60]') && hoja.includes('max-h-[88vh]') && hoja.includes('zona-segura-abajo'), true);
  ok('sin fondo blanco opaco', /\bbg-white\b/.test(hoja), false);
  ok('localStorage solo en las dos funciones con try/catch', (hoja.match(/window\.localStorage\./g) || []).length, 2);
  ok('en iPhone muestra la guía', hoja.includes('<GuiaInstalar compacta />'), true);
  ok('el panel la pone una sola vez, fuera de las ramas',
    (panel.match(/<InvitarAvisos /g) || []).length === 1 && panel.includes('<ContenidoPanel searchParams={searchParams} ctx={ctx} />'), true);
  ok('el panel lee el contexto una sola vez', (panel.match(/await contextoObligatorio\(\)/g) || []).length, 1);
}

console.log(`\n${corridas} comprobaciones, ${fallos} fallos`);
process.exit(fallos > 0 ? 1 : 0);
