-- ============================================================================
-- Cryptsk ISP Platform — Complete Production Database Schema
-- ============================================================================
-- SOURCE OF TRUTH for all database objects
-- Database: ispplatform (PostgreSQL)
-- 
-- This file contains:
--   1. FreeRADIUS standard tables (radcheck, radreply, radgroupcheck, etc.)
--   2. Cryptsk extended RADIUS columns (added to standard FreeRADIUS tables)
--   3. Helper tables for ISP operations
--   4. Reporting views
--   5. Database functions
--
-- NOTE: Prisma schema (prisma/schema.prisma) manages the application tables.
--       This file manages RADIUS tables, extended columns, views, and functions.
--       NEVER run "bun run db:push" — it won't know about the RADIUS extended columns.
-- ============================================================================

-- ============================================================================
-- PART 1: FreeRADIUS Standard Tables
-- ============================================================================

-- Accounting table
CREATE TABLE IF NOT EXISTS radacct (
    RadAcctId          bigserial PRIMARY KEY,
    AcctSessionId      text NOT NULL,
    AcctUniqueId       text NOT NULL UNIQUE,
    UserName           text,
    Realm              text,
    NASIPAddress       inet NOT NULL,
    NASPortId          text,
    NASPortType        text,
    AcctStartTime      timestamp with time zone,
    AcctUpdateTime     timestamp with time zone,
    AcctStopTime       timestamp with time zone,
    AcctInterval       bigint,
    AcctSessionTime    bigint,
    AcctAuthentic      text,
    ConnectInfo_start  text,
    ConnectInfo_stop   text,
    AcctInputOctets    bigint,
    AcctOutputOctets   bigint,
    CalledStationId    text,
    CallingStationId   text,
    AcctTerminateCause text,
    ServiceType        text,
    FramedProtocol     text,
    FramedIPAddress    inet,
    FramedIPv6Address  inet,
    FramedIPv6Prefix   inet,
    FramedInterfaceId  text,
    DelegatedIPv6Prefix inet,
    Class              text
);
CREATE INDEX IF NOT EXISTS radacct_active_session_idx ON radacct (AcctUniqueId) WHERE AcctStopTime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_bulk_close ON radacct (NASIPAddress, AcctStartTime) WHERE AcctStopTime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_start_user_idx ON radacct (AcctStartTime, UserName);
CREATE INDEX IF NOT EXISTS radacct_calss_idx ON radacct (Class);

