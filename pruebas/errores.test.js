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
const { mensajeDeError, verificarAfectados, SIN_PERMISO_SILENCIOSO, REGLAS } =
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

// La conexión, como la avisa cada navegador. Safari —el de todos los iPhone—
// dice «Load failed», y era el único que faltaba: le llegaba crudo a la
// persona como «TypeError: Load failed», en Deudas y en Presupuesto, justo
// cuando más necesitaba saber qué había pasado con lo que estaba guardando.
const CORTE = 'Se cortó la conexión. Revisá tu internet y probá de nuevo.';
ok('Chrome sin red', mensajeDeError({ message: 'TypeError: Failed to fetch' }), CORTE);
ok('Safari sin red: el caso del iPhone', mensajeDeError({ message: 'TypeError: Load failed' }), CORTE);
ok('también sin el «TypeError:» adelante', mensajeDeError(new Error('Load failed')), CORTE);
ok('Firefox sin red', mensajeDeError({ message: 'NetworkError when attempting to fetch resource.' }), CORTE);
ok('Node sin red', mensajeDeError({ message: 'fetch failed' }), CORTE);
ok('Safari sin internet', mensajeDeError({ message: 'The Internet connection appears to be offline.' }), CORTE);
ok('Safari, conexión perdida', mensajeDeError({ message: 'The network connection was lost.' }), CORTE);
ok('un pedido que tardó demasiado', mensajeDeError({ message: 'The request timed out.' }), CORTE);
ok('un pedido cortado a la mitad', mensajeDeError({ message: 'AbortError: The operation was aborted.' }), CORTE);

// Y ningún otro error de JavaScript pasa crudo. Arrancan con mayúscula,
// que es lo que usa `esNuestro` para reconocer nuestros mensajes, pero
// ninguno nuestro empieza con el nombre de una clase de error.
ok('un error técnico del navegador no llega crudo',
  mensajeDeError({ message: "TypeError: undefined is not an object (evaluating 'a.b')" }), RESPALDO);
ok('y se usa el respaldo que eligió la pantalla',
  mensajeDeError(new Error('RangeError: Maximum call stack size exceeded'), 'No se pudo guardar.'),
  'No se pudo guardar.');
// Lo nuestro que empieza con la palabra «Error» sigue pasando: «Error» sola
// no es el nombre de una clase de JavaScript.
ok('un mensaje nuestro que empieza con «Error» pasa',
  mensajeDeError({ message: 'Error al leer el archivo.' }), 'Error al leer el archivo.');

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

// ---------------------------------------------------------------
// Ninguna regla técnica tapa un mensaje nuestro.
//
// Las reglas se miran ANTES que la heurística, así que si un patrón
// técnico aparece dentro de un mensaje nuestro, ese mensaje queda tapado
// por uno genérico y la persona pierde la única pista que tenía.
//
// El comentario de errores.ts decía que esto se comprobaba, y no era
// cierto. Apareció al sumar las formas en que Safari y los demás avisan
// un corte —«timed out», «aborted»…—, que es cuando más riesgo había.
// ---------------------------------------------------------------
{
  const fs = require('fs');
  const path = require('path');
  const deVerdad = [];

  // Los de la base: cada `raise exception '...'`. Los «%» se llenan con un
  // nombre, que es lo que pasa cuando PostgreSQL arma el mensaje.
  const dirMig = path.join(__dirname, '..', 'supabase', 'migrations');
  for (const f of fs.readdirSync(dirMig).filter((x) => x.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(dirMig, f), 'utf8');
    for (const m of sql.matchAll(/raise exception\s+'((?:[^']|'')*)'/gi)) {
      deVerdad.push(m[1].replace(/''/g, "'").replace(/%/g, 'Juan'));
    }
  }

  // Los que lanzan las pantallas: `new Error('...')`.
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const r = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(r); continue; }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      for (const m of fs.readFileSync(r, 'utf8').matchAll(/new Error\('((?:[^'\\]|\\.)*)'\)/g)) {
        deVerdad.push(m[1]);
      }
    }
  };
  recorrer(path.join(__dirname, '..', 'src'));

  const tapados = deVerdad.filter((msg) => REGLAS.some(({ patron }) => patron.test(msg)));
  ok('se leyeron los mensajes de la base y de las pantallas', deVerdad.length > 300, true);
  ok('ninguna regla técnica tapa un mensaje nuestro', tapados, []);
}

