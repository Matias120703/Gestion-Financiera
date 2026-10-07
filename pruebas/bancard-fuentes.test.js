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
  ok('verificar: la tarjeta tiene que ser de esa cuenta (lo comprueba el flujo contra la base)',
    [verificar.includes('verificarTarjeta(d, { tarjeta, empresa })'), verificar.indexOf('auth.getUser()') < verificar.indexOf('dependencias()')], [true, true]);
  const cobrar = sinComentarios(leer('src/app/api/pagos/bancard/cobrar/route.ts'));
  ok('cobrar con la tarjeta guardada: mismo cuerpo que el pago (qué, nunca cuánto), 60 s de tope',
    [cobrar.includes('leerPedidoDePago(cuerpo)'), /cuerpo\.(importe|amount|monto|precio)/.test(cobrar), cobrar.includes('maxDuration = 60')], [true, false, true]);

  // Lo que dice el formulario de catastro no cuenta: se verifica con Bancard.
  const hoja = sinComentarios(leer('src/components/bancard/HojaGuardarTarjeta.tsx'));
  ok('la hoja de guardar: casilla de consentimiento obligatoria, y al terminar el iframe pide /tarjeta/verificar',
    [hoja.includes('acepto: true'), hoja.includes("fetch('/api/pagos/bancard/tarjeta/verificar'"), /disabled=\{!acepto/.test(hoja)], [true, true, true]);
  ok('y no cree lo que dijo el iframe: `onTermino` solo dispara la verificación', /onTermino=\{\(\) => \{ void verificar\(\); \}\}/.test(hoja), true);
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
  ok('y lo que dice el formulario no se usa: solo avisa que terminó', /onTermino\(\)|avisar\.current\(\)/.test(formulario), true);
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
  const admin = ['probar', 'consultar', 'revertir'].map((n) => sinComentarios(leer(`src/app/api/admin/bancard/${n}/route.ts`)));
  ok('las rutas de /api/admin/bancard exigen ser la administración', admin.every((s) => s.includes("rpc('es_superadmin')") && s.includes('403')), true);
}

console.log(`\n${corridas - fallos}/${corridas} comprobaciones de las fuentes de Bancard.`);
if (fallos > 0) {
  console.log(`${fallos} fallaron.`);
  process.exit(1);
}
