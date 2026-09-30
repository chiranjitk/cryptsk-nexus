-- ============================================================================
-- cryptsk-nexus — FreeRADIUS platform views (vw_radius_*)
-- These views back the /api/freeradius endpoints (all tabs).
-- SOURCE OF TRUTH: this file is appended to complete-database.sql.
-- Recreated 2026-09-30 (fresh-sandbox restore; previous DB-only versions lost).
-- All views are CREATE OR REPLACE → idempotent.
-- NOTE: Prisma tables use quoted PascalCase/camelCase identifiers
--       ("Subscriber", "Plan", "RadiusGroup", "NetworkDevice", "NasConfig").
--       FreeRADIUS tables (radacct, radcheck, ...) are lowercase.
-- ============================================================================

-- 1) Full RADIUS user view (users tab)
CREATE OR REPLACE VIEW vw_radius_user_full AS
SELECT
    rc.username                                              AS username,
    rc.value                                                 AS password,
    s.status                                                 AS subscriber_status,
    s."connectionType"                                       AS connection_type,
    COALESCE(s."radiusEnabled", false)                       AS radius_enabled,
    s."ipAddress"                                            AS subscriber_ip,
    s."macAddress"                                           AS mac_address,
    p.name                                                   AS plan_name,
    p."downloadSpeed"                                        AS plan_download_kbps,
    p."uploadSpeed"                                          AS plan_upload_kbps,
    p."priceMonthly"                                         AS plan_price,
    ug.groupname                                             AS group_name,
    rg."speedLimitDown"                                      AS group_download_kbps,
    rg."speedLimitUp"                                        AS group_upload_kbps,
    COALESCE(
        (SELECT rgr.value FROM radgroupreply rgr
          WHERE rgr.groupname = ug.groupname AND rgr.attribute = 'Mikrotik-Rate-Limit'
          LIMIT 1),
        CASE WHEN rg.id IS NOT NULL
             THEN rg."speedLimitDown"::text || 'M/' || rg."speedLimitUp"::text || 'M' END
    )                                                        AS effective_rate_limit,
    COALESCE(
        (SELECT rgr.value::int FROM radgroupreply rgr
          WHERE rgr.groupname = ug.groupname AND rgr.attribute = 'Simultaneous-Use'
          LIMIT 1),
        p."maxConcurrentSessions"
    )                                                        AS max_sessions,
    rg."dataLimit"                                           AS data_limit_mb,
    act.acctsessionid                                        AS active_session_id,
    act.framedipaddress::text                                AS active_session_ip,
    act.nasipaddress::text                                   AS active_session_nas,
    (SELECT rgr.value FROM radgroupreply rgr
      WHERE rgr.groupname = ug.groupname AND rgr.attribute = 'Mikrotik-Rate-Limit'
      LIMIT 1)                                               AS active_session_rate,
    act.acctstarttime                                        AS session_start_time,
    act.acctsessiontime                                      AS session_duration_seconds,
    s."lastAuthAt"                                           AS last_auth_at,
    s."lastAuthResult"                                       AS last_auth_result
FROM radcheck rc
LEFT JOIN LATERAL (
    SELECT ug.username, ug.groupname FROM radusergroup ug
    WHERE ug.username = rc.username
    ORDER BY ug.priority ASC NULLS LAST
    LIMIT 1
) ug ON true
LEFT JOIN "RadiusGroup" rg ON rg.name = ug.groupname
LEFT JOIN "Subscriber" s  ON s."serviceUsername" = rc.username
LEFT JOIN "Plan" p        ON p.id = s."planId"
LEFT JOIN LATERAL (
    SELECT a.acctsessionid, a.framedipaddress, a.nasipaddress, a.acctstarttime, a.acctsessiontime
    FROM radacct a
    WHERE a.username = rc.username AND a.acctstoptime IS NULL
    ORDER BY a.acctstarttime DESC LIMIT 1
) act ON true
WHERE rc.attribute = 'Cleartext-Password';

