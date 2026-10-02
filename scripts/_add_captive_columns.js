// Check + add missing CaptivePortal columns
const pg = require('pg');
const c = new pg.Client({ connectionString: 'postgresql://cryptsknexus:CryptskNexus2026@127.0.0.1:5432/cryptsknexus' });

(async () => {
  await c.connect();
  
  // Get existing columns
  const existing = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='CaptivePortal' ORDER BY ordinal_position");
  const existingCols = existing.rows.map(r => r.column_name);
  console.log('Existing columns:', existingCols.join(', '));
  
  // Define all StaySuite columns that should exist
  const neededColumns = [
    ['listenIp', 'TEXT DEFAULT \'0.0.0.0\''],
    ['listenPort', 'INTEGER DEFAULT 80'],
    ['useSsl', 'BOOLEAN DEFAULT false'],
    ['sslCertPath', 'TEXT'],
    ['sslKeyPath', 'TEXT'],
    ['isDefault', 'BOOLEAN DEFAULT false'],
    ['autoAuthEnabled', 'BOOLEAN DEFAULT true'],
    ['maxConcurrent', 'INTEGER DEFAULT 1000'],
    ['sessionTimeout', 'INTEGER DEFAULT 86400'],
    ['idleTimeout', 'INTEGER DEFAULT 3600'],
    ['failMessage', 'TEXT'],
    ['slug', 'TEXT UNIQUE DEFAULT \'default-zone\''],
    ['roamingMode', 'TEXT DEFAULT \'auth_origin\''],
    ['allowsRoamingFrom', 'TEXT DEFAULT \'[]\''],
    ['authMethod', 'TEXT DEFAULT \'voucher\''],
    ['maxBandwidthDown', 'INTEGER DEFAULT 5242880'],
    ['maxBandwidthUp', 'INTEGER DEFAULT 1048576'],
    ['bandwidthPolicy', 'TEXT DEFAULT \'zone\''],
    ['nasIdentifier', 'TEXT DEFAULT \'\''],
    ['ssidList', 'TEXT DEFAULT \'[]\''],
    ['captchaEnabled', 'BOOLEAN DEFAULT false'],
    ['captchaSiteKey', 'TEXT'],
    ['captchaSecretKey', 'TEXT'],
    ['partnerId', 'TEXT'],
  ];
  
  // Add missing columns
  let added = 0;
  for (const [col, type] of neededColumns) {
    if (!existingCols.includes(col)) {
      try {
        await c.query(`ALTER TABLE "CaptivePortal" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
        console.log(`✓ Added: ${col} (${type})`);
        added++;
      } catch (e) {
        console.log(`✗ Failed: ${col} — ${e.message}`);
      }
    }
  }
  
  console.log(`\n✅ Added ${added} columns to CaptivePortal table`);
  
  // Also check PortalMapping table
  const pmExists = await c.query("SELECT to_regclass('PortalMapping')");
  if (pmExists.rows[0].to_regclass) {
    const pmCols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='PortalMapping'");
    const pmExisting = pmCols.rows.map(r => r.column_name);
    if (!pmExisting.includes('ipPoolId')) {
      await c.query('ALTER TABLE "PortalMapping" ADD COLUMN IF NOT EXISTS "ipPoolId" TEXT');
      console.log('✓ Added ipPoolId to PortalMapping');
    }
  }
  
  await c.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
