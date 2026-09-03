/**
 * Pruebas del teléfono que se convierte en enlace de WhatsApp.
 *
 * Es la pieza más chica del recordatorio y la que más silenciosamente puede
 * fallar: un número mal armado no da error en ningún lado, simplemente abre
 * una conversación con nadie —o peor, con otra persona— y el local se entera
 * cuando el cliente no viene.
 *
 * Los casos de abajo son los que aparecen de verdad: el número tipeado con
 * espacios en el mostrador, el que el cliente escribió con guiones en el link
 * público, el que vino con +595 porque la persona lo copió de su agenda, y el
 * que ya estaba guardado en formato internacional sin el más.
 */
const { telefonoInternacional, enlaceWhatsApp, prefijoDeZona } = require('../.compilado/telefono.js');

let fallos = 0;
function ok(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a);
}

const PY = 'America/Asuncion';

// --- Cómo lo escribe la gente en Paraguay ---
ok('con el cero de siempre', telefonoInternacional('0981111111', PY), '595981111111');
ok('con espacios', telefonoInternacional('0981 111 111', PY), '595981111111');
ok('con guiones', telefonoInternacional('0981-111-111', PY), '595981111111');
ok('con paréntesis', telefonoInternacional('(0981) 111111', PY), '595981111111');
ok('con espacios al principio y al final', telefonoInternacional('  0981111111  ', PY), '595981111111');

// --- Ya viene con el país ---
ok('con más y espacios', telefonoInternacional('+595 981 111111', PY), '595981111111');
ok('con doble cero', telefonoInternacional('00595981111111', PY), '595981111111');
ok('ya guardado sin el más', telefonoInternacional('595981111111', PY), '595981111111');
ok('no se le pega el prefijo dos veces',
  telefonoInternacional('595981111111', PY).startsWith('595595'), false);

// --- Sin el cero de arranque ---
ok('escrito sin el cero', telefonoInternacional('981111111', PY), '595981111111');

// --- El cliente de otro país ---
ok('un argentino guardado con más, desde una cuenta paraguaya',
  telefonoInternacional('+54 9 11 1234 5678', PY), '5491112345678');

// --- Otras zonas ---
ok('Buenos Aires', telefonoInternacional('011 1234-5678', 'America/Argentina/Buenos_Aires'), '541112345678');
ok('São Paulo', telefonoInternacional('(11) 91234-5678', 'America/Sao_Paulo'), '5511912345678');
ok('Madrid, que no usa cero de arranque', telefonoInternacional('612345678', 'Europe/Madrid'), '34612345678');

// --- Lo que NO se puede armar ---
ok('vacío', telefonoInternacional('', PY), '');
ok('solo espacios', telefonoInternacional('   ', PY), '');
ok('demasiado corto', telefonoInternacional('12345', PY), '');
ok('puras letras', telefonoInternacional('no tiene', PY), '');
ok('una zona que no está en la lista no inventa prefijo',
  telefonoInternacional('0981111111', 'Asia/Tokyo'), '');
ok('pero si vino internacional, la zona desconocida no importa',
  telefonoInternacional('+81 90 1234 5678', 'Asia/Tokyo'), '819012345678');

// --- El prefijo por zona ---
ok('Asunción', prefijoDeZona(PY), '595');
ok('zona desconocida no tiene prefijo', prefijoDeZona('Antarctica/Troll'), '');

// --- El enlace completo ---
ok('el enlace lleva el número y el mensaje escapado',
  enlaceWhatsApp('0981111111', PY, 'Hola Ana! Tu turno es a las 10:00'),
  'https://wa.me/595981111111?text=Hola%20Ana!%20Tu%20turno%20es%20a%20las%2010%3A00');
ok('los dos puntos de la hora no rompen el enlace',
  enlaceWhatsApp('0981111111', PY, '10:00').includes('10%3A00'), true);
ok('un salto de línea tampoco',
  enlaceWhatsApp('0981111111', PY, 'uno\ndos').includes('%0A'), true);
ok('sin número no hay enlace, y no se devuelve uno roto',
  enlaceWhatsApp('', PY, 'Hola'), '');
ok('con un número imposible tampoco',
  enlaceWhatsApp('123', PY, 'Hola'), '');

console.log(fallos === 0 ? '\n>>> TODAS LAS PRUEBAS DE TELÉFONO PASARON' : `\n>>> ${fallos} FALLAS DE TELÉFONO`);
process.exit(fallos ? 1 : 0);