-- 2) RADIUS group summary (groups tab)
CREATE OR REPLACE VIEW vw_radius_group_summary AS
SELECT
    rg.id                                                    AS group_id,
    rg.name                                                  AS group_name,
    rg.description                                           AS description,
    rg."speedLimitDown"                                      AS download_kbps,
    rg."speedLimitUp"                                        AS upload_kbps,
    rg."dataLimit"                                           AS data_limit,
    rg."sessionTimeout"                                      AS session_timeout,
    COALESCE(rg."priority", 0)                               AS priority,
    (SELECT CAST(COUNT(DISTINCT ug.username) AS int) FROM radusergroup ug
      WHERE ug.groupname = rg.name)                          AS total_users,
    (SELECT CAST(COUNT(DISTINCT a.username) AS int) FROM radacct a
      WHERE a.acctstoptime IS NULL
        AND a.username IN (SELECT ug2.username FROM radusergroup ug2 WHERE ug2.groupname = rg.name))
                                                             AS active_users,
    rg."dataLimit"                                           AS data_cap_mb,
    COALESCE(
        (SELECT rgr.value FROM radgroupreply rgr
          WHERE rgr.groupname = rg.name AND rgr.attribute = 'Mikrotik-Rate-Limit' LIMIT 1),
        rg."speedLimitDown"::text || 'M/' || rg."speedLimitUp"::text || 'M'
    )                                                        AS rate_limit,
    COALESCE(
        (SELECT rgr.value::int FROM radgroupreply rgr
          WHERE rgr.groupname = rg.name AND rgr.attribute = 'Idle-Timeout' LIMIT 1),
        0
    )                                                        AS idle_timeout,
    (SELECT CAST(COUNT(DISTINCT (rgr.attribute, rgr.value)) AS int) FROM radgroupreply rgr
      WHERE rgr.groupname = rg.name)                         AS reply_count
FROM "RadiusGroup" rg;

-- 3) Active RADIUS sessions (sessions tab)
CREATE OR REPLACE VIEW vw_radius_active_sessions AS
SELECT
    a.acctsessionid                                          AS session_id,
    a.username                                               AS username,
    a.nasipaddress::text                                     AS nas_ip,
    a.nasportid                                              AS nas_port,
    a.nasporttype                                            AS nas_port_type,
    a.acctstarttime                                          AS start_time,
    a.acctupdatetime                                         AS last_update,
    a.acctstoptime                                           AS stop_time,
    a.acctsessiontime                                        AS session_time,
    a.acctauthentic                                          AS auth_type,
    COALESCE(a.connectinfo_stop, a.connectinfo_start)        AS connect_info,
    a.acctinputoctets                                        AS input_octets,
    a.acctoutputoctets                                       AS output_octets,
    a.calledstationid                                        AS called_station_id,
    a.callingstationid                                       AS calling_station_id,
    a.framedprotocol                                         AS framed_protocol,
    a.framedipaddress::text                                  AS framed_ip,
    a.acctterminatecause                                     AS terminate_cause,
    a.subscriber_id                                          AS subscriber_id,
    s.status                                                 AS subscriber_status,
    s."connectionType"                                       AS connection_type,
    s."macAddress"                                           AS mac_address,
    p.name                                                   AS plan_name,
    p."downloadSpeed"                                        AS plan_dl_kbps,
    p."uploadSpeed"                                          AS plan_ul_kbps,
    n.shortname                                              AS nas_name,
    n.type                                                   AS nas_type,
    (a.acctstoptime IS NULL)                                 AS is_active,
    (a.acctinputoctets + a.acctoutputoctets)                 AS total_octets,
    ROUND((a.acctinputoctets)::numeric / 1073741824, 3)      AS download_gb,
    ROUND((a.acctoutputoctets)::numeric / 1073741824, 3)     AS upload_gb
FROM radacct a
LEFT JOIN "Subscriber" s ON s.id = a.subscriber_id
LEFT JOIN "Plan" p       ON p.id = a.plan_id
LEFT JOIN nas n          ON a.nasipaddress::text = host(n.nasname::inet);