-- User check attributes
CREATE TABLE IF NOT EXISTS radcheck (
    id        serial PRIMARY KEY,
    UserName  text NOT NULL DEFAULT '',
    Attribute text NOT NULL DEFAULT '',
    op        VARCHAR(2) NOT NULL DEFAULT '==',
    Value     text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radcheck_UserName ON radcheck (UserName, Attribute);

-- Group check attributes
CREATE TABLE IF NOT EXISTS radgroupcheck (
    id         serial PRIMARY KEY,
    GroupName  text NOT NULL DEFAULT '',
    Attribute  text NOT NULL DEFAULT '',
    op         VARCHAR(2) NOT NULL DEFAULT '==',
    Value      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupcheck_GroupName ON radgroupcheck (GroupName, Attribute);

-- Group reply attributes
CREATE TABLE IF NOT EXISTS radgroupreply (
    id         serial PRIMARY KEY,
    GroupName  text NOT NULL DEFAULT '',
    Attribute  text NOT NULL DEFAULT '',
    op         VARCHAR(2) NOT NULL DEFAULT '=',
    Value      text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radgroupreply_GroupName ON radgroupreply (GroupName, Attribute);

-- User reply attributes
CREATE TABLE IF NOT EXISTS radreply (
    id        serial PRIMARY KEY,
    UserName  text NOT NULL DEFAULT '',
    Attribute text NOT NULL DEFAULT '',
    op        VARCHAR(2) NOT NULL DEFAULT '=',
    Value     text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS radreply_UserName ON radreply (UserName, Attribute);

-- User-to-group mapping
CREATE TABLE IF NOT EXISTS radusergroup (
    id        serial PRIMARY KEY,
    UserName  text NOT NULL DEFAULT '',
    GroupName text NOT NULL DEFAULT '',
    priority  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS radusergroup_UserName ON radusergroup (UserName);

-- Post-auth log
CREATE TABLE IF NOT EXISTS radpostauth (
    id                bigserial PRIMARY KEY,
    username          text NOT NULL,
    pass              text,
    reply             text,
    CalledStationId   text,
    CallingStationId  text,
    authdate          timestamp with time zone NOT NULL DEFAULT now(),
    Class             text
);
CREATE INDEX IF NOT EXISTS radpostauth_username_idx ON radpostauth (username);
CREATE INDEX IF NOT EXISTS radpostauth_class_idx ON radpostauth (Class);

-- NAS devices
CREATE TABLE IF NOT EXISTS nas (
    id          serial PRIMARY KEY,
    nasname     text NOT NULL,
    shortname   text NOT NULL,
    type        text NOT NULL DEFAULT 'other',
    ports       integer,
    secret      text NOT NULL,
    server      text,
    community   text,
    description text
);
CREATE INDEX IF NOT EXISTS nas_nasname ON nas (nasname);

-- NAS reload tracking
CREATE TABLE IF NOT EXISTS nasreload (
    NASIPAddress inet PRIMARY KEY,
    ReloadTime  timestamp with time zone NOT NULL
);


-- ============================================================================
-- PART 2: Cryptsk Extended RADIUS Columns
-- ============================================================================
-- These columns are added to standard FreeRADIUS tables for ISP operations.
-- Prisma does NOT know about these — they are managed here.

-- radcheck: extended columns for subscriber linking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radcheck' AND column_name = 'subscriber_id') THEN
        ALTER TABLE radcheck ADD COLUMN subscriber_id text;
    END IF;
END $$;

-- radreply: extended columns for subscriber linking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radreply' AND column_name = 'subscriber_id') THEN
        ALTER TABLE radreply ADD COLUMN subscriber_id text;
    END IF;
END $$;

-- radusergroup: extended columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radusergroup' AND column_name = 'subscriber_id') THEN
        ALTER TABLE radusergroup ADD COLUMN subscriber_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radusergroup' AND column_name = 'is_active') THEN
        ALTER TABLE radusergroup ADD COLUMN is_active boolean DEFAULT true;
    END IF;
END $$;

-- radacct: extended columns for ISP tracking
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radacct' AND column_name = 'subscriber_id') THEN
        ALTER TABLE radacct ADD COLUMN subscriber_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radacct' AND column_name = 'plan_id') THEN
        ALTER TABLE radacct ADD COLUMN plan_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radacct' AND column_name = 'area_id') THEN
        ALTER TABLE radacct ADD COLUMN area_id text;
    END IF;
END $$;

-- radpostauth: extended columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'radpostauth' AND column_name = 'subscriber_id') THEN
        ALTER TABLE radpostauth ADD COLUMN subscriber_id text;
    END IF;
END $$;

-- nas: extended columns for ISP device management
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nas' AND column_name = 'area_id') THEN
        ALTER TABLE nas ADD COLUMN area_id text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nas' AND column_name = 'vendor') THEN
        ALTER TABLE nas ADD COLUMN vendor text DEFAULT '';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nas' AND column_name = 'coa_enabled') THEN
        ALTER TABLE nas ADD COLUMN coa_enabled boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'nas' AND column_name = 'status') THEN
        ALTER TABLE nas ADD COLUMN status text DEFAULT 'unknown';
    END IF;
END $$;


-- ============================================================================
-- PART 3: Helper Tables
-- ============================================================================

-- RADIUS provisioning log (tracks all provisioning operations)
CREATE TABLE IF NOT EXISTS radius_provisioning_log (
    id          bigserial PRIMARY KEY,
    username    text NOT NULL,
    action      text NOT NULL,       -- create, update, delete, suspend, activate
    target_table text NOT NULL,      -- radcheck, radreply, radusergroup, etc.
    details     jsonb DEFAULT '{}',
    status      text DEFAULT 'success',
    error_msg   text DEFAULT '',
    performed_by text DEFAULT 'system',
    created_at  timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rad_prov_log_username ON radius_provisioning_log (username);
CREATE INDEX IF NOT EXISTS rad_prov_log_created ON radius_provisioning_log (created_at);

-- RADIUS auth statistics (daily aggregation)
CREATE TABLE IF NOT EXISTS radius_daily_stats (
    id              bigserial PRIMARY KEY,
    stat_date       date NOT NULL,
    total_auth      integer DEFAULT 0,
    auth_success    integer DEFAULT 0,
    auth_failure    integer DEFAULT 0,
    active_sessions integer DEFAULT 0,
    total_data_gb   numeric(12,2) DEFAULT 0,
    unique_users    integer DEFAULT 0,
    created_at      timestamp with time zone DEFAULT now(),
    UNIQUE (stat_date)
);
CREATE INDEX IF NOT EXISTS rad_daily_stats_date ON radius_daily_stats (stat_date);


-- ============================================================================
-- PART 4: Reporting Views
-- ============================================================================

-- Active RADIUS sessions view
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
    a.RadAcctId,
    a.AcctSessionId,
    a.AcctUniqueId,
    a.UserName,
    a.NASIPAddress::text AS nas_ip,
    a.NASPortId,
    a.CalledStationId,
    a.CallingStationId,
    a.AcctStartTime,
    a.AcctUpdateTime,
    EXTRACT(EPOCH FROM (COALESCE(a.AcctUpdateTime, NOW()) - a.AcctStartTime))::bigint AS session_seconds,
    a.AcctInputOctets,
    a.AcctOutputOctets,
    (a.AcctInputOctets + a.AcctOutputOctets) AS total_octets,
    ROUND((a.AcctInputOctets + a.AcctOutputOctets)::numeric / 1073741824, 4) AS total_gb,
    a.FramedIPAddress::text AS framed_ip,
    a.FramedIPv6Address::text AS framed_ipv6,
    a.subscriber_id,
    a.plan_id,
    a.area_id,
    s.name AS subscriber_name,
    s.phone AS subscriber_phone,
    s.status AS subscriber_status,
    p.name AS plan_name,
    ar.name AS area_name,
    n.shortname AS nas_shortname
FROM radacct a
LEFT JOIN "Subscriber" s ON a.subscriber_id = s.id
LEFT JOIN "Plan" p ON a.plan_id = p.id OR s."planId" = p.id
LEFT JOIN "Area" ar ON a.area_id = ar.id OR s."areaId" = ar.id
LEFT JOIN nas n ON a.NASIPAddress = n.nasname::inet
WHERE a.AcctStopTime IS NULL;

-- RADIUS user provisioning status
CREATE OR REPLACE VIEW v_radius_user_status AS
SELECT
    rc.UserName,
    bool_or(CASE WHEN rc.Attribute = 'Cleartext-Password' THEN true ELSE false END) AS has_password,
    bool_or(CASE WHEN rc.Attribute = 'Auth-Type' AND rc.Value = 'Reject' THEN true ELSE false END) AS is_rejected,
    ug.GroupName,
    ug.is_active,
    s.id AS subscriber_id,
    s.code AS subscriber_code,
    s.name AS subscriber_name,
    s.status AS subscriber_status,
    s."radiusEnabled" AS radius_enabled,
    p.name AS plan_name,
    rg.name AS radius_group_name
FROM radcheck rc
LEFT JOIN radusergroup ug ON rc.UserName = ug.UserName
LEFT JOIN "Subscriber" s ON rc.UserName = s."serviceUsername"
LEFT JOIN "Plan" p ON s."planId" = p.id
LEFT JOIN "RadiusGroup" rg ON s."radiusGroupId" = rg.id OR p."groupId" = rg.id
GROUP BY rc.UserName, ug.GroupName, ug.is_active, s.id, s.code, s.name, s.status, s."radiusEnabled", p.name, rg.name;

-- Daily authentication summary
CREATE OR REPLACE VIEW v_auth_summary_daily AS
SELECT
    DATE(authdate) AS auth_date,
    username,
    COUNT(*) AS total_attempts,
    COUNT(*) FILTER (WHERE reply = 'Access-Accept') AS accepts,
    COUNT(*) FILTER (WHERE reply = 'Access-Reject') AS rejects,
    ROUND(
        COUNT(*) FILTER (WHERE reply = 'Access-Accept')::numeric / NULLIF(COUNT(*), 0) * 100, 2
    ) AS accept_rate_pct
FROM radpostauth
WHERE authdate >= NOW() - INTERVAL '30 days'
GROUP BY DATE(authdate), username
ORDER BY auth_date DESC, total_attempts DESC;

-- Subscriber data usage (current billing cycle)
CREATE OR REPLACE VIEW v_subscriber_data_usage AS
SELECT
    a.UserName,
    a.subscriber_id,
    a.plan_id,
    DATE(a.AcctStartTime) AS usage_date,
    COUNT(DISTINCT a.AcctSessionId) AS sessions,
    SUM(a.AcctSessionTime) AS total_seconds,
    SUM(a.AcctInputOctets) AS download_bytes,
    SUM(a.AcctOutputOctets) AS upload_bytes,
    SUM(a.AcctInputOctets + a.AcctOutputOctets) AS total_bytes,
    ROUND(SUM(a.AcctInputOctets + a.AcctOutputOctets)::numeric / 1073741824, 4) AS total_gb
FROM radacct a
WHERE a.AcctStopTime IS NOT NULL
  AND a.AcctStartTime >= DATE_TRUNC('month', NOW())
GROUP BY a.UserName, a.subscriber_id, a.plan_id, DATE(a.AcctStartTime)
ORDER BY total_gb DESC;

-- NAS device status
CREATE OR REPLACE VIEW v_nas_status AS
SELECT
    n.id,
    n.nasname,
    n.shortname,
    n.type,
    n.secret,
    n.description,
    n.area_id,
    n.vendor,
    n.coa_enabled,
    n.status,
    COUNT(DISTINCT CASE WHEN a.AcctStopTime IS NULL THEN a.AcctUniqueId END) AS active_sessions,
    MAX(a.AcctStartTime) FILTER (WHERE a.AcctStopTime IS NULL) AS last_session_start,
    COUNT(DISTINCT a.AcctUniqueId) AS total_sessions
FROM nas n
LEFT JOIN radacct a ON n.nasname = a.NASIPAddress::text
GROUP BY n.id, n.nasname, n.shortname, n.type, n.secret, n.description, n.area_id, n.vendor, n.coa_enabled, n.status;


-- ============================================================================
-- PART 5: Database Functions
-- ============================================================================

-- Function: Get subscriber's total data usage in GB
CREATE OR REPLACE FUNCTION fn_subscriber_total_usage_gb(p_subscriber_id text)
RETURNS numeric AS $$
    SELECT ROUND(COALESCE(SUM(AcctInputOctets + AcctOutputOctets), 0)::numeric / 1073741824, 4)
    FROM radacct
    WHERE subscriber_id = p_subscriber_id;
$$ LANGUAGE sql STABLE;

-- Function: Get subscriber's current active session count
CREATE OR REPLACE FUNCTION fn_subscriber_active_sessions(p_subscriber_id text)
RETURNS integer AS $$
    SELECT COUNT(*)
    FROM radacct
    WHERE subscriber_id = p_subscriber_id AND AcctStopTime IS NULL;
$$ LANGUAGE sql STABLE;

-- Function: Get subscriber's data usage for current month in GB
CREATE OR REPLACE FUNCTION fn_subscriber_monthly_usage_gb(p_subscriber_id text)
RETURNS numeric AS $$
    SELECT ROUND(COALESCE(SUM(AcctInputOctets + AcctOutputOctets), 0)::numeric / 1073741824, 4)
    FROM radacct
    WHERE subscriber_id = p_subscriber_id
      AND AcctStartTime >= DATE_TRUNC('month', NOW());
$$ LANGUAGE sql STABLE;

-- Function: Get total active sessions across all NAS
CREATE OR REPLACE FUNCTION fn_total_active_sessions()
RETURNS integer AS $$
    SELECT COUNT(*)
    FROM radacct
    WHERE AcctStopTime IS NULL;
$$ LANGUAGE sql STABLE;

-- Function: Get auth success rate for last N hours
CREATE OR REPLACE FUNCTION fn_auth_success_rate(p_hours integer DEFAULT 24)
RETURNS numeric AS $$
    SELECT ROUND(
        COALESCE(
            COUNT(*) FILTER (WHERE reply = 'Access-Accept')::numeric / NULLIF(COUNT(*), 0) * 100, 0
        ), 2
    )
    FROM radpostauth
    WHERE authdate >= NOW() - (p_hours || ' hours')::interval;
$$ LANGUAGE sql STABLE;

-- Function: Get RADIUS group member count
CREATE OR REPLACE FUNCTION fn_radius_group_member_count(p_group_name text)
RETURNS integer AS $$
    SELECT COUNT(*)
    FROM radusergroup
    WHERE GroupName = p_group_name AND is_active = true;
$$ LANGUAGE sql STABLE;

-- Function: Disconnect all active sessions for a subscriber (mark as stop)
CREATE OR REPLACE FUNCTION fn_disconnect_subscriber(p_username text)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE radacct
    SET AcctStopTime = NOW(),
        AcctSessionTime = EXTRACT(EPOCH FROM (NOW() - AcctStartTime))::bigint,
        AcctTerminateCause = 'Admin-Reset'
    WHERE UserName = p_username
      AND AcctStopTime IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Refresh daily RADIUS stats (call from cron)
CREATE OR REPLACE FUNCTION fn_refresh_daily_stats()
RETURNS void AS $$
BEGIN
    INSERT INTO radius_daily_stats (stat_date, total_auth, auth_success, auth_failure, active_sessions, unique_users)
    SELECT
        DATE(authdate),
        COUNT(*),
        COUNT(*) FILTER (WHERE reply = 'Access-Accept'),
        COUNT(*) FILTER (WHERE reply = 'Access-Reject'),
        (SELECT COUNT(*) FROM radacct WHERE AcctStopTime IS NULL AND DATE(AcctStartTime) = DATE(authdate)),
        COUNT(DISTINCT username)
    FROM radpostauth
    WHERE DATE(authdate) = CURRENT_DATE - 1
    GROUP BY DATE(authdate)
    ON CONFLICT (stat_date) DO UPDATE SET
        total_auth = EXCLUDED.total_auth,
        auth_success = EXCLUDED.auth_success,
        auth_failure = EXCLUDED.auth_failure,
        active_sessions = EXCLUDED.active_sessions,
        unique_users = EXCLUDED.unique_users,
        created_at = NOW();

    -- Update total data usage
    UPDATE radius_daily_stats ds
    SET total_data_gb = (
        SELECT ROUND(COALESCE(SUM(AcctInputOctets + AcctOutputOctets), 0)::numeric / 1073741824, 2)
        FROM radacct
        WHERE DATE(AcctStartTime) = ds.stat_date
    )
    WHERE ds.stat_date = CURRENT_DATE - 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 6: Seed RADIUS Group Attributes (for the 8 default plans)
-- ============================================================================
-- These are the RADIUS group reply attributes that enforce speed limits
-- and session parameters for each plan.

-- Helper: Create or update group reply attributes
CREATE OR REPLACE FUNCTION fn_seed_group_reply(
    p_group text, p_attr text, p_op text DEFAULT '=', p_val text DEFAULT ''
) RETURNS void AS $$
BEGIN
    INSERT INTO radgroupreply (GroupName, Attribute, op, Value)
    VALUES (p_group, p_attr, p_op, p_val)
    ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed the default 8 plan groups with bandwidth attributes
SELECT fn_seed_group_reply('basic-30-mbps', 'Mikrotik-Rate-Limit', '=', '30M/15M');
SELECT fn_seed_group_reply('basic-30-mbps', 'Session-Timeout', '=', '2592000');

SELECT fn_seed_group_reply('standard-50-mbps', 'Mikrotik-Rate-Limit', '=', '50M/25M');
SELECT fn_seed_group_reply('standard-50-mbps', 'Session-Timeout', '=', '2592000');

SELECT fn_seed_group_reply('premium-100-mbps', 'Mikrotik-Rate-Limit', '=', '100M/50M');
SELECT fn_seed_group_reply('premium-100-mbps', 'Session-Timeout', '=', '2592000');

SELECT fn_seed_group_reply('ultra-200-mbps', 'Mikrotik-Rate-Limit', '=', '200M/100M');
SELECT fn_seed_group_reply('ultra-200-mbps', 'Session-Timeout', '=', '2592000');

SELECT fn_seed_group_reply('enterprise-500-mbps', 'Mikrotik-Rate-Limit', '=', '500M/250M');
SELECT fn_seed_group_reply('enterprise-500-mbps', 'Session-Timeout', '=', '2592000');

SELECT fn_seed_group_reply('wireless-20-mbps', 'Mikrotik-Rate-Limit', '=', '20M/10M');
SELECT fn_seed_group_reply('wireless-20-mbps', 'Session-Timeout', '=', '2592000');
SELECT fn_seed_group_reply('wireless-20-mbps', 'WISPr-Bandwidth-Max-Down', '=', '20480');
SELECT fn_seed_group_reply('wireless-20-mbps', 'WISPr-Bandwidth-Max-Up', '=', '10240');

SELECT fn_seed_group_reply('wireless-40-mbps', 'Mikrotik-Rate-Limit', '=', '40M/20M');
SELECT fn_seed_group_reply('wireless-40-mbps', 'Session-Timeout', '=', '2592000');
SELECT fn_seed_group_reply('wireless-40-mbps', 'WISPr-Bandwidth-Max-Down', '=', '40960');
SELECT fn_seed_group_reply('wireless-40-mbps', 'WISPr-Bandwidth-Max-Up', '=', '20480');

SELECT fn_seed_group_reply('cable-30-mbps', 'Mikrotik-Rate-Limit', '=', '30M/15M');
SELECT fn_seed_group_reply('cable-30-mbps', 'Session-Timeout', '=', '2592000');

-- Cleanup helper function
DROP FUNCTION IF EXISTS fn_seed_group_reply(text, text, text, text);
