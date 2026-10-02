-- ============================================================
-- CRYPTSK Nexus — PostgreSQL LISTEN/NOTIFY Triggers for radacct
-- Per: docs/architecture/02_ENTERPRISE_GATEWAY_ARCHITECTURE.md §10
--
-- These triggers enable INSTANT event-driven session processing:
--   - INSERT (Accounting-Start) → pg_notify('session_start', ...) → fires <1ms
--   - UPDATE acctstoptime NULL→non-NULL (Accounting-Stop) → pg_notify('session_stop', ...)
--
-- The Session Engine LISTENs on these channels and programs VPP
-- immediately (synchronously), per §8 "Login Must Be Transactional".
--
-- The 60-second reconciliation poller is a FALLBACK only (crash recovery).
-- ============================================================

-- ─── Session Start Trigger (fires on Accounting-Start) ──────────
CREATE OR REPLACE FUNCTION notify_session_start() RETURNS TRIGGER AS $$
BEGIN
  -- Only fire on INSERT when this is a new active session (acctstoptime IS NULL)
  IF TG_OP = 'INSERT' AND NEW.acctstoptime IS NULL THEN
    PERFORM pg_notify('session_start', json_build_object(
      'radacctid', NEW.radacctid,
      'acctsessionid', NEW.acctsessionid,
      'acctuniqueid', NEW.acctuniqueid,
      'username', NEW.username,
      'nasipaddress', NEW.nasipaddress,
      'nasportid', NEW.nasportid,
      'framedipaddress', NEW.framedipaddress,
      'callingstationid', NEW.callingstationid,
      'acctstarttime', NEW.acctstarttime,
      'event_type', 'session_start'
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (idempotent), then create
DROP TRIGGER IF EXISTS radacct_session_start_trigger ON radacct;
CREATE TRIGGER radacct_session_start_trigger
AFTER INSERT ON radacct
FOR EACH ROW EXECUTE FUNCTION notify_session_start();

-- ─── Session Stop Trigger (fires on Accounting-Stop) ─────────────
-- Fires when acctstoptime transitions from NULL to non-NULL (UPDATE)
CREATE OR REPLACE FUNCTION notify_session_stop() RETURNS TRIGGER AS $$
BEGIN
  -- Only fire on UPDATE when acctstoptime goes from NULL to a timestamp
  IF TG_OP = 'UPDATE' AND OLD.acctstoptime IS NULL AND NEW.acctstoptime IS NOT NULL THEN
    PERFORM pg_notify('session_stop', json_build_object(
      'radacctid', NEW.radacctid,
      'acctsessionid', NEW.acctsessionid,
      'username', NEW.username,
      'nasipaddress', NEW.nasipaddress,
      'framedipaddress', NEW.framedipaddress,
      'acctstoptime', NEW.acctstoptime,
      'acctsessiontime', NEW.acctsessiontime,
      'acctinputoctets', NEW.acctinputoctets,
      'acctoutputoctets', NEW.acctoutputoctets,
      'event_type', 'session_stop'
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (idempotent), then create
DROP TRIGGER IF EXISTS radacct_session_stop_trigger ON radacct;
CREATE TRIGGER radacct_session_stop_trigger
AFTER UPDATE ON radacct
FOR EACH ROW EXECUTE FUNCTION notify_session_stop();

-- ─── Session Interim Update Trigger (fires on Accounting-Interim) ──
-- Fires when acctupdatetime changes (interim accounting update — octets refresh)
-- This lets the Session Engine update in-memory counters without polling
CREATE OR REPLACE FUNCTION notify_session_interim() RETURNS TRIGGER AS $$
BEGIN
  -- Only fire on UPDATE when the session is still active AND acctupdatetime changed
  IF TG_OP = 'UPDATE' 
     AND NEW.acctstoptime IS NULL 
     AND OLD.acctupdatetime IS DISTINCT FROM NEW.acctupdatetime THEN
    PERFORM pg_notify('session_interim', json_build_object(
      'radacctid', NEW.radacctid,
      'acctsessionid', NEW.acctsessionid,
      'username', NEW.username,
      'framedipaddress', NEW.framedipaddress,
      'acctsessiontime', NEW.acctsessiontime,
      'acctinputoctets', NEW.acctinputoctets,
      'acctoutputoctets', NEW.acctoutputoctets,
      'acctupdatetime', NEW.acctupdatetime,
      'event_type', 'session_interim'
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS radacct_session_interim_trigger ON radacct;
CREATE TRIGGER radacct_session_interim_trigger
AFTER UPDATE ON radacct
FOR EACH ROW EXECUTE FUNCTION notify_session_interim();

-- ─── Verify triggers are created ─────────────────────────────────
SELECT 'Triggers created successfully' as status,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'radacct'::regclass AND NOT tgisinternal) as trigger_count;