-- 4) Accounting detail (accounting tab — full history)
CREATE OR REPLACE VIEW vw_radius_accounting_detail AS
SELECT
    a.acctuniqueid                                           AS unique_id,
    a.acctsessionid                                          AS session_id,
    a.username                                               AS username,
    a.nasipaddress::text                                     AS nas_ip,
    a.nasportid                                              AS nas_port,
    a.nasporttype                                            AS nas_port_type,
    a.acctstarttime                                          AS start_time,
    a.acctupdatetime                                         AS update_time,
    a.acctstoptime                                           AS stop_time,
    a.acctsessiontime                                        AS session_time_seconds,
    a.acctauthentic                                          AS auth_type,
    COALESCE(a.connectinfo_stop, a.connectinfo_start)        AS connect_info,
    a.acctinputoctets                                        AS input_octets,
    a.acctoutputoctets                                       AS output_octets,
    a.calledstationid                                        AS called_station_id,
    a.callingstationid                                       AS calling_station_id,
    a.framedprotocol                                         AS framed_protocol,
    a.framedipaddress::text                                  AS framed_ip,
    a.framedipv6address::text                                AS framed_ipv6,
    a.framedipv6prefix::text                                 AS framed_ipv6_prefix,
    a.delegatedipv6prefix::text                              AS delegated_ipv6_prefix,
    a.acctterminatecause                                     AS terminate_cause,
    a.servicetype                                            AS service_type,
    a.subscriber_id                                          AS subscriber_id,
    s.status                                                 AS subscriber_status,
    s."connectionType"                                       AS connection_type,
    p.name                                                   AS plan_name,
    ug.groupname                                             AS radius_group,
    n.shortname                                              AS nas_name,
    nd.name                                                  AS device_name,
    (a.acctstoptime IS NULL)                                 AS is_active,
    ROUND((a.acctinputoctets)::numeric / 1048576, 2)         AS download_mb,
    ROUND((a.acctoutputoctets)::numeric / 1048576, 2)        AS upload_mb,
    ROUND((a.acctinputoctets + a.acctoutputoctets)::numeric / 1048576, 2) AS total_mb
FROM radacct a
LEFT JOIN "Subscriber" s ON s.id = a.subscriber_id
LEFT JOIN "Plan" p       ON p.id = a.plan_id
LEFT JOIN LATERAL (
    SELECT ug.username, ug.groupname FROM radusergroup ug
    WHERE ug.username = a.username
    ORDER BY ug.priority ASC NULLS LAST
    LIMIT 1
) ug ON true
LEFT JOIN nas n          ON a.nasipaddress::text = host(n.nasname::inet)
LEFT JOIN "NetworkDevice" nd ON nd."ipAddress" = a.nasipaddress::text;

-- 5) Auth logs (authlog tab)
CREATE OR REPLACE VIEW vw_radius_auth_logs AS
SELECT
    pa.id                                                    AS id,
    pa.username                                              AS username,
    pa.pass                                                  AS password_used,
    pa.reply                                                 AS auth_result,
    pa.authdate                                              AS auth_date,
    pa.calledstationid                                       AS called_station_id,
    pa.callingstationid                                      AS calling_station_id,
    pa.subscriber_id                                         AS subscriber_id,
    s.status                                                 AS subscriber_status,
    s."connectionType"                                       AS connection_type,
    p.name                                                   AS plan_name,
    ug.groupname                                             AS radius_group
FROM radpostauth pa
LEFT JOIN "Subscriber" s ON s.id = pa.subscriber_id
LEFT JOIN "Plan" p       ON p.id = s."planId"
LEFT JOIN LATERAL (
    SELECT ug.username, ug.groupname FROM radusergroup ug
    WHERE ug.username = pa.username
    ORDER BY ug.priority ASC NULLS LAST
    LIMIT 1
) ug ON true;

-- 6) NAS status (nas tab)
CREATE OR REPLACE VIEW vw_radius_nas_status AS
SELECT
    n.id                                                     AS nas_id,
    n.nasname::text                                          AS nas_ip,
    n.shortname                                              AS short_name,
    n.type                                                   AS nas_type,
    n.ports                                                  AS max_ports,
    n.secret                                                 AS nas_secret,
    n.description                                            AS nas_description,
    n.server                                                 AS server,
    nd.id                                                    AS device_id,
    nd.name                                                  AS device_name,
    COALESCE(nd.vendor::text, n.vendor)                      AS vendor,
    nd.model                                                 AS model,
    nd.status                                                AS device_status,
    (SELECT CAST(COUNT(*) AS int) FROM radacct a
      WHERE a.acctstoptime IS NULL
        AND a.nasipaddress::text = host(n.nasname::inet))    AS active_sessions,
    (SELECT CAST(COUNT(*) AS int) FROM radacct a
      WHERE a.nasipaddress::text = host(n.nasname::inet))    AS total_sessions,
    nc.identifier                                            AS nas_identifier,
    nc.id                                                    AS config_type,
    COALESCE(n.coa_enabled, false)                           AS coa_enabled
FROM nas n
LEFT JOIN "NetworkDevice" nd ON nd."ipAddress" = n.nasname::text
LEFT JOIN "NasConfig" nc     ON nc.id = 'builtin';

