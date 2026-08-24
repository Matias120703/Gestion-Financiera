/**
 * Verificación MANUAL contra la Data API real de Supabase.
 *
 * Las pruebas automáticas corren sobre PGlite: PostgreSQL de verdad, pero
 * dentro de Node y sin PostgREST adelante. Este script es el complemento que
 * falta: usa el mismo cliente `@supabase/supabase-js` que usa la aplicación,
 * contra tu proyecto real, y comprueba que los agregados no se vean afectados
 * por el máximo de filas de la Data API.
 *
 * CÓMO USARLO
 *
 *   1. Aplicá supabase/schema.sql en tu proyecto.
 *   2. Creá una cuenta y una empresa desde la app, y cargá algunos movimientos.
 *   3. Ejecutá:
 *
 *        NEXT_PUBLIC_SUPABASE_URL=... \
 *        NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *        ORDEN_EMAIL=tu@correo.com \
 *        ORDEN_PASSWORD=tu-contraseña \
 *        node pruebas/verificar-data-api.js
 *
 * NO escribe nada: solo lee. No crea ni borra movimientos.
 */
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const EMAIL = process.env.ORDEN_EMAIL;
const PASSWORD = process.env.ORDEN_PASSWORD;
const DESDE = process.env.ORDEN_DESDE || '2000-01-01';
const HASTA = process.env.ORDEN_HASTA || new Date().toISOString().slice(0, 10);

let fallos = 0;
const ok = (n, real, esperado) => {
  const a = JSON.stringify(real), b = JSON.stringify(esperado);
  if (a !== b) { fallos++; console.log(`  ✗ ${n}\n      obtenido: ${a}\n      esperado: ${b}`); }
  else console.log(`  ✓ ${n} → ${a}`);
};
const info = (n, v) => console.log(`  · ${n}: ${v}`);

async function principal() {
  if (!URL || !KEY || !EMAIL || !PASSWORD) {
    console.error('Faltan variables. Mirá el comentario de arriba para saber cuáles.');
    process.exit(2);
  }

  const supabase = createClient(URL, KEY);

  console.log('\n── Sesión ────────────────────────────────────────────────');
  const { error: errorLogin } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (errorLogin) { console.error('No se pudo entrar:', errorLogin.message); process.exit(1); }
  console.log('  ✓ sesión iniciada');

  const { data: miembros } = await supabase.from('miembros').select('empresa_id, rol').limit(1);
  if (!miembros?.length) { console.error('Esa cuenta no pertenece a ninguna empresa.'); process.exit(1); }
  const empresa = miembros[0].empresa_id;
  info('empresa', empresa);
  info('rol', miembros[0].rol);
  info('periodo', `${DESDE} → ${HASTA}`);

  console.log('\n── Cuántos movimientos hay ───────────────────────────────');
  const { data: total } = await supabase.rpc('contar_movimientos', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA,
  });
  info('movimientos en el periodo', total);

  console.log('\n── Los agregados devuelven poquísimas filas ──────────────');
  const { data: resumen, error: e1 } = await supabase.rpc('resumen_financiero', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA,
  });
  if (e1) { console.error('  ✗ resumen_financiero:', e1.message); fallos++; }
  else {
    ok('el resumen es un solo objeto', Array.isArray(resumen), false);
    info('ventas', resumen.ventas);
    info('ganancia neta', resumen.ganancia_neta);
  }

  const { data: ranking } = await supabase.rpc('ranking_productos', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA, p_limite: null,
  });
  const { data: serie } = await supabase.rpc('serie_financiera_diaria', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA,
  });
  const { data: gastos } = await supabase.rpc('gastos_por_categoria', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA,
  });

  info('filas del ranking', ranking?.length ?? 0);
  info('filas de la serie', serie?.length ?? 0);
  info('filas de gastos', gastos?.length ?? 0);

  const mayor = Math.max(ranking?.length ?? 0, serie?.length ?? 0, gastos?.length ?? 0);
  ok('ninguna respuesta agregada llega a 1.000 filas', mayor < 1000, true);

  console.log('\n── La suma del ranking reconcilia con el resumen ─────────');
  if (ranking?.length) {
    const suma = ranking.reduce((s, f) => s + Number(f.ingresos), 0);
    const dif = Math.abs(suma - Number(resumen.ventas));
    ok('ranking = ventas del resumen', dif < 0.01, true);
    info('suma del ranking', suma);
    info('ventas del resumen', resumen.ventas);
  } else {
    console.log('  (sin ventas en el periodo: nada que reconciliar)');
  }

  console.log('\n── El historial pagina de a 100 ──────────────────────────');
  const { data: pag1 } = await supabase.rpc('pagina_movimientos', {
    p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA, p_tamano: 100,
    p_cursor_fecha: null, p_cursor_created: null, p_cursor_id: null,
    p_tipo: null, p_incluir_anuladas: true, p_busqueda: null,
  });
  info('filas en la primera página', pag1?.length ?? 0);
  ok('una página nunca pasa de 100', (pag1?.length ?? 0) <= 100, true);

  if (pag1?.length === 100) {
    const u = pag1[pag1.length - 1];
    const { data: pag2 } = await supabase.rpc('pagina_movimientos', {
      p_empresa: empresa, p_desde: DESDE, p_hasta: HASTA, p_tamano: 100,
      p_cursor_fecha: u.fecha, p_cursor_created: u.created_at, p_cursor_id: u.id,
      p_tipo: null, p_incluir_anuladas: true, p_busqueda: null,
    });
    const ids1 = new Set(pag1.map((m) => m.id));
    const repetidos = (pag2 ?? []).filter((m) => ids1.has(m.id)).length;
    ok('la segunda página no repite nada de la primera', repetidos, 0);
  }

  console.log('\n── Qué pasaría trayendo todo (el camino viejo) ───────────');
  const { data: crudos } = await supabase
    .from('movimientos')
    .select('id, monto')
    .eq('empresa_id', empresa)
    .gte('fecha', DESDE).lte('fecha', HASTA)
    .eq('estado', 'activo').eq('tipo', 'venta');

  info('filas que devolvió la Data API', crudos?.length ?? 0);
  const sumaCruda = (crudos ?? []).reduce((s, m) => s + Number(m.monto), 0);
  info('total que habría mostrado', sumaCruda);
  info('total correcto (agregado)', resumen?.ventas);

  if (Math.abs(sumaCruda - Number(resumen?.ventas ?? 0)) > 0.01) {
    console.log('  ⚠️  ¡ACÁ SE VE EL PROBLEMA! La Data API recortó la respuesta');
    console.log('      y el camino viejo habría mostrado un total equivocado.');
    console.log('      El agregado, en cambio, sigue exacto.');
  } else {
    console.log('  (con este volumen el tope todavía no se activa; por eso la');
    console.log('   arquitectura no puede depender de que no se active)');
  }

  await supabase.auth.signOut();

  console.log(`\n${'═'.repeat(58)}`);
  console.log(fallos === 0
    ? '>>> LA DATA API REAL SE COMPORTA COMO ESPERÁBAMOS'
    : `>>> ${fallos} COMPROBACIONES FALLARON`);
  process.exit(fallos ? 1 : 0);
}

principal().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
