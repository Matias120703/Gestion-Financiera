/**
 * BANCARD, LEÍDO EN LAS FUENTES (02/10/2026).
 *
 * Lo que no se puede probar corriendo sin Next ni un navegador, se cuida
 * leyendo el código:
 *
 *   · la clave privada se lee en UN solo archivo y nunca llega al navegador;
 *   · ningún componente del navegador importa lo del servidor;
 *   · la pantalla de vuelta no cree lo que dice la dirección;
 *   · la confirmación es pública, sin cookies y con tope de tamaño;
 *   · del navegador no viaja un importe;
 *   · el comprobante no muestra lo que el manual prohíbe;
 *   · las reglas de pantalla del proyecto (sin loading.tsx, sin velos
 *     propios, sin bg-white ni dark:).
 *
 * Las que leen fuentes normalizan CRLF (en un worktree de Windows llegan con \r\n).
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
/** Sin comentarios: lo que se explica en un comentario no es código. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    fallos++;
    console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`);
  } else {
    console.log(`  ✓ ${nombre} → ${a.length > 150 ? a.slice(0, 147) + '...' : a}`);
  }
}

const archivos = [];
(function mirar(dir) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) mirar(rel);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name)) archivos.push(rel);
  }
})('src');

console.log('\n── Las claves de Bancard ──────────────────────────────────');
{
  // Se busca la LECTURA (process.env.…): el panel de /admin nombra la
  // variable en su ayuda («falta BANCARD_CLAVE_PRIVADA»), sin leerla.
  const conPrivada = archivos.filter((a) => /env.BANCARD_CLAVE_PRIVADA|env[['"]BANCARD_CLAVE_PRIVADA/.test(leer(a)));
  ok('BANCARD_CLAVE_PRIVADA se lee en un solo archivo: bancard-servidor.ts', conPrivada, ['src/lib/bancard-servidor.ts']);
  ok('y BANCARD_CLAVE_PUBLICA también',
    archivos.filter((a) => /env.BANCARD_CLAVE_PUBLICA|env[['"]BANCARD_CLAVE_PUBLICA/.test(leer(a))), ['src/lib/bancard-servidor.ts']);
  ok('ningún componente del navegador lee una variable BANCARD_ del servidor',
    archivos.filter((a) => /^s*['"]use client['"]/.test(leer(a)) && /process.env.BANCARD_/.test(leer(a))), []);
  ok('el interruptor general (BANCARD_ABIERTO) se lee solo ahí',
    archivos.filter((a) => sinComentarios(leer(a)).includes('BANCARD_ABIERTO')), ['src/lib/bancard-servidor.ts']);
  ok('y el del transporte (BANCARD_HTTP) también; bancard.ts no lee el entorno',
    [archivos.filter((a) => /process\.env\.BANCARD_HTTP/.test(leer(a))), leer('src/lib/bancard.ts').includes('process.env')],
    [['src/lib/bancard-servidor.ts'], false]);
  ok('no existe ninguna variable NEXT_PUBLIC_BANCARD_CLAVE (iría al navegador)',
    archivos.filter((a) => /NEXT_PUBLIC_BANCARD_CLAVE/.test(leer(a))), []);
  const servidor = sinComentarios(leer('src/lib/bancard-servidor.ts'));
  // La clave privada del portal trae signos (. , ( ) + $): exigirle «solo
  // letras y números» dejaba a Bancard «sin configurar» con todo bien cargado
  // (07/10/2026). Se saca del fuente la forma que se le pide y se la prueba.
  const formaPrivada = servidor.match(/if \(!(\/\^[^\n]+?\$\/)\.test\(privada\)\)/);
  const pideLaForma = formaPrivada ? new RegExp(formaPrivada[1].slice(1, -1)) : null;
  ok('la clave privada se acepta con signos, y no se acepta vacía, con espacios ni de 5 caracteres',
    pideLaForma === null ? 'no encontré la forma en bancard-servidor.ts' : [
      pideLaForma.test('aB3.dE5,gH7(jK9)mN1+pQ3$sT5*vW7^yZ9.bC1d'),
      pideLaForma.test('abcdefghij0123456789abcdefghij0123456789'),
      pideLaForma.test(''), pideLaForma.test('aB3.dE5,gH7(jK9) mN1+pQ3$sT5*vW7^yZ9.bC1'), pideLaForma.test('abc12'),
    ], [true, true, false, false, false]);
  ok('y el panel dice qué le pasa a la clave (no llegó, tiene un espacio, cuánto mide) sin mostrarla',
    [/falla\?: \{ falta: boolean; conEspacios: boolean; largo: number \}/.test(leer('src/components/bancard/PanelBancardAdmin.tsx')),
      leer('src/components/bancard/PanelBancardAdmin.tsx').includes('letras y números')],
    [true, false]);
  ok('la clave privada no se registra: el servidor no la pone en la consola',
    /console\.[a-z]+\([^)]*clavePrivada/.test(servidor), false);
  ok('bancard-flujo.ts no escribe en la consola (el registro entra por `registrar`)',
    /console\./.test(sinComentarios(leer('src/lib/bancard-flujo.ts'))), false);
}

console.log('\n── El navegador no importa lo del servidor ───────────────');
{
  const delNavegador = archivos.filter((a) => /^\s*['"]use client['"]/.test(leer(a)));
  ok('se encontraron los componentes del navegador', delNavegador.length > 50, true);
  const prohibidos = /from ['"](@\/lib\/bancard-servidor|@\/lib\/bancard-flujo|@\/lib\/bancard|@\/lib\/supabase\/servicio|@\/lib\/avisos-bancard|@\/lib\/aviso-plan-activo|\.\/bancard-servidor|\.\/bancard-flujo|\.\/bancard)['"]/;
  ok('ningún «use client» importa bancard-servidor, bancard-flujo, bancard (node:crypto) ni el cliente de servicio',
    delNavegador.filter((a) => prohibidos.test(leer(a))), []);
  ok('los componentes de Bancard son todos del navegador y están en src/components/bancard/',
    ['BotonPagarBancard', 'HojaPagar', 'SelectorPersonas', 'DesglosePago', 'FormularioBancard', 'EstadoDelPago', 'Comprobante', 'ContactoDePago', 'PanelBancardAdmin',
      'TarjetaGuardada', 'HojaGuardarTarjeta', 'VueltaDeTarjeta', 'EquipoPremium', 'HojaSumarPersonas']
      .filter((n) => !/^'use client'/.test(leer(`src/components/bancard/${n}.tsx`))), []);
}

console.log('\n── La tarjeta guardada y el cobro automático (parte 3) ────');
{
  // Las rutas de la tarjeta: sesión y acceso con el cliente del usuario
  // ANTES de armar el cliente de servicio; el cuerpo trae solo lo mínimo.
  const tarjeta = sinComentarios(leer('src/app/api/pagos/bancard/tarjeta/route.ts'));
  ok('POST /tarjeta (catastro) y DELETE /tarjeta (quitar) existen', [/export async function POST/.test(tarjeta), /export async function DELETE/.test(tarjeta)], [true, true]);
  ok('validan sesión y acceso antes del cliente de servicio',
    tarjeta.indexOf('auth.getUser()') < tarjeta.indexOf('accesoBancard(') && tarjeta.indexOf('accesoBancard(') < tarjeta.indexOf('dependencias()'), true);
  ok('el catastro exige el consentimiento explícito (acepto: true) y guarda el texto exacto aceptado',
    [tarjeta.includes('cuerpo.acepto !== true'), tarjeta.includes('consentimiento: t.bancard.tarjeta.autorizo')], [true, true]);
  ok('del navegador nunca viaja un número de tarjeta, un vencimiento ni un código',
    /cuerpo\.(numero|number|tarjeta_numero|card_number|vencimiento|expiration|cvv|cvc|codigo)/.test(tarjeta), false);
  const verificar = sinComentarios(leer('src/app/api/pagos/bancard/tarjeta/verificar/route.ts'));
  // 07/10: la llamada lleva además `formulario` (lo que dijo el iframe, para
  // anotarlo). La cuenta se sigue pasando igual: es la misma comprobación,
  // con la llamada como quedó.
  ok('verificar: la tarjeta tiene que ser de esa cuenta (lo comprueba el flujo contra la base)',
    [verificar.includes('verificarTarjeta(d, { tarjeta, empresa, formulario })'), verificar.indexOf('auth.getUser()') < verificar.indexOf('dependencias()')], [true, true]);
  const cobrar = sinComentarios(leer('src/app/api/pagos/bancard/cobrar/route.ts'));
  ok('cobrar con la tarjeta guardada: mismo cuerpo que el pago (qué, nunca cuánto), 60 s de tope',
    [cobrar.includes('leerPedidoDePago(cuerpo)'), /cuerpo\.(importe|amount|monto|precio)/.test(cobrar), cobrar.includes('maxDuration = 60')], [true, false, true]);

  // Lo que dice el formulario de catastro no cuenta: se verifica con Bancard.
  const hoja = sinComentarios(leer('src/components/bancard/HojaGuardarTarjeta.tsx'));
  ok('la hoja de guardar: casilla de consentimiento obligatoria, y al terminar el iframe pide /tarjeta/verificar',
    [hoja.includes('acepto: true'), hoja.includes("fetch('/api/pagos/bancard/tarjeta/verificar'"), /disabled=\{!acepto/.test(hoja)], [true, true, true]);
  // 07/10: esto pedía, letra por letra, `onTermino={() => { void verificar(); }}`.
  // Ahora lo que dijo el iframe viaja al servidor para quedar anotado, así que
  // la regla se escribe por lo que cuida: `onTermino` solo dispara la
  // verificación (pasándole lo que oyó), a «guardada» se llega por un único
  // camino, que es la respuesta del servidor, y la hoja no mira el estado que
  // dijo el formulario (ni lo nombra).
  ok('y no cree lo que dijo el iframe: `onTermino` solo dispara la verificación, y «guardada» sale solo de lo que contesta el servidor',
    [/onTermino=\{\(dicho\) => \{ void verificar\(dicho\); \}\}/.test(hoja),
      (hoja.match(/setPaso\('guardada'\)/g) || []).length,
      /if \(r\.ok && d\?\.guardada === true\) \{\s+setGuardada\([^\n]+\n\s+setPaso\('guardada'\);/.test(hoja),
      /add_new_card|_success|_fail|\.mensaje\b/.test(hoja)],
    [true, 1, true, false]);
  const vuelta = leer('src/app/(app)/plan/tarjeta/[tarjeta]/page.tsx');
  ok('/plan/tarjeta/[tarjeta] no lee searchParams: valida el número y verifica con el servidor',
    [/searchParams/.test(vuelta), vuelta.includes("/^[0-9]{1,15}$/"), vuelta.includes('<VueltaDeTarjeta')], [false, true, true]);
  ok('la tarjeta guardada en /plan: quitar pide confirmación y manda DELETE; nunca muestra más que marca y últimos cuatro',
    (() => {
      const s = sinComentarios(leer('src/components/bancard/TarjetaGuardada.tsx'));
      return [s.includes("method: 'DELETE'"), s.includes('<Confirmar'), /vencimiento|expiration|enmascarado|masked/.test(s)];
    })(), [true, true, false]);

  // El equipo del Premium: sumar se paga (tipo 'personas', sin importe); bajar va por el servidor (07/10).
  const sumar = sinComentarios(leer('src/components/bancard/HojaSumarPersonas.tsx'));
  const cuerpoSumar = sumar.slice(sumar.indexOf('const cuerpo = () =>'), sumar.indexOf('const cuerpo = () =>') + 160);
  ok('sumar personas manda tipo personas y la cantidad, nunca un importe',
    [cuerpoSumar.includes("tipo: 'personas'"), /importe|total|amount/.test(cuerpoSumar)], [true, false]);
  ok('y cotiza con la base (cotizar_personas), no con una cuenta propia', sumar.includes("rpc('cotizar_personas'"), true);
  const equipo = sinComentarios(leer('src/components/bancard/EquipoPremium.tsx'));
  // Revisión 07/10 (R1.1): esto afirmaba que la pantalla llamaba el rpc
  // `bancard_bajar_personas` con la sesión. Esa función escribía aunque la
  // cuenta no viera Bancard; ahora es solo del servidor y se entra por una
  // ruta con el molde de las demás (sesión → acceso → cliente de servicio).
  ok('bajar personas va por /api/pagos/bancard/personas (null deshace), sin cobro y sin rpc desde el navegador',
    [equipo.includes("fetch('/api/pagos/bancard/personas'"), equipo.includes('programar(null)'), equipo.includes('personas: n'),
      /rpc\(|clienteNavegador|importe|amount/.test(equipo.slice(equipo.indexOf('async function programar'), equipo.indexOf('async function programar') + 700))],
    [true, true, true, false]);
  ok('ningún archivo de src llama bancard_bajar_personas fuera del flujo del servidor',
    archivos.filter((a) => sinComentarios(leer(a)).includes('bancard_bajar_personas')), ['src/lib/bancard-flujo.ts']);
  const personas = sinComentarios(leer('src/app/api/pagos/bancard/personas/route.ts'));
  ok('la ruta de la baja: sesión, después el acceso con el cliente del usuario, y recién ahí el cliente de servicio',
    [personas.indexOf('auth.getUser()') > 0, personas.indexOf('auth.getUser()') < personas.indexOf('accesoBancard('),
      personas.indexOf('accesoBancard(') < personas.indexOf('baseDeServicio()'), personas.includes('status: 401')],
    [true, true, true, true]);
  ok('le pasa a la regla quién lo pide y si la cuenta ve Bancard; programar sin verlo contesta 403',
    [personas.includes('usuario: user.id'), personas.includes('veBancard: acceso.disponible'), /case 'no_disponible':\s+return NextResponse\.json\(\{ error: t\.bancard\.noDisponible \}, \{ status: 403 \}\)/.test(personas)],
    [true, true, true]);
  ok('no anda con dependencias() (tiene que poder deshacer con Bancard apagado) ni lee un importe',
    [personas.includes('dependencias('), /cuerpo\.(importe|amount|monto|precio)/.test(personas)], [false, false]);
  ok('un cuerpo sin «personas» no deshace nada por descuido', personas.includes("!('personas' in cuerpo)"), true);
  const flujoFuente = sinComentarios(leer('src/lib/bancard-flujo.ts'));
  ok('la regla vive en programarBajaDePersonas: programar exige ver Bancard, deshacer (null) no',
    flujoFuente.includes("if (p.personas !== null && !p.veBancard) return { estado: 'no_disponible' };"), true);
  ok('/plan monta el equipo solo con un Premium pago vigente con cantidad',
    (() => {
      const p = leer('src/app/(app)/plan/page.tsx');
      const m = p.slice(p.indexOf('<EquipoPremium') - 400, p.indexOf('<EquipoPremium'));
      return [m.includes('contratadas !== null'), m.includes('pagoVigente'), m.includes("planEfectivo === 'negocio'")];
    })(), [true, true, true]);

  // La tarea diaria y el borrado de la cuenta.
  const cobros = sinComentarios(leer('src/app/api/tareas/cobros-bancard/route.ts'));
  ok('la tarea de cobros exige el secreto, sin configurar se omite, y contesta solo cantidades',
    [cobros.includes('cronAutorizado(request)'), cobros.includes('omitida'), cobros.includes('correrCobros(d, { hastaMs'), /empresa_id|email|nombre/.test(cobros)], [true, true, true, false]);
  ok('y su reloj está en pg_cron (126), no en vercel.json',
    [leer('supabase/migrations/126_bancard_reloj_y_avisos.sql').includes('/api/tareas/cobros-bancard'), leer('vercel.json').includes('cobros-bancard')], [true, false]);
  ok('borrar la cuenta quita antes la tarjeta en Bancard (a mejor esfuerzo)',
    [leer('src/app/api/cuenta/borrar/route.ts').includes('quitarTarjeta(d, {'), leer('src/app/api/cuenta/borrar/route.ts').includes('.catch(() => undefined)')], [true, true]);

  // Lo que se guarda de una tarjeta (D8 del contrato): ni número, ni vencimiento, ni alias.
  // Solo las columnas (hasta el «);» que cierra la tabla) y sin los
  // comentarios de SQL: el comentario que prohíbe esas columnas las nombra.
  const m124 = leer('supabase/migrations/124_bancard_precio_y_tablas.sql').replace(/--.*$/gm, '');
  const desde = m124.indexOf('create table if not exists public.bancard_tarjetas');
  const tabla = m124.slice(desde, m124.indexOf(');', desde));
  ok('bancard_tarjetas guarda marca, últimos cuatro y tipo; ninguna columna para el número, el vencimiento, el CVV o el alias',
    [['marca', 'ultimos4', 'tipo'].every((c) => tabla.includes(c)), /numero|vencimiento|expiration|cvv|alias|enmascarado|masked/.test(tabla)], [true, false]);

  // Los textos: el cobro automático y las devoluciones están publicados, en los dos idiomas.
  const legal = leer('src/i18n/textos/legal.ts');
  ok('Términos: apartados «cobro-automatico» y «devoluciones» en es y pt',
    [(legal.match(/id: 'cobro-automatico'/g) || []).length, (legal.match(/id: 'devoluciones'/g) || []).length], [2, 2]);
  ok('Privacidad nombra a Bancard entre los proveedores, en es y pt', (legal.match(/\*\*Bancard\*\* \(Paragua[yi]\)/g) || []).length, 2);
  ok('ya no se promete «no hay débito automático»', /No hay débito automático|Não tem débito automático/.test(legal), false);
  ok('el FAQ «¿Cómo se paga?» nombra a Bancard en es y pt',
    [leer('src/i18n/textos/es.ts').includes('pago con tarjeta o QR por Bancard'), leer('src/i18n/textos/pt.ts').includes('pagamento com cartão ou QR pela Bancard')], [true, true]);

  // Las tarjetas de prueba del portal van SOLO en la guía de certificación.
  // (Este archivo se excluye: es el único que tiene que nombrarlas, para buscarlas.)
  const todo = [...archivos, 'README.md', 'supabase/migrations/124_bancard_precio_y_tablas.sql', 'supabase/migrations/125_bancard_pagos.sql',
    'supabase/migrations/126_bancard_reloj_y_avisos.sql',
    ...fs.readdirSync(path.join(RAIZ, 'pruebas')).filter((n) => /\.js$/.test(n) && n !== 'bancard-fuentes.test.js').map((n) => `pruebas/${n}`)];
  ok('ninguna tarjeta de prueba del portal en el código, las pruebas, la base ni el README',
    todo.filter((a) => /4907860500000016|5418630110000014|8601010000000013|4907 8605 0000 0016|5418 6301 1000 0014/.test(leer(a))), []);
}

console.log('\n── La pantalla de vuelta no cree la dirección ─────────────');
{
  const vuelta = leer('src/app/(app)/plan/pago/[op]/page.tsx');
  ok('/plan/pago/[op] no lee searchParams (ni ?status= ni ?description=)', /searchParams/.test(vuelta), false);
  ok('valida el número de pedido y lee el estado de la base con la sesión',
    [vuelta.includes("/^[0-9]{1,15}$/"), vuelta.includes("rpc('bancard_operacion_ver'"), vuelta.includes('notFound()')], [true, true, true]);
  ok('está bajo /plan: el candado de la cuenta vencida la deja pasar',
    leer('src/components/CandadoCuenta.tsx').includes("startsWith('/plan')"), true);
  const formulario = sinComentarios(leer('src/components/bancard/FormularioBancard.tsx'));
  ok('el formulario: tercer argumento { styles, responseHandler }, y un manejador de módulo',
    [/styles:\s*estilosBancard\(/.test(formulario), /responseHandler:\s*manejadorDeModulo/.test(formulario)], [true, true]);
  // 07/10: esto pedía `avisar.current()` sin nada adentro. Ahora el aviso
  // lleva lo que dijo el iframe, pero SOLO pasado por la función que lo
  // limpia, y el formulario sigue sin mirarlo: no nombra ningún estado ni lee
  // ningún campo de lo que le llega.
  ok('y lo que dice el formulario no se usa acá: avisa que terminó y lo pasa limpio, sin mirarlo',
    [formulario.includes('avisar.current(leerLoQueDijoElFormulario(r) ?? undefined)'),
      (formulario.match(/avisar\.current\(/g) || []).length,
      /add_new_card|payment_|_success|_fail|\.message\b|\.details\b|\.status\b|\.description\b/.test(formulario)],
    [true, 1, false]);
  ok('ancho mínimo de 320 px (manual)', formulario.includes('min-w-[320px]'), true);
}

console.log('\n── La confirmación: pública, sin cookies, con tope ────────');
{
  const conf = sinComentarios(leer('src/app/api/pagos/bancard/confirmacion/route.ts'));
  ok('existe y responde con recibirConfirmacion (o sin configurar)',
    [conf.includes('recibirConfirmacion(d, crudo)'), conf.includes('recibirSinConfigurar(crudo)')], [true, true]);
  ok('no usa cookies ni sesión, ni redirige',
    [/cookies\(|clienteServidor|redirect\(/.test(conf)], [false]);
  ok('lee el cuerpo con tope de 64 KB', conf.includes('64 * 1024'), true);
  ok('corre en Node, sin caché, con 30 s', [conf.includes("runtime = 'nodejs'"), conf.includes("dynamic = 'force-dynamic'"), conf.includes('maxDuration = 30')], [true, true, true]);
}

console.log('\n── Del navegador no viaja un importe ──────────────────────');
{
  const pago = sinComentarios(leer('src/app/api/pagos/bancard/pago/route.ts'));
  ok('la ruta de pago no lee un importe del pedido', /cuerpo\.(importe|amount|monto|precio)|c\.(importe|amount|monto|precio)/.test(pago), false);
  ok('valida sesión y acceso antes de armar el cliente de servicio',
    pago.indexOf('auth.getUser()') < pago.indexOf('accesoBancard(') && pago.indexOf('accesoBancard(') < pago.indexOf('dependencias()'), true);
  const hoja = sinComentarios(leer('src/components/bancard/HojaPagar.tsx'));
  const cuerpo = hoja.slice(hoja.indexOf("fetch('/api/pagos/bancard/pago'"), hoja.indexOf("fetch('/api/pagos/bancard/pago'") + 600);
  ok('la ventana de pago manda qué se paga, no cuánto', [/importe|total|amount/.test(cuerpo.slice(0, cuerpo.indexOf('});'))), /plan:/.test(cuerpo)], [false, true]);
  const estado = sinComentarios(leer('src/app/api/pagos/bancard/estado/route.ts'));
  ok('el estado se lee con la sesión de quien pregunta (la base decide si es suyo)',
    [estado.includes("rpc('bancard_operacion_ver'"), estado.indexOf('auth.getUser()') < estado.indexOf('dependencias()')], [true, true]);
  ok('y la pantalla que sondea no consulta a Bancard más de una vez cada 10 segundos (revisión 03/10)',
    /resolverOperacion\(d, operacion, \{ esperaMs: 8_000, noRepetirAntesDeS: 10 \}\)/.test(estado), true);
}

console.log('\n── La revisión del 03/10, en las pantallas y los avisos ─────');
{
  const sumar = sinComentarios(leer('src/components/bancard/HojaSumarPersonas.tsx'));
  ok('«Sumar personas» avisa que cancela la baja programada, y el equipo le pasa la baja',
    [sumar.includes('q.cancelaBaja(datos.proxima)'), sinComentarios(leer('src/components/bancard/EquipoPremium.tsx')).includes('proxima: personas.proxima')], [true, true]);
  ok('el texto existe en es y pt', (leer('src/i18n/textos/bancard.ts').match(/cancelaBaja:/g) || []).length, 2);
  // Decisión del 07/10: esto afirmaba «el correo del fin de la prueba sabe
  // decir que se cobra solo» (4 frases de débito: período y prueba, es y pt).
  // Una cuenta en prueba ya no se cobra sola, así que la prueba no tiene
  // frase de débito: quedan las 2 del plan pago.
  ok('solo el plan pago tiene frase de débito (es y pt); el correo del fin de la prueba no promete ningún cobro',
    [(leer('src/i18n/textos/aviso-vencimiento.ts').match(/fraseDebito:/g) || []).length,
      /fraseDebito/.test(sinComentarios(leer('src/lib/aviso-vencimiento.ts')).split('prueba: {')[1].split('};')[0])],
    [2, false]);
  const avisos = sinComentarios(leer('src/lib/avisos-bancard.ts'));
  ok('un conflicto (la plata se anota, el plan no) no manda «tu plan está activo»', avisos.includes("r.conflicto !== true && typeof r.empresa_id === 'string'"), true);
  ok('«Bloqueo» en /admin dice qué hacer (BANCARD_HTTP=2)',
    [leer('src/components/bancard/PanelBancardAdmin.tsx').includes('BANCARD_HTTP=2'), leer('.env.example').includes('BANCARD_HTTP='), leer('README.md').includes('`BANCARD_HTTP`')], [true, true, true]);
}

console.log('\n── La revisión final del 07/10, en las pantallas ───────────');
{
  const textosBancard = leer('src/i18n/textos/bancard.ts');
  const es = textosBancard.slice(0, textosBancard.indexOf('export const bancardPt'));
  const pt = textosBancard.slice(textosBancard.indexOf('export const bancardPt'));
  const valor = (bloque, clave) => (new RegExp(`\\n\\s+${clave}: '([^']*)'`).exec(bloque) || [])[1] ?? '';
  const guardada = sinComentarios(leer('src/components/bancard/TarjetaGuardada.tsx'));
  const hojaGuardar = sinComentarios(leer('src/components/bancard/HojaGuardarTarjeta.tsx'));
  const plan = sinComentarios(leer('src/app/(app)/plan/page.tsx'));

  // D1 · una cuenta en prueba nunca se cobra sola: las pantallas no lo prometen.
  ok('los textos nuevos existen en es y pt',
    ['guardarSinCobro', 'enPrueba', 'sinPlanActivo', 'pagoRevertido', 'guardarYPagarDetalle'].map((k) => (textosBancard.match(new RegExp(`\\n\\s+${k}:`, 'g')) || []).length),
    [2, 2, 2, 2, 2]);
  ok('en prueba: «Tu tarjeta queda guardada. Cuando termine la prueba elegís tu plan y pagás con un toque; desde ahí se renueva sola.»',
    valor(es, 'enPrueba'), 'Tu tarjeta queda guardada. Cuando termine la prueba elegís tu plan y pagás con un toque; desde ahí se renueva sola.');
  ok('ni ese texto ni el de «sin plan activo» ni el botón prometen un cobro, en ningún idioma',
    [es, pt].map((b) => ['enPrueba', 'sinPlanActivo', 'guardarSinCobro'].map((k) => valor(b, k)))
      .flat().filter((s) => !s || /cobramos|cobro de cada|cobrança de cada|día anterior|dia anterior|vencimiento|vencimento/i.test(s)), []);
  ok('/plan decide si se cobra sola con la misma condición que la base: solo con un plan pago activo',
    [plan.includes("sus.estado === 'activa' && sus.plan !== 'gratis' ? 'activa'"), plan.includes(": sus.en_prueba ? 'prueba'"), plan.includes('momento={momentoDelDebito}')],
    [true, true, true]);
  ok('la tarjeta de /plan, sin plan activo: «Guardar mi tarjeta» a secas y el texto sin promesa, también con la tarjeta ya guardada',
    [guardada.includes("momento === 'prueba' ? k.enPrueba : momento === 'sin_plan' ? k.sinPlanActivo : null"),
      guardada.includes('{sinCobro ?? k.cuando}'), guardada.includes('sinCobro ? k.guardarSinCobro : anual ? k.guardarAnual : k.guardar'),
      guardada.includes('sinCobro ?? k.sinPlan')],
    [true, true, true, true]);
  ok('y la hoja de guardar no promete nada por su cuenta: lo que dice antes y después se lo pasa quien la abre',
    [/k\.(cuando|guardadaDetalle|guardar|guardarAnual)\b/.test(hojaGuardar), hojaGuardar.includes('{antes}'), hojaGuardar.includes('{despues}'),
      guardada.includes('despues={sinCobro ?? k.guardadaDetalle}'),
      sinComentarios(leer('src/components/bancard/HojaPagar.tsx')).includes('despues={k.guardarYPagarDetalle}')],
    [false, true, true, true, true]);

  // D6 · el pago revertido por la administración no es «no pudimos cobrar».
  const tipos = leer('src/components/bancard/tipos.ts');
  const m125 = leer('supabase/migrations/125_bancard_pagos.sql');
  const motivo = (/ERROR_PAGO_REVERTIDO = '([^']+)'/.exec(tipos) || [])[1];
  ok('el motivo que reconoce la pantalla es, letra por letra, el que escribe bancard_revertir (125)',
    [motivo, m125.includes(`ultimo_error = '${motivo}'`)], ['Pago revertido por la administración', true]);
  ok('con ese motivo la pantalla dice «te devolvimos el último pago», antes de llegar a «no pudimos cobrar»',
    [guardada.includes("estado === 'pausado' && debito.ultimo_error === ERROR_PAGO_REVERTIDO) linea = { texto: k.pagoRevertido"),
      guardada.indexOf('ERROR_PAGO_REVERTIDO) linea') < guardada.indexOf('`${errorTexto} ${k.pausado}`'),
      /No pudimos|Não deu pra cobrar/.test(valor(es, 'pagoRevertido') + valor(pt, 'pagoRevertido')), valor(es, 'pagoRevertido').includes('Te devolvimos el último pago')],
    [true, true, false, true]);
  ok('/admin avisa que el débito quedó pausado al revertir', leer('src/components/bancard/PanelBancardAdmin.tsx').includes('d.debito_pausado === true'), true);

  // D4 · la reversa que Bancard hizo sobre una pagada llega a la administración con el texto de la base.
  const avisosB = leer('src/lib/avisos-bancard.ts');
  const motivoReversa = (/MOTIVO_REVERSA_SOBRE_PAGADA = '([^']+)'/.exec(avisosB) || [])[1];
  ok('el aviso de «reversa sobre una pagada» usa el mismo texto que la base deja en «para revisar», y no lo tapa otro aviso del mismo pedido',
    [m125.includes(`'${motivoReversa}'`), sinComentarios(avisosB).includes("r.aviso === 'reversa_sobre_pagada'"),
      sinComentarios(avisosB).includes("avisarAdministracion(servicio, r, MOTIVO_REVERSA_SOBRE_PAGADA, 'reversa')")],
    [true, true, true]);

  // D5 · un 5xx al cobrar con la tarjeta guardada queda incierta.
  ok('cobrarOperacionTomada solo cierra como «no se cobró» un error de Bancard por debajo de 500',
    [sinComentarios(leer('src/lib/bancard-flujo.ts')).includes("if (r.clase === 'bancard' && r.http < 500) {"),
      (sinComentarios(leer('src/lib/bancard-flujo.ts')).match(/if \(r\.clase === 'bancard'\) \{/g) || []).length], [true, 0]);
}

console.log('\n── El catastro que falla dice por qué (07/10) ──────────────');
{
  // Matías probó cinco veces guardar su tarjeta en pruebas y solo vio «No se
  // pudo guardar la tarjeta.»: la respuesta del formulario de Bancard se
  // tiraba. Ahora se muestra y se anota, sin que decida nada.
  const hoja = sinComentarios(leer('src/components/bancard/HojaGuardarTarjeta.tsx'));
  const vuelta = sinComentarios(leer('src/components/bancard/VueltaDeTarjeta.tsx'));
  const ruta = sinComentarios(leer('src/app/api/pagos/bancard/tarjeta/verificar/route.ts'));
  const flujo = sinComentarios(leer('src/lib/bancard-flujo.ts'));
  const lector = leer('src/lib/bancard-formulario.ts');
  const textosBancard = leer('src/i18n/textos/bancard.ts');
  const es = textosBancard.slice(0, textosBancard.indexOf('export const bancardPt'));
  const pt = textosBancard.slice(textosBancard.indexOf('export const bancardPt'));
  /** La línea entera de una clave (sirve también para las que son una función). */
  const linea = (bloque, clave) => (new RegExp(`\\n\\s+${clave}: ([^\\n]*)`).exec(bloque) || [])[1] ?? '';
  const cuantas = (fuente, re) => (fuente.match(re) || []).length;
  /** La ayuda aparece una sola vez y colgada de `entorno === 'staging'`. */
  const ayudaSoloEnPruebas = (fuente) => [
    cuantas(fuente, /k\.ayudaDePruebas/g),
    /\{entorno === 'staging' && \(\s*<p [^>]*>\{k\.ayudaDePruebas\}<\/p>\s*\)\}/.test(fuente),
  ];
  /** «Bancard respondió» va debajo de «No se pudo guardar», solo si hay algo que mostrar. */
  const respuestaDebajo = (fuente) => {
    const fallo = fuente.slice(fuente.lastIndexOf('k.noSeGuardo}'));
    return [fuente.lastIndexOf('k.noSeGuardo}') > 0,
      /^k\.noSeGuardo\}<\/p>\s*\{respuestaDeBancard && <p [^>]*>\{k\.bancardRespondio\(respuestaDeBancard\)\}<\/p>\}/.test(fallo),
      cuantas(fuente, /k\.bancardRespondio\(/g)];
  };

  ok('la hoja le manda al servidor lo que dijo el formulario (campo `formulario`), y solo si dijo algo',
    hoja.includes("body: JSON.stringify({ empresa: empresaId, tarjeta: abierto.tarjeta, ...(formulario ? { formulario } : {}) })"), true);
  ok('si no quedó guardada, la hoja muestra «Bancard respondió: …» debajo de «No se pudo guardar la tarjeta.»', respuestaDebajo(hoja), [true, true, 1]);
  ok('y la ayuda de la cédula de prueba, SOLO en el ambiente de prueba', ayudaSoloEnPruebas(hoja), [1, true]);
  ok('lo que muestra es lo que devolvió el servidor ya limpio (o lo que oyó, si el servidor no contestó)',
    [hoja.includes('dicho = leerLoQueDijoElFormulario(d?.formulario) ?? dicho;'), hoja.includes('setRespuestaDeBancard(textoDeLoQueDijo(dicho));')], [true, true]);

  ok('la vuelta por el return_url levanta `status` y `description` de la dirección y los manda igual',
    [/leerLoQueDijoElFormulario\(\{\s+status: direccion\.get\('status'\),\s+description: direccion\.get\('description'\),\s+\}\)/.test(vuelta),
      vuelta.includes("body: JSON.stringify({ empresa: empresaId, tarjeta, ...(formulario ? { formulario } : {}) })")], [true, true]);
  ok('muestra lo mismo que la hoja: la respuesta de Bancard debajo y la ayuda solo en pruebas',
    [respuestaDebajo(vuelta), ayudaSoloEnPruebas(vuelta)], [[true, true, 1], [1, true]]);
  ok('y tampoco cree la dirección: «guardada» sale solo de lo que contesta el servidor, y no nombra ningún estado',
    [cuantas(vuelta, /k\.guardada\(|k\.guardadaSinDetalle/g),
      /if \(r\.ok && d\?\.guardada === true\) \{\s+setTexto\(d\.marca && d\.ultimos4 \? k\.guardada\(d\.marca, d\.ultimos4\) : k\.guardadaSinDetalle\);/.test(vuelta),
      /add_new_card|_success|_fail|\.mensaje\b/.test(vuelta)],
    [2, true, false]);
  ok('la página de la vuelta le pasa el ambiente, y sigue sin leer la dirección',
    (() => {
      const pagina = leer('src/app/(app)/plan/tarjeta/[tarjeta]/page.tsx');
      return [pagina.includes('entorno={bancard.configurado ? bancard.entorno : null}'), /searchParams/.test(pagina)];
    })(), [true, false]);
  ok('se muestra como texto: ningún componente de Bancard mete HTML a mano',
    fs.readdirSync(path.join(RAIZ, 'src/components/bancard')).filter((n) => /dangerouslySetInnerHTML|innerHTML/.test(leer(`src/components/bancard/${n}`))), []);
  ok('el pago y el 3D Secure siguen igual: no reciben ni miran lo que dice el formulario',
    ['HojaPagar', 'HojaSumarPersonas', 'EstadoDelPago'].map((n) => {
      const s = sinComentarios(leer(`src/components/bancard/${n}.tsx`));
      return [cuantas(s, /onTermino=\{\(\) => \{/g), cuantas(s, /onTermino=/g)];
    }), [[2, 2], [2, 2], [1, 1]]);

  // El servidor: lo que manda el navegador se limpia, se anota y se devuelve; no decide.
  ok('la ruta limpia lo que manda el navegador con la misma función, y lo devuelve cuando la tarjeta no quedó',
    [ruta.includes('const formulario = leerLoQueDijoElFormulario(cuerpo.formulario);'),
      ruta.includes('return NextResponse.json({ guardada: false, motivo: r.motivo, formulario },')], [true, true]);
  ok('la ruta no decide con eso: el único «guardada: true» cuelga de lo que contestó el flujo, y no lee qué dijo el formulario',
    [cuantas(ruta, /guardada: true/g), /if \(r\.guardada\) \{\s+return NextResponse\.json\(\s+\{ guardada: true,/.test(ruta), /formulario[?]?\.(mensaje|detalle)/.test(ruta)],
    [1, true, false]);
  const cuerpoVerificar = flujo.slice(flujo.indexOf('export async function verificarTarjeta('), flujo.indexOf('export type QuitarTarjeta'));
  const desdeLaLista = cuerpoVerificar.slice(cuerpoVerificar.indexOf('const lista = await listarTarjetas('));
  ok('verificarTarjeta anota lo que dijo el formulario (catastro_formulario) ANTES de preguntarle a Bancard',
    [cuerpoVerificar.includes("tarjeta: p.tarjeta, tipo: 'catastro_formulario',"), cuerpoVerificar.includes('ok: dicho.mensaje === CATASTRO_CON_EXITO,'),
      cuerpoVerificar.includes('const dicho = leerLoQueDijoElFormulario(p.formulario);'),
      cuerpoVerificar.indexOf("tipo: 'catastro_formulario',") < cuerpoVerificar.indexOf('const lista = await listarTarjetas('), desdeLaLista.length > 500],
    [true, true, true, true, true]);
  // 07/10 (tarjetas olvidadas): esto decía además «y después no lo vuelve a
  // mirar». Dejó de ser cierto A PROPÓSITO: si el formulario dijo «éxito» y
  // la lista vino sin la tarjeta, se le pregunta a Bancard una vez más y, si
  // sigue sin estar, queda pendiente para la conciliación en vez de fallida
  // para siempre. Lo que se cuida ahora, dicho como es: lo del formulario
  // decide SOLO esa segunda pregunta (un único lugar, y solo para una
  // pendiente), y activar sigue colgando de que Bancard la liste.
  const dondeActiva = desdeLaLista.indexOf("'bancard_activar_tarjeta'");
  ok('lo que dijo el formulario decide una sola cosa: si se le pregunta a Bancard otra vez (y solo por una pendiente)',
    [cuerpoVerificar.includes("const segundaMirada = info.estado === 'pendiente' && dicho?.mensaje === CATASTRO_CON_EXITO;"),
      cuantas(cuerpoVerificar, /segundaMirada/g), cuantas(desdeLaLista, /if \(!t && segundaMirada\) \{/g),
      /\bdicho\b|formulario/.test(desdeLaLista),
      /if \(!t && segundaMirada\) \{[\s\S]*?const otra = await listarTarjetas\([\s\S]*?if \(!t\) return \{ guardada: false, motivo: 'sin_confirmar' \};\s+\}/.test(desdeLaLista)],
    [true, 2, 1, false, true]);
  ok('y activar cuelga solo de que Bancard la liste: hay un único bancard_activar_tarjeta, después de todas las salidas de «no está»',
    [cuantas(cuerpoVerificar, /'bancard_activar_tarjeta'/g), dondeActiva > 0,
      dondeActiva > desdeLaLista.indexOf("return { guardada: false, motivo: 'sin_confirmar' }"),
      dondeActiva > desdeLaLista.indexOf("return { guardada: false, motivo: 'no_esta' }"),
      desdeLaLista.indexOf("return { guardada: false, motivo: 'no_esta' }") > 0,
      /sin_confirmar[\s\S]*bancard_tarjeta_fallida/.test(desdeLaLista), cuantas(desdeLaLista, /'bancard_tarjeta_fallida'/g)],
    [1, true, true, true, true, true, 1]);
  ok('y lo anota recién cuando la tarjeta es de esa cuenta',
    cuerpoVerificar.indexOf("return { guardada: false, motivo: 'ajena' }") > 0
      && cuerpoVerificar.indexOf("return { guardada: false, motivo: 'ajena' }") < cuerpoVerificar.indexOf('leerLoQueDijoElFormulario(p.formulario)'), true);
  const cuerpoListar = flujo.slice(flujo.indexOf('async function listarTarjetas('), flujo.indexOf('async function borrarEnBancard('));
  ok('users_cards anota cuántas tarjetas vinieron y sus card_id, y nada más de la tarjeta (ni alias, ni enmascarado, ni vencimiento, ni marca)',
    [cuerpoListar.includes("detalle: r.ok === true ? { cuantas: r.tarjetas.length, ids: r.tarjetas.map((t) => t.cardId).join(',') } : {},"),
      /\.alias|enmascarado|vencimiento|\.marca|clavePrivada/.test(cuerpoListar)],
    [true, false]);
  // La base (125, bancard_sanear_detalle) descarta del detalle algunas claves
  // por nombre: las que se usan acá no pueden estar en esa lista.
  const descartadas = ((/lower\(e\.key\) not in \(([^)]+)\)/.exec(leer('supabase/migrations/125_bancard_pagos.sql')) || [])[1] ?? '').match(/'[a-z_0-9]+'/g) || [];
  ok('las claves del detalle (cuantas, ids, descripcion) no son de las que la base descarta',
    [descartadas.length >= 10, ['cuantas', 'ids', 'descripcion'].filter((c) => descartadas.includes(`'${c}'`))], [true, []]);

  // El lector: puro, y lo usan los dos lados.
  ok('bancard-formulario.ts es puro (sin imports ni variables del servidor) y lo usan el navegador, la ruta y el flujo',
    [/^\s*import /m.test(lector), /process\.env/.test(lector),
      ['src/components/bancard/FormularioBancard.tsx', 'src/components/bancard/HojaGuardarTarjeta.tsx', 'src/components/bancard/VueltaDeTarjeta.tsx',
        'src/app/api/pagos/bancard/tarjeta/verificar/route.ts'].filter((a) => !leer(a).includes("from '@/lib/bancard-formulario'")),
      flujo.includes("from './bancard-formulario'")],
    [false, false, [], true]);

  // Los textos: en los dos idiomas, cortos, y sin nada de la tarjeta ni de las claves.
  const nuevos = ['bancardRespondio', 'ayudaDePruebas'];
  ok('los textos nuevos existen en es y pt', nuevos.map((k) => cuantas(textosBancard, new RegExp(`\\n\\s+${k}:`, 'g'))), [2, 2]);
  ok('«Bancard respondió: …» / «A Bancard respondeu: …»',
    [linea(es, 'bancardRespondio'), linea(pt, 'bancardRespondio')],
    ['(respuesta: string) => `Bancard respondió: ${respuesta}`,', '(respuesta) => `A Bancard respondeu: ${respuesta}`,']);
  ok('la ayuda de pruebas nombra la cédula 9661000 y una tarjeta de prueba de Bancard, en los dos idiomas',
    [linea(es, 'ayudaDePruebas').includes('la cédula 9661000'), linea(es, 'ayudaDePruebas').includes('tarjeta de prueba de Bancard'),
      linea(pt, 'ayudaDePruebas').includes('9661000'), linea(pt, 'ayudaDePruebas').includes('cartão de teste da Bancard')],
    [true, true, true, true]);
  ok('ningún texto nuevo lleva un alias, un número enmascarado, un número de tarjeta ni una clave; y son cortos',
    [es, pt].flatMap((b) => nuevos.map((k) => linea(b, k)))
      .filter((s) => !s || s.length > 140 || /alias|token|enmascarad|mascarad|clave|chave|senha|\*{2,}|•|[0-9]{8,}/i.test(s)), []);
}

console.log('\n── El comprobante no muestra lo que el manual prohíbe ─────');
{
  const comp = sinComentarios(leer('src/components/bancard/Comprobante.tsx'));
  ok('ni autorización, ni código de respuesta, ni respuesta extendida, ni datos de seguridad',
    ['authorization', 'autorizacion', 'response_code', 'extended_response', 'security_information', 'ticket'].filter((p) => comp.includes(p)), []);
  ok('sí fecha y hora, número de pedido, importe y descripción',
    ['c.fechaYHora', 'c.pedido', 'c.importe', 'c.descripcion'].every((p) => comp.includes(p)), true);
  ok('y el contacto (manual: «la sección de Contacto»)', comp.includes('<ContactoDePago'), true);
  const tipos = leer('src/components/bancard/tipos.ts');
  ok('lo que ve la persona de una operación no tiene campos de autorización',
    /authorization|autorizacion|response_code/.test(sinComentarios(tipos)), false);
}

console.log('\n── Reglas de pantalla del proyecto ─────────────────────────');
{
  ok('no hay loading.tsx en las pantallas de adentro', existe('src/app/(app)/loading.tsx'), false);
  const bancard = fs.readdirSync(path.join(RAIZ, 'src/components/bancard')).map((n) => `src/components/bancard/${n}`);
  const velo = /["'`][^"'`]*\bfixed\b[^"'`]*\binset-0\b[^"'`]*["'`]|["'`][^"'`]*\binset-0\b[^"'`]*\bfixed\b[^"'`]*["'`]/;
  ok('ningún componente de Bancard arma su propio velo (usan la Hoja)', bancard.filter((a) => velo.test(sinComentarios(leer(a)))), []);
  ok('colores por variables: sin bg-white opaco ni dark:', bancard.filter((a) => /\bbg-white(?!\/)|\bdark:/.test(leer(a))), []);
  ok('los textos de Bancard viven en textos/bancard.ts, colgados de es y pt',
    [leer('src/i18n/textos/es.ts').includes('bancard: bancardEs'), leer('src/i18n/textos/pt.ts').includes('bancard: bancardPt'),
      leer('src/i18n/textos/bancard.ts').includes('export const bancardPt: typeof bancardEs')], [true, true, true]);
  const cfg = leer('next.config.mjs');
  ok('/plan no se puede meter en un iframe ajeno', [cfg.includes("frame-ancestors 'self'"), cfg.includes("source: '/plan/:path*'")], [true, true]);
}

console.log('\n── Las tareas y el reloj ──────────────────────────────────');
{
  const tarea = leer('src/app/api/tareas/conciliar-bancard/route.ts');
  ok('la conciliación exige el secreto antes de nada', tarea.includes('cronAutorizado(request)'), true);
  ok('y su reloj está en pg_cron (126), no en vercel.json',
    [leer('supabase/migrations/126_bancard_reloj_y_avisos.sql').includes('/api/tareas/conciliar-bancard'),
      leer('vercel.json').includes('conciliar-bancard')], [true, false]);
  const admin = ['probar', 'consultar', 'revertir', 'olvidadas'].map((n) => sinComentarios(leer(`src/app/api/admin/bancard/${n}/route.ts`)));
  ok('las rutas de /api/admin/bancard exigen ser la administración', admin.every((s) => s.includes("rpc('es_superadmin')") && s.includes('403')), true);
  ok('y son todas las que hay: ninguna carpeta de /api/admin/bancard queda sin mirar',
    fs.readdirSync(path.join(RAIZ, 'src/app/api/admin/bancard')).sort(), ['consultar', 'olvidadas', 'probar', 'revertir']);
}

console.log('\n── Tarjetas olvidadas en Bancard (07/10) ───────────────────');
{
  // La herramienta de /admin que busca, por número de pagador, las tarjetas
  // que Bancard tiene guardadas y deja borrar las que Orden no usa. Lo que no
  // se puede correr sin Next ni sesión, leído acá: quién entra, qué viaja del
  // navegador, y que nada de la tarjeta (ni su alias) pasa por la ruta ni por
  // la pantalla.
  const cuantas = (fuente, re) => (fuente.match(re) || []).length;
  const ruta = sinComentarios(leer('src/app/api/admin/bancard/olvidadas/route.ts'));
  const buscar = ruta.slice(ruta.indexOf('export async function POST('), ruta.indexOf('export async function DELETE('));
  const borrar = ruta.slice(ruta.indexOf('export async function DELETE('));
  ok('la ruta busca con POST y borra con DELETE, en Node, sin caché y con 60 s',
    [buscar.length > 300, borrar.length > 300, ruta.includes("runtime = 'nodejs'"), ruta.includes("dynamic = 'force-dynamic'"), ruta.includes('maxDuration = 60')],
    [true, true, true, true, true]);
  /** En cada una: sesión → es_superadmin con la sesión de quien llama → y recién después el cliente de servicio. */
  const orden = (s) => {
    const sesion = s.indexOf('auth.getUser()');
    const sinSesion = s.indexOf("if (!user) return NextResponse.json({ ok: false }, { status: 401 });");
    const esSuper = s.indexOf("supabase.rpc('es_superadmin')");
    const noEsSuper = s.indexOf("if (esSuper !== true) return NextResponse.json({ ok: false }, { status: 403 });");
    const servicio = s.indexOf('dependencias()');
    return [sesion > 0, sesion < sinSesion, sinSesion < esSuper, esSuper < noEsSuper, noEsSuper < servicio, cuantas(s, /dependencias\(\)/g)];
  };
  ok('buscar: sin sesión contesta 401 y un usuario común 403, ANTES de armar el cliente de servicio y de hablar con Bancard',
    [orden(buscar), buscar.indexOf('dependencias()') < buscar.indexOf('buscarOlvidadas(d,')], [[true, true, true, true, true, 1], true]);
  ok('borrar: lo mismo',
    [orden(borrar), borrar.indexOf('dependencias()') < borrar.indexOf('borrarOlvidada(d,')], [[true, true, true, true, true, 1], true]);
  ok('el permiso se pregunta con la sesión de quien llama (el cliente del usuario), nunca con el de servicio',
    [cuantas(ruta, /const supabase = clienteServidor\(\);/g), /clienteDeServicio|baseDeServicio|SERVICE_ROLE/.test(ruta)], [2, false]);
  ok('la búsqueda tiene tope de tiempo (40 s de reloj en una ruta de 60) y el rango se valida antes de tocar Bancard',
    [buscar.includes('buscarOlvidadas(d, { desde, hasta }, { hastaMs: Date.now() + 40_000 })'),
      buscar.indexOf('desde > hasta') > 0 && buscar.indexOf('desde > hasta') < buscar.indexOf('dependencias()'), buscar.includes("status: 400")],
    [true, true, true]);
  const flujoFuente = sinComentarios(leer('src/lib/bancard-flujo.ts'));
  ok('y tope de rango: 40 pagadores por pedido, y la búsqueda no hace nada en paralelo',
    [flujoFuente.includes('export const TOPE_DE_BUSQUEDA = 40;'), flujoFuente.includes('Math.min(p.hasta, desde + TOPE_DE_BUSQUEDA - 1)'),
      /Promise\.all/.test(flujoFuente.slice(flujoFuente.indexOf('export async function buscarOlvidadas('), flujoFuente.indexOf('export type BorradoDeOlvidada')))],
    [true, true, false]);
  ok('del pedido de borrar se leen SOLO el pagador y el número de tarjeta: que se pueda borrar no lo dice el navegador',
    [[...new Set(borrar.match(/cuerpo\.[A-Za-z_]+/g) || [])].sort(), borrar.includes('borrarOlvidada(d, { userId, cardId, actor: user.id })')],
    [['cuerpo.cardId', 'cuerpo.userId'], true]);
  ok('y del de buscar, solo el rango', [...new Set(buscar.match(/cuerpo\.[A-Za-z_]+/g) || [])].sort(), ['cuerpo.desde', 'cuerpo.hasta']);
  ok('si Orden la tiene en uso o a medio guardar contesta 409; si la base no contestó 503; si Bancard no contestó 502',
    [borrar.includes("status: r.motivo === 'base' ? 503 : 409"), /if \(r\.motivo === 'bancard'\) \{\s+return NextResponse\.json\(\{ ok: false, motivo: r\.motivo, clave: r\.clave \?\? '' \}, \{ status: 502,/.test(borrar)],
    [true, true]);
  ok('la ruta no nombra el alias, el número enmascarado ni el vencimiento, ni lee las claves',
    /alias|enmascarad|masked|vencimiento|expiration|clavePrivada|process\.env/i.test(ruta), false);

  // El flujo: lo que decide, se decide al borrar, y el alias no sale de ahí.
  const cuerpoBorrar = flujoFuente.slice(flujoFuente.indexOf('export async function borrarOlvidada('), flujoFuente.indexOf('export type PruebaDeConexion'));
  const pasos = ['d.bancard.tarjetas(userId,', 'lista.tarjetas.find((x) => x.cardId === cardId)', 'estadoEnOrden(await tarjetaInterna(d, cardId), userId, d.entorno)',
    'if (!sePuedeOlvidar(estado)) return', 'd.bancard.borrarTarjeta(userId, t.alias,'].map((p) => cuerpoBorrar.indexOf(p));
  ok('borrarOlvidada: lista recién pedida → la tarjeta en ESA lista → la base, ahora → si no se olvida, vuelve → y recién ahí el borrado',
    [pasos.every((i) => i > 0), pasos.every((i, n) => n === 0 || i > pasos[n - 1]), cuantas(cuerpoBorrar, /borrarTarjeta\(/g)], [true, true, 1]);
  ok('el alias se usa en un solo lugar (el pedido de borrado) y no se devuelve ni se anota',
    [cuantas(cuerpoBorrar, /\.alias\b/g), /return \{[^}]*alias/.test(cuerpoBorrar), /detalle: [^\n]*alias/.test(cuerpoBorrar)], [1, false, false]);
  const cuerpoBuscar = flujoFuente.slice(flujoFuente.indexOf('export async function buscarOlvidadas('), flujoFuente.indexOf('export type BorradoDeOlvidada'));
  ok('buscarOlvidadas no toca el alias ni el vencimiento, y del enmascarado saca solo los últimos cuatro',
    [/\.alias\b|vencimiento/.test(cuerpoBuscar), cuantas(cuerpoBuscar, /enmascarado/g), cuerpoBuscar.includes('ultimos4: ultimos4(t.enmascarado),')], [false, 1, true]);
  ok('la regla es una sola y la usan las dos: nunca una activa ni una pendiente',
    [flujoFuente.includes("return e === 'sin_cuenta' || e === 'fallida' || e === 'quitada' || e === 'por_quitar';"),
      cuantas(cuerpoBuscar, /sePuedeOlvidar\(/g), cuantas(cuerpoBorrar, /sePuedeOlvidar\(/g)], [true, 1, 1]);
  // Revisión del 07/10: la búsqueda no puede quedar trabada en un pagador por
  // el que Bancard contesta algo raro. Parar por «bloqueo» o por «red» cuelga
  // de que la pregunta de «Probar conexión» tampoco pase; y un JSON sin la
  // lista no es una página.
  const dondePregunta = cuerpoBuscar.indexOf('await probarConexion(d,');
  ok('buscarOlvidadas: antes de parar por bloqueo o por red hace la pregunta de «Probar conexión», y un JSON sin la lista no para la búsqueda',
    [cuerpoBuscar.includes("const pagina = lista.clase === 'no_json' && lista.clave !== 'forma_desconocida';"),
      dondePregunta > 0, cuantas(cuerpoBuscar, /probarConexion\(/g),
      dondePregunta < cuerpoBuscar.indexOf("cortar('bloqueo'"), dondePregunta < cuerpoBuscar.indexOf("cortar('red'"),
      cuantas(cuerpoBuscar, /cortar\('bloqueo'/g), cuantas(cuerpoBuscar, /cortar\('red'/g),
      /if \(prueba\.resultado !== 'bien'\) \{[\s\S]*?cortar\('bloqueo', u\);[\s\S]*?cortar\('red', u - \(CORTES_SEGUIDOS - 1\)\);\s+break;\s+\}/.test(cuerpoBuscar)],
    [true, true, 1, true, true, 1, 1, true]);
  // Y la conciliación (arreglo B): la pendiente vieja de una cuenta que guardó
  // otra NO se borra con `borrarEnBancard` (termina en 'hecho', que a una
  // activa la quita y le apaga el débito): lista, la base otra vez, y recién
  // ahí el borrado.
  const cuerpoDescartar = flujoFuente.slice(flujoFuente.indexOf('async function descartarPendienteVieja('), flujoFuente.indexOf('export async function correrConciliacion('));
  const pasosDescartar = ['await listarTarjetas(d, p.userId,', "if (estadoEnOrden(await tarjetaInterna(d, p.tarjeta), p.userId, d.entorno) !== 'pendiente') return;",
    'd.bancard.borrarTarjeta(p.userId, t.alias,', "'bancard_tarjeta_fallida'"].map((p) => cuerpoDescartar.indexOf(p));
  const cuerpoConciliar = flujoFuente.slice(flujoFuente.indexOf('export async function correrConciliacion('), flujoFuente.indexOf('export type EstadoEnOrden'));
  const lasPendientes = cuerpoConciliar.slice(cuerpoConciliar.indexOf('r.data.tarjetas_pendientes'), cuerpoConciliar.indexOf('r.data.tarjetas_por_quitar'));
  ok('la conciliación, con la pendiente vieja: lista → la base OTRA VEZ (solo si sigue pendiente) → el borrado → fallida; sin `borrarEnBancard` ni el paso «hecho»',
    [pasosDescartar.every((i) => i > 0), pasosDescartar.every((i, n) => n === 0 || i > pasosDescartar[n - 1]), cuantas(cuerpoDescartar, /borrarTarjeta\(/g),
      /borrarEnBancard\(|'bancard_quitar_tarjeta'/.test(cuerpoDescartar),
      lasPendientes.length > 300, lasPendientes.includes('await descartarPendienteVieja(d, { tarjeta, userId: Number(p.user_id) });'), /borrarEnBancard\(/.test(lasPendientes)],
    [true, true, 1, false, true, true, false]);
  // Sin migración: todo lo que el flujo le pide a la base ya está en las
  // migraciones de Bancard (124 a 126). Una función nueva acá fallaría en
  // producción hasta aplicar su migración.
  //
  // 07/10 (cambiar de plan): la lista suma la 130. El flujo llama ahora una
  // función que nace ahí (`bancard_programar_plan`, programar la baja de
  // plan), y por eso la 130 se aplica ANTES de publicar este código. Que sea
  // la ÚNICA función de fuera de la 124-126 lo afirma el grupo «Cambiar de
  // plan», más abajo; y que la herramienta de tarjetas olvidadas no usa
  // ninguna nueva lo sigue diciendo el último dato de esta comprobación.
  const sqlBancard = ['124_bancard_precio_y_tablas.sql', '125_bancard_pagos.sql', '126_bancard_reloj_y_avisos.sql', '130_cambiar_de_plan.sql']
    .map((n) => leer(`supabase/migrations/${n}`)).join('\n');
  const pedidas = [...new Set(flujoFuente.match(/'bancard_[a-z_]+'/g) || [])].map((s) => s.slice(1, -1));
  ok('la herramienta no necesita ninguna función nueva en la base: todas las que llama el flujo existen en las migraciones de Bancard (124-126 y 130)',
    [pedidas.length > 15, pedidas.includes('bancard_tarjeta_interna'), pedidas.filter((n) => !sqlBancard.includes(`function public.${n}(`)),
      [...new Set((cuerpoBuscar + cuerpoBorrar).match(/'bancard_[a-z_]+'/g) || [])]],
    [true, true, [], ["'bancard_quitar_tarjeta'"]]);

  // La pantalla.
  const panel = sinComentarios(leer('src/components/bancard/PanelBancardAdmin.tsx'));
  const tramo = panel.slice(panel.indexOf('type EstadoEnOrden ='), panel.indexOf('export function PagosBancardDeCuenta('));
  ok('el panel la monta solo con Bancard configurado, y está en el archivo de la administración',
    [panel.includes('{config.configurado && <TarjetasOlvidadas />}'), tramo.length > 3000, tramo.includes('Tarjetas olvidadas en Bancard')], [true, true, true]);
  ok('busca y borra por la ruta de la administración, mandando solo el rango o los dos números',
    [cuantas(tramo, /fetch\('\/api\/admin\/bancard\/olvidadas'/g), tramo.includes('body: JSON.stringify({ desde: a, hasta: b })'),
      tramo.includes('body: JSON.stringify({ userId: t.userId, cardId: t.cardId })'), /rpc\(|clienteNavegador/.test(tramo)],
    [2, true, true, false]);
  ok('el botón de borrar aparece solo si el servidor dijo que se puede, y antes pregunta',
    [/\{t\.sePuedeBorrar && \(\s+<button/.test(tramo), /<Confirmar\s/.test(tramo), /<ConfirmarBorrado\s/.test(tramo),
      /onClick=\{borrar\}/.test(tramo), cuantas(tramo, /onSi=\{borrar\}/g)],
    [true, true, true, false, 1]);
  // Revisión del 07/10: tocar «Borrar en Bancard» mientras corría «Seguir
  // desde el N» borraba la tarjeta y, al terminar la búsqueda, el renglón
  // volvía a aparecer como olvidada (y los dos pedidos salían a la vez).
  ok('buscar y borrar van de a uno: mientras busca, el botón de borrar del renglón queda apagado; y mientras borra, los dos de buscar',
    [/\{t\.sePuedeBorrar && \(\s+<button\s+type="button" className="[^"]*" disabled=\{borrando \|\| buscando\}/.test(tramo),
      cuantas(tramo, /disabled=\{buscando \|\| borrando\}/g), cuantas(tramo, /disabled=\{(buscando|borrando)\}/g)],
    [true, 2, 0]);
  ok('en producción la confirmación es más fuerte: hay que escribir BORRAR; y si no se sabe el ambiente, se trata como producción',
    [tramo.includes("const PALABRA_PARA_BORRAR = 'BORRAR';"), tramo.includes('disabled={ocupado || !escrita}'),
      tramo.includes('const escrita = palabra.trim().toUpperCase() === PALABRA_PARA_BORRAR;'), tramo.includes("enProduccion={busqueda?.entorno !== 'staging'}"),
      /if \(!enProduccion\) \{\s+return \(\s+<Confirmar/.test(tramo)],
    [true, true, true, true, true]);
  ok('la pantalla no nombra el alias, el número enmascarado ni el vencimiento: muestra pagador, tarjeta, marca y últimos cuatro',
    [/alias|enmascarad|masked|vencimiento|expiration/i.test(tramo), tramo.includes('pagador {t.userId} · tarjeta N.º {t.cardId}'), tramo.includes('•••• ${t.ultimos4}')],
    [false, true, true]);
  const estados = ['sin_cuenta', 'fallida', 'quitada', 'por_quitar', 'pendiente', 'activa', 'otro_entorno', 'no_coincide', 'sin_dato'];
  ok('cada estado que puede contestar el servidor tiene su texto, y los que no se tocan lo dicen',
    [estados.filter((e) => !new RegExp(`\\n\\s+${e}: \\{ texto: '[^']+', clase: `).test(tramo)),
      ['pendiente', 'activa', 'otro_entorno', 'no_coincide', 'sin_dato'].filter((e) => !new RegExp(`\\n\\s+${e}: \\{ texto: '[^']*[Nn]o se toca'`).test(tramo))],
    [[], []]);

  // «Guardar mi tarjeta»: qué hacer cuando Bancard dice que ya está catastrada, y el «sin confirmar».
  const textosBancard = leer('src/i18n/textos/bancard.ts');
  const es = textosBancard.slice(0, textosBancard.indexOf('export const bancardPt'));
  const pt = textosBancard.slice(textosBancard.indexOf('export const bancardPt'));
  const valor = (bloque, clave) => (new RegExp(`\\n\\s+${clave}: '([^']*)'`).exec(bloque) || [])[1] ?? '';
  const claves = ['yaCatastrada', 'yaCatastradaPruebas', 'sinConfirmar'];
  ok('los tres textos nuevos existen en es y pt', claves.map((k) => cuantas(textosBancard, new RegExp(`\\n\\s+${k}:`, 'g'))), [2, 2, 2]);
  ok('«ya catastrada» le dice a la persona qué puede hacer: esperar, probar con otra tarjeta o escribirnos',
    [/esperá/.test(valor(es, 'yaCatastrada')), /otra tarjeta/.test(valor(es, 'yaCatastrada')), /escribinos/.test(valor(es, 'yaCatastrada')),
      /espere/.test(valor(pt, 'yaCatastrada')), /outro cartão/.test(valor(pt, 'yaCatastrada')), /fale com a gente/.test(valor(pt, 'yaCatastrada'))],
    [true, true, true, true, true, true]);
  ok('«sin confirmar» dice que no la cargue de nuevo, en los dos idiomas',
    [/no la cargues de nuevo/.test(valor(es, 'sinConfirmar')), /não cadastre outra vez/.test(valor(pt, 'sinConfirmar'))], [true, true]);
  ok('ninguno lleva nada de la tarjeta ni de las claves, y con voseo en español',
    [[es, pt].flatMap((b) => claves.map((k) => valor(b, k))).filter((s) => !s || s.length > 220 || /alias|token|enmascarad|mascarad|clave|chave|senha|\*{2,}|•|[0-9]{6,}/i.test(s)),
      /\b(espera|prueba|escríbenos|puedes|tienes)\b/.test(claves.map((k) => valor(es, k)).join(' '))],
    [[], false]);
  const lector = sinComentarios(leer('src/lib/bancard-formulario.ts'));
  ok('reconocer «ya catastrada» vive en el lector puro, que sigue sin imports', [lector.includes('export function tarjetaYaCatastrada('), /^\s*import /m.test(lector)], [true, false]);
  for (const nombre of ['HojaGuardarTarjeta', 'VueltaDeTarjeta']) {
    const s = sinComentarios(leer(`src/components/bancard/${nombre}.tsx`));
    const ayuda = s.slice(s.indexOf('{yaCatastrada && ('), s.indexOf('{yaCatastrada && (') + 500);
    ok(`${nombre}: la ayuda sale solo si Bancard dijo «ya catastrada», debajo de su respuesta, con el contacto; lo de pruebas, solo en pruebas`,
      [s.includes('setYaCatastrada(tarjetaYaCatastrada(dicho));'), cuantas(s, /\{yaCatastrada && \(/g),
        s.indexOf('{yaCatastrada && (') > s.indexOf('k.bancardRespondio(respuestaDeBancard)'),
        ayuda.includes('<p>{k.yaCatastrada}</p>'), ayuda.includes('<ContactoDePago />'),
        /\{entorno === 'staging' && <p [^>]*>\{k\.yaCatastradaPruebas\}<\/p>\}/.test(ayuda), cuantas(s, /k\.yaCatastradaPruebas/g)],
      [true, 1, true, true, true, true, 1]);
    ok(`${nombre}: «sin confirmar» sale solo si lo contestó el servidor, y no se muestra como un fallo`,
      [/if \(r\.ok && d\?\.motivo === 'sin_confirmar'\) \{/.test(s), cuantas(s, /k\.sinConfirmar/g),
        /role="status"[^>]*>\{k\.sinConfirmar\}<\/p>/.test(s)],
      [true, 1, true]);
  }
  const hoja = sinComentarios(leer('src/components/bancard/HojaGuardarTarjeta.tsx'));
  const pieSinConfirmar = hoja.slice(hoja.indexOf(") : paso === 'sin_confirmar' ? ("), hoja.indexOf(") : paso === 'sin_confirmar' ? (") + 260);
  ok('en la hoja, «sin confirmar» solo deja cerrar: no ofrece «Probar de nuevo» (cargarla otra vez es lo que Bancard rechaza)',
    [pieSinConfirmar.includes('onClick={onCerrar}'), pieSinConfirmar.includes('k.probarDeNuevo'), cuantas(hoja, /k\.probarDeNuevo/g)], [true, false, 1]);
}

console.log('\n── La respuesta de un cobro que no se entendió (07/10/2026) ──');
{
  const cliente = sinComentarios(leer('src/lib/bancard.ts'));
  const flujo = sinComentarios(leer('src/lib/bancard-flujo.ts'));
  ok('el cobro lee el resultado de «operation» o de «confirmation»',
    /esObjeto\(r\.cuerpo\.operation\) \? r\.cuerpo\.operation : r\.cuerpo\.confirmation/.test(cliente), true);
  ok('y si no lo entiende, el evento «charge» guarda la forma (nombres de campos), no la respuesta',
    /tipo: 'charge'[\s\S]{0,400}r\.forma \? \{ forma: r\.forma \} : \{\}/.test(flujo), true);
  const forma = cliente.slice(cliente.indexOf('function formaDe('), cliente.indexOf('function esObjeto('));
  ok('la forma se arma solo con Object.keys: nunca lee un valor de texto de la respuesta',
    [forma.includes('Object.keys('), /String\(|JSON\.stringify|\$\{v\}|\+ v\b/.test(forma)], [true, false]);
  // La base deja pasar esa clave: es un texto suelto que no está en la lista de lo que nunca se guarda.
  const sanear = leer('supabase/migrations/125_bancard_pagos.sql');
  const prohibidas = sanear.slice(sanear.indexOf("lower(e.key) not in ("), sanear.indexOf("lower(e.key) not in (") + 400);
  ok('«forma» no está entre las claves que la base descarta del detalle', /'forma'/.test(prohibidas), false);
}

console.log('\n── Cambiar de plan con días pagos (130, 07/10/2026) ─────────');
{
  // Matías: «Si la persona quiere cambiar al Pro o al Premium me lleva al
  // WhatsApp. ¿No hay una forma de que se pueda pagar con tarjeta o con QR?»
  // Subir se paga hoy (la diferencia por los días que faltan); bajar se
  // programa para la renovación. Lo que corre está en bancard-flujo.test.js
  // y en cambiar-plan.test.js; acá, lo que solo se puede cuidar leyendo.
  const cuantas = (fuente, re) => (fuente.match(re) || []).length;
  const hoja = sinComentarios(leer('src/components/bancard/HojaCambiarPlan.tsx'));
  const baja = sinComentarios(leer('src/components/bancard/BajaDePlan.tsx'));
  const plan = sinComentarios(leer('src/app/(app)/plan/page.tsx'));
  const servidor = sinComentarios(leer('src/lib/bancard-servidor.ts'));
  const flujo = sinComentarios(leer('src/lib/bancard-flujo.ts'));
  const ruta = sinComentarios(leer('src/app/api/pagos/bancard/plan/route.ts'));
  const m130 = leer('supabase/migrations/130_cambiar_de_plan.sql');
  const nuevos = ['HojaCambiarPlan', 'BotonCambiarPlan', 'BajaDePlan'];
  /** El cuerpo de una función de la hoja, hasta su llave de cierre. */
  const funcionDe = (fuente, nombre) => {
    const i = fuente.indexOf(`async function ${nombre}(`);
    return i < 0 ? '' : fuente.slice(i, fuente.indexOf('\n  }\n', i));
  };

  // ---- Del navegador no viaja un importe ni un período.
  ok('los componentes nuevos son del navegador y no importan nada del servidor',
    [nuevos.filter((n) => !/^'use client'/.test(leer(`src/components/bancard/${n}.tsx`))),
      nuevos.filter((n) => /from ['"]@\/lib\/(bancard|bancard-servidor|bancard-flujo|supabase\/servicio)['"]/.test(leer(`src/components/bancard/${n}.tsx`)))],
    [[], []]);
  const cuerpoDelCambio = hoja.slice(hoja.indexOf('const cuerpo = () =>'), hoja.indexOf('});', hoja.indexOf('const cuerpo = () =>')) + 3);
  ok('el pedido de cambio manda el tipo, a qué plan y cuántas personas; ni importe, ni período, ni fecha',
    [cuerpoDelCambio.includes("tipo: 'cambio'"), cuerpoDelCambio.includes('plan: datos.plan'), cuerpoDelCambio.includes('personas: conPersonas ? personas : null'),
      /importe|total|amount|monto|precio|periodo|vence|fecha|dias/.test(cuerpoDelCambio), cuantas(hoja, /body: cuerpo\(\)/g), cuantas(hoja, /JSON\.stringify\(/g)],
    [true, true, true, false, 2, 1]);
  ok('va por las dos rutas de pago de siempre, y esas rutas siguen leyendo el pedido con leerPedidoDePago (sin importe)',
    [cuantas(hoja, /fetch\('\/api\/pagos\/bancard\/pago'/g), cuantas(hoja, /fetch\('\/api\/pagos\/bancard\/cobrar'/g), cuantas(hoja, /fetch\(/g),
      ['pago', 'cobrar'].map((r) => sinComentarios(leer(`src/app/api/pagos/bancard/${r}/route.ts`)))
        .map((s) => [s.includes('leerPedidoDePago(cuerpo)'), /cuerpo\.(importe|amount|monto|precio|periodo)/.test(s)])],
    [1, 1, 2, [[true, false], [true, false]]]);
  ok('leerPedidoDePago: del cambio sale el plan de destino (Pro o Premium) y el período va SIEMPRE en null',
    [servidor.includes("if (c.plan !== 'pro' && c.plan !== 'negocio') return null;"), servidor.includes('return { tipo, plan: c.plan, periodo: null, personas };'),
      servidor.includes("tipo: 'plan' | 'personas' | 'cambio';"), flujo.includes("tipo: 'plan' | 'personas' | 'cambio';")],
    [true, true, true, true]);
  ok('la hoja no hace ninguna cuenta: el importe sale de UNA lectura de la base (cotizar_cambio), con la sesión',
    [cuantas(hoja, /rpc\('cotizar_cambio'/g), /[*/]\s*(30|365)\b|diferencia\s*[*/]|dias_[a-z]+\s*[*/]/.test(hoja), /Math\.(round|ceil|floor)/.test(hoja)],
    [1, false, false]);
  // La forma de lo que cotiza la base y la que espera la pantalla, clave por clave.
  const devuelve = m130.slice(m130.indexOf('create or replace function public.prorrateo_de_plan('), m130.indexOf('revoke all on function public.prorrateo_de_plan('));
  const clavesDeLaBase = [...devuelve.slice(devuelve.indexOf('return jsonb_build_object(')).matchAll(/\n\s+'([a-z_]+)',\s/g)].map((m) => m[1]).sort();
  const cotizacion = leer('src/lib/cotizacion.ts');
  const interfaz = cotizacion.slice(cotizacion.indexOf('export interface CotizacionDeCambio {'), cotizacion.indexOf('\n}\n', cotizacion.indexOf('export interface CotizacionDeCambio {')));
  const clavesDeLaPantalla = [...interfaz.matchAll(/\n  ([a-z_]+): /g)].map((m) => m[1]).sort();
  ok('lo que la pantalla espera de la cotización son las 25 claves que devuelve prorrateo_de_plan (130)',
    [clavesDeLaBase.length, clavesDeLaPantalla.filter((k) => !clavesDeLaBase.includes(k)), clavesDeLaBase.filter((k) => !clavesDeLaPantalla.includes(k))], [25, [], []]);

  // ---- Volver a cotizar antes de cobrar (con la tarjeta guardada no hay paso «Vas a pagar»).
  const abrir = funcionDe(hoja, 'abrir');
  const cobrar = funcionDe(hoja, 'cobrar');
  const sigue = funcionDe(hoja, 'sigueIgual');
  const antesDelPedido = (cuerpo, destino) => {
    const i = cuerpo.indexOf('if (!(await sigueIgual())) {');
    return [i > 0, i < cuerpo.indexOf(`fetch('/api/pagos/bancard/${destino}'`), /if \(!\(await sigueIgual\(\)\)\) \{\s+setPaso\('elegir'\);\s+return;\s+\}/.test(cuerpo)];
  };
  ok('los dos botones vuelven a pedirle la cotización a la base ANTES de mandar el pedido, y si cambió no cobran',
    [antesDelPedido(abrir, 'pago'), antesDelPedido(cobrar, 'cobrar')], [[true, true, true], [true, true, true]]);
  ok('«sigue igual» compara el importe y la fecha de la cotización nueva con lo que la hoja muestra; si cambió, deja lo nuevo a la vista',
    [sigue.includes('const r = await cotizar(personas);'), sigue.includes('Number(nueva.importe) === Number(cot.importe)'),
      sigue.includes('new Date(nueva.vence_hasta).getTime() === new Date(cot.vence_hasta).getTime()'),
      sigue.includes('if (mismoImporte && mismaFecha) return true;'), sigue.includes('setCot(nueva);'), sigue.includes('q.cambioElImporte('),
      sigue.trimEnd().endsWith('return false;')],
    [true, true, true, true, true, true, true]);
  ok('y no abre un formulario viejo que cobra otra cosa que lo recién cotizado',
    /if \(Number\(d\.importe\) !== Number\(cot\.importe\)\) \{\s+setError\(h\.enCurso\);\s+setPaso\('elegir'\);\s+return;\s+\}\s+setAbierto\(/.test(abrir), true);
  ok('el pago y el 3D Secure, como en las otras hojas: no reciben ni miran lo que dice el formulario',
    [cuantas(hoja, /onTermino=\{\(\) => \{/g), cuantas(hoja, /onTermino=/g), hoja.includes('<ResultadoDelPago'), /payment_|_success|_fail/.test(hoja)], [2, 2, true, false]);

  // ---- Lo que se lee antes de pagar.
  ok('antes de pagar: cuánto se paga hoy, que la fecha no cambia, cuánto es la renovación (con y sin descuento) y qué día se cobra sola',
    ['q.sePagaHoy(gs(cot.importe), cot.dias_restantes)', 'q.sePagaHoyEntero(gs(cot.importe), anual)', 'q.pruebaNoSeCobra(cot.dias_gratis)',
      'q.mismaFecha(fecha(cot.vence_hasta))', 'q.desdeProxima(gs(cot.renovacion), anual)',
      "q.desdeProximaConDescuento(gs(cot.renovacion), gs(cot.renovacion_hoy), anual, cot.descuento_fase === 'constancia')",
      'diaDelCobro(datos.fechaDelDebito, locale)', 'conDescuento ? q.sinDescuento : q.sinDescuentoHoy', 'q.seActiva', 'q.otroPeriodo(anual)',
      'q.cancelaLoProgramado', 'h.seCobraEnGuaranies', '<ContactoDePago />'].filter((p) => !hoja.includes(p)), []);
  ok('con descuento se dicen los dos números solo si la base dice que hay descuento en la renovación',
    hoja.includes('const conDescuento = cot ? Number(cot.renovacion_hoy) < Number(cot.renovacion) : false;'), true);

  // ---- Bajar: por el servidor, sin cobro.
  const programarEnPantalla = baja.slice(baja.indexOf('async function programar('), baja.indexOf('return { ocupado, error, setError, programar };'));
  ok('bajar y deshacer van por /api/pagos/bancard/plan (null deshace): solo la cuenta y el plan, sin rpc desde el navegador',
    [cuantas(baja, /fetch\('\/api\/pagos\/bancard\/plan'/g), programarEnPantalla.includes('body: JSON.stringify({ empresa: empresaId, plan }),'),
      /rpc\(|clienteNavegador|importe|fecha|vence/.test(programarEnPantalla.slice(
        programarEnPantalla.indexOf('const r = await fetch('), programarEnPantalla.indexOf('const d = await r.json()'))),
      cuantas(baja, /await programar\(null\)/g), baja.includes('await programar(plan)')],
    [1, true, false, 2, true]);
  ok('ningún archivo de src llama bancard_programar_plan fuera del flujo del servidor',
    archivos.filter((a) => sinComentarios(leer(a)).includes('bancard_programar_plan')), ['src/lib/bancard-flujo.ts']);
  ok('lo que va a pagar desde la renovación lo cotiza la base (cotizar_plan, sobre el período de la cuenta), con y sin descuento',
    [cuantas(baja, /rpc\('cotizar_plan'/g), baja.includes('p_empresa: empresaId, p_plan: plan, p_periodo: periodo, p_personas: null,'),
      baja.includes('Number(cot.total) < Number(cot.subtotal)'), baja.includes('q.bajarDetalleConDescuento('), baja.includes('q.bajarDetalle('),
      baja.includes('disabled={ocupado || !cot}')],
    [1, true, true, true, true, true]);
  ok('con un pago en curso no se ofrece «Deshacer» ni «Seguir con el…»: se dice que hay que esperar',
    [/\{enCurso \? \(\s+<p [^>]*>\{q\.esperaElPago\}<\/p>\s+\) : \(\s+<button type="button" className="boton-suave w-full" onClick=\{deshacer\}/.test(baja),
      /\{!programado \? children : enCurso \? \(\s+<p [^>]*>\{q\.esperaElPago\}<\/p>\s+\) : \(\s+<button type="button" className="boton-principal w-full" onClick=\{seguir\}/.test(baja),
      /\) : enCurso \? \(\s+<p [^>]*>\{q\.esperaElPago\}<\/p>\s+\) : \(\s+<button type="button" className="boton-suave w-full" onClick=\{\(\) => \{ setError\(''\); setAviso\(''\); setAbierta\(true\); \}\}/.test(baja),
      // Revisión 08/10: decía `!!estadoBancard?.viva` (cualquier operación viva). Un
      // formulario dejado a medias escondía los botones hasta 40 minutos, y era
      // el único caso que la ruta sabe resolver sola. La regla ahora vive en
      // src/lib/plan-pantalla.ts y se prueba más abajo.
      plan.includes('const pagoEnCurso = hayQueEsperarElPago(estadoBancard?.viva);'), cuantas(plan, /enCurso=\{pagoEnCurso\}/g)],
    [true, true, true, true, 2]);
  ok('si el equipo de hoy no entra en el plan más bajo, en vez del botón va el porqué',
    /\) : noEntra \? \(\s+<p [^>]*>\{q\.equipoGrande\(nombre, h\.personas\(lugares\), miembros\)\}<\/p>/.test(baja) && baja.includes('const noEntra = miembros > lugares;'), true);

  // ---- La ruta nueva.
  ok('la ruta de la baja: sesión (401), después el acceso con el cliente DEL USUARIO, y recién ahí el cliente de servicio',
    [ruta.indexOf('auth.getUser()') > 0, ruta.indexOf('auth.getUser()') < ruta.indexOf('accesoBancard(supabase, empresa)'),
      ruta.indexOf('accesoBancard(supabase, empresa)') < ruta.indexOf('baseDeServicio()'), ruta.indexOf('accesoBancard(supabase, empresa)') < ruta.indexOf('dependencias()'),
      ruta.includes("if (!user) return NextResponse.json({ error: t.servidor.necesitasSesion }, { status: 401 });")],
    [true, true, true, true, true]);
  ok('le pasa a la regla quién lo pide y si la cuenta ve Bancard; programar sin verlo contesta 403',
    [ruta.includes('{ empresa, usuario: user.id, plan, veBancard: acceso.disponible },'),
      /case 'no_disponible':\s+return NextResponse\.json\(\{ error: t\.bancard\.noDisponible \}, \{ status: 403 \}\)/.test(ruta)],
    [true, true]);
  const programarEnLaBase = m130.slice(m130.indexOf('create or replace function public.bancard_programar_plan('), m130.indexOf('revoke all on function public.bancard_programar_plan('));
  ok('y que administre la cuenta lo vuelve a comprobar la base con ese usuario, antes que nada; la función es solo del servidor',
    [/begin\s+if not public\.bancard_administra\(p_empresa, p_usuario\) then\s+raise exception 'Solo el dueño de la cuenta puede pagar el plan\.' using errcode = '42501';/.test(programarEnLaBase),
      m130.includes('revoke all on function public.bancard_programar_plan(uuid, uuid, text) from public, anon, authenticated;'),
      m130.includes('grant execute on function public.bancard_programar_plan(uuid, uuid, text) to service_role;')],
    [true, true, true]);
  ok('un cuerpo sin «plan» no deshace nada por descuido, y solo vale null, Básico o Pro (el Premium nunca es el destino de una baja)',
    ruta.includes("if (!('plan' in cuerpo) || !(plan === null || plan === 'basico' || plan === 'pro')) {"), true);
  ok('no lee un importe ni una fecha del pedido: del cuerpo usa solo la cuenta y el plan',
    [[...new Set(ruta.match(/cuerpo\.[A-Za-z_]+/g) || [])].sort(), /importe|amount|monto|precio/.test(ruta.slice(0, ruta.indexOf('switch (r.estado)')))],
    [['cuerpo.empresa', 'cuerpo.plan'], false]);
  ok('deshacer anda con Bancard apagado: la base va por baseDeServicio(), y Bancard (si está) solo sirve para soltar un formulario abandonado',
    [ruta.includes('const bd = baseDeServicio();'), ruta.includes('const d = acceso.disponible ? dependencias() : null;'), cuantas(ruta, /dependencias\(\)/g),
      /\} : null,\s+\);/.test(ruta), ruta.includes("supabase.rpc('bancard_estado', { p_empresa: empresa, p_entorno: d.entorno })")],
    [true, true, 1, true, true]);
  ok('la ruta no es pública: la única de /api/pagos que pasa sin sesión por el middleware sigue siendo la confirmación',
    (sinComentarios(leer('src/middleware.ts')).match(/'\/api\/pagos\/[^']*'/g) || []), ["'/api/pagos/bancard/confirmacion'"]);
  ok('corre en Node, sin caché', [ruta.includes("runtime = 'nodejs'"), ruta.includes("dynamic = 'force-dynamic'")], [true, true]);

  // ---- La regla del flujo.
  ok('la regla vive en programarCambioDePlan: programar exige ver Bancard, deshacer (null) no',
    flujo.includes("if (p.plan !== null && !p.veBancard) return { estado: 'no_disponible' };"), true);
  const enCurso = (/ERROR_PAGO_EN_CURSO = '([^']+)'/.exec(flujo) || [])[1];
  ok('el «hay un pago en curso» que reconoce el flujo es, letra por letra, el que escribe bancard_programar_plan (130)',
    [enCurso, programarEnLaBase.includes(`raise exception '${enCurso}' using errcode = '22023';`)],
    ['Hay un pago en curso. Esperá a que se confirme y probá de nuevo.', true]);
  ok('y solo con ese mensaje, una sola vez, suelta lo abandonado con la misma función que usa el pago (liberarViva)',
    [flujo.includes('if (intento === 0 && soltar && mensaje === ERROR_PAGO_EN_CURSO) {'),
      /&& \(await liberarViva\(soltar\.d, viva\)\) !== 'en_curso'\) \{\s+continue;\s+\}/.test(flujo), cuantas(flujo, /'bancard_programar_plan'/g)],
    [true, true, 1]);

  const sql124a126 = ['124_bancard_precio_y_tablas.sql', '125_bancard_pagos.sql', '126_bancard_reloj_y_avisos.sql']
    .map((n) => leer(`supabase/migrations/${n}`)).join('\n');
  const queLlama = [...new Set(flujo.match(/'bancard_[a-z_]+'/g) || [])].map((s) => s.slice(1, -1));
  // Revisión 08/10: se suma `bancard_rechazadas_abiertas` (qué formularios
  // rechazados hay que cerrar en Bancard antes de deshacer una baja). También
  // nace en la 130.
  ok('de todo lo que el flujo le pide a la base, lo único que no existía en la 124-126 son bancard_programar_plan y bancard_rechazadas_abiertas, y las crea la 130 (que se aplica antes que este código)',
    [queLlama.filter((n) => !sql124a126.includes(`function public.${n}(`)),
      m130.includes('create or replace function public.bancard_programar_plan(p_empresa uuid, p_usuario uuid, p_plan text)'),
      m130.includes('create or replace function public.bancard_rechazadas_abiertas(p_empresa uuid, p_entorno text, p_plan text)')],
    [['bancard_programar_plan', 'bancard_rechazadas_abiertas'], true, true]);

  // ---- /plan: dónde quedó el WhatsApp.
  const ramaDelCambio = plan.slice(plan.indexOf('if (cambiaPorBancard(plan) && planVigente !== null) {'), plan.indexOf('} else if (botonBancard) {'));
  ok('en /plan, con un plan pago vigente y Bancard, la tarjeta de otro plan ya no manda al WhatsApp: sube con «Cambiar al…» o baja programando',
    [ramaDelCambio.length > 500, ramaDelCambio.includes('<BotonCambiarPlan etiqueta={t.bancard.cambio.subir(t.plan[plan])} datos={cambio} />'),
      ramaDelCambio.includes('<PieBajarDePlan'), /BotonSuscribirme|BotonCotizar|transferencia|whatsapp/.test(ramaDelCambio)],
    [true, true, true, false]);
  ok('es un cambio solo para un negocio que ve Bancard y tiene un plan pago vigente; el resto sigue como estaba',
    [plan.includes('const cambiaPorBancard = (plan: PlanPago) => !!entornoBancard && !esPersonal && planVigente !== null && cambioConDiasPagos(plan);'),
      plan.includes('const cambioConDiasPagos = (plan: PlanPago) => pagoVigente && ctx.planEfectivo !== plan;'),
      plan.includes('const planVigente = pagoVigente ? planPagado : null;'),
      plan.includes('<BotonCotizar whatsapp={whatsapp} empresa={ctx.empresa.nombre} />'), plan.includes('etiqueta={sus.en_prueba ? t.plan.activarEstePlan : t.plan.suscribirme}')],
    [true, true, true, true, true]);
  ok('subir es al plan más alto y bajar al más bajo, por el orden fijo de los planes (el de nivel_de_plan en la base)',
    [plan.includes('const NIVEL: Record<PlanPago, number> = { basico: 1, pro: 2, negocio: 3 };'), ramaDelCambio.includes("if (plan !== 'basico' && NIVEL[plan] > NIVEL[planVigente]) {"),
      m130.includes("select case p_plan when 'basico' then 1 when 'pro' then 2 when 'negocio' then 3 else 0 end;")],
    [true, true, true]);
  const datosDelCambio = plan.slice(plan.indexOf('const datosDelCambio = '), plan.indexOf('const renovarElProgramado = '));
  ok('a la hoja de subir no se le pasa ningún importe ni el período de la cuenta: los lee de la base',
    [datosDelCambio.length > 300, /importe|precio[A-Z(]|periodoDeLaCuenta|sus\.periodo/.test(datosDelCambio), datosDelCambio.includes('periodoElegido: periodo,')],
    [true, false, true]);
  ok('el equipo tiene que entrar en el plan que se paga: se dice en la tarjeta, antes de llegar a pagar (al subir, al pagar y al renovar)',
    [plan.includes("const noEntraElEquipo = (plan: PlanPago) => !!entornoBancard && !esPersonal && plan !== 'negocio'"),
      plan.includes('&& equipoHoy > LIMITES_VISIBLES[plan].miembros;'),
      /pie = noEntraElEquipo\(plan\) \? \(\s+<p [^>]*>\{avisoDelEquipo\(plan\)\}<\/p>\s+\) : cambio \? \(/.test(ramaDelCambio),
      /\{noEntraElEquipo\(plan\)\s+\? <p [^>]*>\{avisoDelEquipo\(plan\)\}<\/p>\s+: botonBancard\}/.test(plan),
      plan.includes('(conCandado ? t.bancard.cambio.equipoNoEntraVencida : t.bancard.cambio.equipoNoEntra)(')],
    [true, true, true, true, true]);
  ok('el plan programado se paga a mano solo cuando la base dice que ya se puede; antes, ni «Renovar» ni «Cobrar ahora»',
    [plan.includes('const programadoPagable = estadoBancard?.plan_proximo_pagable === true;'), plan.includes('if (!programadoPagable || noEntraElEquipo(plan)) return null;'),
      plan.includes('if (planProgramadoEnLaBase !== null && !programadoPagable) return null;'),
      plan.includes('{planProgramado === plan ? renovarElProgramado(plan) : null}'), plan.includes('aviso: t.bancard.cambio.alPagarCambia(t.plan[plan])'),
      sinComentarios(leer('src/components/bancard/HojaPagar.tsx')).includes('{datos.aviso && <p className="font-medium text-ambar">{datos.aviso}</p>}')],
    [true, true, true, true, true, true]);
  ok('lo que la pantalla lee de bancard_estado para todo esto existe en la base con ese nombre',
    ['plan_proximo', 'plan_proximo_pagable', 'miembros'].map((k) => [plan.includes(`estadoBancard?.${k}`), m130.includes(`'${k}', `)]), [[true, true], [true, true], [true, true]]);
  ok('con una baja de plan programada, «Tu equipo» no deja sumar ni bajar personas',
    [plan.includes('bloqueado={planProgramado !== null}'),
      /\{bloqueado \? \(\s+<p [^>]*>\s+\{t\.bancard\.cambio\.equipoBloqueado\}\s+<\/p>\s+\) : \(/.test(sinComentarios(leer('src/components/bancard/EquipoPremium.tsx')))],
    [true, true]);
  ok('/plan sigue sin escribir a mano la lista de planes', plan.includes("['basico', 'pro', 'negocio']"), false);

  // ---- El comprobante, el correo y /admin dicen «cambio», no «un mes de Pro».
  ok('el comprobante, su correo y la lista de /admin nombran el cambio de plan',
    [sinComentarios(leer('src/components/bancard/Comprobante.tsx')).includes("op.tipo === 'cambio'"),
      sinComentarios(leer('src/components/bancard/Comprobante.tsx')).includes('c.conceptoCambio(planAntes, plan,'),
      sinComentarios(leer('src/lib/avisos-bancard.ts')).includes("r.tipo === 'cambio'"),
      sinComentarios(leer('src/lib/avisos-bancard.ts')).includes('c.conceptoCambio(planAntes, nombreDelPlan(r.plan, t),'),
      sinComentarios(leer('src/components/bancard/PanelBancardAdmin.tsx')).includes("o.tipo === 'cambio' ? `Cambio"),
      leer('src/components/bancard/tipos.ts').includes("tipo: 'plan' | 'personas' | 'cambio';")],
    [true, true, true, true, true, true]);

  // ---- Los textos: en los dos idiomas, con las mismas claves, cortos y sin ningún importe escrito.
  const textosBancard = leer('src/i18n/textos/bancard.ts');
  const es = textosBancard.slice(0, textosBancard.indexOf('export const bancardPt'));
  const pt = textosBancard.slice(textosBancard.indexOf('export const bancardPt'));
  const bloque = (idioma) => {
    const i = idioma.indexOf('\n  cambio: {');
    return i < 0 ? '' : sinComentarios(idioma.slice(i, idioma.indexOf('\n  },', i)));
  };
  const clavesDe = (b) => [...b.matchAll(/\n    ([A-Za-z0-9]+): /g)].map((m) => m[1]).sort();
  ok('el bloque «cambio» tiene las mismas claves en español y en portugués',
    [clavesDe(bloque(es)).length >= 38, clavesDe(bloque(es)).filter((k) => !clavesDe(bloque(pt)).includes(k)), clavesDe(bloque(pt)).filter((k) => !clavesDe(bloque(es)).includes(k)),
      cuantas(textosBancard, /\n  cambio: \{/g), cuantas(textosBancard, /\n    conceptoCambio: /g)],
    [true, [], [], 2, 2]);
  ok('toda clave del bloque que usan las pantallas existe, y ninguna quedó sin usar',
    (() => {
      // En la hoja y en los pies de la baja, `q` es `t.bancard.cambio`; en las demás se nombra entero.
      const conQ = [hoja, baja].join('\n');
      const enteras = [hoja, baja, plan, ruta, sinComentarios(leer('src/components/bancard/EquipoPremium.tsx'))].join('\n');
      const pedidas = [...new Set([
        ...[...conQ.matchAll(/\bq\.([A-Za-z0-9]+)/g)].map((m) => m[1]),
        ...[...enteras.matchAll(/t\.bancard\.cambio\.([A-Za-z0-9]+)/g)].map((m) => m[1]),
      ])].sort();
      return [pedidas.filter((k) => !clavesDe(bloque(es)).includes(k)), clavesDe(bloque(es)).filter((k) => !pedidas.includes(k))];
    })(), [[], []]);
  ok('ningún importe escrito en los textos (salen de la base), con voseo en español y sin «usted»',
    [/Gs\.|[0-9]{4,}|US\$/.test(bloque(es) + bloque(pt)), /\b(puedes|tienes|pagas|sigues|revisa|toca|elige|prueba de nuevo|usted)\b/.test(bloque(es)),
      /pagás/.test(bloque(es)), /Revisalo y tocá/.test(bloque(es)), /você paga/.test(bloque(pt))],
    [false, false, true, true, true]);
  const texto = (b, clave) => (new RegExp(`\\n    ${clave}: ([^\\n]*(?:\\n      [^\\n]*)*)`).exec(b) || [])[1] ?? '';
  ok('las tres cosas que la persona lee antes de pagar, dichas en español',
    [texto(bloque(es), 'sePagaHoy').includes('Se paga hoy ${importe}: la diferencia entre los dos planes por'),
      texto(bloque(es), 'mismaFecha').includes('Tu plan sigue venciendo el ${fecha}. La fecha no cambia.'),
      texto(bloque(es), 'desdeProxima').includes('Desde la próxima renovación pagás ${importe} por'),
      texto(bloque(es), 'desdeProximaConDescuento').includes('de hoy, ${conDescuento}.'),
      texto(bloque(es), 'debito').includes('se cobra solo de tu'),
      texto(bloque(es), 'sinDescuento').includes('El cambio no lleva descuento. Tu descuento vuelve en la renovación.')],
    [true, true, true, true, true, true]);
  ok('bajar dice que no se cobra nada ahora y que no hay devolución; deshacer dice cuánto vuelve a ser la renovación',
    [texto(bloque(es), 'bajarDetalle').includes('No se cobra nada ahora.'), texto(bloque(es), 'sinDevolucion').includes('no se devuelve'),
      texto(bloque(es), 'deshecho').includes('La renovación vuelve a ser de ${importe}.'), texto(bloque(pt), 'sinDevolucion').includes('não é devolvido')],
    [true, true, true, true]);
  ok('«Tu plan es por N personas» ya no manda a escribir: «Sumar» y «Bajar» existen',
    [/personasFijas: \(n: number\) =>\s+`[^`]*andá a «Tu equipo»[^`]*`/.test(es), /personasFijas[^\n]*\n[^\n]*escribinos/.test(es), /personasFijas[^\n]*\n[^\n]*fale com a gente/.test(pt)],
    [true, false, false]);
  ok('los componentes nuevos leen sus textos del diccionario: ninguna frase escrita en el código',
    nuevos.filter((n) => {
      const s = sinComentarios(leer(`src/components/bancard/${n}.tsx`));
      return /'[^'\n]*[áéíóúñ¿¡][^'\n]*'|"[^"\n]*[áéíóúñ¿¡][^"\n]*"|`[^`\n]*[áéíóúñ¿¡][^`\n]*`/.test(s) || /^\s*[A-ZÁÉÍÓÚ¿¡][^<>{}=;()]*$/m.test(s)
        || (n !== 'BotonCambiarPlan' && !s.includes('useTextos()'));
    }), []);
  ok('ningún loading.tsx en toda la aplicación', archivos.filter((a) => /(^|\/)loading\.tsx$/.test(a)), []);

  // ════ LO QUE ENCONTRÓ LA REVISIÓN DEL 08/10 ════
  // Las reglas de qué se muestra viven en src/lib/plan-pantalla.ts (sin
  // dependencias): acá se CORREN, y después se mira que la pantalla las use.
  const P = require('../.compilado/plan-pantalla.js');
  const reglas = sinComentarios(leer('src/lib/plan-pantalla.ts'));
  ok('las reglas de la pantalla no importan nada (las compilan las pruebas y las usan el servidor y el navegador)', /^\s*import /m.test(reglas), false);

  // ---- 1. Un formulario dejado a medias no esconde «Bajar…», «Deshacer» ni «Seguir con el…».
  ok('hay que esperar un cobro con tarjeta en curso, un 3D Secure o un pago incierto; un formulario abierto y dejado, NO (lo suelta la ruta); sin pago, tampoco',
    [P.hayQueEsperarElPago({ estado: 'creada', medio: 'formulario' }), P.hayQueEsperarElPago({ estado: 'creada', medio: 'token' }),
      P.hayQueEsperarElPago({ estado: 'en_3ds', medio: 'token' }), P.hayQueEsperarElPago({ estado: 'incierta', medio: 'token' }),
      P.hayQueEsperarElPago({ estado: 'incierta', medio: 'formulario' }), P.hayQueEsperarElPago(null), P.hayQueEsperarElPago(undefined)],
    [false, true, true, true, true, false, false]);
  ok('/plan decide con esa regla, y no con «hay cualquier operación viva»',
    [plan.includes('const pagoEnCurso = hayQueEsperarElPago(estadoBancard?.viva);'), /pagoEnCurso = !!estadoBancard/.test(plan),
      /import \{[^}]*hayQueEsperarElPago[^}]*\} from '@\/lib\/plan-pantalla';/.test(plan)],
    [true, false, true]);
  ok('y el texto de la espera ya no promete que ese pago «se va a confirmar»',
    [/confirm/i.test(texto(bloque(es), 'esperaElPago')), /confirm/i.test(texto(bloque(pt), 'esperaElPago')),
      texto(bloque(es), 'esperaElPago').includes('Cuando se resuelva'), texto(bloque(pt), 'esperaElPago').length > 20],
    [false, false, true, true]);

  // ---- 2. El «Listo: …» no vive más que el estado que anuncia.
  {
    const listo = { texto: 'Listo: desde la próxima renovación tu plan es Básico.', para: true, visto: false };
    const antesDelRefresco = P.avisoQueQueda(listo, false);
    const conElRefresco = P.avisoQueQueda(antesDelRefresco, true);
    const igual = P.avisoQueQueda(conElRefresco, true);
    const desdeLaOtra = P.avisoQueQueda(igual, false);
    ok('recién programada, el «Listo» se ve aunque la pantalla todavía no cambió; cuando cambia, queda visto; y sigue mientras siga programada',
      [antesDelRefresco === listo, conElRefresco.texto === listo.texto, conElRefresco.visto, igual === conElRefresco], [true, true, true, true]);
    ok('si la baja se deshace desde la OTRA tarjeta («Seguir con el Pro»), ese «Listo» se borra: no queda al lado del botón «Bajar al Básico»', desdeLaOtra, null);
    ok('  y no resucita si se vuelve a programar desde otro lado', P.avisoQueQueda(desdeLaOtra, true), null);
    const sigue = { texto: 'Listo: seguís con el Pro.', para: false, visto: false };
    ok('al revés igual: «Listo: seguís con el Pro» se borra cuando se vuelve a programar la baja',
      [P.avisoQueQueda(P.avisoQueQueda(sigue, false), true), P.avisoQueQueda(sigue, true) === sigue, P.avisoQueQueda(null, true)], [null, true, null]);
  }
  const ganchoDelAviso = baja.slice(baja.indexOf('function useAvisoDeBaja('), baja.indexOf('function Aviso('));
  ok('los dos pies guardan su «Listo» con esa regla, atado a «programado»: ya no es un texto suelto en un useState',
    [cuantas(baja, /const \[aviso, setAviso\] = useAvisoDeBaja\(programado\);/g), /const \[aviso, setAviso\] = useState/.test(baja),
      ganchoDelAviso.includes('const queda = avisoQueQueda(guardado, programado);'), ganchoDelAviso.includes("return [queda?.texto ?? '', setAviso];"),
      ganchoDelAviso.includes('if (queda !== guardado) setGuardado(queda);')],
    [2, false, true, true, true]);
  ok('cada «Listo» dice qué estado anuncia: programar → programada; «Deshacer» y «Seguir con el…» → sin baja',
    [baja.includes('setAviso(q.listo(nombre), true);'), cuantas(baja, /setAviso\(q\.deshecho\([^\n]*\), false\);/g), cuantas(baja, /setAviso\(q\.(listo|deshecho)\(/g)],
    [true, 2, 3]);

  // ---- 3. A la cuenta vencida se le sigue mostrando el plan que tenía; y si ningún plan alcanza, se le dice que escriba.
  const TODOS = ['basico', 'pro', 'negocio'];
  ok('el profe (su rubro ofrece solo el Básico) que tenía el Pro y venció: ve el Básico Y el Pro (antes: solo el Básico, que es para una persona)',
    [P.planesALaVista(TODOS, ['basico'], null, 'pro'), P.planesALaVista(TODOS, ['basico'], null, null), P.planesALaVista(TODOS, ['basico'], 'pro', null),
      P.planesALaVista(TODOS, ['basico', 'pro', 'negocio'], null, 'pro'), P.planesALaVista(TODOS, ['basico', 'pro'], null, 'negocio')],
    [['basico', 'pro'], ['basico'], ['basico', 'pro'], ['basico', 'pro', 'negocio'], ['basico', 'pro', 'negocio']]);
  const planVencido = plan.slice(plan.indexOf('const planVencido = '), plan.indexOf('const planesVisibles'));
  ok('/plan: el plan «que tenía» es solo el de un negocio vencido que lo PAGÓ (una prueba vencida no cuenta), y entra en las tarjetas a la vista',
    [/const planVencido = conCandado && sus\.estado === 'activa'\s+\? PLANES_PAGOS\.find\(\(p\) => p === sus\.plan\) \?\? null\s+: null;/.test(planVencido),
      plan.includes('const planesVisibles: PlanPago[] = planesALaVista(PLANES_PAGOS, ficha.planes, planPagado, planVencido);'),
      plan.includes("const conCandado = !esPersonal && !sus.en_prueba && ctx.planEfectivo === 'gratis';"),
      plan.indexOf('const conCandado = ') < plan.indexOf('const planVencido = '), cuantas(plan, /const conCandado = /g)],
    [true, true, true, true, 1]);
  const lugares = (p) => ({ basico: 1, pro: 3, negocio: 15 }[p]);
  ok('¿entra el equipo en algún plan a la vista? Cinco personas con Básico y Pro: no. Con el Premium a la vista, o siendo tres: sí',
    [P.algunPlanAlcanza(['basico', 'pro'], lugares, 5), P.algunPlanAlcanza(['basico', 'pro', 'negocio'], lugares, 5),
      P.algunPlanAlcanza(['basico', 'pro'], lugares, 3), P.algunPlanAlcanza(['basico'], lugares, 2), P.algunPlanAlcanza([], lugares, 1)],
    [false, true, true, false, false]);
  const avisoDelEquipo = plan.slice(plan.indexOf('const avisoDelEquipo = '), plan.indexOf('const personasDelPremium'));
  ok('/plan: si no entra en ninguno, el texto no manda a «elegir un plan donde entren todos»: dice que escriba (otro para la cuenta vencida)',
    [plan.includes('const hayPlanParaElEquipo = algunPlanAlcanza(planesVisibles, (p) => LIMITES_VISIBLES[p].miembros, equipoHoy);'),
      /if \(!hayPlanParaElEquipo\) \{\s+return \(conCandado \? t\.bancard\.cambio\.equipoSinPlanVencida : t\.bancard\.cambio\.equipoSinPlan\)\(/.test(avisoDelEquipo),
      avisoDelEquipo.indexOf('equipoSinPlan') < avisoDelEquipo.indexOf('equipoNoEntra')],
    [true, true, true]);
  ok('esos dos textos dicen «escribinos» y no «elegí un plan», en los dos idiomas',
    [['equipoSinPlan', 'equipoSinPlanVencida'].map((k) => [/[Ee]scribinos/.test(texto(bloque(es), k)), /[Ee]legí un plan/.test(texto(bloque(es), k)),
      /[Ff]ale com a gente/.test(texto(bloque(pt), k)), /[Ee]scolha um plano/.test(texto(bloque(pt), k))]),
      /Achicá el equipo/.test(texto(bloque(es), 'equipoSinPlan')), /Achicá el equipo/.test(texto(bloque(es), 'equipoSinPlanVencida'))],
    [[[true, false, true, false], [true, false, true, false]], true, false]);

  // ---- 4. La baja programada se ve y se deshace aunque la cuenta ya no vea Bancard.
  const sinBancard = plan.slice(plan.indexOf('const bajaSinBancard = '), plan.indexOf('const ahora = Date.now();'));
  ok('/plan: sin Bancard, un negocio con plan pago igual lee si tiene una baja programada (solo eso, con su sesión)',
    [sinBancard.includes("const bajaSinBancard = !entornoBancard && !esPersonal && sus.estado === 'activa' && !sus.en_prueba"),
      sinBancard.includes("supabase.rpc('bancard_estado', { p_empresa: ctx.empresa.id, p_entorno: 'produccion' })"),
      sinBancard.includes('(r.data as EstadoBancard | null)?.plan_proximo ?? null'), sinBancard.includes('.catch(() => null)'),
      plan.includes('const planProximoLeido = estadoBancard?.plan_proximo ?? bajaSinBancard;'), cuantas(plan, /rpc\('bancard_estado'/g)],
    [true, true, true, true, true, 2]);
  const ramaSinBancard = plan.slice(plan.indexOf('} else if (esActual) {'), plan.indexOf('} else if (whatsapp) {'));
  ok('y en la tarjeta del plan actual dice a qué plan pasa y desde cuándo, con «Seguir con el…» (que solo llama a la ruta con plan: null)',
    [/pie = pagoVigente && !esPersonal && planProgramado !== null \? \(\s+<PieDelPlanActual/.test(ramaSinBancard),
      ramaSinBancard.includes('detalle={t.bancard.cambio.programado(t.plan[planProgramado], fechaDeRenovacion)}'),
      ramaSinBancard.includes('enCurso={false}'), /BotonPagarBancard|datosDelPago|HojaPagar/.test(ramaSinBancard),
      /\{programado && detalle && \(\s+<p [^>]*>\{detalle\}<\/p>\s+\)\}/.test(baja)],
    [true, true, true, false, true]);
  ok('deshacer sin ver Bancard lo sigue dejando la regla del servidor (no llama a Bancard: va sin `soltar`)',
    [flujo.includes("if (p.plan !== null && !p.veBancard) return { estado: 'no_disponible' };"), ruta.includes('} : null,')], [true, true]);

  // ---- 5. Después de volver a cotizar, la hoja no anuncia el cobro automático del vencimiento que ya pasó.
  const ZONA = 'America/Asuncion';
  ok('la fecha del cobro automático vale si es del vencimiento que dice la cotización (el día anterior, o un reintento); la de un vencimiento anterior, no',
    [P.debitoSigueVigente('2026-10-08', '2026-10-09T15:00:00-03:00', ZONA),   // vence mañana: el cobro es hoy
      P.debitoSigueVigente('2026-10-08', '2026-11-09T15:00:00-03:00', ZONA),  // se renovó con la hoja abierta: ese cobro ya salió
      P.debitoSigueVigente('2026-11-08', '2026-11-09T15:00:00-03:00', ZONA),  // la fecha nueva, con el vencimiento nuevo
      P.debitoSigueVigente('2026-10-10', '2026-10-09T15:00:00-03:00', ZONA),  // un reintento, después del vencimiento
      P.debitoSigueVigente('2026-10-07', '2026-10-09T15:00:00-03:00', ZONA),
      P.debitoSigueVigente(null, '2026-10-09T15:00:00-03:00', ZONA), P.debitoSigueVigente('2026-10-08', 'no es una fecha', ZONA),
      P.debitoSigueVigente('2026-10-08', '2026-10-09T15:00:00-03:00', 'Zona/Inventada')],
    [true, false, true, true, false, false, false, false]);
  ok('  el vencimiento se mira en la zona de la cuenta: 01:30 UTC del 10 es todavía el 9 en Asunción (el cobro es el 8)',
    [P.debitoSigueVigente('2026-10-08', '2026-10-10T01:30:00Z', ZONA), P.debitoSigueVigente('2026-10-08', '2026-10-10T01:30:00Z', 'UTC')], [true, false]);
  ok('  «el día anterior» es el primer día de cobro de la base (bancard_dias_de_cobro, 125)',
    [P.DIAS_ANTES_DEL_PRIMER_COBRO, leer('supabase/migrations/125_bancard_pagos.sql').includes('select array[-1, 1, 4];')], [1, true]);
  ok('la hoja de subir dice «el … se cobra solo de tu tarjeta» solo con esa condición, sobre la cotización que tiene a la vista',
    [hoja.includes('{tarjeta && datos.fechaDelDebito && debitoSigueVigente(datos.fechaDelDebito, cot.vence_hasta, datos.zona) && ` ${q.debito('),
      cuantas(hoja, /q\.debito\(/g), /\{tarjeta && datos\.fechaDelDebito && ` \$\{q\.debito\(/.test(hoja)],
    [true, 1, false]);

  // ---- 6. El formulario RECHAZADO que sigue abierto en Bancard (lo que corre está en bancard-flujo, grupo 35).
  const cerrarAbiertas = flujo.slice(flujo.indexOf('async function cerrarRechazadasAbiertas('), flujo.indexOf('export type ReversaDePago'));
  ok('al deshacer, si no hay ninguna operación viva, el servidor cierra en Bancard los formularios rechazados de la cuenta (los de su ambiente) y prueba una vez más',
    [flujo.includes('if (viva === null && await cerrarRechazadasAbiertas(soltar.d, p.empresa)) {'),
      cerrarAbiertas.includes("'bancard_rechazadas_abiertas', { p_empresa: empresa, p_entorno: d.entorno, p_plan: null }"),
      cerrarAbiertas.includes('if (!(await cerrarRechazada(d, Number(id)))) todas = false;'), cerrarAbiertas.trimEnd().endsWith('return todas;\n}')],
    [true, true, true, true]);
  const abiertasEnLaBase = m130.slice(m130.indexOf('create or replace function public.bancard_rechazadas_abiertas('), m130.indexOf('revoke all on function public.bancard_rechazadas_abiertas('));
  const reemplaza = leer('supabase/migrations/125_bancard_pagos.sql');
  ok('«sigue abierta» es la misma condición con que el pago las cierra al abrir otro (`reemplaza`, 125): rechazada, de formulario, con process_id, de las últimas 24 horas',
    ["o.estado = 'rechazada' and o.medio = 'formulario' and o.process_id is not null", "o.created_at > now() - interval '24 hours'"]
      .map((c) => [abiertasEnLaBase.includes(c), reemplaza.includes(c)]),
    [[true, true], [true, true]]);
  ok('programar o deshacer la baja mira esa lista por el plan que estaba programado, y solo cuando lo programado cambia; la función es solo del servidor',
    [programarEnLaBase.includes("if v_habia is not null and p_plan is distinct from v_habia\n     and public.bancard_rechazadas_abiertas(p_empresa, null, v_habia) <> '[]'::jsonb then"),
      m130.includes('revoke all on function public.bancard_rechazadas_abiertas(uuid, text, text) from public, anon, authenticated;'),
      m130.includes('grant execute on function public.bancard_rechazadas_abiertas(uuid, text, text) to service_role;')],
    [true, true, true]);

  // ---- 7. /admin: un cambio que quedó en conflicto no «vuelve» a ningún plan.
  const panelAdmin = sinComentarios(leer('src/components/bancard/PanelBancardAdmin.tsx'));
  ok('al revertir un cambio en conflicto, /admin dice que la cuenta queda como está (la base no repone ninguna foto)',
    [panelAdmin.includes("const noTocoLaCuenta = op.tipo === 'cambio' && antes.conflicto === true;"),
      /\{noTocoLaCuenta\s+\? <>Este pago <b>no cambió nada<\/b> en la cuenta: la cuenta queda como está\.<\/>\s+: <>La cuenta vuelve a <b>\{vuelve\}<\/b>\.<\/>\}/.test(panelAdmin)],
    [true, true]);
}

console.log(`\n${corridas - fallos}/${corridas} comprobaciones de las fuentes de Bancard.`);
if (fallos > 0) {
  console.log(`${fallos} fallaron.`);
  process.exit(1);
}
