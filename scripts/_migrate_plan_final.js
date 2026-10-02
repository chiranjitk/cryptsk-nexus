// Final Plan migration — add ALL missing enum types + columns
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });
(async () => {
  await c.connect();
  
  // Create ALL missing enum types
  const enums = [
    ['IdleTimeoutType', "('NONE', 'LIVE_REQUEST', 'DATA_TRANSFER')"],
    ['ExpiryBasis', "('GLOBAL', 'FIXED_DATE', 'FIXED_DATETIME')"],
    ['PlanCycleType', "('NONE', 'WEEKLY', 'MONTHLY')"],
    ['CycleAmountBasis', "('ACTUAL_DAYS', 'FULL_AMOUNT')"],
  ];
  for (const [name, values] of enums) {
    try {
      await c.query(`DO $$ BEGIN CREATE TYPE "${name}" AS ENUM ${values}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
      console.log(`✓ Enum ${name}`);
    } catch (e) { console.log(`✗ ${name}: ${e.message}`); }
  }
  
  // Add ALL missing enum columns
  const enumCols = [
    ['idleTimeoutType', '"IdleTimeoutType" DEFAULT \'NONE\''],
    ['expiryBasis', '"ExpiryBasis" DEFAULT \'GLOBAL\''],
    ['cycleType', '"PlanCycleType" DEFAULT \'NONE\''],
    ['cycleAmountBasis', '"CycleAmountBasis" DEFAULT \'ACTUAL_DAYS\''],
    ['quotaChargeBasis', '"CycleAmountBasis" DEFAULT \'ACTUAL_DAYS\''],
  ];
  for (const [col, type] of enumCols) {
    try {
      await c.query(`ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
      console.log(`✓ Plan.${col}`);
    } catch (e) { console.log(`✗ Plan.${col}: ${e.message}`); }
  }
  
  console.log('\n✅ Migration complete');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
