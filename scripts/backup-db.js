/**
 * Manuelles DB-Backup: exportiert jede Tabelle als eigene CSV-Datei in einen
 * neuen, zeitgestempelten Unterordner von backups/.
 *
 * Aufruf:
 *   npm run backup
 *   node scripts/backup-db.js
 *   node scripts/backup-db.js --out ../meine-backups
 *
 * Verbindung wie bei scripts/verify-schema.js: DATABASE_URL aus der Umgebung
 * oder aus der .env-Datei im aktuellen Verzeichnis.
 *
 * WICHTIG: Die erzeugten CSVs enthalten echte Kundendaten (Namen, Emails,
 * Fahrzeugdaten) - backups/ ist deshalb in .gitignore eingetragen. Niemals
 * mit --out an einen Ort exportieren, der versioniert oder öffentlich
 * zugänglich ist.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Reihenfolge nur für die Lesbarkeit der Konsolenausgabe - beim CSV-Export
// spielt die Tabellenreihenfolge (anders als bei einem Restore) keine Rolle.
const TABLES = [
  'organizations',
  'organization_members',
  'organization_invites',
  'organization_subscriptions',
  'user_profiles',
  'vehicles',
  'usages',
  'usage_reminders',
  'push_subscriptions',
];

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('DATABASE_URL is not set and .env file was not found.');
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    if (!line.startsWith('DATABASE_URL=')) continue;
    return line.slice('DATABASE_URL='.length).trim();
  }

  throw new Error('DATABASE_URL is not set and was not found in .env.');
}

// Eine CSV-Zelle: in Anführungszeichen, falls sie Trennzeichen/
// Anführungszeichen/Zeilenumbrüche enthält; enthaltene Anführungszeichen
// werden verdoppelt. null/undefined -> leere Zelle, Date -> ISO-String,
// Objekte (z.B. jsonb-Spalten) -> JSON-Text.
function csvCell(value) {
  if (value === null || value === undefined) return '';
  let str;
  if (value instanceof Date) {
    str = value.toISOString();
  } else if (typeof value === 'object') {
    str = JSON.stringify(value);
  } else {
    str = String(value);
  }
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows) {
  if (rows.length === 0) return '(keine Zeilen)\r\n';
  const columns = Object.keys(rows[0]);
  const header = columns.map(csvCell).join(',');
  const lines = rows.map((row) => columns.map((col) => csvCell(row[col])).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

async function main() {
  const outArgIndex = process.argv.indexOf('--out');
  const outDir =
    outArgIndex !== -1 && process.argv[outArgIndex + 1]
      ? path.resolve(process.argv[outArgIndex + 1])
      : path.join(process.cwd(), 'backups');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(outDir, timestamp);
  fs.mkdirSync(backupDir, { recursive: true });

  const client = new Client({
    connectionString: loadDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log(`Backup nach: ${backupDir}\n`);

  const failed = [];
  let totalRows = 0;

  try {
    for (const table of TABLES) {
      try {
        const result = await client.query(`SELECT * FROM "${table}"`);
        const csv = toCsv(result.rows);
        fs.writeFileSync(path.join(backupDir, `${table}.csv`), csv, 'utf8');
        totalRows += result.rows.length;
        console.log(`  ✓ ${table}: ${result.rows.length} Zeilen`);
      } catch (err) {
        failed.push(table);
        console.error(`  ✗ ${table}: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(`\n${TABLES.length - failed.length}/${TABLES.length} Tabellen gesichert, ${totalRows} Zeilen insgesamt.`);

  if (failed.length > 0) {
    console.error(`Fehlgeschlagen: ${failed.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Erinnerung: Diese CSVs enthalten echte Kundendaten - sicher aufbewahren, nicht committen.');
  }
}

main().catch((err) => {
  console.error('Backup fehlgeschlagen:', err.message);
  process.exitCode = 1;
});