// ---------------------------------------------------------------
// En portugués (2026-09-16).
//
// Los mensajes de la base están escritos en español y ahí se quedan: se
// traducen en el navegador, justo antes de mostrarse. Un mensaje nuevo sin
// traducir le llegaría en español a un brasileño, que es justo lo que la
// regla de idiomas.ts no permite. Esta prueba es la que lo impide.
// ---------------------------------------------------------------
{
  const fs = require('fs');
  const path = require('path');
  const { MENSAJES_PT, traducirMensajeAPortugues } = require('../.compilado/mensajes-base.js');
  const { usarTraductorDeErrores } = require('../.compilado/errores.js');

  // Los vigentes: la ÚLTIMA definición de cada función en las migraciones.
  // Las versiones viejas de una función ya no existen en la base, y sus
  // mensajes no le llegan a nadie.
  const dirMig = path.join(__dirname, '..', 'supabase', 'migrations');
  const porFuncion = new Map();
  for (const f of fs.readdirSync(dirMig).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = fs.readFileSync(path.join(dirMig, f), 'utf8');
    for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/gi)) {
      porFuncion.delete(m[1].toLowerCase());
    }
    const definicion = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\bas\s+(\$\w*\$)([\s\S]*?)\2/gi;
    for (const m of sql.matchAll(definicion)) {
      const mensajes = [...m[3].matchAll(/raise exception\s+'((?:[^']|'')*)'/gi)].map((x) => x[1].replace(/''/g, "'"));
      porFuncion.set(m[1].toLowerCase(), mensajes);
    }
  }
  const vigentes = [...new Set([...porFuncion.values()].flat())];
  const sinTraducir = vigentes.filter((msg) => !MENSAJES_PT[msg]);

  ok('se leyeron los mensajes vigentes de la base', vigentes.length > 200, true);
  ok('todos tienen traducción al portugués', sinTraducir, []);
  ok('y las reglas técnicas también', REGLAS.map((r) => r.mensaje).filter((m) => !MENSAJES_PT[m]), []);

  ok('un mensaje exacto se traduce',
    traducirMensajeAPortugues('Ese horario ya no está disponible.'), 'Esse horário não está mais disponível.');
  ok('uno con un dato adentro, con el dato en su lugar',
    traducirMensajeAPortugues('Lucas te debe Gs. 300.000, no podés cobrarle más que eso.'),
    'Lucas te deve Gs. 300.000, não dá pra cobrar mais que isso.');
  ok('con dos datos, cada uno donde va',
    traducirMensajeAPortugues('Ana todavía tiene turnos agendados (3). Pasalos a otra persona o cancelalos desde Agenda, y después lo sacás del equipo.'),
    'Ana ainda tem horários agendados (3). Passe pra outra pessoa ou cancele em Agenda, e depois tire da equipe.');
  ok('lo que no conoce lo deja como está',
    traducirMensajeAPortugues('Un mensaje que no existe.'), 'Un mensaje que no existe.');

  // Y enchufado a mensajeDeError, como lo instala el proveedor de idioma.
  usarTraductorDeErrores(traducirMensajeAPortugues);
  ok('en portugués, lo de la base llega traducido',
    mensajeDeError({ message: 'Todavía no tenés nada por cobrar.' }), 'Você ainda não tem nada pra receber.');
  ok('la jerga técnica también',
    mensajeDeError({ message: 'JWT expired' }), 'Sua sessão expirou. Entre de novo.');
  ok('y el respaldo por defecto',
    mensajeDeError(null), 'Não foi possível concluir a operação.');
  ok('el respaldo que ya vino traducido de la pantalla no se toca',
    mensajeDeError(null, 'Não foi possível salvar.'), 'Não foi possível salvar.');
  usarTraductorDeErrores(null);
  ok('sin traductor, vuelve a salir en español',
    mensajeDeError({ message: 'Todavía no tenés nada por cobrar.' }), 'Todavía no tenés nada por cobrar.');
}

console.log(fallos === 0
  ? '\n>>> TODAS LAS PRUEBAS DE ERRORES PASARON'
  : `\n>>> ${fallos} FALLAS DE ERRORES`);
process.exit(fallos ? 1 : 0);
