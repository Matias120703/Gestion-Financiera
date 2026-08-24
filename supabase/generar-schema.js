/**
 * Arma supabase/schema.sql concatenando las migraciones en orden.
 *
 * schema.sql es el archivo maestro: ejecutarlo entero en una base nueva deja
 * el estado final correcto. Como cada migración está escrita de forma
 * idempotente, también se puede ejecutar sobre una instalación existente.
 *
 *   node supabase/generar-schema.js
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'migrations');
const archivos = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const cabecera = `-- ============================================================
-- ORDEN · Esquema completo
--
-- GENERADO AUTOMÁTICAMENTE — no editar a mano.
-- Se arma con: node supabase/generar-schema.js
-- La fuente son los archivos de supabase/migrations/.
--
-- Cómo usarlo:
--   · Base nueva      → pegá todo esto en Supabase → SQL Editor → Run.
--   · Base existente  → ejecutá solo las migraciones que te falten,
--                       o esto mismo (es idempotente y no borra datos).
--
-- Migraciones incluidas:
${archivos.map((f) => `--   · ${f}`).join('\n')}
-- ============================================================

`;

const cuerpo = archivos
  .map((f) => {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8').trim();
    return `-- ############################################################\n-- ##  ${f}\n-- ############################################################\n\n${sql}\n`;
  })
  .join('\n\n');

fs.writeFileSync(path.join(__dirname, 'schema.sql'), cabecera + cuerpo);
console.log(`schema.sql generado a partir de ${archivos.length} migraciones (${archivos.join(', ')})`);
