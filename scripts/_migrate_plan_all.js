// Comprehensive Plan table migration — add ALL missing columns + enums
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });

(async () => {
  await c.connect();
  
  // 1. Create BillingScheme enum if it doesn't exist
  console.log('===Creating enums===');
  try {
    await c.query(`DO $$ BEGIN CREATE TYPE "BillingScheme" AS ENUM ('PREPAID', 'POSTPAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    console.log('✓ BillingScheme enum created/exists');
  } catch (e) { console.log('BillingScheme:', e.message); }
  
  try {
    await c.query(`DO $$ BEGIN CREATE TYPE "IdleTimeoutType" AS ENUM ('NONE', 'LIVE_REQUEST', 'DATA_TRANSFER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    console.log('✓ IdleTimeoutType enum created/exists');
  } catch (e) { console.log('IdleTimeoutType:', e.message); }
  
  // 2. Add ALL missing columns to Plan table
  console.log('\n===Adding Plan columns===');
  const columns = [
    ['billingScheme', '"BillingScheme" DEFAULT \'PREPAID\''],
    ['availableFor', 'TEXT DEFAULT \'REGISTRATION,RENEWAL\''],
    ['onlinePurchaseable', 'BOOLEAN DEFAULT true'],
    ['discountAmount', 'FLOAT DEFAULT 0'],
    ['discountIsPercent', 'BOOLEAN DEFAULT false'],
    ['macBinding', 'BOOLEAN DEFAULT false'],
    ['priority', 'INTEGER DEFAULT 0'],
    ['idleTimeoutMin', 'INTEGER'],
    ['fixedExpiryAt', 'TIMESTAMPTZ'],
    ['expireTimeOfDay', 'TEXT DEFAULT \'23:59:59\''],
    ['ipPoolId', 'TEXT'],
    ['billingDay', 'INTEGER'],
    ['cycleMultiplier', 'INTEGER'],
    ['cyclePrice', 'FLOAT'],
    ['cycleDays', 'INTEGER'],
    ['ipv6Enabled', 'BOOLEAN DEFAULT false'],
    ['ipv6PrefixDelegation', 'BOOLEAN DEFAULT false'],
    ['ipv6DefaultPoolId', 'TEXT'],
    ['ipv6AssignmentMode', 'TEXT DEFAULT \'SLAAC\''],
  ];
  
  let added = 0;
  for (const [col, type] of columns) {
    try {
      await c.query(`ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
      console.log(`✓ Plan.${col}`);
      added++;
    } catch (e) {
      console.log(`✗ Plan.${col}: ${e.message}`);
    }
  }
  
  console.log(`\n✅ Added ${added} columns to Plan table`);
  
  // 3. Test the dashboard API
  console.log('\n===Testing dashboard===');
  const dashResult = await c.query('SELECT COUNT(*) as count FROM "Plan"');
  console.log('Plan count in DB:', dashResult.rows[0].count);
  
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
