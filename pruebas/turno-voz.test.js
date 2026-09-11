/**
 * Dictar un turno (turnos por voz).
 *
 * Como las pruebas del prompt de la captura, no comprueban que la IA acierte
 * —eso solo se sabe hablándole de verdad— sino dos cosas que sí dependen de
 * nosotros:
 *
 *   · que el calendario que se le da al modelo esté bien calculado. Un
 *     «el jueves» que cae en viernes es un turno perdido, y el error sería
 *     nuestro, no del modelo;
 *   · que nada de lo que devuelve llegue a la pantalla sin sanear: un id
 *     inventado, una hora imposible o una fecha que ya pasó.
 */
const { calendario, instruccionesTurno, sanearTurno, mismoNombre, ESQUEMA_TURNO } =
  require('../.compilado/turno-voz.js');

let fallos = 0;
let corridas = 0;

function grupo(nombre) {
  console.log(`\n── ${nombre} ${'─'.repeat(Math.max(0, 58 - nombre.length))}`);
}

function ok(nombre, real, esperado) {
  corridas++;
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${JSON.stringify(real)}\n      esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`  ✓ ${nombre}`);
  }
}

const HOY = '2026-09-10'; // un jueves

const CTX = {
  hoy: HOY,
  servicios: [{ id: 's-corte', nombre: 'Corte', duracion_min: 30 }],
  profesionales: [{ id: 'p-pedro', nombre: 'Pedro' }],
};

// ═══════════════════════════════════════════════════════════
grupo('1 · El calendario se calcula, no se le pide al modelo');
{
  const lineas = calendario(HOY).split('\n');
  ok('son quince días', lineas.length, 15);
  ok('empieza hoy, con su nombre', lineas[0], '- jueves 2026-09-10 (hoy)');
  ok('mañana', lineas[1], '- viernes 2026-09-11 (mañana)');
  ok('pasado mañana', lineas[2], '- sábado 2026-09-12 (pasado mañana)');
  ok('el jueves que viene es el 17', lineas.includes('- jueves 2026-09-17'), true);
  ok('cruza de mes sin perderse', calendario('2026-09-28').includes('- jueves 2026-10-01'), true);
  ok('y de año', calendario('2026-12-30').includes('- viernes 2027-01-01'), true);
  ok('conoce el 29 de febrero', calendario('2028-02-27').includes('- martes 2028-02-29'), true);
}

// ═══════════════════════════════════════════════════════════
grupo('2 · El prompt lleva las listas, con sus ids');
{
  const p = instruccionesTurno(CTX);
  ok('lleva el calendario', p.includes('- jueves 2026-09-10 (hoy)'), true);
  ok('cada servicio con su id y su duración', p.includes('- Corte | id=s-corte | dura 30 min'), true);
  ok('cada uno del equipo con su id', p.includes('- Pedro | id=p-pedro'), true);
  ok('«a las tres» es de la tarde', p.includes('De 1 a 7 sin aclarar es de la TARDE'), true);
  ok('y no elige profesional por su cuenta', p.includes('no elijas a nadie por tu cuenta'), true);
}

// ═══════════════════════════════════════════════════════════
grupo('3 · Lo que devuelve el modelo se sanea');
{
  ok('lo que está bien pasa entero', sanearTurno({
    cliente_nombre: '  Juan Pérez ', cliente_telefono: '0981 234 567', fecha: '2026-09-11',
    hora: '15:00', servicio_id: 's-corte', profesional_id: 'p-pedro', confianza: 0.95, aviso: null,
  }, CTX), {
    cliente_nombre: 'Juan Pérez', cliente_telefono: '0981234567', fecha: '2026-09-11',
    hora: '15:00', servicio_id: 's-corte', profesional_id: 'p-pedro', confianza: 0.95, aviso: null,
  });

  const inventado = sanearTurno({ servicio_id: 's-otro', profesional_id: 'p-nadie' }, CTX);
  ok('un servicio inventado no llega', inventado.servicio_id, null);
  ok('ni alguien que no es del equipo', inventado.profesional_id, null);

  ok('una hora sin cero adelante se completa', sanearTurno({ hora: '9:30' }, CTX).hora, '09:30');
  ok('una hora imposible no pasa', sanearTurno({ hora: '25:00' }, CTX).hora, null);
  ok('ni una hora en palabras', sanearTurno({ hora: 'tres' }, CTX).hora, null);

  const pasada = sanearTurno({ fecha: '2026-09-01' }, CTX);
  ok('una fecha que ya pasó no se usa', pasada.fecha, null);
  ok('y se avisa', /ya pasó/.test(pasada.aviso ?? ''), true);
  ok('hoy sí vale', sanearTurno({ fecha: HOY }, CTX).fecha, HOY);
  ok('una fecha mal escrita no pasa', sanearTurno({ fecha: 'mañana' }, CTX).fecha, null);

  ok('un teléfono a medio dictar no es un teléfono',
    sanearTurno({ cliente_telefono: '0981' }, CTX).cliente_telefono, null);
  ok('un nombre vacío es null', sanearTurno({ cliente_nombre: '   ' }, CTX).cliente_nombre, null);
  ok('la confianza no se sale de 0 a 1',
    [sanearTurno({ confianza: 7 }, CTX).confianza, sanearTurno({ confianza: -2 }, CTX).confianza], [1, 0]);

  const nada = sanearTurno(null, CTX);
  ok('sin respuesta, todo vacío',
    [nada.fecha, nada.hora, nada.servicio_id, nada.profesional_id, nada.cliente_nombre],
    [null, null, null, null, null]);
}

// ═══════════════════════════════════════════════════════════
grupo('4 · Reconocer a un cliente por el nombre');
{
  ok('sin tildes es el mismo', mismoNombre('Martín', 'martin'), true);
  ok('con espacios de más también', mismoNombre('Juan  Pérez', ' juan perez'), true);
  ok('Juan no es Juana', mismoNombre('Juan', 'Juana'), false);
  ok('vacío no coincide con vacío', mismoNombre('', ''), false);
}

// ═══════════════════════════════════════════════════════════
grupo('5 · El esquema es estricto');
{
  ok('pide todo lo que describe',
    [...ESQUEMA_TURNO.required].sort(), Object.keys(ESQUEMA_TURNO.properties).sort());
  ok('y no acepta nada más', ESQUEMA_TURNO.additionalProperties, false);
}

console.log(`\n${fallos === 0 ? '✓' : '✗'} ${corridas - fallos}/${corridas} pruebas`);
process.exit(fallos === 0 ? 0 : 1);
