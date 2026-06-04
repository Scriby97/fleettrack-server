const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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

const strict = process.argv.includes('--strict');

const expected = {
  tables: [
    'organizations',
    'organization_invites',
    'user_profiles',
    'vehicles',
    'usages',
  ],
  columnsByTable: {
    organizations: [
      'id',
      'name',
      'subdomain',
      'isActive',
      'contactEmail',
      'createdAt',
      'updatedAt',
    ],
    organization_invites: [
      'id',
      'token',
      'organizationId',
      'email',
      'role',
      'invitedBy',
      'expiresAt',
      'usedAt',
      'usedBy',
      'createdAt',
    ],
    user_profiles: [
      'id',
      'email',
      'role',
      'firstName',
      'lastName',
      'createdAt',
      'updatedAt',
      'organizationId',
    ],
    vehicles: [
      'id',
      'name',
      'plate',
      'snowsatNumber',
      'organizationId',
      'isRetired',
      'location',
      'vehicleType',
      'fuelType',
      'notes',
    ],
    usages: [
      'id',
      'vehicleId',
      'usageDate',
      'creatorId',
      'startOperatingHours',
      'endOperatingHours',
      'fuelLitersRefilled',
      'creationDate',
    ],
  },
  foreignKeys: [
    'organization_invites.organizationId->organizations.id',
    'user_profiles.organizationId->organizations.id',
    'vehicles.organizationId->organizations.id',
    'usages.vehicleId->vehicles.id',
    'usages.creatorId->user_profiles.id',
  ],
  checkConstraints: [
    'check_start_operating_hours_non_negative',
    'check_end_operating_hours_positive',
    'check_end_hours_gte_start_hours',
  ],
  indexes: [
    'idx_vehicles_organization',
    'idx_users_organization',
    'idx_invites_token',
    'idx_invites_organization',
    'idx_vehicles_isretired',
    'idx_usages_creation_date',
  ],
  policies: [
    'Users can read own profile',
    'Users can update own profile',
    'Users can read own organization',
    'Users can read invites for their organization',
    'Public can read invite by token',
    'Users can read vehicles from their organization',
    'Users can read usages from their organization',
  ],
  rlsTables: [
    'organizations',
    'organization_invites',
    'user_profiles',
    'vehicles',
    'usages',
  ],
};

const allowedExtraColumnsByTable = {
  usages: ['updatedat', 'version', 'deleted', 'deletedat'],
};

function toSet(items) {
  return new Set(items);
}

function diffMissing(actualSet, expectedItems) {
  return expectedItems.filter((item) => !actualSet.has(item));
}

function diffUnexpected(actualItems, expectedSet) {
  return actualItems.filter((item) => !expectedSet.has(item));
}

async function main() {
  const connectionString = loadDatabaseUrl();

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const report = {
    strict,
    missingTables: [],
    missingColumns: [],
    unexpectedColumns: [],
    missingForeignKeys: [],
    missingCheckConstraints: [],
    missingIndexes: [],
    unexpectedIndexes: [],
    missingPolicies: [],
    rlsDisabled: [],
  };

  const tablesRes = await client.query(
    "select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  const actualTables = tablesRes.rows.map((r) => r.table_name);
  const actualTableSet = toSet(actualTables);
  report.missingTables = diffMissing(actualTableSet, expected.tables);

  const colsRes = await client.query(
    "select table_name, column_name from information_schema.columns where table_schema='public'",
  );

  const actualColsByTable = new Map();
  for (const row of colsRes.rows) {
    if (!actualColsByTable.has(row.table_name)) actualColsByTable.set(row.table_name, []);
    actualColsByTable.get(row.table_name).push(row.column_name);
  }

  for (const [table, expectedCols] of Object.entries(expected.columnsByTable)) {
    const actualCols = actualColsByTable.get(table) || [];
    const actualSet = toSet(actualCols);
    for (const col of expectedCols) {
      if (!actualSet.has(col)) report.missingColumns.push(`${table}.${col}`);
    }

    if (strict) {
      const expectedSet = toSet(expectedCols);
      const allowedExtras = new Set(allowedExtraColumnsByTable[table] || []);
      const extra = diffUnexpected(actualCols, expectedSet)
        .filter((c) => !allowedExtras.has(c))
        .map((c) => `${table}.${c}`);
      report.unexpectedColumns.push(...extra);
    }
  }

  const fkRes = await client.query(
    "select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name=kcu.constraint_name and tc.table_schema=kcu.table_schema join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.table_schema=tc.table_schema where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'",
  );
  const actualFks = fkRes.rows.map(
    (r) => `${r.table_name}.${r.column_name}->${r.foreign_table_name}.${r.foreign_column_name}`,
  );
  report.missingForeignKeys = diffMissing(toSet(actualFks), expected.foreignKeys);

  const checkRes = await client.query(
    "select conname from pg_constraint where contype='c'",
  );
  const actualChecks = checkRes.rows.map((r) => r.conname);
  report.missingCheckConstraints = diffMissing(toSet(actualChecks), expected.checkConstraints);

  const idxRes = await client.query(
    "select tablename, indexname from pg_indexes where schemaname='public'",
  );
  const actualIdx = idxRes.rows.map((r) => r.indexname);
  report.missingIndexes = diffMissing(toSet(actualIdx), expected.indexes);

  if (strict) {
    const managedTableSet = toSet(Object.keys(expected.columnsByTable));
    const actualCustomIdx = idxRes.rows
      .filter((row) => managedTableSet.has(row.tablename))
      .map((row) => row.indexname)
      .filter((name) => name.startsWith('idx_'));
    report.unexpectedIndexes = diffUnexpected(actualCustomIdx, toSet(expected.indexes));
  }

  const policyRes = await client.query(
    "select policyname from pg_policies where schemaname='public'",
  );
  const actualPolicies = policyRes.rows.map((r) => r.policyname);
  report.missingPolicies = diffMissing(toSet(actualPolicies), expected.policies);

  const rlsRes = await client.query(
    "select tablename, rowsecurity from pg_tables where schemaname='public'",
  );
  const rlsMap = new Map(rlsRes.rows.map((r) => [r.tablename, r.rowsecurity]));
  report.rlsDisabled = expected.rlsTables.filter((table) => !rlsMap.get(table));

  await client.end();

  const issueCount = Object.values(report)
    .filter((value) => Array.isArray(value))
    .reduce((sum, arr) => sum + arr.length, 0);

  console.log(JSON.stringify(report, null, 2));

  if (issueCount > 0) {
    process.exit(1);
  }

  console.log('Schema verification passed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(2);
});
