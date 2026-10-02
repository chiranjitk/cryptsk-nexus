// Add missing Plan policy columns + create policy tables if missing
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });

(async () => {
  await c.connect();
  
  // 1. Add missing columns to Plan table
  console.log('===Adding Plan policy columns===');
  const planCols = [
    ['surfingQuotaPolicyId', 'TEXT'],
    ['accessTimePolicyId', 'TEXT'],
    ['bandwidthPolicyId', 'TEXT'],
    ['dataTransferPolicyId', 'TEXT'],
    ['fairAccessPolicyId', 'TEXT'],
  ];
  
  for (const [col, type] of planCols) {
    try {
      await c.query(`ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
      console.log(`✓ Added Plan.${col}`);
    } catch (e) {
      console.log(`✗ Plan.${col}: ${e.message}`);
    }
  }
  
  // 2. Create policy tables if they don't exist
  const tables = [
    ['SurfingQuotaPolicy', `CREATE TABLE IF NOT EXISTS "SurfingQuotaPolicy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      "dailyQuotaMb" INTEGER DEFAULT 0,
      "weeklyQuotaMb" INTEGER DEFAULT 0,
      "monthlyQuotaMb" INTEGER DEFAULT 0,
      "sessionQuotaMb" INTEGER DEFAULT 0,
      "resetDay" INTEGER DEFAULT 1,
      "resetMode" TEXT DEFAULT 'monthly',
      "overLimitAction" TEXT DEFAULT 'throttle',
      "throttleSpeedDownKbps" INTEGER DEFAULT 0,
      "throttleSpeedUpKbps" INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`],
    ['AccessTimePolicy', `CREATE TABLE IF NOT EXISTS "AccessTimePolicy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      "slotsJson" TEXT DEFAULT '[]',
      "pricingFactor" DECIMAL(10,2) DEFAULT 1.0,
      "maxSessionMinutes" INTEGER DEFAULT 0,
      "enforceWeekdays" BOOLEAN DEFAULT false,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`],
    ['BandwidthPolicy', `CREATE TABLE IF NOT EXISTS "BandwidthPolicy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      "cirDownKbps" INTEGER DEFAULT 0,
      "cirUpKbps" INTEGER DEFAULT 0,
      "eirDownKbps" INTEGER DEFAULT 0,
      "eirUpKbps" INTEGER DEFAULT 0,
      "burstDownKbps" INTEGER DEFAULT 0,
      "burstUpKbps" INTEGER DEFAULT 0,
      "burstDurationSec" INTEGER DEFAULT 0,
      "priorityLevel" INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`],
    ['DataTransferPolicy', `CREATE TABLE IF NOT EXISTS "DataTransferPolicy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      "downloadQuotaMb" INTEGER DEFAULT 0,
      "uploadQuotaMb" INTEGER DEFAULT 0,
      "totalQuotaMb" INTEGER DEFAULT 0,
      "resetPeriod" TEXT DEFAULT 'monthly',
      "overLimitAction" TEXT DEFAULT 'block',
      "throttleDownKbps" INTEGER DEFAULT 0,
      "throttleUpKbps" INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`],
    ['FairAccessPolicy', `CREATE TABLE IF NOT EXISTS "FairAccessPolicy" (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      "primaryPolicyId" TEXT,
      "secondaryPolicyId" TEXT,
      "switchOverThresholdMb" INTEGER DEFAULT 0,
      "switchOverMode" TEXT DEFAULT 'data',
      "revertMode" TEXT DEFAULT 'manual',
      "revertTimeMinutes" INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ DEFAULT NOW()
    )`],
  ];
  
  for (const [tableName, createSQL] of tables) {
    try {
      await c.query(createSQL);
      console.log(`✓ Table ${tableName} exists/created`);
    } catch (e) {
      console.log(`✗ Table ${tableName}: ${e.message}`);
    }
  }
  
  // 3. Drop FK constraints on Plan policy columns (avoid FK issues)
  for (const [col] of planCols) {
    try {
      await c.query(`ALTER TABLE "Plan" DROP CONSTRAINT IF EXISTS "Plan_${col}_fkey"`);
    } catch (e) { /* ignore */ }
  }
  
  console.log('\n✅ Migration complete');
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