-- 7) Plan ↔ RADIUS group mapping (plan-mapping tab)
CREATE OR REPLACE VIEW vw_radius_plan_group_mapping AS
SELECT
    p.id                                                     AS plan_id,
    p.name                                                   AS plan_name,
    p."downloadSpeed"                                        AS download_kbps,
    p."uploadSpeed"                                          AS upload_kbps,
    p."priceMonthly"                                         AS monthly_price,
    p.status                                                 AS plan_status,
    p."contentionRatio"                                      AS contention_ratio,
    p."dataLimitGb"                                          AS data_limit_gb,
    p."maxConcurrentSessions"                                AS max_sessions,
    rg.id                                                    AS group_id,
    rg.name                                                  AS group_name,
    rg."speedLimitDown"                                      AS group_dl_kbps,
    rg."speedLimitUp"                                        AS group_ul_kbps,
    rg."dataLimit"                                           AS group_data_limit_mb,
    (SELECT CAST(COUNT(*) AS int) FROM "Subscriber" s WHERE s."planId" = p.id)
                                                             AS total_subscribers,
    (SELECT CAST(COUNT(*) AS int) FROM "Subscriber" s WHERE s."planId" = p.id AND s.status = 'ACTIVE')
                                                             AS active_subscribers,
    COALESCE(s2.radius_enabled, false)                       AS radius_synced
FROM "Plan" p
LEFT JOIN "RadiusGroup" rg ON rg.id = p."groupId"
LEFT JOIN LATERAL (
    SELECT BOOL_OR(s0."radiusEnabled") AS radius_enabled
    FROM "Subscriber" s0 WHERE s0."planId" = p.id AND s0."radiusEnabled" = true
) s2 ON true;

-- 8) Subscriber RADIUS dashboard (subscriber-dashboard tab)
CREATE OR REPLACE VIEW vw_radius_subscriber_dashboard AS
SELECT
    s.id                                                     AS subscriber_id,
    COALESCE(s."serviceUsername", s.code)                    AS username,
    s.status                                                 AS status,
    s."connectionType"                                       AS connection_type,
    COALESCE(s."radiusEnabled", false)                       AS radius_enabled,
    p.name                                                   AS plan_name,
    rg.name                                                  AS radius_group,
    COALESCE(
        (SELECT rgr.value FROM radgroupreply rgr
          WHERE rg.name IS NOT NULL AND rgr.groupname = rg.name
            AND rgr.attribute = 'Mikrotik-Rate-Limit' LIMIT 1),
        CASE WHEN rg.id IS NOT NULL
             THEN rg."speedLimitDown"::text || 'M/' || rg."speedLimitUp"::text || 'M' END
    )                                                        AS rate_limit,
    (SELECT CAST(COUNT(*) AS int) FROM radacct a
      WHERE a.acctstoptime IS NULL AND a.username = s."serviceUsername")
                                                             AS active_sessions,
    (SELECT CAST(COUNT(*) AS int) FROM radacct a
      WHERE a.username = s."serviceUsername")                AS total_sessions,
    (SELECT CAST(COALESCE(SUM(a.acctinputoctets), 0) AS bigint) FROM radacct a
      WHERE a.username = s."serviceUsername")                AS total_input_octets,
    (SELECT CAST(COALESCE(SUM(a.acctoutputoctets), 0) AS bigint) FROM radacct a
      WHERE a.username = s."serviceUsername")                AS total_output_octets,
    (SELECT CAST(COALESCE(SUM(a.acctsessiontime), 0) AS bigint) FROM radacct a
      WHERE a.username = s."serviceUsername")                AS total_session_time,
    (SELECT CAST(COUNT(*) AS int) FROM radpostauth pa
      WHERE pa.username = s."serviceUsername")               AS total_auth_attempts,
    (SELECT CAST(COUNT(*) AS int) FROM radpostauth pa
      WHERE pa.username = s."serviceUsername" AND pa.reply = 'Access-Accept')
                                                             AS successful_auths,
    (SELECT CAST(COUNT(*) AS int) FROM radpostauth pa
      WHERE pa.username = s."serviceUsername" AND pa.reply = 'Access-Reject')
                                                             AS failed_auths,
    s."lastAuthAt"                                           AS last_auth_date,
    s."lastAuthResult"                                       AS last_auth_result
FROM "Subscriber" s
LEFT JOIN "Plan" p        ON p.id = s."planId"
LEFT JOIN "RadiusGroup" rg ON rg.id = s."radiusGroupId";
