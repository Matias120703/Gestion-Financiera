/**
 * Los videos propios del trainer (113): las reglas sin navegador y lo que se
 * comprueba leyendo el código.
 *
 * La base se prueba en videos.test.js. Acá va:
 *
 *   · qué se hace con un video antes de subirlo (video-reglas.ts): a qué
 *     tamaño se achica, cuándo se recorta (preguntando) y cuándo no se puede;
 *   · qué ve el alumno (rutina-sin-senal.ts): un `clip` roto no pasa, los
 *     videos de la rutina sin repetir, y el propio tapa al link;
 *   · que `mediabunny` (el conversor, ~cientos de kB) solo lo baje quien
 *     sube un video: nunca la página del alumno;
 *   · que la ruta pública que firma los videos no acepte nada del
 *     navegador salvo el token;
 *   · que el service worker no borre las copias del alumno al cambiar de
 *     versión, y que los textos nuevos estén en el diccionario.
 *
 * Lee `.compilado/` (lo arma `probar:calculos` con tsconfig.calculos.json).
 */
const fs = require('fs');
const path = require('path');

let fallos = 0;
let corridas = 0;
function ok(nombre, real, esperado) {
  corridas++;
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${nombre}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${nombre} → ${a.length > 90 ? a.slice(0, 87) + '...' : a}`);
}
function grupo(n) { console.log(`\n── ${n} ${'─'.repeat(Math.max(0, 58 - n.length))}`); }

const raiz = path.join(__dirname, '..');
// CRLF normalizado: en un worktree de Windows los fuentes llegan con \r\n.
const leer = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8').replace(/\r\n/g, '\n');
/** El código sin comentarios: lo que dicen los comentarios no cuenta. */
const sinComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

const R = require('../.compilado/video-reglas.js');
const S = require('../.compilado/rutina-sin-senal.js');

// ═══════════════════════════════════════════════════════════
grupo('1 · A qué tamaño se achica');
// ═══════════════════════════════════════════════════════════
ok('un vertical de 1080×1920: el alto a 960', R.medidasDestino(1080, 1920), { height: 960 });
ok('un horizontal de 1920×1080: el ancho a 960', R.medidasDestino(1920, 1080), { width: 960 });
ok('uno chico no se agranda', R.medidasDestino(480, 854), { height: 854 });
ok('un cuadrado', R.medidasDestino(1440, 1440), { width: 960 });
ok('siempre par', [R.medidasDestino(481, 855), R.medidasDestino(641, 359)], [{ height: 854 }, { width: 640 }]);
ok('medidas raras no rompen', R.medidasDestino(0, NaN), { width: 960 });

// ═══════════════════════════════════════════════════════════
grupo('2 · Qué se hace con cada video');
// ═══════════════════════════════════════════════════════════
const MB = 1024 * 1024;
ok('30 s con conversor: se convierte', R.decidirVideo({ segundos: 30, bytes: 60 * MB, puedeConvertir: true, esMp4Avc: false }),
  { accion: 'convertir', recortar: false });
ok('75 s: se ofrece recortar (RECORTAR_SI_PASA)', R.decidirVideo({ segundos: 75, bytes: 90 * MB, puedeConvertir: true, esMp4Avc: false }),
  { accion: 'convertir', recortar: true });
ok('60,4 s todavía entra sin recortar (redondeo)', R.decidirVideo({ segundos: 60.4, bytes: MB, puedeConvertir: true, esMp4Avc: true }),
  { accion: 'convertir', recortar: false });
ok('sin conversor, un MP4 H.264 de 10 MB y 30 s entra tal cual',
  R.decidirVideo({ segundos: 30, bytes: 10 * MB, puedeConvertir: false, esMp4Avc: true }), { accion: 'tal_cual', recortar: false });
ok('sin conversor, un .mov: este celular no puede',
  R.decidirVideo({ segundos: 30, bytes: 10 * MB, puedeConvertir: false, esMp4Avc: false }), { error: 'celular_no_convierte' });
ok('sin conversor, un MP4 de 20 MB tampoco',
  R.decidirVideo({ segundos: 30, bytes: 20 * MB, puedeConvertir: false, esMp4Avc: true }), { error: 'celular_no_convierte' });
ok('sin conversor, un MP4 de 75 s tampoco (no se puede recortar)',
  R.decidirVideo({ segundos: 75, bytes: 5 * MB, puedeConvertir: false, esMp4Avc: true }), { error: 'celular_no_convierte' });
ok('una duración que no se pudo leer', R.decidirVideo({ segundos: NaN, bytes: MB, puedeConvertir: true, esMp4Avc: true }),
  { error: 'no_se_pudo_leer' });
ok('los topes son los de la base: 60 s y 15 MB', [R.TOPE_SEGUNDOS, R.TOPE_BYTES], [60, 15728640]);
const sql113 = leer('supabase/migrations/113_videos_propios.sql');
ok('y la 113 dice lo mismo',
  [/limite_segundos_video\(\) returns integer\s+language sql immutable as \$fn\$ select 60 \$fn\$/.test(sql113),
    /limite_bytes_video\(\) returns integer\s+language sql immutable as \$fn\$ select 15 \* 1024 \* 1024 \$fn\$/.test(sql113)],
  [true, true]);
ok('las preguntas abiertas viven en una constante', [R.RECORTAR_SI_PASA, R.CON_SONIDO, S.VIDEO_PROPIO_TAPA_EL_LINK],
  [true, 'si-se-puede', true]);
// Revisión (30/09): el AAC del celular se copia (recodificarlo lo dejaba mudo sin codificador AAC).
ok('el sonido: AAC se copia; lo demás se recodifica', [R.queHacerConElSonido('aac'), R.queHacerConElSonido('opus'),
  R.queHacerConElSonido(null)], ['copiar', 'recodificar', 'recodificar']);
ok('el navegador guarda el video 3 h (como la firma), y una subida sin avance se corta a los 30 s',
  [R.CACHE_VIDEO_SEG, R.SIN_AVANCE_SUBIDA_MS], [10800, 30000]);

// ═══════════════════════════════════════════════════════════
grupo('3 · Cómo se muestran el peso y la duración');
// ═══════════════════════════════════════════════════════════
ok('8 MB con coma', R.formatoMb(8_000_000), '8,0');
ok('y 1,5', R.formatoMb(1_500_000), '1,5');
ok('0:45', R.duracionTexto(45), '0:45');
ok('1:12', R.duracionTexto(72), '1:12');
ok('con decimales redondea', [R.duracionTexto(59.6), R.duracionTexto(0.2)], ['1:00', '0:00']);
ok('lo roto no rompe', [R.formatoMb(NaN), R.duracionTexto(-3)], ['0,0', '0:00']);

// ═══════════════════════════════════════════════════════════
grupo('4 · Lo que ve el alumno');
// ═══════════════════════════════════════════════════════════
const ID1 = '11111111-2222-4333-8444-555555555555';
const ID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
ok('un clip bien', S.clipLimpio({ id: ID1, bytes: 8000000, seg: 42.5 }), { id: ID1, bytes: 8000000, seg: 42.5 });
ok('solo sus claves: una ruta o una empresa no pasan',
  S.clipLimpio({ id: ID1, bytes: 1, seg: 1, ruta: `${ID1}.mp4`, empresa_id: ID2 }), { id: ID1, bytes: 1, seg: 1 });
ok('un id que no es uuid', S.clipLimpio({ id: '../x', bytes: 1, seg: 1 }), null);
ok('bytes o segundos rotos', [S.clipLimpio({ id: ID1, bytes: '8', seg: 1 }), S.clipLimpio({ id: ID1, bytes: 1, seg: 0 }),
  S.clipLimpio({ id: ID1, bytes: Infinity, seg: 1 })], [null, null, null]);
ok('null, un texto, una lista', [S.clipLimpio(null), S.clipLimpio('x'), S.clipLimpio([ID1])], [null, null, null]);
const ej = (clip, video = null) => ({ id: 'r', orden: 1, nombre: 'x', series: 3, reps: '10', carga: '', descanso_seg: null,
  nota: '', junto: false, video, como: '', clip });
const c1 = { id: ID1, bytes: 1000, seg: 10 };
const c2 = { id: ID2, bytes: 2000, seg: 20 };
const rutina = (dias, extra = {}) => ({ existe: true, negocio: 'N', nombre: 'Ana', renovar: false, actualizada: null,
  rutina: { nombre: 'R', notas: '', desde: null, dias }, ...extra });
const r4 = rutina([
  { orden: 1, nombre: 'A', notas: '', ejercicios: [ej(c2), ej(null), ej(c1)] },
  { orden: 2, nombre: 'B', notas: '', ejercicios: [ej(c1), ej(c2)] },
]);
ok('los videos de la rutina, sin repetir y en orden', S.clipsDeLaRutina(r4).map((c) => c.id), [ID2, ID1]);
ok('con renovar: ninguno', S.clipsDeLaRutina(rutina(r4.rutina.dias, { renovar: true })), []);
ok('sin rutina, link inactivo o nada: ninguno',
  [S.clipsDeLaRutina({ ...rutina([]), rutina: null }), S.clipsDeLaRutina({ existe: false }), S.clipsDeLaRutina(null)], [[], [], []]);
ok('una copia rota no rompe', [S.clipsDeLaRutina(rutina(null)), S.clipsDeLaRutina(rutina([{ orden: 1 }]))], [[], []]);
ok('el propio gana al link', S.queVideoMostrar({ clip: c1, video: 'https://youtu.be/x' }), 'clip');
ok('solo el propio', S.queVideoMostrar({ clip: c1, video: null }), 'clip');
ok('solo el link', S.queVideoMostrar({ clip: null, video: 'https://youtu.be/x' }), 'link');
ok('un link que no es https: nada', [S.queVideoMostrar({ clip: null, video: 'http://youtu.be/x' }),
  S.queVideoMostrar({ clip: null, video: 'javascript:alert(1)' }), S.queVideoMostrar({ clip: null, video: null })], [null, null, null]);
ok('la caché de cada link y la clave de cada video',
  [S.nombreCacheRutina('tok'), S.claveClip(ID1), S.PREFIJO_CACHE_RUTINA], ['orden-rutina:tok', `/__clip/${ID1}`, 'orden-rutina:']);

// ═══════════════════════════════════════════════════════════
grupo('5 · Lo que se comprueba leyendo el código');
// ═══════════════════════════════════════════════════════════
const todos = (dir) => fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? todos(`${dir}/${d.name}`) : /\.(ts|tsx|js|mjs)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
const fuentes = todos('src');
const codigo = Object.fromEntries(fuentes.map((f) => [f, leer(f)]));

// El conversor solo con import() adentro de src/lib/video.ts.
ok('ningún archivo importa mediabunny de arriba', fuentes.filter((f) => /from\s+['"]mediabunny['"]/.test(codigo[f])), []);
ok("import('mediabunny') solo en src/lib/video.ts",
  fuentes.filter((f) => /import\(\s*['"]mediabunny['"]\s*\)/.test(sinComentarios(codigo[f]))), ['src/lib/video.ts']);
ok('ni require', fuentes.filter((f) => /require\(\s*['"]mediabunny['"]\s*\)/.test(codigo[f])), []);
// La página del alumno no baja el conversor ni el código de subir.
const delAlumno = fuentes.filter((f) => f.startsWith('src/components/rutinas/publico/')
  || f === 'src/components/rutinas/RutinaDelCliente.tsx' || f.startsWith('src/app/rutina/'));
ok('se revisa la página del alumno', delAlumno.length >= 8, true);
ok('que no importa @/lib/video ni mediabunny',
  delAlumno.filter((f) => /['"](?:@\/lib|(?:\.\.\/)+lib)\/video['"]|mediabunny/.test(sinComentarios(codigo[f]))), []);
ok('y video-reglas.ts no importa nada (lo baja el alumno)', /\bimport\b/.test(sinComentarios(codigo['src/lib/video-reglas.ts'])), false);

// La ruta pública que firma: solo el token.
const rutaVideos = sinComentarios(codigo['src/app/rutina/[token]/videos/route.ts']);
ok('la ruta de los videos firma lo que devuelve videos_por_token, con el token validado',
  ['videos_por_token', 'createSignedUrls', 'esTokenDeRutina', 'no-store', 'noindex', 'no-referrer'].filter((x) => !rutaVideos.includes(x)), []);
ok('y no lee nada más del pedido', ['searchParams', 'request.json', '.json()', 'formData', 'nextUrl', 'headers.get']
  .filter((x) => rutaVideos.includes(x)), []);
ok('firma por 3 horas', /SEGUNDOS_FIRMA = 3 \* 60 \* 60/.test(rutaVideos), true);
ok('servicio.ts escribe la excepción', codigo['src/lib/supabase/servicio.ts'].includes('/rutina/[token]/videos'), true);
ok('el middleware ya la deja pasar sin tocarlo (/rutina/)', /'\/rutina\/'/.test(codigo['src/middleware.ts']), true);

// El cron de la limpieza.
const cron = codigo['src/app/api/tareas/limpiar-videos/route.ts'];
ok('limpiar-videos exige el secreto antes de nada',
  /export async function GET\(request: Request\) \{\s*if \(!cronAutorizado\(request\)\)/.test(cron), true);
ok('borra los archivos de a 100 y después las filas',
  [/i \+= 100/.test(cron), cron.indexOf("remove(") < cron.indexOf("'videos_limpiados'")], [true, true]);
ok('el reloj está en la 113 y la ruta de la tarea existe',
  [sql113.includes("'orden-limpiar-videos'") && sql113.includes("'/api/tareas/limpiar-videos'"),
    fs.existsSync(path.join(raiz, 'src/app/api/tareas/limpiar-videos/route.ts'))], [true, true]);
ok('vercel.json no se tocó: sigue sin este cron', leer('vercel.json').includes('limpiar-videos'), false);

// Borrar la cuenta se lleva los videos.
const borrar = codigo['src/app/api/cuenta/borrar/route.ts'];
ok('borrar la cuenta pide las rutas de los videos antes de borrar los datos',
  [borrar.includes("'videos_a_borrar'"), borrar.indexOf("'videos_a_borrar'") < borrar.indexOf("'borrar_datos_de_usuario'"),
    borrar.includes(".from('videos').remove(")], [true, true, true]);
// Revisión (30/09): si la 113 todavía no está aplicada (o la consulta falla),
// la cuenta se borra igual: los videos no frenan el borrado.
ok('un error de videos_a_borrar no corta el borrado de la cuenta',
  [/if \(errorVideos\) throw/.test(sinComentarios(borrar)), /if \(errorVideos\) console\.error/.test(sinComentarios(borrar))], [false, true]);

// El service worker no borra las copias del alumno.
const sw = leer('public/sw.js');
const activar = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf("function esEstatico"));
ok("sw.js conserva 'orden-rutina:' en activate", activar.includes("!c.startsWith('orden-rutina:')"), true);
ok('con el mismo prefijo que la lib', activar.includes(`'${S.PREFIJO_CACHE_RUTINA}'`), true);

// Los componentes nuevos: todo del diccionario, colores por variables.
const nuevos = ['src/components/rutinas/VideoDelEjercicio.tsx', 'src/components/rutinas/publico/VideoPropio.tsx'];
const textoSuelto = nuevos.filter((a) => /(?<![=-])>\s*[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}[^<{}()=;]*(<\/|\{)/.test(sinComentarios(codigo[a])));
ok('ningún texto suelto en los componentes nuevos', textoSuelto, []);
ok('ni bg-white opaco, bg-black o clases dark:',
  nuevos.filter((a) => /\bbg-white(?!\/)|\bbg-black\b|\bdark:/.test(codigo[a])), []);
ok("todos son 'use client' y usan useTextos",
  nuevos.filter((a) => !codigo[a].startsWith("'use client'") || !codigo[a].includes('useTextos()')), []);
ok('el reproductor del alumno: playsInline, desde un blob y se suelta',
  [/playsInline/.test(codigo[nuevos[1]]), /URL\.createObjectURL/.test(codigo[nuevos[1]]), /URL\.revokeObjectURL/.test(codigo[nuevos[1]])],
  [true, true, true]);
ok('el del trainer: playsInline y preload="metadata"',
  [/playsInline/.test(codigo[nuevos[0]]), /preload="metadata"/.test(codigo[nuevos[0]])], [true, true]);
const publicos = fuentes.filter((f) => f.startsWith('src/components/rutinas/publico/'));
const cachesSinTry = publicos.filter((a) => {
  const lineas = sinComentarios(codigo[a]).split('\n');
  return lineas.some((l, i) => /\b(localStorage|caches)\./.test(l) && !lineas.slice(Math.max(0, i - 3), i).some((x) => /try \{/.test(x)));
});
ok('todo acceso a caches y localStorage de la página del alumno va con try/catch', cachesSinTry, []);
// Revisión (30/09): la subida va con subirAStorage (XHR: avance, tope por falta
// de avance y «Cancelar»), siempre como video/mp4 (el tipo del Blob, que es lo
// que cuenta en el FormData: la opción contentType de storage-js no hacía nada).
const videoTs = sinComentarios(codigo['src/lib/video.ts']);
ok('la subida va directo a Storage con la ruta que dio la base, sin pisar, y siempre como video/mp4',
  [/rpc\('reservar_video'/.test(videoTs), /subirAStorage\(/.test(videoTs), /tipo: 'video\/mp4'/.test(videoTs),
    /\.upload\(/.test(videoTs), /rpc\('poner_video_ejercicio'/.test(videoTs),
    /x-upsert', 'false'/.test(sinComentarios(codigo['src/lib/subida-storage.ts']))],
  [true, true, true, false, true, true]);
ok('«tal cual»: el archivo del selector se sube como video/mp4 aunque venga sin tipo',
  /new Blob\(\[archivo\], \{ type: 'video\/mp4' \}\)/.test(videoTs), true);
ok('el sonido del celular (AAC) se copia: sin quality ni numberOfChannels para «copiar»',
  [/queHacerConElSonido\(codecAudio\)/.test(videoTs), /sonido === 'copiar'\s*\?\s*\{ codec: 'aac' \}/.test(videoTs)], [true, true]);
ok('se sube con el cacheControl de 3 h, no de un año', [/cacheSeg: CACHE_VIDEO_SEG/.test(videoTs), /31536000/.test(videoTs)], [true, false]);
const delTrainer = sinComentarios(codigo['src/components/rutinas/VideoDelEjercicio.tsx']);
ok('la pantalla del trainer: «Cancelar la subida», y «Reintentar la subida» con el video ya preparado',
  [/p\.cancelarSubida/.test(delTrainer), /control\.current\?\.abort\(\)/.test(delTrainer), /p\.reintentar/.test(delTrainer),
    /subir\(reintento\.listo\)/.test(delTrainer), /soltarReserva\(/.test(delTrainer)],
  [true, true, true, true, true]);
const delAlumnoVideo = sinComentarios(codigo['src/components/rutinas/publico/VideoPropio.tsx']);
ok('la página del alumno: «Parar» mientras baja, y el aviso de la bajada que se quedó quieta',
  [/r\.parar/.test(delAlumnoVideo), /control\.current\?\.abort\(\)/.test(delAlumnoVideo), /r\.videoSeQuedo/.test(delAlumnoVideo)],
  [true, true, true]);
const clipsTs = sinComentarios(codigo['src/components/rutinas/publico/clips.ts']);
ok('clips.ts: la dirección con firmas.de (vuelve a pedir si falta) y la bajada con tope por falta de avance',
  [/firmas\.de\(token, clip\.id\)/.test(clipsTs), /bajarConAvance\(/.test(clipsTs), /SIN_AVANCE_BAJADA_MS = 20_000/.test(codigo['src/components/rutinas/publico/clips.ts'])],
  [true, true, true]);
ok('la biblioteca limpia después de borrar y de unir',
  (codigo['src/components/rutinas/BibliotecaEjercicios.tsx'].match(/limpiarVideosPendientes\(empresaId\)/g) || []).length, 2);
ok('la pantalla pide el cupo con videos_de_la_cuenta', codigo['src/app/(app)/rutinas/page.tsx'].includes("rpc('videos_de_la_cuenta'"), true);

// Los textos.
const legal = leer('src/i18n/textos/legal.ts');
ok('la privacidad dice «Tus videos» y «Seus vídeos»', [legal.includes('**Tus videos:**'), legal.includes('**Seus vídeos:**')], [true, true]);
ok('y que se borran con la cuenta', [legal.includes('links, videos e historial'), legal.includes('links, vídeos e histórico')], [true, true]);
const panel = leer('src/i18n/textos/rutinas-panel.ts');
ok('el label del link dice que es la alternativa', [panel.includes("video: 'Link de un video'"), panel.includes("video: 'Link de um vídeo'")],
  [true, true]);
ok('los errores del video en los dos idiomas',
  ['no_es_video', 'no_se_pudo_leer', 'celular_no_convierte', 'muy_pesado', 'subida_fallo', 'pantalla_cerrada', 'muy_largo']
    .filter((k) => (panel.match(new RegExp(`\\b${k}: '`, 'g')) || []).length !== 2), []);
const publica = leer('src/i18n/textos/rutina-publica.ts');
ok('la página del alumno, en los dos idiomas',
  ['videoVer', 'videoDatos', 'videoBajando', 'videoNecesitaSenal', 'videoNoCargo', 'videoCerrar', 'videoGuardado']
    .filter((k) => (publica.match(new RegExp(`\\b${k}: `, 'g')) || []).length !== 2), []);
ok('en.ts no suma claves de rutinas', /videoGuardado|conVideoPropio/.test(leer('src/i18n/textos/en.ts')), false);
ok('sin loading.tsx bajo (app)', fs.existsSync(path.join(raiz, 'src/app/(app)/loading.tsx')), false);
// Revisión (30/09): los textos nuevos, en los dos idiomas.
ok('subir: cancelar, reintentar y los dos errores nuevos, en es y pt',
  ['cancelarSubida', 'reintentar', 'subida_quieta', 'subida_cancelada'].filter((k) => (panel.match(new RegExp(`\\b${k}: '`, 'g')) || []).length !== 2), []);
ok('la bajada que se quedó quieta, en es y pt', (publica.match(/\bvideoSeQuedo: '/g) || []).length, 2);
// Revisión (30/09, Smart CDN): la privacidad no promete que apagar el link corte un video ya visto.
ok('la privacidad dice cómo se corta un video del todo (es y pt)',
  [legal.includes('para cortar un video del todo, quitalo o cambialo'), legal.includes('para cortar um vídeo de vez, remova ou troque o vídeo')],
  [true, true]);
ok('y la ruta de las firmas lo explica (el CDN sigue sirviendo una firma ya usada)',
  /BORRAR EL ARCHIVO sí/.test(codigo['src/app/rutina/[token]/videos/route.ts']), true);

(async () => {
  // ═══════════════════════════════════════════════════════════
  grupo('6 · La subida del trainer (subida-storage.ts), con un XHR de mentira');
  // ═══════════════════════════════════════════════════════════
  const U = require('../.compilado/subida-storage.js');
  const entradaDe = (fd) => [...fd.entries()];
  const sinTipo = entradaDe(U.cuerpoDeSubida(new Blob(['x']), 'video/mp4', 10800));
  const de3gp = entradaDe(U.cuerpoDeSubida(new Blob(['x'], { type: 'video/3gpp' }), 'video/mp4', 10800));
  ok('el archivo va SIEMPRE como video/mp4 (sin tipo o 3gpp), con el cacheControl',
    [sinTipo[0], sinTipo[1][1].type, de3gp[1][1].type, sinTipo[1][1].size], [['cacheControl', '10800'], 'video/mp4', 'video/mp4', 1]);
  ok('la dirección de la subida', U.direccionDeSubida('https://x.supabase.co/', 'videos', `${ID1}.mp4`),
    `https://x.supabase.co/storage/v1/object/videos/${ID1}.mp4`);

  /** Un XMLHttpRequest de mentira: `alEnviar(xhr)` decide qué pasa. */
  const xhrFalso = (alEnviar) => {
    const x = { cabeceras: {}, abortado: false, upload: {}, status: 0 };
    x.open = (metodo, url) => { x.metodo = metodo; x.url = url; };
    x.setRequestHeader = (k, v) => { x.cabeceras[k] = v; };
    x.abort = () => { x.abortado = true; if (x.onabort) x.onabort(); };
    x.send = (cuerpo) => { x.cuerpo = cuerpo; alEnviar(x); };
    return x;
  };
  const pedido = (x, extra = {}) => ({
    base: 'https://x.supabase.co', clave: 'clave-publica', token: 'token-usuario', bucket: 'videos', ruta: `${ID1}.mp4`,
    archivo: new Blob(['abc'], { type: 'video/mp4' }), tipo: 'video/mp4', cacheSeg: 10800, sinAvanceMs: 60,
    crearXhr: () => x, ...extra,
  });
  const avances = [];
  const bien = xhrFalso((x) => setTimeout(() => {
    x.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    x.status = 200; x.onload();
  }, 10));
  ok('bien: ok, con el avance, POST con el token, la clave y sin pisar',
    [await U.subirAStorage(pedido(bien, { alAvanzar: (p) => avances.push(p) })), avances, bien.metodo,
      bien.cabeceras, bien.abortado],
    ['ok', [50], 'POST', { Authorization: 'Bearer token-usuario', apikey: 'clave-publica', 'x-upsert': 'false' }, false]);
  const rechazo = xhrFalso((x) => setTimeout(() => { x.status = 400; x.onload(); }, 5));
  ok('Storage la rechaza (400): fallo', await U.subirAStorage(pedido(rechazo)), 'fallo');
  const cortada = xhrFalso((x) => setTimeout(() => x.onerror(), 5));
  ok('se corta la red: fallo', await U.subirAStorage(pedido(cortada)), 'fallo');
  const colgada = xhrFalso(() => {});
  const t0 = Date.now();
  ok('la señal se queda colgada (nada sale): quieta, cortada, a los sinAvanceMs',
    [await U.subirAStorage(pedido(colgada)), colgada.abortado, Date.now() - t0 >= 50], ['quieta', true, true]);
  let pasos = 0;
  const lenta = xhrFalso((x) => {
    const tic = setInterval(() => {
      pasos++;
      x.upload.onprogress({ lengthComputable: true, loaded: pasos * 10, total: 100 });
      if (pasos === 6) { clearInterval(tic); x.status = 200; x.onload(); }
    }, 30);
  });
  ok('lenta pero avanzando (cada 30 ms, tope 60 ms): no se corta', [await U.subirAStorage(pedido(lenta)), lenta.abortado], ['ok', false]);
  const ctrl = new AbortController();
  const cancelable = xhrFalso(() => setTimeout(() => ctrl.abort(), 10));
  ok('«Cancelar la subida»: cancelada, y el pedido se corta',
    [await U.subirAStorage(pedido(cancelable, { senal: ctrl.signal, sinAvanceMs: 5000 })), cancelable.abortado], ['cancelada', true]);
  const yaCancelada = new AbortController();
  yaCancelada.abort();
  ok('cancelada antes de empezar: ni se pide', await U.subirAStorage(pedido(xhrFalso(() => { throw new Error('no'); }), { senal: yaCancelada.signal })), 'cancelada');

  // ═══════════════════════════════════════════════════════════
  grupo('7 · La bajada del alumno (bajar-video.ts), con un fetch de mentira');
  // ═══════════════════════════════════════════════════════════
  const B = require('../.compilado/bajar-video.js');
  let pedidas = 0;
  let listas = [{ [ID1]: 'https://s/1' }, { [ID1]: 'https://s/1', [ID2]: 'https://s/2' }];
  let reloj = 1000;
  const firmas = B.crearFirmas(async () => { pedidas++; return listas[Math.min(pedidas, listas.length) - 1]; }, { recordarMs: 100, ahora: () => reloj });
  ok('la primera vez se piden las firmas', [await firmas.de('t', ID1), pedidas], ['https://s/1', 1]);
  ok('la segunda, de lo recordado', [await firmas.de('t', ID1), pedidas], ['https://s/1', 1]);
  ok('un video recién subido que no está en lo recordado: se piden otra vez, una sola (antes: «no cargó» por 150 min)',
    [await firmas.de('t', ID2), pedidas], ['https://s/2', 2]);
  reloj += 200;
  await firmas.todas('t');
  ok('y al vencer lo recordado se vuelven a pedir', pedidas, 3);
  let pedidasOtras = 0;
  const otras = B.crearFirmas(async () => { pedidasOtras++; return {}; }, { recordarMs: 100, ahora: () => reloj });
  ok('uno que de verdad no está: undefined, sin pedir en bucle', [await otras.de('t', ID1), pedidasOtras], [undefined, 1]);

  const cuerpo = (pedazos, { quedarse = false } = {}) => (url, init) => {
    const flujo = new ReadableStream({
      start(c) {
        for (const p of pedazos) c.enqueue(new Uint8Array(p));
        if (!quedarse) c.close();
        init.signal.addEventListener('abort', () => { try { c.error(new DOMException('corte', 'AbortError')); } catch { /* ya cerrado */ } });
      },
    });
    return Promise.resolve(new Response(flujo, { status: 200, headers: { 'content-length': String(pedazos.reduce((s, p) => s + p, 0)) } }));
  };
  const pcts = [];
  const blob = await B.bajarConAvance('https://s/1', { total: 1, tipo: 'video/mp4', sinAvanceMs: 200, alAvanzar: (p) => pcts.push(p), hacerFetch: cuerpo([50, 50]) });
  ok('baja entera, con el porcentaje, como video/mp4', [blob.size, blob.type, pcts], [100, 'video/mp4', [50, 99, 100]]);
  const error = async (promesa) => { try { await promesa; return 'sin error'; } catch (e) { return B.errorDeBajada(e); } };
  ok('una bajada que se queda quieta en la mitad: quieta (antes: «Bajando 43 %» para siempre)',
    await error(B.bajarConAvance('https://s/1', { total: 100, tipo: 'video/mp4', sinAvanceMs: 60, hacerFetch: cuerpo([43], { quedarse: true }) })), 'quieta');
  const colgado = (url, init) => new Promise((_, mal) => init.signal.addEventListener('abort', () => mal(new DOMException('corte', 'AbortError'))));
  ok('un servidor que ni contesta: quieta', await error(B.bajarConAvance('https://s/1', { total: 1, tipo: 'video/mp4', sinAvanceMs: 60, hacerFetch: colgado })), 'quieta');
  const parar = new AbortController();
  setTimeout(() => parar.abort(), 20);
  ok('«Parar»: parada (no es un error que se muestre)',
    await error(B.bajarConAvance('https://s/1', { total: 100, tipo: 'video/mp4', sinAvanceMs: 5000, senal: parar.signal, hacerFetch: cuerpo([10], { quedarse: true }) })), 'parada');
  ok('una firma vencida (403): http', await error(B.bajarConAvance('https://s/1', { total: 1, tipo: 'video/mp4', sinAvanceMs: 200,
    hacerFetch: async () => new Response('no', { status: 403 }) })), 'http');
  ok('la red se corta: red', await error(B.bajarConAvance('https://s/1', { total: 1, tipo: 'video/mp4', sinAvanceMs: 200,
    hacerFetch: async () => { throw new TypeError('Failed to fetch'); } })), 'red');

  console.log('\n' + '═'.repeat(62));
  console.log(fallos === 0
    ? `>>> ${corridas} COMPROBACIONES DE LAS REGLAS DE LOS VIDEOS PASARON`
    : `>>> ${fallos} DE ${corridas} COMPROBACIONES DE LAS REGLAS DE LOS VIDEOS FALLARON`);
  process.exit(fallos > 0 ? 1 : 0);
})().catch((e) => { console.error('\nLa prueba se rompió:', e); process.exit(1); });
