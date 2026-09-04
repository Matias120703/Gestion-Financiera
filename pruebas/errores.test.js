/**
 * Pruebas del traductor de errores.
 *
 * Esta función decide TODO lo que una persona lee cuando algo falla, y hasta
 * ahora no tenía ni una comprobación. Se equivoca de dos formas, y las dos
 * son caras:
 *
 *   · deja pasar jerga de PostgreSQL —«new row violates row-level security
 *     policy for table turnos_reserva»— y el que la lee no entiende que le
 *     faltó un permiso: entiende que la app está rota;
 *
 *   · o se pasa de celosa y tapa un mensaje NUESTRO, que estaba escrito
 *     justamente para explicarle qué hacer. «Ese horario ya no está
 *     disponible» convertido en «No se pudo completar» es peor que el error
 *     crudo, porque le saca la única pista que tenía.
 *
 * El equilibrio sale de dos pasos, en este orden: primero las reglas, que
 * reconocen cadenas técnicas en inglés, y recién después la heurística
 * (`esNuestro`), que mira cómo arranca el texto. Escribir estas pruebas
 * destapó que el orden estaba al revés, y por eso «JWT expired» y «TypeError:
 * Failed to fetch» —la sesión vencida y el celular sin señal, los dos casos
 * más comunes de todos— le llegaban crudos a la persona.
 */
const { mensajeDeError, verificarAfectados, SIN_PERMISO_SILENCIOSO } =
  require('../.compilado/errores.js');

let fallos = 0;
function ok(nombre, real, esperado) {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log('FALLA', nombre, '\n  real:', a, '\n  esperado:', b); }
  else console.log('ok  ', nombre, '→', a);
}

const RESPALDO = 'No se pudo completar la operación.';

// ---------------------------------------------------------------
// Lo nuestro llega tal cual. Son mensajes de verdad de las migraciones.
// ---------------------------------------------------------------
const nuestros = [
  'Ese horario ya no está disponible.',
  'No pertenecés a esta empresa.',
  'Solo administración maneja los lotes.',
  'Ese lote tiene 3 movimientos cargados. Sacáselos antes de borrarlo.',
  'Un lote no puede cerrarse antes de haberse abierto.',
  'Ya está todo cargado: no tenés nada pendiente de ese negocio.',
  'Esa persona no está en el equipo de esta cuenta.',
  'Escribí un teléfono, para poder avisarte si pasa algo.',
  '¿Cerrar el local ese día? Decidilo desde Ajustes.',
];
for (const m of nuestros) ok('pasa tal cual: ' + m.slice(0, 34), mensajeDeError({ message: m }), m);

ok('también si viene como texto suelto y no como objeto',
  mensajeDeError('Ese turno ya se cerró: no se puede mover.'),
  'Ese turno ya se cerró: no se puede mover.');

// ---------------------------------------------------------------
// La jerga se traduce. Estos son los textos que salían antes del arreglo.
// ---------------------------------------------------------------
ok('el error de policy que veía el barbero',
  mensajeDeError({ message: 'new row violates row-level security policy for table "turnos_reserva"' }),
  'No tenés permiso para hacer esto. Si creés que deberías, pedile a un administrador.');

ok('permiso denegado sobre una tabla',
  mensajeDeError({ message: 'permission denied for table movimientos' }),
  'No tenés permiso para hacer esto. Si creés que deberías, pedile a un administrador.');

ok('nombre repetido',
  mensajeDeError({ message: 'duplicate key value violates unique constraint "productos_empresa_id_nombre_key"' }),
  'Ya existe algo con ese nombre.');

ok('la llave compuesta de los lotes, si alguien la fuerza',
  mensajeDeError({ message: 'insert or update on table "movimientos" violates foreign key constraint "movimientos_lote_fk"' }),
  'Eso hace referencia a algo que ya no existe. Recargá la página.');

ok('la sesión vencida', mensajeDeError({ message: 'JWT expired' }),
  'Tu sesión venció. Volvé a entrar.');

ok('sin internet', mensajeDeError({ message: 'TypeError: Failed to fetch' }),
  'No hay conexión. Probá de nuevo cuando vuelva internet.');

ok('un error de sintaxis no se le muestra a nadie',
  mensajeDeError({ message: 'syntax error at or near "select"' }), RESPALDO);

// El código de Postgres NO alcanza para tapar un mensaje nuestro, y es a
// propósito: nuestras propias excepciones de permiso levantan errcode 42501
// con un texto mucho más útil que «no tenés permiso». Si una regla mirara ese
// código, «No trabajás en ese negocio» se convertiría en el genérico y la
// persona perdería la única pista que tenía.
ok('un mensaje nuestro con code 42501 sigue llegando entero',
  mensajeDeError({ message: 'No trabajás en ese negocio.', code: '42501' }),
  'No trabajás en ese negocio.');

// Pero sí se mira el code y los detalles cuando el texto no dice nada útil.
ok('reconoce la falta de permiso por los detalles',
  mensajeDeError({ message: 'error', details: 'permission denied for table lotes' }),
  'No tenés permiso para hacer esto. Si creés que deberías, pedile a un administrador.');

// ---------------------------------------------------------------
// Los bordes.
// ---------------------------------------------------------------
ok('sin error, el respaldo', mensajeDeError(null), RESPALDO);
ok('undefined también', mensajeDeError(undefined), RESPALDO);
ok('un objeto vacío', mensajeDeError({}), RESPALDO);
ok('mensaje en blanco', mensajeDeError({ message: '   ' }), RESPALDO);
ok('el respaldo se puede cambiar',
  mensajeDeError(null, 'No se pudo reservar. Probá de nuevo.'),
  'No se pudo reservar. Probá de nuevo.');
ok('un texto técnico en minúscula no se cuela',
  mensajeDeError({ message: 'relation "lotes" does not exist' }), RESPALDO);

// ---------------------------------------------------------------
// La policy que no da error sino cero filas.
// ---------------------------------------------------------------
let tiro = null;
try { verificarAfectados([]); } catch (e) { tiro = e.message; }
ok('sin filas afectadas, avisa que no se guardó', tiro, SIN_PERMISO_SILENCIOSO);

tiro = null;
try { verificarAfectados(null); } catch (e) { tiro = e.message; }
ok('null también', tiro, SIN_PERMISO_SILENCIOSO);

tiro = 'no tiró';
try { verificarAfectados([{ id: 1 }]); } catch (e) { tiro = e.message; }
ok('con filas, no molesta', tiro, 'no tiró');

console.log(fallos === 0
  ? '\n>>> TODAS LAS PRUEBAS DE ERRORES PASARON'
  : `\n>>> ${fallos} FALLAS DE ERRORES`);
process.exit(fallos ? 1 : 0);
