warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AddOnChargeType" AS ENUM ('FLAT', 'PER_DAY', 'PER_GB', 'PER_MONTH');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('CORRECTION', 'DAMAGED', 'RETURN', 'AUDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "AllocationStrategy" AS ENUM ('STATIC', 'DHCP_POOL', 'FULL_ALLOW', 'UNRESTRICTED');

-- CreateEnum
CREATE TYPE "AppRuleAction" AS ENUM ('ALLOW', 'BLOCK', 'RATE_LIMIT', 'SHAPE');

-- CreateEnum
CREATE TYPE "AppRuleScope" AS ENUM ('GLOBAL', 'PLAN', 'SUBSCRIBER', 'IP_RANGE');

-- CreateEnum
CREATE TYPE "AreaStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPANDING');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('RADIUS', 'LOCAL_DB', 'MAC_AUTH', 'VOUCHER', 'CAPTIVE_PORTAL');

-- CreateEnum
CREATE TYPE "BatchJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycleType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "BwSampleSource" AS ENUM ('GATEWAY', 'INTERFACE', 'SUBNET', 'POOL', 'USER', 'PLAN');

-- CreateEnum
CREATE TYPE "CaptureStatus" AS ENUM ('RUNNING', 'STOPPED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChargeOverrideStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoaStatus" AS ENUM ('REQUESTED', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "CoaType" AS ENUM ('PLAN_CHANGE', 'BANDWIDTH_CHANGE', 'SESSION_DISCONNECT', 'SESSION_TIMEOUT', 'FAP_TRIGGER', 'TOPUP_APPLY');

-- CreateEnum
CREATE TYPE "CommissionMethod" AS ENUM ('PERCENTAGE', 'FLAT', 'SLAB');

-- CreateEnum
CREATE TYPE "ComplaintPriority" AS ENUM ('P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ComplaintType" AS ENUM ('NO_INTERNET', 'SLOW_SPEED', 'CABLE_CUT', 'WIFI_ISSUE', 'PLAN_CHANGE', 'BILLING_QUERY', 'VOIP_ISSUE', 'IPTV_ISSUE', 'NEW_CONNECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('FTTH', 'WIRELESS', 'CABLE', 'LEASED_LINE', 'ETHERNET');

-- CreateEnum
CREATE TYPE "DdosAction" AS ENUM ('DROP', 'REJECT', 'RATE_LIMIT', 'LOG', 'NOTIFY', 'TARPIT');

-- CreateEnum
CREATE TYPE "DdosProtectionType" AS ENUM ('SYN_FLOOD', 'UDP_FLOOD', 'ICMP_FLOOD', 'ACK_FLOOD', 'DNS_AMPLIFICATION', 'NTP_AMPLIFICATION', 'SSDP_AMPLIFICATION', 'MEMCACHED_AMPLIFICATION', 'FRAG_ATTACK', 'PING_OF_DEATH', 'SMURF_ATTACK', 'SLOWLORIS', 'ZERO_DAY_EXPLOIT', 'PORT_SCAN', 'BRUTE_FORCE', 'CONNECTION_LIMIT', 'RATE_LIMIT', 'IP_REPUTATION', 'GEO_BLOCK', 'BOGON_FILTER', 'BLACKLIST', 'WHITELIST');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'WARNING', 'UNKNOWN', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('ROUTER', 'SWITCH', 'AP', 'OLT', 'ONU', 'SERVER', 'FIREWALL', 'GATEWAY', 'BRIDGE', 'WIRELESS_BRIDGE', 'OTHER');

-- CreateEnum
CREATE TYPE "DeviceVendor" AS ENUM ('MIKROTIK', 'CISCO', 'JUNIPER', 'HUAWEI', 'ZTE', 'VSOL', 'BDCOM', 'UBIQUITI', 'TP_LINK', 'ARUBA', 'FORTINET', 'NOKIA', 'C_DATA', 'FIBERHOME', 'REALTEK', 'DASAN', 'ZYXEL', 'CTC_UNION', 'O_NET', 'ABOCOM', 'RUIJIE', 'H3C', 'ZHONE', 'CALIX', 'ADTRAN', 'OTHER');

-- CreateEnum
CREATE TYPE "DhcpLeaseState" AS ENUM ('ACTIVE', 'EXPIRED', 'RELEASED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "DiagnosticTool" AS ENUM ('TCPDUMP', 'PING', 'TRACEROUTE', 'NSLOOKUP', 'DIG', 'ARP_TABLE', 'MTR', 'CURL', 'SPEEDTEST');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FLAT');

-- CreateEnum
CREATE TYPE "DnsRecordType" AS ENUM ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV');

-- CreateEnum
CREATE TYPE "EqRepairStatus" AS ENUM ('REPORTED', 'DIAGNOSED', 'REPAIRING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EqRepairType" AS ENUM ('HARDWARE', 'FIRMWARE', 'PHYSICAL', 'ELECTRICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentCategory" AS ENUM ('ROUTER', 'ONT', 'SWITCH', 'AP', 'CABLE', 'SPLITTER', 'ANTENNA', 'UPS', 'PATCH_CORD', 'OLT', 'POWER_SUPPLY', 'OTHER');

-- CreateEnum
CREATE TYPE "EquipmentCondition" AS ENUM ('NEW', 'GOOD', 'DAMAGED', 'DEAD');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_STOCK', 'DEPLOYED', 'RETURNED', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "FirewallAction" AS ENUM ('ACCEPT', 'DROP', 'REJECT', 'LOG', 'DNAT', 'SNAT', 'MASQUERADE');

-- CreateEnum
CREATE TYPE "FirewallRuleStatus" AS ENUM ('ACTIVE', 'DISABLED', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "GracePeriodStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GracePeriodType" AS ENUM ('PRE_BILLING', 'POST_BILLING');

-- CreateEnum
CREATE TYPE "IfaceRole" AS ENUM ('WAN', 'LAN', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "IfaceType" AS ENUM ('PHYSICAL', 'VLAN', 'BRIDGE', 'BOND', 'ALIAS', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "InstallationStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InterfaceStatus" AS ENUM ('UP', 'DOWN', 'DISABLED');

-- CreateEnum
CREATE TYPE "InterfaceType" AS ENUM ('ETHERNET', 'SFP', 'WIRELESS', 'PON', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "IpStackType" AS ENUM ('IPV4_ONLY', 'DUAL_STACK', 'IPV6_ONLY');

-- CreateEnum
CREATE TYPE "IpType" AS ENUM ('DYNAMIC', 'STATIC');

-- CreateEnum
CREATE TYPE "IpsAlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "IpsBlockAction" AS ENUM ('DROP', 'REJECT', 'RATE_LIMIT', 'TARPIT');

-- CreateEnum
CREATE TYPE "IpsBlockDuration" AS ENUM ('TEMP_5M', 'TEMP_15M', 'TEMP_30M', 'TEMP_1H', 'TEMP_6H', 'TEMP_24H', 'PERMANENT');

-- CreateEnum
CREATE TYPE "IpsEventType" AS ENUM ('PORT_SCAN', 'SYN_FLOOD', 'UDP_FLOOD', 'ICMP_FLOOD', 'BRUTE_FORCE', 'BANDWIDTH_ABUSE', 'DNS_AMPLIFICATION', 'ARP_POISON', 'CONNECTION_FLOOD', 'MALWARE_C2', 'MAC_SPOOF', 'BOGON_SOURCE', 'BLACKLIST_HIT', 'GEO_BLOCK', 'PROTOCOL_ANOMALY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "IpsSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('PERCENTAGE', 'FLAT');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'WHATSAPP', 'REFERRAL', 'WALK_IN', 'CALL', 'SOCIAL_MEDIA', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'INTERESTED', 'QUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "MonitorProtocol" AS ENUM ('SNMP', 'SNMP_V3', 'SSH', 'API', 'TELNET', 'HTTP');

-- CreateEnum
CREATE TYPE "NasType" AS ENUM ('BUILTIN', 'MIKROTIK', 'CISCO', 'JUNIPER', 'HUAWEI', 'UBNT', 'OTHER');

-- CreateEnum
CREATE TYPE "NatMode" AS ENUM ('NONE', 'MASQUERADE', 'SNAT_POOL', 'ROUND_ROBIN', 'ONE_TO_ONE');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('BILL_DUE', 'PAYMENT_CONFIRM', 'DATA_USAGE', 'PLAN_CHANGE', 'OUTAGE', 'MAINTENANCE', 'WELCOME', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED', 'READ');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL', 'PUSH', 'IN_APP');

-- CreateEnum
CREATE TYPE "PacketAction" AS ENUM ('ADD', 'MODIFY', 'DELETE');

-- CreateEnum
CREATE TYPE "PacketType" AS ENUM ('AUTH_REQ', 'ACCT_REQ', 'COA_REQ', 'COA_ACK', 'DISCONNECT_REQ');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'ONLINE', 'BANK_TRANSFER', 'CHEQUE', 'WALLET');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PlanCategory" AS ENUM ('FTTH', 'WIRELESS', 'CABLE', 'LEASED_LINE', 'HOTSPOT', 'COMBO');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'HIDDEN', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "PortalLoginMethod" AS ENUM ('RADIUS', 'VOUCHER', 'CLICK_TO_CONTINUE', 'MAC_AUTH', 'SOCIAL');

-- CreateEnum
CREATE TYPE "PortalSessionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISCONNECTED', 'DATA_CAP_REACHED', 'ADMIN_DISCONNECT');

-- CreateEnum
CREATE TYPE "PortalTemplate" AS ENUM ('HOTEL', 'CAFE', 'AIRPORT', 'RESORT', 'CORPORATE', 'ISP_DEFAULT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PppoeAuthType" AS ENUM ('PAP', 'CHAP', 'MSCHAPv2');

-- CreateEnum
CREATE TYPE "PppoeSessionStatus" AS ENUM ('ACTIVE', 'TERMINATING', 'IDLE');

-- CreateEnum
CREATE TYPE "PromoStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('PERCENTAGE', 'FLAT', 'FREE_TRIAL');

-- CreateEnum
CREATE TYPE "ProxyServerType" AS ENUM ('AUTH', 'ACCT', 'BOTH');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RadiusAttrDataType" AS ENUM ('STRING', 'INTEGER', 'IP_ADDRESS', 'OCTETS');

-- CreateEnum
CREATE TYPE "RadiusAttrType" AS ENUM ('CHECK', 'REPLY', 'BOTH');

-- CreateEnum
CREATE TYPE "RecurringSchedule" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('SUBMITTED', 'DIAGNOSED', 'REPAIRING', 'COMPLETED', 'UNREPAIRABLE');

-- CreateEnum
CREATE TYPE "ResellerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('GOOD', 'FAIR', 'POOR');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('PENDING_INSPECTION', 'INSPECTED', 'REPAIRED', 'SCRAPPED', 'RESTOCKED');

-- CreateEnum
CREATE TYPE "SecurityFeature" AS ENUM ('ARP_PROTECTION', 'DHCP_SNOOPING', 'CLIENT_ISOLATION', 'PORT_SECURITY', 'STORM_CONTROL');

-- CreateEnum
CREATE TYPE "SessionEventType" AS ENUM ('AUTH_REQUEST', 'AUTH_SUCCESS', 'AUTH_FAILURE', 'SESSION_START', 'SESSION_UPDATE', 'SESSION_STOP', 'SESSION_EXPIRE', 'COA_REQUEST', 'COA_SUCCESS', 'COA_FAILURE', 'POLICY_ENFORCE', 'DATA_LIMIT_REACHED', 'TIME_LIMIT_REACHED', 'IDLE_TIMEOUT', 'ADMIN_DISCONNECT', 'BULK_DISCONNECT', 'NAS_REGISTER', 'NAS_HEARTBEAT');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('AUTHENTICATING', 'ACTIVE', 'IDLE', 'SUSPENDED', 'COA_PENDING', 'TERMINATING', 'CLOSED');

-- CreateEnum
CREATE TYPE "SpeedUnit" AS ENUM ('KBPS', 'MBPS', 'GBPS');

-- CreateEnum
CREATE TYPE "SubscriberAddOnStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TRIAL', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "SyslogProtocol" AS ENUM ('UDP', 'TCP', 'TLS');

-- CreateEnum
CREATE TYPE "TdsEntryStatus" AS ENUM ('DEDUCTED', 'DEPOSITED', 'PENDING');

-- CreateEnum
CREATE TYPE "TdsEntryType" AS ENUM ('TDS', 'TCS');

-- CreateEnum
CREATE TYPE "TimeAccessAction" AS ENUM ('ALLOW', 'BLOCK', 'RATE_LIMIT');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TopUpType" AS ENUM ('DATA', 'TIME', 'SPEED_BOOST');

-- CreateEnum
CREATE TYPE "UserActionType" AS ENUM ('PLAN_CHANGE', 'PLAN_ASSIGN', 'RENEWAL', 'SUSPEND', 'ACTIVATE', 'PLAN_UPGRADE', 'PLAN_DOWNGRADE', 'FAP_TRIGGER', 'TOPUP_APPLY', 'REVERSAL', 'PRICE_OVERRIDE', 'GRACE_APPLY', 'NOTE_ADD');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AGENT', 'TECHNICIAN', 'VIEWER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WarehouseStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "WidgetCategory" AS ENUM ('NETWORK', 'BILLING', 'SUBSCRIBER', 'SYSTEM', 'CUSTOM');

-- CreateTable
CREATE TABLE "AddOnService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "chargeType" "AddOnChargeType" NOT NULL DEFAULT 'FLAT',
    "chargeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "dataMb" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddOnService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentFollowUp" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'GENERAL',
    "notes" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentReconciliation" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "expectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reconciledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertComment" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "condition" TEXT NOT NULL DEFAULT '',
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "notifyChannels" TEXT,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 5,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "escalationLevels" TEXT,
    "autoEscalate" BOOLEAN NOT NULL DEFAULT false,
    "escalationIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxSeverity" TEXT NOT NULL DEFAULT 'CRITICAL',
    "deduplicationWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertSuppression" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "suppressedBy" TEXT NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "target" TEXT NOT NULL DEFAULT 'ALL',
    "channels" TEXT NOT NULL DEFAULT 'IN_APP',
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementDismissal" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "scopes" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "lastUsedUserAgent" TEXT NOT NULL DEFAULT '',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "requestsPerMinute" INTEGER NOT NULL DEFAULT 60,
    "requestsPerDay" INTEGER NOT NULL DEFAULT 1000,
    "autoExpiryDays" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "lastRotatedAt" TIMESTAMP(3),
    "ipWhitelist" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "assignedTechnicianId" TEXT,
    "assignedAgentId" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "status" "AreaStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "polygonBoundary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaBudgetLimit" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "cycleType" "BillingCycleType" NOT NULL DEFAULT 'MONTHLY',
    "allottedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cycleStartDate" TIMESTAMP(3) NOT NULL,
    "cycleEndDate" TIMESTAMP(3),
    "alertThreshold" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AreaBudgetLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT 'System',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" TEXT,
    "previousValues" TEXT,
    "endpoint" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'full',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "fileSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "filePath" TEXT NOT NULL DEFAULT 'Local',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL DEFAULT 'manual',
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "conflictDetected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandwidthLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL DEFAULT '',
    "downloadBps" INTEGER NOT NULL DEFAULT 0,
    "uploadBps" INTEGER NOT NULL DEFAULT 0,
    "totalBps" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BandwidthLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandwidthPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "planId" TEXT,
    "radiusGroupId" TEXT,
    "downloadKbps" INTEGER NOT NULL,
    "uploadKbps" INTEGER NOT NULL,
    "burstDownloadKbps" INTEGER NOT NULL DEFAULT 0,
    "burstUploadKbps" INTEGER NOT NULL DEFAULT 0,
    "burstDurationSec" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "ceilingDownloadKbps" INTEGER NOT NULL DEFAULT 0,
    "ceilingUploadKbps" INTEGER NOT NULL DEFAULT 0,
    "tcClassId" TEXT NOT NULL DEFAULT '',
    "tcParentId" TEXT NOT NULL DEFAULT '',
    "interfaceId" TEXT,
    "fapDownloadKbps" INTEGER,
    "fapUploadKbps" INTEGER,
    "fapDataLimitMb" INTEGER,
    "hardDataLimitMb" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandwidthPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BandwidthThrottleConfig" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "maxDownloadMbps" INTEGER NOT NULL DEFAULT 100,
    "maxUploadMbps" INTEGER NOT NULL DEFAULT 50,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStartTime" TEXT NOT NULL DEFAULT '09:00',
    "scheduleEndTime" TEXT NOT NULL DEFAULT '18:00',
    "scheduleDays" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BandwidthThrottleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchProvisioningJob" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "filename" TEXT NOT NULL DEFAULT '',
    "totalUsers" INTEGER NOT NULL DEFAULT 0,
    "completedUsers" INTEGER NOT NULL DEFAULT 0,
    "failedUsers" INTEGER NOT NULL DEFAULT 0,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorDetail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdDataMb" INTEGER NOT NULL DEFAULT 0,
    "speedDownKbps" INTEGER NOT NULL DEFAULT 0,
    "speedUpKbps" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotCommand" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BwSample" (
    "id" TEXT NOT NULL,
    "sourceType" "BwSampleSource" NOT NULL,
    "sourceId" TEXT NOT NULL DEFAULT '',
    "sourceName" TEXT NOT NULL DEFAULT '',
    "downloadBps" INTEGER NOT NULL DEFAULT 0,
    "uploadBps" INTEGER NOT NULL DEFAULT 0,
    "totalBps" INTEGER NOT NULL DEFAULT 0,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "activeSessions" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BwSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptivePortal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "template" "PortalTemplate" NOT NULL DEFAULT 'ISP_DEFAULT',
    "loginMethod" "PortalLoginMethod" NOT NULL DEFAULT 'RADIUS',
    "theme" TEXT,
    "welcomeTitle" TEXT NOT NULL DEFAULT 'Welcome',
    "welcomeMessage" TEXT NOT NULL DEFAULT '',
    "tosText" TEXT NOT NULL DEFAULT '',
    "successMessage" TEXT NOT NULL DEFAULT 'You are now connected!',
    "timeoutMessage" TEXT NOT NULL DEFAULT 'Your session has expired. Please login again.',
    "dataCapMessage" TEXT NOT NULL DEFAULT 'You have reached your data limit.',
    "sessionTimeoutSec" INTEGER NOT NULL DEFAULT 86400,
    "idleTimeoutSec" INTEGER NOT NULL DEFAULT 3600,
    "dataLimitMb" INTEGER,
    "fapDataLimitMb" INTEGER,
    "bandwidthLimitDown" INTEGER NOT NULL DEFAULT 0,
    "bandwidthLimitUp" INTEGER NOT NULL DEFAULT 0,
    "redirectUrl" TEXT NOT NULL DEFAULT '',
    "originalUrlParam" TEXT NOT NULL DEFAULT 'original_url',
    "allowedHosts" TEXT,
    "enableCaptiveDetection" BOOLEAN NOT NULL DEFAULT true,
    "macAuthEnabled" BOOLEAN NOT NULL DEFAULT false,
    "macAuthUnknownAction" TEXT NOT NULL DEFAULT 'DENY',
    "socialProviders" TEXT,
    "voucherRequired" BOOLEAN NOT NULL DEFAULT false,
    "voucherReusePolicy" TEXT NOT NULL DEFAULT 'SINGLE_USE',
    "interfaceId" TEXT,
    "locationId" TEXT,
    "siteName" TEXT NOT NULL DEFAULT '',
    "venueType" TEXT NOT NULL DEFAULT '',
    "maxConcurrentSessions" INTEGER NOT NULL DEFAULT 0,
    "passthroughMode" BOOLEAN NOT NULL DEFAULT false,
    "customLoginPageUrl" TEXT NOT NULL DEFAULT '',
    "postLoginAdUrl" TEXT NOT NULL DEFAULT '',
    "collectPhone" BOOLEAN NOT NULL DEFAULT false,
    "collectEmail" BOOLEAN NOT NULL DEFAULT false,
    "collectName" BOOLEAN NOT NULL DEFAULT false,
    "partnerId" TEXT,
    "revenueSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduleConfig" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptivePortal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CgnatMapping" (
    "id" TEXT NOT NULL,
    "cgnatPoolId" TEXT,
    "mappingType" TEXT NOT NULL DEFAULT 'SNAT',
    "internalIp" TEXT NOT NULL,
    "internalPort" INTEGER NOT NULL DEFAULT 0,
    "externalIp" TEXT NOT NULL,
    "externalPort" INTEGER NOT NULL DEFAULT 0,
    "portBlockCount" INTEGER NOT NULL DEFAULT 0,
    "subscriberId" TEXT,
    "subnetId" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'ALL',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgnatMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CgnatPool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "poolType" TEXT NOT NULL DEFAULT 'SNAT_POOL',
    "startIp" TEXT NOT NULL,
    "endIp" TEXT NOT NULL,
    "portBlockSize" INTEGER NOT NULL DEFAULT 512,
    "portRangeStart" INTEGER NOT NULL DEFAULT 1024,
    "portRangeEnd" INTEGER NOT NULL DEFAULT 65535,
    "activeMappings" INTEGER NOT NULL DEFAULT 0,
    "maxMappings" INTEGER NOT NULL DEFAULT 0,
    "healthCheckIp" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CgnatPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnCommunication" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL DEFAULT '',
    "actionDetail" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurnCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurnTracking" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRACKING',
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurnTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoaEvent" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "radiusSessionId" TEXT,
    "coaType" "CoaType" NOT NULL,
    "coaStatus" "CoaStatus" NOT NULL DEFAULT 'REQUESTED',
    "oldPlanId" TEXT,
    "newPlanId" TEXT,
    "oldBwPolicyId" TEXT,
    "newBwPolicyId" TEXT,
    "bwPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL DEFAULT '',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorDetail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CoaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionAgent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "assignedAreaIds" TEXT,
    "dailyTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCollectedToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCollectedMonth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayout" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidOn" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "speed" TEXT NOT NULL DEFAULT '',
    "dataLimit" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL,
    "validity" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "marketSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPriceHistory" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "planName" TEXT NOT NULL DEFAULT '',
    "speed" TEXT NOT NULL DEFAULT '',
    "dataLimit" TEXT NOT NULL DEFAULT '',
    "oldPrice" DOUBLE PRECISION NOT NULL,
    "newPrice" DOUBLE PRECISION NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subscriberId" TEXT,
    "areaId" TEXT,
    "type" "ComplaintType" NOT NULL,
    "priority" "ComplaintPriority" NOT NULL DEFAULT 'P3_MEDIUM',
    "description" TEXT NOT NULL,
    "assignedToId" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "slaHours" INTEGER NOT NULL DEFAULT 24,
    "slaDeadline" TIMESTAMP(3),
    "walkInName" TEXT NOT NULL DEFAULT '',
    "resolutionNotes" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "customerRating" INTEGER,
    "customerFeedback" TEXT NOT NULL DEFAULT '',
    "aiCategory" TEXT NOT NULL DEFAULT '',
    "aiSeverity" TEXT NOT NULL DEFAULT '',
    "aiProbableCause" TEXT NOT NULL DEFAULT '',
    "aiResolutionGuide" TEXT NOT NULL DEFAULT '',
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "isSlaPaused" BOOLEAN NOT NULL DEFAULT false,
    "slaPausedAt" TIMESTAMP(3),
    "slaPausedTotalMs" INTEGER NOT NULL DEFAULT 0,
    "slaPauseReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintComment" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "feedback" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WidgetCategory" NOT NULL DEFAULT 'SYSTEM',
    "description" TEXT NOT NULL DEFAULT '',
    "widgetType" TEXT NOT NULL DEFAULT 'chart',
    "configSchema" TEXT NOT NULL DEFAULT '{}',
    "defaultConfig" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataUsage" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "downloadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "uploadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DdosProtection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "protectionType" "DdosProtectionType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdPps" INTEGER NOT NULL DEFAULT 10000,
    "thresholdBps" INTEGER NOT NULL DEFAULT 10000000,
    "thresholdConnRate" INTEGER NOT NULL DEFAULT 1000,
    "rateLimitPps" INTEGER,
    "rateLimitBps" INTEGER,
    "burstSize" INTEGER NOT NULL DEFAULT 100,
    "action" "DdosAction" NOT NULL DEFAULT 'DROP',
    "logEnabled" BOOLEAN NOT NULL DEFAULT true,
    "logPrefix" TEXT NOT NULL DEFAULT 'DDOS',
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "notifyEmail" TEXT NOT NULL DEFAULT '',
    "targetInterface" TEXT NOT NULL DEFAULT '',
    "targetPorts" TEXT NOT NULL DEFAULT '',
    "targetProtocols" TEXT NOT NULL DEFAULT '',
    "sourceWhitelist" TEXT NOT NULL DEFAULT '',
    "sourceBlacklist" TEXT NOT NULL DEFAULT '',
    "geoBlockCountries" TEXT NOT NULL DEFAULT '',
    "geoBlockAction" "DdosAction" NOT NULL DEFAULT 'DROP',
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "packetCount" BIGINT NOT NULL DEFAULT 0,
    "byteCount" BIGINT NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStartTime" TEXT NOT NULL DEFAULT '00:00',
    "scheduleEndTime" TEXT NOT NULL DEFAULT '23:59',
    "scheduleDays" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DdosProtection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceConfigHistory" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "oldValue" TEXT NOT NULL DEFAULT '',
    "newValue" TEXT NOT NULL DEFAULT '',
    "changedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceConfigHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceInterface" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "InterfaceType" NOT NULL DEFAULT 'ETHERNET',
    "status" "InterfaceStatus" NOT NULL DEFAULT 'DISABLED',
    "speed" INTEGER NOT NULL DEFAULT 0,
    "macAddress" TEXT NOT NULL DEFAULT '',
    "txBytes" BIGINT NOT NULL DEFAULT 0,
    "rxBytes" BIGINT NOT NULL DEFAULT 0,
    "connectedDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceInterface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpReservation" (
    "id" TEXT NOT NULL,
    "dhcpSubnetId" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "hostname" TEXT NOT NULL DEFAULT '',
    "clientType" TEXT NOT NULL DEFAULT 'SUBSCRIBER',
    "subscriberId" TEXT,
    "deviceId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpSubnet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL,
    "subnet" TEXT NOT NULL,
    "netmask" TEXT NOT NULL DEFAULT '255.255.255.0',
    "rangeStart" TEXT NOT NULL,
    "rangeEnd" TEXT NOT NULL,
    "leaseTimeSec" INTEGER NOT NULL DEFAULT 86400,
    "gateway" TEXT NOT NULL DEFAULT '',
    "dnsServers" TEXT NOT NULL DEFAULT '',
    "domainName" TEXT NOT NULL DEFAULT '',
    "ntpServers" TEXT NOT NULL DEFAULT '',
    "winsServer" TEXT NOT NULL DEFAULT '',
    "optionsJson" TEXT,
    "captivePortalId" TEXT,
    "ipamSubnetId" TEXT,
    "allowedHosts" TEXT,
    "blockAfterAuth" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpSubnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpV6Pool" (
    "id" TEXT NOT NULL,
    "dhcpV6SubnetId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "rangeStart" TEXT NOT NULL,
    "rangeEnd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpV6Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpV6PrefixDelegation" (
    "id" TEXT NOT NULL,
    "dhcpV6SubnetId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "delegatedPrefix" TEXT NOT NULL,
    "prefixLength" INTEGER NOT NULL DEFAULT 48,
    "clientDuid" TEXT NOT NULL DEFAULT '',
    "excludedPrefix" TEXT NOT NULL DEFAULT '',
    "leaseTime" INTEGER NOT NULL DEFAULT 86400,
    "subscriberId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpV6PrefixDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpV6Reservation" (
    "id" TEXT NOT NULL,
    "dhcpV6SubnetId" TEXT NOT NULL,
    "duid" TEXT NOT NULL,
    "iaid" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL,
    "hostname" TEXT NOT NULL DEFAULT '',
    "clientType" TEXT NOT NULL DEFAULT 'SUBSCRIBER',
    "subscriberId" TEXT,
    "deviceId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpV6Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DhcpV6Subnet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "interfaceName" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "prefixLength" INTEGER NOT NULL DEFAULT 64,
    "preferredLifetime" INTEGER NOT NULL DEFAULT 14400,
    "validLifetime" INTEGER NOT NULL DEFAULT 86400,
    "raEnabled" BOOLEAN NOT NULL DEFAULT true,
    "raIntervalSec" INTEGER NOT NULL DEFAULT 600,
    "raManagedFlag" BOOLEAN NOT NULL DEFAULT true,
    "raOtherFlag" BOOLEAN NOT NULL DEFAULT false,
    "raDefaultRouter" BOOLEAN NOT NULL DEFAULT true,
    "dnsServers" TEXT NOT NULL DEFAULT '',
    "domainSearch" TEXT NOT NULL DEFAULT '',
    "ntpServers" TEXT NOT NULL DEFAULT '',
    "rapidCommit" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DhcpV6Subnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosisBaseline" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "issuesCount" INTEGER NOT NULL DEFAULT 0,
    "speedDown" TEXT NOT NULL DEFAULT '',
    "speedUp" TEXT NOT NULL DEFAULT '',
    "ping" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "fullResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosisBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticCapture" (
    "id" TEXT NOT NULL,
    "tool" "DiagnosticTool" NOT NULL,
    "status" "CaptureStatus" NOT NULL DEFAULT 'STOPPED',
    "targetHost" TEXT NOT NULL DEFAULT '',
    "targetPort" INTEGER NOT NULL DEFAULT 0,
    "targetInterface" TEXT NOT NULL DEFAULT '',
    "filterExpression" TEXT NOT NULL DEFAULT '',
    "packetCount" INTEGER NOT NULL DEFAULT 0,
    "snapshotLength" INTEGER NOT NULL DEFAULT 262144,
    "captureFile" TEXT NOT NULL DEFAULT '',
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "output" TEXT NOT NULL DEFAULT '',
    "exitCode" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "pppoeSessionId" TEXT,
    "packetsCaptured" INTEGER NOT NULL DEFAULT 0,
    "packetsDropped" INTEGER NOT NULL DEFAULT 0,
    "startedBy" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiagnosticCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "actionTaken" TEXT NOT NULL DEFAULT '',
    "resolution" TEXT NOT NULL DEFAULT '',
    "events" TEXT,
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DnsRecord" (
    "id" TEXT NOT NULL,
    "type" "DnsRecordType" NOT NULL DEFAULT 'A',
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "ttl" INTEGER NOT NULL DEFAULT 300,
    "interfaceId" TEXT,
    "captivePortalId" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DnsRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseSession" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "enterpriseUserId" TEXT,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT DEFAULT '',
    "sessionId" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL DEFAULT 'ldap',
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "disconnectReason" TEXT DEFAULT '',

    CONSTRAINT "EnterpriseSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseSubscriber" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "planId" TEXT,
    "location" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "authMethod" TEXT NOT NULL DEFAULT 'local',
    "bandwidthMode" TEXT NOT NULL DEFAULT 'shared_pool',
    "sharedPoolMbps" INTEGER NOT NULL DEFAULT 100,
    "perUserDownMbps" INTEGER NOT NULL DEFAULT 50,
    "perUserUpMbps" INTEGER NOT NULL DEFAULT 20,
    "dataQuotaGB" INTEGER,
    "overageAction" TEXT NOT NULL DEFAULT 'throttle',
    "sessionTimeout" INTEGER NOT NULL DEFAULT 28800,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 1,
    "macBinding" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnterpriseUser" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "adGroups" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "totalUpload" BIGINT NOT NULL DEFAULT 0,
    "totalDownload" BIGINT NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EnterpriseUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "EquipmentCategory" NOT NULL DEFAULT 'OTHER',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "condition" "EquipmentCondition" NOT NULL DEFAULT 'NEW',
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_STOCK',
    "stockLocation" TEXT NOT NULL DEFAULT '',
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "depreciationRate" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warrantyExpiry" TIMESTAMP(3),
    "warrantyProvider" TEXT NOT NULL DEFAULT '',
    "warrantyNumber" TEXT NOT NULL DEFAULT '',
    "vendorName" TEXT NOT NULL DEFAULT '',
    "vendorId" TEXT,
    "assignedSubscriberId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "returnCondition" TEXT NOT NULL DEFAULT '',
    "repairStatus" TEXT NOT NULL DEFAULT '',
    "bookValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "warehouseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentInspection" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "inspectedBy" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'GOOD',
    "notes" TEXT NOT NULL DEFAULT '',
    "checklistResult" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentRepair" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "reportedIssue" TEXT NOT NULL DEFAULT '',
    "repairType" "EqRepairType" NOT NULL DEFAULT 'HARDWARE',
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "EqRepairStatus" NOT NULL DEFAULT 'REPORTED',
    "repairNotes" TEXT NOT NULL DEFAULT '',
    "assignedTo" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentRepair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentReturn" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "returnedById" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condition" "ReturnCondition" NOT NULL DEFAULT 'FAIR',
    "inspectionNotes" TEXT NOT NULL DEFAULT '',
    "status" "ReturnStatus" NOT NULL DEFAULT 'PENDING_INSPECTION',
    "inspectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Operational',
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailoverRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "primaryWanId" TEXT,
    "backupWanId" TEXT,
    "triggerCondition" TEXT NOT NULL DEFAULT 'Ping Fail',
    "autoFailback" BOOLEAN NOT NULL DEFAULT true,
    "failbackDelaySec" INTEGER NOT NULL DEFAULT 60,
    "preferPrimary" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailoverRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'General',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirewallRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "chain" TEXT NOT NULL DEFAULT 'forward',
    "table" TEXT NOT NULL DEFAULT 'filter',
    "action" "FirewallAction" NOT NULL DEFAULT 'ACCEPT',
    "matchCriteria" TEXT,
    "natTarget" TEXT NOT NULL DEFAULT '',
    "logEnabled" BOOLEAN NOT NULL DEFAULT false,
    "logPrefix" TEXT NOT NULL DEFAULT '',
    "status" "FirewallRuleStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleStartTime" TEXT NOT NULL DEFAULT '',
    "scheduleEndTime" TEXT NOT NULL DEFAULT '',
    "scheduleDays" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "bytesProcessed" BIGINT NOT NULL DEFAULT 0,
    "packetsProcessed" BIGINT NOT NULL DEFAULT 0,
    "interfaceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirewallRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GatewayConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "gatewayMode" TEXT NOT NULL DEFAULT 'BRIDGE',
    "defaultGateway" TEXT NOT NULL DEFAULT '',
    "dnsForwarders" TEXT NOT NULL DEFAULT '1.1.1.1,8.8.8.8',
    "enableDnsCache" BOOLEAN NOT NULL DEFAULT true,
    "dhcpServerType" TEXT NOT NULL DEFAULT 'KEA',
    "dhcpServerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dhcpServerUrl" TEXT NOT NULL DEFAULT 'http://localhost:8080',
    "dnsServerType" TEXT NOT NULL DEFAULT 'DNSMASQ',
    "dnsServerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalServerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalListenPort" INTEGER NOT NULL DEFAULT 8080,
    "portalHttpsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalHttpsPort" INTEGER NOT NULL DEFAULT 8443,
    "tcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tcDefaultClass" TEXT NOT NULL DEFAULT '',
    "tcCleanupOnLogout" BOOLEAN NOT NULL DEFAULT true,
    "natEnabled" BOOLEAN NOT NULL DEFAULT true,
    "natMode" TEXT NOT NULL DEFAULT 'MASQUERADE',
    "nftablesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "nftablesTable" TEXT NOT NULL DEFAULT 'cryptsk',
    "natLoggingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "natLogRetentionDays" INTEGER NOT NULL DEFAULT 7,
    "connectionTracking" BOOLEAN NOT NULL DEFAULT true,
    "conntrackMax" INTEGER NOT NULL DEFAULT 262144,
    "radiusInterimUpdateSec" INTEGER NOT NULL DEFAULT 60,
    "radiusAcctEnabled" BOOLEAN NOT NULL DEFAULT true,
    "arpProtection" BOOLEAN NOT NULL DEFAULT false,
    "dhcpSnooping" BOOLEAN NOT NULL DEFAULT false,
    "clientIsolation" BOOLEAN NOT NULL DEFAULT false,
    "enforceMaxSessions" BOOLEAN NOT NULL DEFAULT true,
    "maxSessionAction" TEXT NOT NULL DEFAULT 'KICK_OLD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GatewayConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedLegalNotice" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "noticeType" TEXT NOT NULL DEFAULT '',
    "referenceNumber" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "generatedById" TEXT,
    "sentVia" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedLegalNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "severity" TEXT NOT NULL DEFAULT 'MAJOR',
    "status" TEXT NOT NULL DEFAULT 'INVESTIGATING',
    "affectedAreaIds" TEXT,
    "affectedDeviceIds" TEXT,
    "affectedSubscriberCount" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "rcaReport" TEXT NOT NULL DEFAULT '',
    "rcaData" TEXT,
    "targetResolutionHours" INTEGER NOT NULL DEFAULT 2,
    "escalationHistory" TEXT,
    "assignedToId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentUpdate" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "incidentId" TEXT NOT NULL,

    CONSTRAINT "IncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "areaId" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT NOT NULL DEFAULT '',
    "status" "InstallationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "checklist" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "photos" TEXT,
    "completedAt" TIMESTAMP(3),
    "customerSignature" TEXT NOT NULL DEFAULT '',
    "estimatedDurationHours" INTEGER NOT NULL DEFAULT 2,
    "equipmentIds" TEXT,
    "cancellationReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'payment_gateway',
    "name" TEXT NOT NULL DEFAULT '',
    "provider" TEXT NOT NULL DEFAULT '',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "apiSecret" TEXT NOT NULL DEFAULT '',
    "merchantId" TEXT NOT NULL DEFAULT '',
    "environment" TEXT NOT NULL DEFAULT 'test',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" TEXT,
    "costPerRequest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ipAllowlist" TEXT NOT NULL DEFAULT '',
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "url" TEXT NOT NULL DEFAULT '',
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestSummary" TEXT NOT NULL DEFAULT '',
    "responseSummary" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "retryOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationTransaction" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "gatewayType" TEXT NOT NULL DEFAULT '',
    "transactionType" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '',
    "externalRef" TEXT NOT NULL DEFAULT '',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "planId" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" "DiscountType",
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lateFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advanceAdjustment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paymentMode" "PaymentMode",
    "paidAt" TIMESTAMP(3),
    "receiptNumber" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isProRata" BOOLEAN NOT NULL DEFAULT false,
    "proRataDays" INTEGER NOT NULL DEFAULT 0,
    "recurringTemplateId" TEXT,
    "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "tdsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsDeducted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpAddress" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'free',
    "hostname" TEXT NOT NULL DEFAULT '',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "customFields" TEXT,
    "subnetId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpAssignmentHistory" (
    "id" TEXT NOT NULL,
    "ipAddressId" TEXT NOT NULL,
    "assignedTo" TEXT NOT NULL DEFAULT '',
    "assignedType" TEXT NOT NULL DEFAULT '',
    "assignedById" TEXT NOT NULL DEFAULT '',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "IpAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpMacHistory" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "oldMacAddress" TEXT NOT NULL DEFAULT '',
    "newMacAddress" TEXT NOT NULL DEFAULT '',
    "subscriberId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'dhcp',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpMacHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpamSnapshot" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "totalSubnets" INTEGER NOT NULL DEFAULT 0,
    "totalIps" INTEGER NOT NULL DEFAULT 0,
    "usedIps" INTEGER NOT NULL DEFAULT 0,
    "reservedIps" INTEGER NOT NULL DEFAULT 0,
    "freeIps" INTEGER NOT NULL DEFAULT 0,
    "utilizationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalVlans" INTEGER NOT NULL DEFAULT 0,
    "cgnatActiveMappings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpamSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpsAlert" (
    "id" TEXT NOT NULL,
    "eventType" "IpsEventType" NOT NULL,
    "severity" "IpsSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IpsAlertStatus" NOT NULL DEFAULT 'NEW',
    "sourceIp" TEXT NOT NULL,
    "sourceMac" TEXT NOT NULL DEFAULT '',
    "destIp" TEXT NOT NULL DEFAULT '',
    "destPort" INTEGER NOT NULL DEFAULT 0,
    "protocol" TEXT NOT NULL DEFAULT '',
    "pps" INTEGER NOT NULL DEFAULT 0,
    "bps" INTEGER NOT NULL DEFAULT 0,
    "connCount" INTEGER NOT NULL DEFAULT 0,
    "threatScore" INTEGER NOT NULL DEFAULT 0,
    "actionTaken" TEXT NOT NULL DEFAULT 'none',
    "blockRuleId" TEXT,
    "subscriberId" TEXT,
    "ruleId" TEXT,
    "details" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpsAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpsBlockRule" (
    "id" TEXT NOT NULL,
    "sourceIp" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "action" "IpsBlockAction" NOT NULL DEFAULT 'DROP',
    "duration" "IpsBlockDuration" NOT NULL DEFAULT 'TEMP_30M',
    "alertId" TEXT,
    "subscriberId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "nftHandle" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpsBlockRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpsDetectionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "eventType" "IpsEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdPps" INTEGER NOT NULL DEFAULT 0,
    "thresholdBps" INTEGER NOT NULL DEFAULT 0,
    "thresholdConn" INTEGER NOT NULL DEFAULT 0,
    "windowSeconds" INTEGER NOT NULL DEFAULT 60,
    "autoBlock" BOOLEAN NOT NULL DEFAULT false,
    "blockAction" "IpsBlockAction" NOT NULL DEFAULT 'DROP',
    "blockDuration" "IpsBlockDuration" NOT NULL DEFAULT 'TEMP_30M',
    "scoreImpact" INTEGER NOT NULL DEFAULT 20,
    "targetPorts" TEXT NOT NULL DEFAULT '',
    "targetProto" TEXT NOT NULL DEFAULT '',
    "sourceExclude" TEXT NOT NULL DEFAULT '',
    "logEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpsDetectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IspSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT 'My ISP',
    "tagline" TEXT NOT NULL DEFAULT '',
    "logo" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT 'https://cryptsk.com',
    "gstin" TEXT NOT NULL DEFAULT '',
    "panNumber" TEXT NOT NULL DEFAULT '',
    "cinNumber" TEXT NOT NULL DEFAULT '',
    "primaryColor" TEXT NOT NULL DEFAULT '#DC2626',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "language" TEXT NOT NULL DEFAULT 'en',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 5,
    "lateFeeType" "LateFeeType" NOT NULL DEFAULT 'PERCENTAGE',
    "lateFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "customerCodePrefix" TEXT NOT NULL DEFAULT 'CRY',
    "receiptFooterText" TEXT NOT NULL DEFAULT 'Thank you for choosing us!',
    "radiusServerIp" TEXT NOT NULL DEFAULT '',
    "radiusServerPort" INTEGER NOT NULL DEFAULT 1812,
    "radiusSecret" TEXT NOT NULL DEFAULT '',
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireUppercase" BOOLEAN NOT NULL DEFAULT false,
    "passwordRequireLowercase" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireNumbers" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSpecial" BOOLEAN NOT NULL DEFAULT false,
    "passwordExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "maxLoginAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockoutDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "captchaAfterAttempts" INTEGER NOT NULL DEFAULT 3,
    "loadBalancingConfig" TEXT,
    "captivePortalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "captivePortalName" TEXT NOT NULL DEFAULT '',
    "captivePortalWelcome" TEXT NOT NULL DEFAULT '',
    "captivePortalLoginMethod" TEXT NOT NULL DEFAULT 'RADIUS',
    "captivePortalSessionTimeout" INTEGER NOT NULL DEFAULT 86400,
    "captivePortalBandwidthLimit" TEXT NOT NULL DEFAULT '',
    "captivePortalRedirectUrl" TEXT NOT NULL DEFAULT '',
    "captivePortalTos" TEXT NOT NULL DEFAULT '',
    "captivePortalAllowedHosts" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "smtpFromEmail" TEXT NOT NULL DEFAULT '',
    "smsGateway" TEXT NOT NULL DEFAULT '',
    "smsAuthKey" TEXT NOT NULL DEFAULT '',
    "smsSenderId" TEXT NOT NULL DEFAULT '',
    "whatsappApiToken" TEXT NOT NULL DEFAULT '',
    "whatsappPhoneNumberId" TEXT NOT NULL DEFAULT '',
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "whatsappGreetingMessage" TEXT NOT NULL DEFAULT '',
    "whatsappAwayMessage" TEXT NOT NULL DEFAULT '',
    "razorpayKeyId" TEXT NOT NULL DEFAULT '',
    "razorpayKeySecret" TEXT NOT NULL DEFAULT '',
    "paymentGatewayMode" TEXT NOT NULL DEFAULT 'test',
    "hsnCodes" TEXT,
    "backupSettings" TEXT,
    "cloudBackupConfig" TEXT,
    "bandwidthThresholds" TEXT,
    "complaintEscalationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "complaintEscalationLevel1Percent" INTEGER NOT NULL DEFAULT 75,
    "complaintEscalationLevel2Percent" INTEGER NOT NULL DEFAULT 100,
    "complaintEscalationRole1" TEXT NOT NULL DEFAULT 'MANAGER',
    "complaintEscalationRole2" TEXT NOT NULL DEFAULT 'ADMIN',
    "incidentSlaMinutes" INTEGER NOT NULL DEFAULT 60,
    "churnWorkflowConfig" TEXT,
    "escalationPathConfig" TEXT,
    "encryptionKey" TEXT,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "auditAutoDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastAssignedUserIndex" INTEGER NOT NULL DEFAULT 0,
    "invoiceNumberPadding" INTEGER NOT NULL DEFAULT 4,
    "invoiceStartNumber" INTEGER NOT NULL DEFAULT 1001,
    "invoiceSeparator" TEXT NOT NULL DEFAULT '-',
    "invoiceAutoReset" TEXT NOT NULL DEFAULT 'NEVER',
    "invoiceLastResetAt" TIMESTAMP(3),
    "defaultCgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "defaultSgstRate" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "defaultIgstRate" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "taxType" TEXT NOT NULL DEFAULT 'INTRA_STATE',
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "compositeScheme" BOOLEAN NOT NULL DEFAULT false,
    "compositeSchemeRate" DOUBLE PRECISION NOT NULL DEFAULT 6,
    "whatsappBusinessName" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessCategory" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessAddress" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessEmail" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessPhone" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessWebsite" TEXT NOT NULL DEFAULT '',
    "whatsappBusinessAbout" TEXT NOT NULL DEFAULT '',
    "whatsappWebhookConfig" TEXT,
    "kpiTargets" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pointsExpiryDays" INTEGER NOT NULL DEFAULT 365,
    "pointsAutoExpiry" BOOLEAN NOT NULL DEFAULT false,
    "grafanaUrl" TEXT NOT NULL DEFAULT '',
    "grafanaApiKey" TEXT NOT NULL DEFAULT '',
    "gatewayModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tcRootBandwidthDownMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tcRootBandwidthUpMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tcAutoRestoreOnBoot" BOOLEAN NOT NULL DEFAULT true,
    "tcDefaultUnshapedDownMbps" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "tcDefaultUnshapedUpMbps" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "commissionConfig" TEXT,

    CONSTRAINT "IspSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "helpfulVotes" INTEGER NOT NULL DEFAULT 0,
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "slug" TEXT NOT NULL DEFAULT '',
    "metaTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT '',
    "content" TEXT NOT NULL DEFAULT '',
    "tags" TEXT,
    "changeNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KbArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KbCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Info',
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KbCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LdapConfig" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "serverHost" TEXT NOT NULL,
    "serverPort" INTEGER NOT NULL DEFAULT 636,
    "useTls" BOOLEAN NOT NULL DEFAULT true,
    "baseDn" TEXT NOT NULL,
    "bindDn" TEXT NOT NULL,
    "bindPassword" TEXT NOT NULL,
    "userFilter" TEXT NOT NULL DEFAULT '(sAMAccountName=%s)',
    "groupRestriction" TEXT,
    "tlsCert" TEXT,
    "connectionTimeout" INTEGER NOT NULL DEFAULT 5,
    "healthStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LdapConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "areaId" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WALK_IN',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "followUpDate" TIMESTAMP(3),
    "estimatedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dealValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lostReason" TEXT NOT NULL DEFAULT '',
    "convertedSubscriberId" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "scoreFactors" TEXT,
    "duplicateOf" TEXT,
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmMedium" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "utmContent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCommunication" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Call',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCommunication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRecord" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FULL_DAY',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyMember" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "earnedMonth" INTEGER NOT NULL DEFAULT 0,
    "redeemedPoints" INTEGER NOT NULL DEFAULT 0,
    "availablePoints" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'Bronze',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltySetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pointsPerHundred" INTEGER NOT NULL DEFAULT 1,
    "pointValueInr" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "monthlyBonusPoints" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWindow" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "affectedAreaIds" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NasClientConfig" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nasIdentifier" TEXT NOT NULL DEFAULT '',
    "secretKey" TEXT NOT NULL DEFAULT '',
    "nasType" TEXT NOT NULL DEFAULT '',
    "vendorId" INTEGER NOT NULL DEFAULT 21067,
    "idleTimeout" INTEGER NOT NULL DEFAULT 0,
    "acctInterimInterval" INTEGER NOT NULL DEFAULT 60,
    "coaSupport" BOOLEAN NOT NULL DEFAULT true,
    "dmTimeout" INTEGER NOT NULL DEFAULT 3,
    "leaseIp" BOOLEAN NOT NULL DEFAULT false,
    "status" INTEGER NOT NULL DEFAULT 1,
    "fapDomain" TEXT NOT NULL DEFAULT '',
    "datatransferDomain" TEXT NOT NULL DEFAULT '',
    "bwSupport" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NasClientConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NasConfig" (
    "id" TEXT NOT NULL DEFAULT 'builtin',
    "name" TEXT NOT NULL DEFAULT 'Cryptsk Session Engine',
    "nasType" "NasType" NOT NULL DEFAULT 'BUILTIN',
    "ipAddress" TEXT NOT NULL DEFAULT '127.0.0.1',
    "identifier" TEXT NOT NULL DEFAULT 'cryptsk-nas',
    "secret" TEXT NOT NULL DEFAULT 'cryptsk_nas_secret',
    "coaPort" INTEGER NOT NULL DEFAULT 3799,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "maxSessions" INTEGER NOT NULL DEFAULT 0,
    "defaultSessionTimeoutSec" INTEGER NOT NULL DEFAULT 86400,
    "defaultIdleTimeoutSec" INTEGER NOT NULL DEFAULT 3600,
    "defaultDataLimitMb" INTEGER,
    "enforceDataLimit" BOOLEAN NOT NULL DEFAULT true,
    "enforceTimeLimit" BOOLEAN NOT NULL DEFAULT true,
    "enforceIdleTimeout" BOOLEAN NOT NULL DEFAULT true,
    "enforceConcurrent" BOOLEAN NOT NULL DEFAULT true,
    "autoReauthOnPlanChange" BOOLEAN NOT NULL DEFAULT true,
    "accountingIntervalSec" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NasConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NasSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "nasIp" TEXT NOT NULL DEFAULT '127.0.0.1',
    "nasPort" TEXT NOT NULL DEFAULT '',
    "framedIp" TEXT NOT NULL DEFAULT '',
    "framedIpv6" TEXT NOT NULL DEFAULT '',
    "assignedIp" TEXT NOT NULL DEFAULT '',
    "callingStationId" TEXT NOT NULL DEFAULT '',
    "calledStationId" TEXT NOT NULL DEFAULT '',
    "authMethod" "AuthMethod" NOT NULL DEFAULT 'LOCAL_DB',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "planId" TEXT,
    "planName" TEXT NOT NULL DEFAULT '',
    "radiusGroupId" TEXT,
    "radiusGroupName" TEXT NOT NULL DEFAULT '',
    "speedDownKbps" INTEGER NOT NULL DEFAULT 0,
    "speedUpKbps" INTEGER NOT NULL DEFAULT 0,
    "dataLimitMb" INTEGER,
    "sessionTimeoutSec" INTEGER,
    "idleTimeoutSec" INTEGER,
    "inputOctets" BIGINT NOT NULL DEFAULT 0,
    "outputOctets" BIGINT NOT NULL DEFAULT 0,
    "totalOctets" BIGINT NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccounting" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "sessionTimeSec" INTEGER NOT NULL DEFAULT 0,
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "disconnectReason" TEXT NOT NULL DEFAULT '',
    "terminatedBy" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "deviceInfo" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "coaCount" INTEGER NOT NULL DEFAULT 0,
    "lastCoaAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NasSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NatLog" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT,
    "subscriberIp" TEXT NOT NULL DEFAULT '',
    "protocol" TEXT NOT NULL DEFAULT 'TCP',
    "srcIp" TEXT NOT NULL DEFAULT '',
    "srcPort" INTEGER NOT NULL DEFAULT 0,
    "dstIp" TEXT NOT NULL DEFAULT '',
    "dstPort" INTEGER NOT NULL DEFAULT 0,
    "dstDomain" TEXT NOT NULL DEFAULT '',
    "dstCountry" TEXT NOT NULL DEFAULT '',
    "bytesSent" BIGINT NOT NULL DEFAULT 0,
    "bytesReceived" BIGINT NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "natAction" TEXT NOT NULL DEFAULT 'SNAT',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NatLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NdpiApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ndpiId" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "risk" TEXT NOT NULL DEFAULT 'LOW',
    "icon" TEXT NOT NULL DEFAULT 'Globe',
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "description" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NdpiApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NdpiAppRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "appNdpiId" INTEGER NOT NULL,
    "appNdpiIds" TEXT,
    "action" "AppRuleAction" NOT NULL DEFAULT 'BLOCK',
    "scope" "AppRuleScope" NOT NULL DEFAULT 'GLOBAL',
    "targetPlanId" TEXT,
    "targetSubscriberId" TEXT,
    "targetIpRange" TEXT NOT NULL DEFAULT '',
    "rateLimitMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "nftHandle" INTEGER NOT NULL DEFAULT 0,
    "nftComment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NdpiAppRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NdpiAppUsage" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "subscriberId" TEXT,
    "appNdpiId" INTEGER NOT NULL,
    "appName" TEXT NOT NULL DEFAULT '',
    "appCategory" TEXT NOT NULL DEFAULT 'Other',
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "packets" INTEGER NOT NULL DEFAULT 0,
    "flows" INTEGER NOT NULL DEFAULT 0,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'hourly',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NdpiAppUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkAlert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "acknowledgedBy" TEXT NOT NULL DEFAULT '',
    "acknowledgedAt" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "resolvedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "duplicateCount" INTEGER NOT NULL DEFAULT 1,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "vendor" "DeviceVendor" NOT NULL DEFAULT 'OTHER',
    "model" TEXT NOT NULL DEFAULT '',
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "firmwareVersion" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "username" TEXT NOT NULL DEFAULT 'admin',
    "password" TEXT NOT NULL DEFAULT '',
    "monitorProtocol" "MonitorProtocol" NOT NULL DEFAULT 'SNMP',
    "snmpCommunity" TEXT NOT NULL DEFAULT 'public',
    "snmpVersion" TEXT NOT NULL DEFAULT '2c',
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "snmpv3User" TEXT NOT NULL DEFAULT '',
    "snmpv3AuthProto" TEXT NOT NULL DEFAULT 'MD5',
    "snmpv3PrivProto" TEXT NOT NULL DEFAULT 'DES',
    "snmpv3AuthKey" TEXT NOT NULL DEFAULT '',
    "snmpv3PrivKey" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "areaId" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastSeenAt" TIMESTAMP(3),
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "cpuUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "temperature" DOUBLE PRECISION,
    "autoBackup" BOOLEAN NOT NULL DEFAULT false,
    "backupSchedule" TEXT NOT NULL DEFAULT 'daily',
    "backupPath" TEXT NOT NULL DEFAULT '',
    "configLastBackup" TIMESTAMP(3),
    "tags" TEXT,
    "maintenanceStart" TIMESTAMP(3),
    "maintenanceEnd" TIMESTAMP(3),
    "maintenanceNote" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "managementIpv6" TEXT NOT NULL DEFAULT '',
    "ipv6Enabled" BOOLEAN NOT NULL DEFAULT false,
    "ipv6Gateway" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT,
    "userId" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'IN_APP',
    "category" "NotificationCategory" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "recurringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recurringFrequency" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "buttonText" TEXT NOT NULL DEFAULT '',
    "buttonUrl" TEXT NOT NULL DEFAULT '',
    "contentType" TEXT NOT NULL DEFAULT 'plain',
    "recurrencePattern" TEXT NOT NULL DEFAULT 'one-time',
    "nextFireAt" TIMESTAMP(3),
    "openRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL DEFAULT '',
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "templateId" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OltPort" (
    "id" TEXT NOT NULL,
    "oltDeviceId" TEXT NOT NULL,
    "portNumber" INTEGER NOT NULL,
    "portType" TEXT NOT NULL DEFAULT 'PON',
    "status" TEXT NOT NULL DEFAULT 'free',
    "subscriberId" TEXT,
    "lineProfileId" TEXT NOT NULL DEFAULT '',
    "serviceProfileId" TEXT NOT NULL DEFAULT '',
    "txPower" DOUBLE PRECISION,
    "rxPower" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OltPort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OltTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vendor" TEXT NOT NULL DEFAULT '',
    "ponType" TEXT NOT NULL DEFAULT 'GPON',
    "config" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OltTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "transactionRef" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "chequeNumber" TEXT NOT NULL DEFAULT '',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "collectedById" TEXT,
    "verifiedById" TEXT,
    "receiptNumber" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "emiCount" INTEGER NOT NULL DEFAULT 1,
    "emiAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL,
    "paidInstallments" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlanInstallment" (
    "id" TEXT NOT NULL,
    "paymentPlanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL DEFAULT 1,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentPlanInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "PlanCategory" NOT NULL DEFAULT 'FTTH',
    "downloadSpeed" INTEGER NOT NULL,
    "uploadSpeed" INTEGER NOT NULL,
    "speedUnit" "SpeedUnit" NOT NULL DEFAULT 'MBPS',
    "downloadSpeedFup" INTEGER,
    "uploadSpeedFup" INTEGER,
    "dataLimitGb" DOUBLE PRECISION,
    "priceMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priceQuarterly" DOUBLE PRECISION,
    "priceHalfYearly" DOUBLE PRECISION,
    "priceYearly" DOUBLE PRECISION,
    "installationCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "routerRental" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "cgstPercent" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "sgstPercent" DOUBLE PRECISION NOT NULL DEFAULT 9,
    "igstPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contentionRatio" TEXT NOT NULL DEFAULT '1:10',
    "burstSpeed" INTEGER,
    "burstDuration" INTEGER,
    "maxConcurrentSessions" INTEGER NOT NULL DEFAULT 1,
    "freeTrialDays" INTEGER NOT NULL DEFAULT 0,
    "slaUptime" DOUBLE PRECISION NOT NULL DEFAULT 99.5,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupId" TEXT,
    "ipv6Enabled" BOOLEAN NOT NULL DEFAULT false,
    "ipv6PrefixDelegation" BOOLEAN NOT NULL DEFAULT false,
    "ipv6DefaultPoolId" TEXT,
    "ipv6AssignmentMode" TEXT NOT NULL DEFAULT 'SLAAC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsHistory" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL DEFAULT 'Earned',
    "points" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortStatusHistory" (
    "id" TEXT NOT NULL,
    "portId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'free',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAccessRule" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT,
    "actions" TEXT,
    "stopOnMatch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalAdZone" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT 'TOP',
    "adType" TEXT NOT NULL DEFAULT 'IMAGE',
    "content" TEXT NOT NULL DEFAULT '',
    "redirectUrl" TEXT NOT NULL DEFAULT '',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleDays" TEXT,
    "scheduleStart" TEXT NOT NULL DEFAULT '00:00',
    "scheduleEnd" TEXT NOT NULL DEFAULT '23:59',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalAdZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalEventLog" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "authMethod" TEXT NOT NULL DEFAULT '',
    "authUsername" TEXT NOT NULL DEFAULT '',
    "voucherCode" TEXT NOT NULL DEFAULT '',
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalMacWhitelist" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subscriberId" TEXT,
    "allowedDays" TEXT,
    "allowedFrom" TEXT NOT NULL DEFAULT '00:00',
    "allowedUntil" TEXT NOT NULL DEFAULT '23:59',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalMacWhitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSchedule" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daysOfWeek" TEXT,
    "startTime" TEXT NOT NULL DEFAULT '00:00',
    "endTime" TEXT NOT NULL DEFAULT '23:59',
    "overridePortalId" TEXT,
    "outOfScheduleAction" TEXT NOT NULL DEFAULT 'DEFAULT_PORTAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "subscriberId" TEXT,
    "macAddress" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "assignedIp" TEXT NOT NULL DEFAULT '',
    "loginMethod" TEXT NOT NULL DEFAULT 'RADIUS',
    "authUsername" TEXT NOT NULL DEFAULT '',
    "voucherCode" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "expiryTime" TIMESTAMP(3),
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "status" "PortalSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "disconnectReason" TEXT NOT NULL DEFAULT '',
    "nasIp" TEXT NOT NULL DEFAULT '',
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalVoucherPool" (
    "id" TEXT NOT NULL,
    "portalId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "voucherPrefix" TEXT NOT NULL DEFAULT '',
    "maxUsesPerVoucher" INTEGER NOT NULL DEFAULT 1,
    "maxTotalActivations" INTEGER NOT NULL DEFAULT 0,
    "currentActivations" INTEGER NOT NULL DEFAULT 0,
    "speedDownKbps" INTEGER NOT NULL DEFAULT 0,
    "speedUpKbps" INTEGER NOT NULL DEFAULT 0,
    "dataLimitMb" INTEGER NOT NULL DEFAULT 0,
    "sessionTimeoutMin" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalVoucherPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PppoeProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "interfaceName" TEXT NOT NULL DEFAULT '',
    "authType" "PppoeAuthType" NOT NULL DEFAULT 'CHAP',
    "serverName" TEXT NOT NULL DEFAULT 'cryptsk',
    "serviceName" TEXT NOT NULL DEFAULT 'cryptsk-isp',
    "maxSessions" INTEGER NOT NULL DEFAULT 0,
    "sessionTimeout" INTEGER NOT NULL DEFAULT 86400,
    "idleTimeout" INTEGER NOT NULL DEFAULT 300,
    "mtu" INTEGER NOT NULL DEFAULT 1492,
    "mru" INTEGER NOT NULL DEFAULT 1492,
    "acName" TEXT NOT NULL DEFAULT '',
    "ipPoolStart" TEXT NOT NULL DEFAULT '',
    "ipPoolEnd" TEXT NOT NULL DEFAULT '',
    "ipPoolNetmask" TEXT NOT NULL DEFAULT '255.255.255.0',
    "dnsPrimary" TEXT NOT NULL DEFAULT '1.1.1.1',
    "dnsSecondary" TEXT NOT NULL DEFAULT '8.8.8.8',
    "winsServer" TEXT NOT NULL DEFAULT '',
    "ipv6Enabled" BOOLEAN NOT NULL DEFAULT false,
    "ipv6PoolStart" TEXT NOT NULL DEFAULT '',
    "ipv6PoolEnd" TEXT NOT NULL DEFAULT '',
    "ipv6PrefixLength" INTEGER NOT NULL DEFAULT 64,
    "ipv6DelegationPrefix" TEXT NOT NULL DEFAULT '',
    "ipv6DnsPrimary" TEXT NOT NULL DEFAULT '2606:4700:4700::1111',
    "ipv6DnsSecondary" TEXT NOT NULL DEFAULT '2001:4860:4860::8888',
    "lcpEchoInterval" INTEGER NOT NULL DEFAULT 30,
    "lcpEchoFailure" INTEGER NOT NULL DEFAULT 3,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PppoeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PppoeSession" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "username" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "ipv6Address" TEXT NOT NULL DEFAULT '',
    "ipv6Prefix" TEXT NOT NULL DEFAULT '',
    "ipv6InputOctets" BIGINT NOT NULL DEFAULT 0,
    "ipv6OutputOctets" BIGINT NOT NULL DEFAULT 0,
    "peerMac" TEXT NOT NULL DEFAULT '',
    "interfaceName" TEXT NOT NULL DEFAULT '',
    "upstreamInterface" TEXT NOT NULL DEFAULT '',
    "status" "PppoeSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3),
    "lastActivity" TIMESTAMP(3),
    "inputOctets" BIGINT NOT NULL DEFAULT 0,
    "outputOctets" BIGINT NOT NULL DEFAULT 0,
    "inputPackets" BIGINT NOT NULL DEFAULT 0,
    "outputPackets" BIGINT NOT NULL DEFAULT 0,
    "currentDownloadBps" INTEGER NOT NULL DEFAULT 0,
    "currentUploadBps" INTEGER NOT NULL DEFAULT 0,
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "stopTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PppoeSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "PromoType" NOT NULL DEFAULT 'PERCENTAGE',
    "value" DOUBLE PRECISION NOT NULL,
    "minAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDiscount" DOUBLE PRECISION,
    "applicablePlanIds" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "PromoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPlan" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "planId" TEXT,
    "areaId" TEXT,
    "connectionType" "ConnectionType" NOT NULL DEFAULT 'FTTH',
    "bindToMac" BOOLEAN NOT NULL DEFAULT false,
    "autoAssignIp" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "vendorId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "equipmentId" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QosConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "targetPlanId" TEXT,
    "targetIpRange" TEXT NOT NULL DEFAULT '',
    "maxBandwidthMbps" INTEGER NOT NULL DEFAULT 0,
    "minBandwidthMbps" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QosConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickReply" (
    "id" TEXT NOT NULL,
    "shortcut" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusAccountingLog" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "nasIp" TEXT NOT NULL DEFAULT '',
    "acctStartTime" TIMESTAMP(3),
    "acctStopTime" TIMESTAMP(3),
    "sessionTime" INTEGER NOT NULL DEFAULT 0,
    "inputOctets" BIGINT NOT NULL DEFAULT 0,
    "outputOctets" BIGINT NOT NULL DEFAULT 0,
    "callingStationId" TEXT NOT NULL DEFAULT '',
    "calledStationId" TEXT NOT NULL DEFAULT '',
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "framedIpv6" TEXT NOT NULL DEFAULT '',
    "delegatedIpv6Prefix" TEXT NOT NULL DEFAULT '',
    "ipv6InputOctets" BIGINT NOT NULL DEFAULT 0,
    "ipv6OutputOctets" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadiusAccountingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusAttributeDef" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "attributeName" TEXT NOT NULL DEFAULT '',
    "vendorId" INTEGER NOT NULL DEFAULT 0,
    "vendorName" TEXT NOT NULL DEFAULT '',
    "attrType" "RadiusAttrType" NOT NULL DEFAULT 'BOTH',
    "dataType" "RadiusAttrDataType" NOT NULL DEFAULT 'STRING',
    "description" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusAttributeDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "speedLimitDown" INTEGER NOT NULL DEFAULT 0,
    "speedLimitUp" INTEGER NOT NULL DEFAULT 0,
    "dataLimit" INTEGER,
    "sessionTimeout" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "framedIpv6Pool" TEXT NOT NULL DEFAULT '',
    "delegatedIpv6PrefixPool" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusPacketMapping" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "packetType" "PacketType" NOT NULL,
    "condition" TEXT NOT NULL DEFAULT '',
    "action" "PacketAction" NOT NULL DEFAULT 'MODIFY',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusPacketMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusPacketRule" (
    "id" TEXT NOT NULL,
    "mappingId" TEXT NOT NULL,
    "srcAttr" TEXT NOT NULL DEFAULT '',
    "srcVendorId" INTEGER NOT NULL DEFAULT 0,
    "srcExpression" TEXT NOT NULL DEFAULT '',
    "dstAttr" TEXT NOT NULL DEFAULT '',
    "dstVendorId" INTEGER NOT NULL DEFAULT 0,
    "dstValue" TEXT NOT NULL DEFAULT '',
    "packetType" "PacketType" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadiusPacketRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusProxyRealm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "realm" TEXT NOT NULL DEFAULT '',
    "stripRealm" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusProxyRealm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusProxyServer" (
    "id" TEXT NOT NULL,
    "realmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "authPort" INTEGER NOT NULL DEFAULT 1812,
    "acctPort" INTEGER NOT NULL DEFAULT 1813,
    "secret" TEXT NOT NULL DEFAULT '',
    "serverType" "ProxyServerType" NOT NULL DEFAULT 'BOTH',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "timeout" INTEGER NOT NULL DEFAULT 3,
    "retries" INTEGER NOT NULL DEFAULT 2,
    "status" INTEGER NOT NULL DEFAULT 1,
    "aliveTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusProxyServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusSession" (
    "id" TEXT NOT NULL,
    "radiusUserId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "nasIp" TEXT NOT NULL DEFAULT '',
    "nasPort" TEXT NOT NULL DEFAULT '',
    "framedIp" TEXT NOT NULL DEFAULT '',
    "callingStationId" TEXT NOT NULL DEFAULT '',
    "acctSessionTime" INTEGER NOT NULL DEFAULT 0,
    "inputOctets" BIGINT NOT NULL DEFAULT 0,
    "outputOctets" BIGINT NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3),
    "lastUpdate" TIMESTAMP(3),
    "stopTime" TIMESTAMP(3),
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "framedIpv6" TEXT NOT NULL DEFAULT '',
    "delegatedIpv6Prefix" TEXT NOT NULL DEFAULT '',
    "ipv6InputOctets" BIGINT NOT NULL DEFAULT 0,
    "ipv6OutputOctets" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "RadiusSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiusUser" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RadiusUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryEscalation" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryEscalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoverySla" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "targetDays" INTEGER NOT NULL DEFAULT 30,
    "actualDays" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "escalatedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "slaDueDate" TIMESTAMP(3),
    "customSlaDays" INTEGER,
    "slaPaused" BOOLEAN NOT NULL DEFAULT false,
    "slaPausedAt" TIMESTAMP(3),
    "slaPausedTotalMs" INTEGER NOT NULL DEFAULT 0,
    "slaPauseReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoverySla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringInvoiceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscriberId" TEXT,
    "planId" TEXT,
    "areaId" TEXT,
    "schedule" "RecurringSchedule" NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastGeneratedAt" TIMESTAMP(3),
    "nextGenerateAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringInvoiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "bonusType" TEXT NOT NULL DEFAULT 'points',
    "bonusValue" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "bonusRecipient" TEXT NOT NULL DEFAULT 'both',
    "maxReferrals" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "bonusAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "totalReferred" INTEGER NOT NULL DEFAULT 0,
    "convertedCount" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEnrollment" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "campaignId" TEXT,
    "referralCode" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ReferralEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "referrerBonus" INTEGER NOT NULL DEFAULT 100,
    "refereeBonus" INTEGER NOT NULL DEFAULT 50,
    "validityDays" INTEGER NOT NULL DEFAULT 90,
    "minInvoiceAmount" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralTracking" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "refereePhone" TEXT NOT NULL DEFAULT '',
    "bonusAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "convertedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'Original',
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRecord" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "reportedBy" TEXT,
    "issueDescription" TEXT NOT NULL DEFAULT '',
    "diagnosisNotes" TEXT NOT NULL DEFAULT '',
    "repairAction" TEXT NOT NULL DEFAULT '',
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "RepairStatus" NOT NULL DEFAULT 'SUBMITTED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reseller" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "areaIds" TEXT,
    "status" "ResellerStatus" NOT NULL DEFAULT 'TRIAL',
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "commissionCalculationMethod" "CommissionMethod" NOT NULL DEFAULT 'PERCENTAGE',
    "totalSubscribers" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "creditLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentCreditUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccountName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "bankIfsc" TEXT NOT NULL DEFAULT '',
    "bankBranch" TEXT NOT NULL DEFAULT '',
    "ifscCode" TEXT NOT NULL DEFAULT '',
    "assignedPlanIds" TEXT,
    "parentId" TEXT,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "primaryColor" TEXT NOT NULL DEFAULT '',
    "secondaryColor" TEXT NOT NULL DEFAULT '',
    "customDomain" TEXT NOT NULL DEFAULT '',
    "emailTemplate" TEXT NOT NULL DEFAULT '',
    "upiId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reseller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerCommissionPayout" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "subscriberCount" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commissionAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidOn" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerCommissionPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'DISCOUNT',
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsRequired" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardRedemption" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "pointsUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "recipientId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "recipientPhone" TEXT NOT NULL DEFAULT '',
    "message" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'TEXT',
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "features" TEXT,
    "arpProtectionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "arpProtectionAction" TEXT NOT NULL DEFAULT 'DROP',
    "dhcpSnoopingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dhcpSnoopingTrustedPorts" TEXT,
    "clientIsolationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "clientIsolationInterfaces" TEXT,
    "portSecurityEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxMacPerPort" INTEGER NOT NULL DEFAULT 1,
    "stormControlEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stormControlBps" INTEGER NOT NULL DEFAULT 1000000,
    "stormControlPps" INTEGER NOT NULL DEFAULT 1000,
    "interfaceId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "nasSessionId" TEXT,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "subscriberId" TEXT,
    "username" TEXT NOT NULL DEFAULT '',
    "eventType" "SessionEventType" NOT NULL,
    "context" TEXT,
    "authResult" TEXT NOT NULL DEFAULT '',
    "clientIp" TEXT NOT NULL DEFAULT '',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'system',
    "triggeredBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmtpProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "username" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "encryption" TEXT NOT NULL DEFAULT 'tls',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmtpProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Splitter" (
    "id" TEXT NOT NULL,
    "oltId" TEXT NOT NULL,
    "portId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '1:8',
    "splitRatio" TEXT NOT NULL DEFAULT '1:8',
    "ratio" TEXT NOT NULL DEFAULT '1:8',
    "location" TEXT NOT NULL DEFAULT '',
    "connectedCount" INTEGER NOT NULL DEFAULT 0,
    "maxCount" INTEGER NOT NULL DEFAULT 8,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Splitter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "adjustedBy" TEXT,
    "previousQty" INTEGER NOT NULL,
    "newQty" INTEGER NOT NULL,
    "reason" "AdjustmentReason" NOT NULL DEFAULT 'CORRECTION',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransfer" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "transferredBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subnet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT '',
    "cidr" TEXT NOT NULL DEFAULT '',
    "networkv6" TEXT NOT NULL DEFAULT '',
    "prefixv6" TEXT NOT NULL DEFAULT '',
    "gateway" TEXT NOT NULL DEFAULT '',
    "dns" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "vlanId" TEXT,
    "parentId" TEXT,
    "areaId" TEXT,
    "captivePortalId" TEXT,
    "natMode" "NatMode" NOT NULL DEFAULT 'NONE',
    "wanInterfaceId" TEXT,
    "cgnatPoolId" TEXT,
    "oneToOneNatIp" TEXT,
    "allocationStrategy" "AllocationStrategy" NOT NULL DEFAULT 'STATIC',
    "frPoolName" TEXT NOT NULL DEFAULT '',
    "ipRangeStart" TEXT NOT NULL DEFAULT '',
    "ipRangeEnd" TEXT NOT NULL DEFAULT '',
    "tcEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tcSubnetIndex" INTEGER NOT NULL DEFAULT 0,
    "nextClassSlot" INTEGER NOT NULL DEFAULT 1,
    "bandwidthPoolDownMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthBurstDownMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthPoolUpMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthBurstUpMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultUserDownMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultUserUpMbps" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL,
    "altPhone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "areaId" TEXT,
    "landmark" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "planId" TEXT,
    "connectionType" "ConnectionType" NOT NULL DEFAULT 'FTTH',
    "status" "SubscriberStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "serviceUsername" TEXT NOT NULL,
    "servicePassword" TEXT NOT NULL DEFAULT '',
    "ipType" "IpType" NOT NULL DEFAULT 'DYNAMIC',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "assignedDeviceId" TEXT,
    "gstin" TEXT NOT NULL DEFAULT '',
    "panNumber" TEXT NOT NULL DEFAULT '',
    "kycAadhaarNumber" TEXT NOT NULL DEFAULT '',
    "kycDocPath" TEXT NOT NULL DEFAULT '',
    "profilePhotoPath" TEXT NOT NULL DEFAULT '',
    "kycVerified" BOOLEAN NOT NULL DEFAULT false,
    "activationDate" TIMESTAMP(3),
    "billingStartDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "referredById" TEXT,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "routerRented" BOOLEAN NOT NULL DEFAULT false,
    "routerSerial" TEXT NOT NULL DEFAULT '',
    "routerDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentSpeedDown" INTEGER NOT NULL DEFAULT 0,
    "currentSpeedUp" INTEGER NOT NULL DEFAULT 0,
    "currentCycleDataUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "radiusGroupId" TEXT,
    "sessionTimeout" INTEGER,
    "idleTimeout" INTEGER,
    "lastAuthAt" TIMESTAMP(3),
    "lastAuthResult" TEXT NOT NULL DEFAULT '',
    "radiusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ipStackType" "IpStackType" NOT NULL DEFAULT 'IPV4_ONLY',
    "ipv6Address" TEXT NOT NULL DEFAULT '',
    "ipv6Prefix" TEXT NOT NULL DEFAULT '',
    "ipv6PrefixLength" INTEGER NOT NULL DEFAULT 64,
    "ipv6Duid" TEXT NOT NULL DEFAULT '',
    "ipv6AssignmentMode" TEXT NOT NULL DEFAULT 'SLAAC',
    "ipv6PoolId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberAddOn" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "addOnServiceId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "chargeAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "SubscriberAddOnStatus" NOT NULL DEFAULT 'ACTIVE',
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberAddOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberChargeOverride" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "planId" TEXT,
    "oldPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newPrice" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "status" "ChargeOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberChargeOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberGracePeriod" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "graceDays" INTEGER NOT NULL DEFAULT 0,
    "graceType" "GracePeriodType" NOT NULL DEFAULT 'POST_BILLING',
    "suspensionDate" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "GracePeriodStatus" NOT NULL DEFAULT 'ACTIVE',
    "appliedBy" TEXT,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberGracePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberTimeAccess" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "timeAccessPolicyId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriberTimeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriberTopUp" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "topUpProductId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TopUpStatus" NOT NULL DEFAULT 'ACTIVE',
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberTopUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyslogConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "protocol" "SyslogProtocol" NOT NULL DEFAULT 'UDP',
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 514,
    "format" TEXT NOT NULL DEFAULT 'RFC5424',
    "facility" TEXT NOT NULL DEFAULT 'local0',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "tags" TEXT,
    "tlsCaCert" TEXT NOT NULL DEFAULT '',
    "tlsClientCert" TEXT NOT NULL DEFAULT '',
    "tlsClientKey" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSentAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyslogConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyslogMessage" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "facility" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "appname" TEXT,
    "procid" TEXT,
    "msgid" TEXT,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "SyslogMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemInterface" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "type" "IfaceType" NOT NULL DEFAULT 'PHYSICAL',
    "role" "IfaceRole" NOT NULL DEFAULT 'UNASSIGNED',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "mtu" INTEGER NOT NULL DEFAULT 1500,
    "speed" INTEGER NOT NULL DEFAULT 0,
    "carrierStatus" BOOLEAN NOT NULL DEFAULT false,
    "parentInterfaceId" TEXT,
    "vlanId" INTEGER,
    "bridgeMembers" TEXT,
    "bondMode" TEXT NOT NULL DEFAULT '',
    "bondMembers" TEXT,
    "ipv4Address" TEXT NOT NULL DEFAULT '',
    "ipv4Netmask" TEXT NOT NULL DEFAULT '',
    "ipv4Gateway" TEXT NOT NULL DEFAULT '',
    "ipv4Dns" TEXT NOT NULL DEFAULT '',
    "ipv6Address" TEXT NOT NULL DEFAULT '',
    "ipv6Prefix" INTEGER NOT NULL DEFAULT 64,
    "ipv6Gateway" TEXT NOT NULL DEFAULT '',
    "ipv6Dns" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isManaged" BOOLEAN NOT NULL DEFAULT true,
    "configJson" TEXT,
    "txBytes" BIGINT NOT NULL DEFAULT 0,
    "rxBytes" BIGINT NOT NULL DEFAULT 0,
    "txPackets" BIGINT NOT NULL DEFAULT 0,
    "rxPackets" BIGINT NOT NULL DEFAULT 0,
    "txErrors" BIGINT NOT NULL DEFAULT 0,
    "rxErrors" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemInterface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TcClassMapping" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "subnetId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "classSlot" INTEGER NOT NULL,
    "classId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "rateKbps" INTEGER NOT NULL,
    "originalRateKbps" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TcClassMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsEntry" (
    "id" TEXT NOT NULL,
    "type" "TdsEntryType" NOT NULL DEFAULT 'TDS',
    "section" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "invoiceId" TEXT,
    "subscriberId" TEXT,
    "panNumber" TEXT NOT NULL DEFAULT '',
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "TdsEntryStatus" NOT NULL DEFAULT 'DEDUCTED',
    "depositedDate" TIMESTAMP(3),
    "challanNumber" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Technician" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "skills" TEXT,
    "areas" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "currentLocation" TEXT NOT NULL DEFAULT '',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalResolved" INTEGER NOT NULL DEFAULT 0,
    "avgResolutionTime" INTEGER NOT NULL DEFAULT 0,
    "workingHoursStart" TEXT NOT NULL DEFAULT '09:00',
    "workingHoursEnd" TEXT NOT NULL DEFAULT '18:00',
    "daysOff" TEXT,
    "monthlySalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankAccountName" TEXT NOT NULL DEFAULT '',
    "bankAccountNumber" TEXT NOT NULL DEFAULT '',
    "bankIfscCode" TEXT NOT NULL DEFAULT '',
    "paymentMode" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "compensation" TEXT,
    "certifications" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Technician_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeAccessPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "daysOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL DEFAULT '00:00',
    "endTime" TEXT NOT NULL DEFAULT '23:59',
    "action" "TimeAccessAction" NOT NULL DEFAULT 'ALLOW',
    "speedDownKbps" INTEGER NOT NULL DEFAULT 0,
    "speedUpKbps" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeAccessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopUpProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "TopUpType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validityHours" INTEGER NOT NULL DEFAULT 24,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopUpProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UptimeCheck" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latency" DOUBLE PRECISION,
    "statusCode" INTEGER,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UptimeCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UptimeTarget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 60,
    "retries" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 10,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UptimeTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "downloadBytes" BIGINT NOT NULL DEFAULT 0,
    "uploadBytes" BIGINT NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL DEFAULT 0,
    "sessionDuration" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT NOT NULL DEFAULT '',
    "assignedAreaIds" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActionHistory" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "actionType" "UserActionType" NOT NULL,
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "oldValues" TEXT,
    "newValues" TEXT,
    "performedBy" TEXT NOT NULL DEFAULT '',
    "isReversible" BOOLEAN NOT NULL DEFAULT false,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBillingCycle" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "cycleType" "BillingCycleType" NOT NULL DEFAULT 'MONTHLY',
    "cycleStartDate" TIMESTAMP(3) NOT NULL,
    "cycleEndDate" TIMESTAMP(3),
    "allottedTimeSec" INTEGER NOT NULL DEFAULT 0,
    "usedTimeSec" INTEGER NOT NULL DEFAULT 0,
    "allottedUploadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allottedDownloadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "allottedTotalMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedUploadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDownloadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedTotalMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topupUploadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topupDownloadMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topupTotalMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentMilestoneId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserBillingCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRadiusAttribute" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "attributeDefId" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "operator" TEXT NOT NULL DEFAULT ':=',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRadiusAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "device" TEXT NOT NULL DEFAULT '',
    "browser" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "logoutAt" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWidgetConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWidgetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "gstin" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "rating" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vlan" (
    "id" TEXT NOT NULL,
    "vlanId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "subnet" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "denomination" DOUBLE PRECISION NOT NULL,
    "planId" TEXT,
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "usedBySubscriberId" TEXT,
    "usedAt" TIMESTAMP(3),
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "denomination" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "validityDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoucherTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WanEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "wanName" TEXT NOT NULL,
    "details" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WanLink" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FIBER',
    "isp" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "gateway" TEXT NOT NULL DEFAULT '',
    "interfaceName" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT,
    "downloadSpeed" INTEGER NOT NULL DEFAULT 0,
    "uploadSpeed" INTEGER NOT NULL DEFAULT 0,
    "monthlyCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "monthlyBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "autoFailback" BOOLEAN NOT NULL DEFAULT true,
    "failbackDelaySec" INTEGER NOT NULL DEFAULT 60,
    "preferPrimary" BOOLEAN NOT NULL DEFAULT true,
    "maxDownloadMbps" INTEGER NOT NULL DEFAULT 0,
    "maxUploadMbps" INTEGER NOT NULL DEFAULT 0,
    "burstSizeMbps" INTEGER NOT NULL DEFAULT 0,
    "linkPriority" INTEGER NOT NULL DEFAULT 5,
    "alertAtPercent" INTEGER NOT NULL DEFAULT 80,
    "stabilityCheckEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minUptimeSeconds" INTEGER NOT NULL DEFAULT 300,
    "ipv6Address" TEXT NOT NULL DEFAULT '',
    "ipv6Gateway" TEXT NOT NULL DEFAULT '',
    "ipv6HealthTarget" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WanLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "pincode" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "WarehouseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT,
    "secret" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastDeliveryAt" TIMESTAMP(3),
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL DEFAULT '',
    "payload" TEXT,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "content" TEXT NOT NULL,
    "variables" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mediaType" TEXT NOT NULL DEFAULT 'TEXT',
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "approvalStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WinLossAnalysis" (
    "id" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT 'LOSS',
    "reason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nas" (
    "id" SERIAL NOT NULL,
    "nasname" TEXT NOT NULL,
    "shortname" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "ports" INTEGER,
    "secret" TEXT NOT NULL,
    "server" TEXT,
    "community" TEXT,
    "description" TEXT,
    "area_id" TEXT,
    "vendor" TEXT DEFAULT '',
    "coa_enabled" BOOLEAN DEFAULT false,
    "status" TEXT DEFAULT 'unknown',

    CONSTRAINT "nas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nasreload" (
    "nasipaddress" TEXT NOT NULL,
    "reloadtime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nasreload_pkey" PRIMARY KEY ("nasipaddress")
);

-- CreateTable
CREATE TABLE "radacct" (
    "radacctid" BIGSERIAL NOT NULL,
    "acctsessionid" TEXT NOT NULL,
    "acctuniqueid" TEXT NOT NULL,
    "username" TEXT,
    "realm" TEXT,
    "nasipaddress" TEXT NOT NULL,
    "nasportid" TEXT,
    "nasporttype" TEXT,
    "acctstarttime" TIMESTAMP(3),
    "acctupdatetime" TIMESTAMP(3),
    "acctstoptime" TIMESTAMP(3),
    "acctinterval" BIGINT,
    "acctsessiontime" BIGINT,
    "acctauthentic" TEXT,
    "connectinfo_start" TEXT,
    "connectinfo_stop" TEXT,
    "acctinputoctets" BIGINT,
    "acctoutputoctets" BIGINT,
    "calledstationid" TEXT,
    "callingstationid" TEXT,
    "acctterminatecause" TEXT,
    "servicetype" TEXT,
    "framedprotocol" TEXT,
    "framedipaddress" TEXT,
    "framedipv6address" TEXT,
    "framedipv6prefix" TEXT,
    "framedinterfaceid" TEXT,
    "delegatedipv6prefix" TEXT,
    "class" TEXT,
    "subscriber_id" TEXT,
    "plan_id" TEXT,
    "area_id" TEXT,

    CONSTRAINT "radacct_pkey" PRIMARY KEY ("radacctid")
);

-- CreateTable
CREATE TABLE "radcheck" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "attribute" TEXT NOT NULL DEFAULT '',
    "op" TEXT NOT NULL DEFAULT '==',
    "value" TEXT NOT NULL DEFAULT '',
    "subscriber_id" TEXT,

    CONSTRAINT "radcheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radgroupcheck" (
    "id" SERIAL NOT NULL,
    "groupname" TEXT NOT NULL DEFAULT '',
    "attribute" TEXT NOT NULL DEFAULT '',
    "op" TEXT NOT NULL DEFAULT '==',
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "radgroupcheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radgroupreply" (
    "id" SERIAL NOT NULL,
    "groupname" TEXT NOT NULL DEFAULT '',
    "attribute" TEXT NOT NULL DEFAULT '',
    "op" TEXT NOT NULL DEFAULT '=',
    "value" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "radgroupreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_daily_stats" (
    "id" BIGSERIAL NOT NULL,
    "stat_date" TIMESTAMP(3) NOT NULL,
    "total_auth" INTEGER DEFAULT 0,
    "auth_success" INTEGER DEFAULT 0,
    "auth_failure" INTEGER DEFAULT 0,
    "active_sessions" INTEGER DEFAULT 0,
    "total_data_gb" DOUBLE PRECISION DEFAULT 0,
    "unique_users" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radius_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radius_provisioning_log" (
    "id" BIGSERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_table" TEXT NOT NULL,
    "details" TEXT DEFAULT '{}',
    "status" TEXT DEFAULT 'success',
    "error_msg" TEXT DEFAULT '',
    "performed_by" TEXT DEFAULT 'system',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "radius_provisioning_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radpostauth" (
    "id" BIGSERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "pass" TEXT,
    "reply" TEXT,
    "calledstationid" TEXT,
    "callingstationid" TEXT,
    "authdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "class" TEXT,
    "subscriber_id" TEXT,

    CONSTRAINT "radpostauth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radreply" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "attribute" TEXT NOT NULL DEFAULT '',
    "op" TEXT NOT NULL DEFAULT '=',
    "value" TEXT NOT NULL DEFAULT '',
    "subscriber_id" TEXT,

    CONSTRAINT "radreply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "radusergroup" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "groupname" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "subscriber_id" TEXT,
    "is_active" BOOLEAN DEFAULT true,

    CONSTRAINT "radusergroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wifi_offload_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL DEFAULT '',
    "eventType" TEXT NOT NULL DEFAULT '',
    "interfaceType" TEXT NOT NULL DEFAULT 'Gy',
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "peerName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wifi_offload_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wifi_offload_peers" (
    "id" TEXT NOT NULL,
    "peerName" TEXT NOT NULL,
    "peerType" TEXT NOT NULL DEFAULT 'PCRF',
    "host" TEXT NOT NULL DEFAULT '127.0.0.1',
    "port" INTEGER NOT NULL DEFAULT 3868,
    "realm" TEXT NOT NULL DEFAULT '',
    "protocol" TEXT NOT NULL DEFAULT 'diameter',
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "isSimulator" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "messagesIn" INTEGER NOT NULL DEFAULT 0,
    "messagesOut" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wifi_offload_peers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wifi_offload_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imsiPrefix" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT NOT NULL DEFAULT '',
    "defaultSpeedDownKbps" INTEGER NOT NULL DEFAULT 5120,
    "defaultSpeedUpKbps" INTEGER NOT NULL DEFAULT 2560,
    "dataLimitMb" INTEGER,
    "sessionTimeoutSec" INTEGER NOT NULL DEFAULT 86400,
    "fupSpeedDownKbps" INTEGER NOT NULL DEFAULT 1024,
    "fupSpeedUpKbps" INTEGER NOT NULL DEFAULT 512,
    "fupThresholdMb" INTEGER,
    "priorityLevel" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wifi_offload_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wifi_offload_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "imsi" TEXT NOT NULL DEFAULT '',
    "msisdn" TEXT NOT NULL DEFAULT '',
    "imei" TEXT NOT NULL DEFAULT '',
    "macAddress" TEXT NOT NULL DEFAULT '',
    "ipAddress" TEXT NOT NULL DEFAULT '',
    "apName" TEXT NOT NULL DEFAULT '',
    "locationId" TEXT NOT NULL DEFAULT '',
    "loginMethod" TEXT NOT NULL DEFAULT 'EAP-AKA',
    "grantedQuotaMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedDownMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedUpMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usedTimeSec" INTEGER NOT NULL DEFAULT 0,
    "remainingQuotaMb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "speedDownKbps" INTEGER NOT NULL DEFAULT 0,
    "speedUpKbps" INTEGER NOT NULL DEFAULT 0,
    "qosClassId" INTEGER NOT NULL DEFAULT 9,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminateCause" TEXT NOT NULL DEFAULT '',
    "chargedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "planId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wifi_offload_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PromoUsage" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PromoUsage_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "AddOnService_name_key" ON "AddOnService"("name");

-- CreateIndex
CREATE INDEX "AddOnService_isActive_idx" ON "AddOnService"("isActive");

-- CreateIndex
CREATE INDEX "AddOnService_sortOrder_idx" ON "AddOnService"("sortOrder");

-- CreateIndex
CREATE INDEX "AgentFollowUp_agentId_idx" ON "AgentFollowUp"("agentId");

-- CreateIndex
CREATE INDEX "AgentFollowUp_dueDate_idx" ON "AgentFollowUp"("dueDate");

-- CreateIndex
CREATE INDEX "AgentFollowUp_status_idx" ON "AgentFollowUp"("status");

-- CreateIndex
CREATE INDEX "AgentReconciliation_agentId_idx" ON "AgentReconciliation"("agentId");

-- CreateIndex
CREATE INDEX "AgentReconciliation_date_idx" ON "AgentReconciliation"("date");

-- CreateIndex
CREATE INDEX "AgentReconciliation_status_idx" ON "AgentReconciliation"("status");

-- CreateIndex
CREATE INDEX "AlertComment_alertId_idx" ON "AlertComment"("alertId");

-- CreateIndex
CREATE INDEX "AlertComment_userId_idx" ON "AlertComment"("userId");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertSuppression_alertRuleId_idx" ON "AlertSuppression"("alertRuleId");

-- CreateIndex
CREATE INDEX "AlertSuppression_endsAt_idx" ON "AlertSuppression"("endsAt");

-- CreateIndex
CREATE INDEX "AlertSuppression_startsAt_idx" ON "AlertSuppression"("startsAt");

-- CreateIndex
CREATE INDEX "Announcement_createdAt_idx" ON "Announcement"("createdAt");

-- CreateIndex
CREATE INDEX "Announcement_isActive_idx" ON "Announcement"("isActive");

-- CreateIndex
CREATE INDEX "Announcement_priority_idx" ON "Announcement"("priority");

-- CreateIndex
CREATE INDEX "Announcement_target_idx" ON "Announcement"("target");

-- CreateIndex
CREATE INDEX "Announcement_type_idx" ON "Announcement"("type");

-- CreateIndex
CREATE INDEX "AnnouncementDismissal_announcementId_idx" ON "AnnouncementDismissal"("announcementId");

-- CreateIndex
CREATE INDEX "AnnouncementDismissal_userId_idx" ON "AnnouncementDismissal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementDismissal_announcementId_userId_key" ON "AnnouncementDismissal"("announcementId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_key_idx" ON "ApiKey"("key");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Area_code_key" ON "Area"("code");

-- CreateIndex
CREATE INDEX "Area_assignedAgentId_idx" ON "Area"("assignedAgentId");

-- CreateIndex
CREATE INDEX "Area_assignedTechnicianId_idx" ON "Area"("assignedTechnicianId");

-- CreateIndex
CREATE INDEX "Area_parentId_idx" ON "Area"("parentId");

-- CreateIndex
CREATE INDEX "Area_status_idx" ON "Area"("status");

-- CreateIndex
CREATE INDEX "AreaBudgetLimit_areaId_idx" ON "AreaBudgetLimit"("areaId");

-- CreateIndex
CREATE INDEX "AreaBudgetLimit_cycleStartDate_idx" ON "AreaBudgetLimit"("cycleStartDate");

-- CreateIndex
CREATE INDEX "AttendanceRecord_date_idx" ON "AttendanceRecord"("date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_technicianId_idx" ON "AttendanceRecord"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_technicianId_date_key" ON "AttendanceRecord"("technicianId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_action_entity_timestamp_idx" ON "AuditLog"("action", "entity", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_endpoint_idx" ON "AuditLog"("endpoint");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_entity_timestamp_idx" ON "AuditLog"("entity", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_userName_idx" ON "AuditLog"("userName");

-- CreateIndex
CREATE INDEX "BackupRecord_createdAt_idx" ON "BackupRecord"("createdAt");

-- CreateIndex
CREATE INDEX "BackupRecord_status_idx" ON "BackupRecord"("status");

-- CreateIndex
CREATE INDEX "BandwidthLog_deviceId_idx" ON "BandwidthLog"("deviceId");

-- CreateIndex
CREATE INDEX "BandwidthLog_deviceId_timestamp_idx" ON "BandwidthLog"("deviceId", "timestamp");

-- CreateIndex
CREATE INDEX "BandwidthLog_timestamp_idx" ON "BandwidthLog"("timestamp");

-- CreateIndex
CREATE INDEX "BandwidthPolicy_enabled_idx" ON "BandwidthPolicy"("enabled");

-- CreateIndex
CREATE INDEX "BandwidthPolicy_interfaceId_idx" ON "BandwidthPolicy"("interfaceId");

-- CreateIndex
CREATE INDEX "BandwidthPolicy_planId_idx" ON "BandwidthPolicy"("planId");

-- CreateIndex
CREATE INDEX "BandwidthPolicy_radiusGroupId_idx" ON "BandwidthPolicy"("radiusGroupId");

-- CreateIndex
CREATE INDEX "BandwidthThrottleConfig_deviceId_idx" ON "BandwidthThrottleConfig"("deviceId");

-- CreateIndex
CREATE INDEX "BandwidthThrottleConfig_enabled_idx" ON "BandwidthThrottleConfig"("enabled");

-- CreateIndex
CREATE INDEX "BatchProvisioningJob_createdAt_idx" ON "BatchProvisioningJob"("createdAt");

-- CreateIndex
CREATE INDEX "BatchProvisioningJob_status_idx" ON "BatchProvisioningJob"("status");

-- CreateIndex
CREATE INDEX "BatchProvisioningJob_templateId_idx" ON "BatchProvisioningJob"("templateId");

-- CreateIndex
CREATE INDEX "BillingMilestone_planId_idx" ON "BillingMilestone"("planId");

-- CreateIndex
CREATE INDEX "BillingMilestone_priority_idx" ON "BillingMilestone"("priority");

-- CreateIndex
CREATE INDEX "BotCommand_trigger_idx" ON "BotCommand"("trigger");

-- CreateIndex
CREATE INDEX "BwSample_sourceType_sourceId_idx" ON "BwSample"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BwSample_timestamp_idx" ON "BwSample"("timestamp");

-- CreateIndex
CREATE INDEX "CaptivePortal_enabled_idx" ON "CaptivePortal"("enabled");

-- CreateIndex
CREATE INDEX "CaptivePortal_interfaceId_idx" ON "CaptivePortal"("interfaceId");

-- CreateIndex
CREATE INDEX "CaptivePortal_loginMethod_idx" ON "CaptivePortal"("loginMethod");

-- CreateIndex
CREATE INDEX "CgnatMapping_cgnatPoolId_idx" ON "CgnatMapping"("cgnatPoolId");

-- CreateIndex
CREATE INDEX "CgnatMapping_externalIp_idx" ON "CgnatMapping"("externalIp");

-- CreateIndex
CREATE INDEX "CgnatMapping_internalIp_idx" ON "CgnatMapping"("internalIp");

-- CreateIndex
CREATE INDEX "CgnatMapping_isActive_idx" ON "CgnatMapping"("isActive");

-- CreateIndex
CREATE INDEX "CgnatMapping_subscriberId_idx" ON "CgnatMapping"("subscriberId");

-- CreateIndex
CREATE INDEX "CgnatPool_enabled_idx" ON "CgnatPool"("enabled");

-- CreateIndex
CREATE INDEX "ChurnCommunication_createdAt_idx" ON "ChurnCommunication"("createdAt");

-- CreateIndex
CREATE INDEX "ChurnCommunication_subscriberId_idx" ON "ChurnCommunication"("subscriberId");

-- CreateIndex
CREATE INDEX "ChurnCommunication_trackingId_idx" ON "ChurnCommunication"("trackingId");

-- CreateIndex
CREATE INDEX "ChurnTracking_status_idx" ON "ChurnTracking"("status");

-- CreateIndex
CREATE INDEX "ChurnTracking_subscriberId_idx" ON "ChurnTracking"("subscriberId");

-- CreateIndex
CREATE INDEX "CoaEvent_coaStatus_idx" ON "CoaEvent"("coaStatus");

-- CreateIndex
CREATE INDEX "CoaEvent_coaType_idx" ON "CoaEvent"("coaType");

-- CreateIndex
CREATE INDEX "CoaEvent_subscriberId_idx" ON "CoaEvent"("subscriberId");

-- CreateIndex
CREATE INDEX "CoaEvent_triggeredAt_idx" ON "CoaEvent"("triggeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionAgent_userId_key" ON "CollectionAgent"("userId");

-- CreateIndex
CREATE INDEX "CollectionAgent_userId_idx" ON "CollectionAgent"("userId");

-- CreateIndex
CREATE INDEX "CommissionPayout_agentId_idx" ON "CommissionPayout"("agentId");

-- CreateIndex
CREATE INDEX "CommissionPayout_period_idx" ON "CommissionPayout"("period");

-- CreateIndex
CREATE INDEX "CommissionPayout_status_idx" ON "CommissionPayout"("status");

-- CreateIndex
CREATE INDEX "Competitor_name_idx" ON "Competitor"("name");

-- CreateIndex
CREATE INDEX "CompetitorPriceHistory_competitorId_idx" ON "CompetitorPriceHistory"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorPriceHistory_createdAt_idx" ON "CompetitorPriceHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_ticketNumber_key" ON "Complaint"("ticketNumber");

-- CreateIndex
CREATE INDEX "Complaint_areaId_idx" ON "Complaint"("areaId");

-- CreateIndex
CREATE INDEX "Complaint_areaId_status_idx" ON "Complaint"("areaId", "status");

-- CreateIndex
CREATE INDEX "Complaint_createdAt_idx" ON "Complaint"("createdAt");

-- CreateIndex
CREATE INDEX "Complaint_priority_idx" ON "Complaint"("priority");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_status_priority_idx" ON "Complaint"("status", "priority");

-- CreateIndex
CREATE INDEX "Complaint_subscriberId_idx" ON "Complaint"("subscriberId");

-- CreateIndex
CREATE INDEX "Complaint_ticketNumber_idx" ON "Complaint"("ticketNumber");

-- CreateIndex
CREATE INDEX "ComplaintComment_complaintId_idx" ON "ComplaintComment"("complaintId");

-- CreateIndex
CREATE INDEX "ComplaintComment_createdAt_idx" ON "ComplaintComment"("createdAt");

-- CreateIndex
CREATE INDEX "ComplaintComment_userId_idx" ON "ComplaintComment"("userId");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_status_idx" ON "CreditNote"("status");

-- CreateIndex
CREATE INDEX "CustomerFeedback_installationId_idx" ON "CustomerFeedback"("installationId");

-- CreateIndex
CREATE INDEX "CustomerFeedback_rating_idx" ON "CustomerFeedback"("rating");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardWidget_name_key" ON "DashboardWidget"("name");

-- CreateIndex
CREATE INDEX "DashboardWidget_category_idx" ON "DashboardWidget"("category");

-- CreateIndex
CREATE INDEX "DashboardWidget_enabled_idx" ON "DashboardWidget"("enabled");

-- CreateIndex
CREATE INDEX "DashboardWidget_sortOrder_idx" ON "DashboardWidget"("sortOrder");

-- CreateIndex
CREATE INDEX "DataUsage_date_idx" ON "DataUsage"("date");

-- CreateIndex
CREATE INDEX "DataUsage_subscriberId_idx" ON "DataUsage"("subscriberId");

-- CreateIndex
CREATE INDEX "DataUsage_totalMb_idx" ON "DataUsage"("totalMb");

-- CreateIndex
CREATE UNIQUE INDEX "DataUsage_subscriberId_date_key" ON "DataUsage"("subscriberId", "date");

-- CreateIndex
CREATE INDEX "DdosProtection_enabled_idx" ON "DdosProtection"("enabled");

-- CreateIndex
CREATE INDEX "DdosProtection_lastHitAt_idx" ON "DdosProtection"("lastHitAt");

-- CreateIndex
CREATE INDEX "DdosProtection_protectionType_idx" ON "DdosProtection"("protectionType");

-- CreateIndex
CREATE INDEX "DeviceConfigHistory_createdAt_idx" ON "DeviceConfigHistory"("createdAt");

-- CreateIndex
CREATE INDEX "DeviceConfigHistory_deviceId_idx" ON "DeviceConfigHistory"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceInterface_deviceId_idx" ON "DeviceInterface"("deviceId");

-- CreateIndex
CREATE INDEX "DhcpReservation_dhcpSubnetId_idx" ON "DhcpReservation"("dhcpSubnetId");

-- CreateIndex
CREATE INDEX "DhcpReservation_ipAddress_idx" ON "DhcpReservation"("ipAddress");

-- CreateIndex
CREATE INDEX "DhcpReservation_macAddress_idx" ON "DhcpReservation"("macAddress");

-- CreateIndex
CREATE INDEX "DhcpReservation_subscriberId_idx" ON "DhcpReservation"("subscriberId");

-- CreateIndex
CREATE INDEX "DhcpSubnet_captivePortalId_idx" ON "DhcpSubnet"("captivePortalId");

-- CreateIndex
CREATE INDEX "DhcpSubnet_enabled_idx" ON "DhcpSubnet"("enabled");

-- CreateIndex
CREATE INDEX "DhcpSubnet_interfaceName_idx" ON "DhcpSubnet"("interfaceName");

-- CreateIndex
CREATE INDEX "DhcpSubnet_ipamSubnetId_idx" ON "DhcpSubnet"("ipamSubnetId");

-- CreateIndex
CREATE INDEX "DhcpSubnet_subnet_idx" ON "DhcpSubnet"("subnet");

-- CreateIndex
CREATE INDEX "DhcpV6Pool_dhcpV6SubnetId_idx" ON "DhcpV6Pool"("dhcpV6SubnetId");

-- CreateIndex
CREATE INDEX "DhcpV6PrefixDelegation_clientDuid_idx" ON "DhcpV6PrefixDelegation"("clientDuid");

-- CreateIndex
CREATE INDEX "DhcpV6PrefixDelegation_delegatedPrefix_idx" ON "DhcpV6PrefixDelegation"("delegatedPrefix");

-- CreateIndex
CREATE INDEX "DhcpV6PrefixDelegation_dhcpV6SubnetId_idx" ON "DhcpV6PrefixDelegation"("dhcpV6SubnetId");

-- CreateIndex
CREATE INDEX "DhcpV6PrefixDelegation_subscriberId_idx" ON "DhcpV6PrefixDelegation"("subscriberId");

-- CreateIndex
CREATE INDEX "DhcpV6Reservation_dhcpV6SubnetId_idx" ON "DhcpV6Reservation"("dhcpV6SubnetId");

-- CreateIndex
CREATE INDEX "DhcpV6Reservation_duid_idx" ON "DhcpV6Reservation"("duid");

-- CreateIndex
CREATE INDEX "DhcpV6Reservation_ipAddress_idx" ON "DhcpV6Reservation"("ipAddress");

-- CreateIndex
CREATE INDEX "DhcpV6Reservation_subscriberId_idx" ON "DhcpV6Reservation"("subscriberId");

-- CreateIndex
CREATE INDEX "DhcpV6Subnet_enabled_idx" ON "DhcpV6Subnet"("enabled");

-- CreateIndex
CREATE INDEX "DhcpV6Subnet_interfaceName_idx" ON "DhcpV6Subnet"("interfaceName");

-- CreateIndex
CREATE INDEX "DhcpV6Subnet_prefix_idx" ON "DhcpV6Subnet"("prefix");

-- CreateIndex
CREATE INDEX "DiagnosisBaseline_createdAt_idx" ON "DiagnosisBaseline"("createdAt");

-- CreateIndex
CREATE INDEX "DiagnosisBaseline_subscriberId_idx" ON "DiagnosisBaseline"("subscriberId");

-- CreateIndex
CREATE INDEX "DiagnosticCapture_startedAt_idx" ON "DiagnosticCapture"("startedAt");

-- CreateIndex
CREATE INDEX "DiagnosticCapture_status_idx" ON "DiagnosticCapture"("status");

-- CreateIndex
CREATE INDEX "DiagnosticCapture_tool_idx" ON "DiagnosticCapture"("tool");

-- CreateIndex
CREATE INDEX "Dispute_invoiceId_idx" ON "Dispute"("invoiceId");

-- CreateIndex
CREATE INDEX "Dispute_status_idx" ON "Dispute"("status");

-- CreateIndex
CREATE INDEX "Dispute_subscriberId_idx" ON "Dispute"("subscriberId");

-- CreateIndex
CREATE INDEX "DnsRecord_enabled_idx" ON "DnsRecord"("enabled");

-- CreateIndex
CREATE INDEX "DnsRecord_name_idx" ON "DnsRecord"("name");

-- CreateIndex
CREATE INDEX "DnsRecord_type_idx" ON "DnsRecord"("type");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseSession_sessionId_key" ON "EnterpriseSession"("sessionId");

-- CreateIndex
CREATE INDEX "EnterpriseSession_connectedAt_idx" ON "EnterpriseSession"("connectedAt");

-- CreateIndex
CREATE INDEX "EnterpriseSession_status_idx" ON "EnterpriseSession"("status");

-- CreateIndex
CREATE INDEX "EnterpriseSession_subscriberId_idx" ON "EnterpriseSession"("subscriberId");

-- CreateIndex
CREATE INDEX "EnterpriseSession_username_idx" ON "EnterpriseSession"("username");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseSubscriber_subscriberId_key" ON "EnterpriseSubscriber"("subscriberId");

-- CreateIndex
CREATE INDEX "EnterpriseSubscriber_authMethod_idx" ON "EnterpriseSubscriber"("authMethod");

-- CreateIndex
CREATE INDEX "EnterpriseSubscriber_status_idx" ON "EnterpriseSubscriber"("status");

-- CreateIndex
CREATE INDEX "EnterpriseUser_subscriberId_idx" ON "EnterpriseUser"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseUser_subscriberId_username_key" ON "EnterpriseUser"("subscriberId", "username");

-- CreateIndex
CREATE INDEX "Equipment_category_idx" ON "Equipment"("category");

-- CreateIndex
CREATE INDEX "Equipment_repairStatus_idx" ON "Equipment"("repairStatus");

-- CreateIndex
CREATE INDEX "Equipment_serialNumber_idx" ON "Equipment"("serialNumber");

-- CreateIndex
CREATE INDEX "Equipment_status_idx" ON "Equipment"("status");

-- CreateIndex
CREATE INDEX "Equipment_stockLocation_idx" ON "Equipment"("stockLocation");

-- CreateIndex
CREATE INDEX "Equipment_vendorId_idx" ON "Equipment"("vendorId");

-- CreateIndex
CREATE INDEX "Equipment_warehouseId_idx" ON "Equipment"("warehouseId");

-- CreateIndex
CREATE INDEX "EquipmentInspection_createdAt_idx" ON "EquipmentInspection"("createdAt");

-- CreateIndex
CREATE INDEX "EquipmentInspection_equipmentId_idx" ON "EquipmentInspection"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRepair_createdAt_idx" ON "EquipmentRepair"("createdAt");

-- CreateIndex
CREATE INDEX "EquipmentRepair_equipmentId_idx" ON "EquipmentRepair"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentRepair_status_idx" ON "EquipmentRepair"("status");

-- CreateIndex
CREATE INDEX "EquipmentReturn_createdAt_idx" ON "EquipmentReturn"("createdAt");

-- CreateIndex
CREATE INDEX "EquipmentReturn_equipmentId_idx" ON "EquipmentReturn"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentReturn_status_idx" ON "EquipmentReturn"("status");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "FailoverRule_priority_idx" ON "FailoverRule"("priority");

-- CreateIndex
CREATE INDEX "Faq_category_idx" ON "Faq"("category");

-- CreateIndex
CREATE INDEX "Faq_sortOrder_idx" ON "Faq"("sortOrder");

-- CreateIndex
CREATE INDEX "Faq_status_idx" ON "Faq"("status");

-- CreateIndex
CREATE INDEX "FirewallRule_chain_idx" ON "FirewallRule"("chain");

-- CreateIndex
CREATE INDEX "FirewallRule_enabled_idx" ON "FirewallRule"("enabled");

-- CreateIndex
CREATE INDEX "FirewallRule_priority_idx" ON "FirewallRule"("priority");

-- CreateIndex
CREATE INDEX "FirewallRule_status_idx" ON "FirewallRule"("status");

-- CreateIndex
CREATE INDEX "FirewallRule_table_idx" ON "FirewallRule"("table");

-- CreateIndex
CREATE INDEX "GeneratedLegalNotice_invoiceId_idx" ON "GeneratedLegalNotice"("invoiceId");

-- CreateIndex
CREATE INDEX "GeneratedLegalNotice_status_idx" ON "GeneratedLegalNotice"("status");

-- CreateIndex
CREATE INDEX "GeneratedLegalNotice_subscriberId_idx" ON "GeneratedLegalNotice"("subscriberId");

-- CreateIndex
CREATE INDEX "Incident_assignedToId_idx" ON "Incident"("assignedToId");

-- CreateIndex
CREATE INDEX "Incident_createdById_idx" ON "Incident"("createdById");

-- CreateIndex
CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");

-- CreateIndex
CREATE INDEX "Incident_startedAt_idx" ON "Incident"("startedAt");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "IncidentUpdate_createdAt_idx" ON "IncidentUpdate"("createdAt");

-- CreateIndex
CREATE INDEX "IncidentUpdate_incidentId_idx" ON "IncidentUpdate"("incidentId");

-- CreateIndex
CREATE INDEX "Installation_scheduledDate_idx" ON "Installation"("scheduledDate");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE INDEX "Installation_subscriberId_idx" ON "Installation"("subscriberId");

-- CreateIndex
CREATE INDEX "Installation_technicianId_idx" ON "Installation"("technicianId");

-- CreateIndex
CREATE INDEX "IntegrationConfig_enabled_idx" ON "IntegrationConfig"("enabled");

-- CreateIndex
CREATE INDEX "IntegrationConfig_provider_idx" ON "IntegrationConfig"("provider");

-- CreateIndex
CREATE INDEX "IntegrationConfig_type_idx" ON "IntegrationConfig"("type");

-- CreateIndex
CREATE INDEX "IntegrationLog_createdAt_idx" ON "IntegrationLog"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_integrationId_idx" ON "IntegrationLog"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationLog_status_idx" ON "IntegrationLog"("status");

-- CreateIndex
CREATE INDEX "IntegrationTransaction_createdAt_idx" ON "IntegrationTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "IntegrationTransaction_gatewayType_idx" ON "IntegrationTransaction"("gatewayType");

-- CreateIndex
CREATE INDEX "IntegrationTransaction_integrationId_idx" ON "IntegrationTransaction"("integrationId");

-- CreateIndex
CREATE INDEX "IntegrationTransaction_status_idx" ON "IntegrationTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_issueDate_idx" ON "Invoice"("issueDate");

-- CreateIndex
CREATE INDEX "Invoice_status_dueDate_idx" ON "Invoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_status_issueDate_idx" ON "Invoice"("status", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_subscriberId_idx" ON "Invoice"("subscriberId");

-- CreateIndex
CREATE INDEX "Invoice_subscriberId_status_idx" ON "Invoice"("subscriberId", "status");

-- CreateIndex
CREATE INDEX "InvoiceLineItem_invoiceId_idx" ON "InvoiceLineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "IpAddress_address_idx" ON "IpAddress"("address");

-- CreateIndex
CREATE INDEX "IpAddress_status_idx" ON "IpAddress"("status");

-- CreateIndex
CREATE INDEX "IpAddress_subnetId_idx" ON "IpAddress"("subnetId");

-- CreateIndex
CREATE INDEX "IpAssignmentHistory_assignedAt_idx" ON "IpAssignmentHistory"("assignedAt");

-- CreateIndex
CREATE INDEX "IpAssignmentHistory_ipAddressId_idx" ON "IpAssignmentHistory"("ipAddressId");

-- CreateIndex
CREATE INDEX "IpMacHistory_changedAt_idx" ON "IpMacHistory"("changedAt");

-- CreateIndex
CREATE INDEX "IpMacHistory_ipAddress_idx" ON "IpMacHistory"("ipAddress");

-- CreateIndex
CREATE INDEX "IpMacHistory_subscriberId_idx" ON "IpMacHistory"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "IpamSnapshot_snapshotDate_key" ON "IpamSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "IpamSnapshot_snapshotDate_idx" ON "IpamSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "IpsAlert_createdAt_idx" ON "IpsAlert"("createdAt");

-- CreateIndex
CREATE INDEX "IpsAlert_eventType_idx" ON "IpsAlert"("eventType");

-- CreateIndex
CREATE INDEX "IpsAlert_severity_idx" ON "IpsAlert"("severity");

-- CreateIndex
CREATE INDEX "IpsAlert_sourceIp_idx" ON "IpsAlert"("sourceIp");

-- CreateIndex
CREATE INDEX "IpsAlert_status_idx" ON "IpsAlert"("status");

-- CreateIndex
CREATE INDEX "IpsAlert_subscriberId_idx" ON "IpsAlert"("subscriberId");

-- CreateIndex
CREATE INDEX "IpsBlockRule_createdAt_idx" ON "IpsBlockRule"("createdAt");

-- CreateIndex
CREATE INDEX "IpsBlockRule_expiresAt_idx" ON "IpsBlockRule"("expiresAt");

-- CreateIndex
CREATE INDEX "IpsBlockRule_isActive_idx" ON "IpsBlockRule"("isActive");

-- CreateIndex
CREATE INDEX "IpsBlockRule_sourceIp_idx" ON "IpsBlockRule"("sourceIp");

-- CreateIndex
CREATE INDEX "IpsBlockRule_subscriberId_idx" ON "IpsBlockRule"("subscriberId");

-- CreateIndex
CREATE INDEX "IpsDetectionRule_enabled_idx" ON "IpsDetectionRule"("enabled");

-- CreateIndex
CREATE INDEX "IpsDetectionRule_eventType_idx" ON "IpsDetectionRule"("eventType");

-- CreateIndex
CREATE INDEX "IpsDetectionRule_sortOrder_idx" ON "IpsDetectionRule"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "KbArticle_slug_key" ON "KbArticle"("slug");

-- CreateIndex
CREATE INDEX "KbArticle_categoryId_idx" ON "KbArticle"("categoryId");

-- CreateIndex
CREATE INDEX "KbArticle_status_idx" ON "KbArticle"("status");

-- CreateIndex
CREATE INDEX "KbArticle_updatedAt_idx" ON "KbArticle"("updatedAt");

-- CreateIndex
CREATE INDEX "KbArticleVersion_articleId_idx" ON "KbArticleVersion"("articleId");

-- CreateIndex
CREATE INDEX "KbArticleVersion_createdAt_idx" ON "KbArticleVersion"("createdAt");

-- CreateIndex
CREATE INDEX "KbArticleVersion_version_idx" ON "KbArticleVersion"("version");

-- CreateIndex
CREATE INDEX "KbCategory_parentId_idx" ON "KbCategory"("parentId");

-- CreateIndex
CREATE INDEX "KbCategory_sortOrder_idx" ON "KbCategory"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "LdapConfig_subscriberId_key" ON "LdapConfig"("subscriberId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_source_idx" ON "Lead"("source");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "LeadCommunication_date_idx" ON "LeadCommunication"("date");

-- CreateIndex
CREATE INDEX "LeadCommunication_leadId_idx" ON "LeadCommunication"("leadId");

-- CreateIndex
CREATE INDEX "LeadCommunication_type_idx" ON "LeadCommunication"("type");

-- CreateIndex
CREATE INDEX "LeaveRecord_startDate_idx" ON "LeaveRecord"("startDate");

-- CreateIndex
CREATE INDEX "LeaveRecord_status_idx" ON "LeaveRecord"("status");

-- CreateIndex
CREATE INDEX "LeaveRecord_technicianId_idx" ON "LeaveRecord"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyMember_subscriberId_key" ON "LoyaltyMember"("subscriberId");

-- CreateIndex
CREATE INDEX "LoyaltyMember_subscriberId_idx" ON "LoyaltyMember"("subscriberId");

-- CreateIndex
CREATE INDEX "LoyaltyMember_tier_idx" ON "LoyaltyMember"("tier");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_scheduledAt_idx" ON "MaintenanceWindow"("scheduledAt");

-- CreateIndex
CREATE INDEX "MaintenanceWindow_status_idx" ON "MaintenanceWindow"("status");

-- CreateIndex
CREATE UNIQUE INDEX "NasClientConfig_deviceId_key" ON "NasClientConfig"("deviceId");

-- CreateIndex
CREATE INDEX "NasClientConfig_deviceId_idx" ON "NasClientConfig"("deviceId");

-- CreateIndex
CREATE INDEX "NasConfig_enabled_idx" ON "NasConfig"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "nassession_sid_idx" ON "NasSession"("sessionId");

-- CreateIndex
CREATE INDEX "NasSession_callingStationId_idx" ON "NasSession"("callingStationId");

-- CreateIndex
CREATE INDEX "NasSession_framedIp_idx" ON "NasSession"("framedIp");

-- CreateIndex
CREATE INDEX "NasSession_lastActivity_idx" ON "NasSession"("lastActivity");

-- CreateIndex
CREATE INDEX "NasSession_nasIp_idx" ON "NasSession"("nasIp");

-- CreateIndex
CREATE INDEX "NasSession_startTime_idx" ON "NasSession"("startTime");

-- CreateIndex
CREATE INDEX "NasSession_status_idx" ON "NasSession"("status");

-- CreateIndex
CREATE INDEX "NasSession_status_startTime_idx" ON "NasSession"("status", "startTime");

-- CreateIndex
CREATE INDEX "NasSession_stopTime_idx" ON "NasSession"("stopTime");

-- CreateIndex
CREATE INDEX "NasSession_subscriberId_idx" ON "NasSession"("subscriberId");

-- CreateIndex
CREATE INDEX "NasSession_username_idx" ON "NasSession"("username");

-- CreateIndex
CREATE INDEX "NatLog_dstDomain_idx" ON "NatLog"("dstDomain");

-- CreateIndex
CREATE INDEX "NatLog_dstIp_idx" ON "NatLog"("dstIp");

-- CreateIndex
CREATE INDEX "NatLog_dstPort_idx" ON "NatLog"("dstPort");

-- CreateIndex
CREATE INDEX "NatLog_srcIp_idx" ON "NatLog"("srcIp");

-- CreateIndex
CREATE INDEX "NatLog_subscriberId_idx" ON "NatLog"("subscriberId");

-- CreateIndex
CREATE INDEX "NatLog_subscriberIp_idx" ON "NatLog"("subscriberIp");

-- CreateIndex
CREATE INDEX "NatLog_timestamp_idx" ON "NatLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "NdpiApp_name_key" ON "NdpiApp"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NdpiApp_ndpiId_key" ON "NdpiApp"("ndpiId");

-- CreateIndex
CREATE INDEX "NdpiApp_category_idx" ON "NdpiApp"("category");

-- CreateIndex
CREATE INDEX "NdpiApp_isEnabled_idx" ON "NdpiApp"("isEnabled");

-- CreateIndex
CREATE INDEX "NdpiApp_ndpiId_idx" ON "NdpiApp"("ndpiId");

-- CreateIndex
CREATE INDEX "NdpiAppRule_action_idx" ON "NdpiAppRule"("action");

-- CreateIndex
CREATE INDEX "NdpiAppRule_appNdpiId_idx" ON "NdpiAppRule"("appNdpiId");

-- CreateIndex
CREATE INDEX "NdpiAppRule_enabled_idx" ON "NdpiAppRule"("enabled");

-- CreateIndex
CREATE INDEX "NdpiAppRule_priority_idx" ON "NdpiAppRule"("priority");

-- CreateIndex
CREATE INDEX "NdpiAppRule_scope_idx" ON "NdpiAppRule"("scope");

-- CreateIndex
CREATE INDEX "NdpiAppRule_targetPlanId_idx" ON "NdpiAppRule"("targetPlanId");

-- CreateIndex
CREATE INDEX "NdpiAppRule_targetSubscriberId_idx" ON "NdpiAppRule"("targetSubscriberId");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_appCategory_idx" ON "NdpiAppUsage"("appCategory");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_appNdpiId_idx" ON "NdpiAppUsage"("appNdpiId");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_ipAddress_idx" ON "NdpiAppUsage"("ipAddress");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_periodEnd_idx" ON "NdpiAppUsage"("periodEnd");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_periodStart_idx" ON "NdpiAppUsage"("periodStart");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_periodType_idx" ON "NdpiAppUsage"("periodType");

-- CreateIndex
CREATE INDEX "NdpiAppUsage_subscriberId_idx" ON "NdpiAppUsage"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "NdpiAppUsage_ipAddress_appNdpiId_periodStart_periodType_key" ON "NdpiAppUsage"("ipAddress", "appNdpiId", "periodStart", "periodType");

-- CreateIndex
CREATE INDEX "NetworkAlert_assignedToId_idx" ON "NetworkAlert"("assignedToId");

-- CreateIndex
CREATE INDEX "NetworkAlert_createdAt_idx" ON "NetworkAlert"("createdAt");

-- CreateIndex
CREATE INDEX "NetworkAlert_ruleId_deviceId_createdAt_idx" ON "NetworkAlert"("ruleId", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkAlert_severity_idx" ON "NetworkAlert"("severity");

-- CreateIndex
CREATE INDEX "NetworkAlert_status_idx" ON "NetworkAlert"("status");

-- CreateIndex
CREATE INDEX "NetworkDevice_ipAddress_idx" ON "NetworkDevice"("ipAddress");

-- CreateIndex
CREATE INDEX "NetworkDevice_status_idx" ON "NetworkDevice"("status");

-- CreateIndex
CREATE INDEX "NetworkDevice_type_idx" ON "NetworkDevice"("type");

-- CreateIndex
CREATE INDEX "NetworkDevice_vendor_idx" ON "NetworkDevice"("vendor");

-- CreateIndex
CREATE INDEX "Notification_category_idx" ON "Notification"("category");

-- CreateIndex
CREATE INDEX "Notification_status_idx" ON "Notification"("status");

-- CreateIndex
CREATE INDEX "Notification_subscriberId_idx" ON "Notification"("subscriberId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "NotificationRule_isActive_idx" ON "NotificationRule"("isActive");

-- CreateIndex
CREATE INDEX "NotificationRule_triggerEvent_idx" ON "NotificationRule"("triggerEvent");

-- CreateIndex
CREATE INDEX "OltPort_oltDeviceId_idx" ON "OltPort"("oltDeviceId");

-- CreateIndex
CREATE INDEX "OltPort_status_idx" ON "OltPort"("status");

-- CreateIndex
CREATE INDEX "OltTemplate_name_idx" ON "OltTemplate"("name");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_subscriberId_createdAt_idx" ON "Payment"("subscriberId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_subscriberId_idx" ON "Payment"("subscriberId");

-- CreateIndex
CREATE INDEX "Payment_transactionRef_idx" ON "Payment"("transactionRef");

-- CreateIndex
CREATE INDEX "PaymentPlan_invoiceId_idx" ON "PaymentPlan"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentPlan_status_idx" ON "PaymentPlan"("status");

-- CreateIndex
CREATE INDEX "PaymentPlan_subscriberId_idx" ON "PaymentPlan"("subscriberId");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_dueDate_idx" ON "PaymentPlanInstallment"("dueDate");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_paymentPlanId_idx" ON "PaymentPlanInstallment"("paymentPlanId");

-- CreateIndex
CREATE INDEX "PaymentPlanInstallment_status_idx" ON "PaymentPlanInstallment"("status");

-- CreateIndex
CREATE INDEX "Plan_category_idx" ON "Plan"("category");

-- CreateIndex
CREATE INDEX "Plan_groupId_idx" ON "Plan"("groupId");

-- CreateIndex
CREATE INDEX "Plan_sortOrder_idx" ON "Plan"("sortOrder");

-- CreateIndex
CREATE INDEX "Plan_status_idx" ON "Plan"("status");

-- CreateIndex
CREATE INDEX "PointsHistory_createdAt_idx" ON "PointsHistory"("createdAt");

-- CreateIndex
CREATE INDEX "PointsHistory_memberId_idx" ON "PointsHistory"("memberId");

-- CreateIndex
CREATE INDEX "PortStatusHistory_changedAt_idx" ON "PortStatusHistory"("changedAt");

-- CreateIndex
CREATE INDEX "PortStatusHistory_portId_idx" ON "PortStatusHistory"("portId");

-- CreateIndex
CREATE INDEX "PortalAccessRule_enabled_idx" ON "PortalAccessRule"("enabled");

-- CreateIndex
CREATE INDEX "PortalAccessRule_portalId_idx" ON "PortalAccessRule"("portalId");

-- CreateIndex
CREATE INDEX "PortalAccessRule_priority_idx" ON "PortalAccessRule"("priority");

-- CreateIndex
CREATE INDEX "PortalAdZone_enabled_idx" ON "PortalAdZone"("enabled");

-- CreateIndex
CREATE INDEX "PortalAdZone_portalId_idx" ON "PortalAdZone"("portalId");

-- CreateIndex
CREATE INDEX "PortalAdZone_position_idx" ON "PortalAdZone"("position");

-- CreateIndex
CREATE INDEX "PortalEventLog_createdAt_idx" ON "PortalEventLog"("createdAt");

-- CreateIndex
CREATE INDEX "PortalEventLog_eventType_idx" ON "PortalEventLog"("eventType");

-- CreateIndex
CREATE INDEX "PortalEventLog_macAddress_idx" ON "PortalEventLog"("macAddress");

-- CreateIndex
CREATE INDEX "PortalEventLog_portalId_idx" ON "PortalEventLog"("portalId");

-- CreateIndex
CREATE INDEX "PortalEventLog_sessionId_idx" ON "PortalEventLog"("sessionId");

-- CreateIndex
CREATE INDEX "PortalMacWhitelist_enabled_idx" ON "PortalMacWhitelist"("enabled");

-- CreateIndex
CREATE INDEX "PortalMacWhitelist_macAddress_idx" ON "PortalMacWhitelist"("macAddress");

-- CreateIndex
CREATE INDEX "PortalMacWhitelist_portalId_idx" ON "PortalMacWhitelist"("portalId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalMacWhitelist_portalId_macAddress_key" ON "PortalMacWhitelist"("portalId", "macAddress");

-- CreateIndex
CREATE INDEX "PortalSchedule_enabled_idx" ON "PortalSchedule"("enabled");

-- CreateIndex
CREATE INDEX "PortalSchedule_portalId_idx" ON "PortalSchedule"("portalId");

-- CreateIndex
CREATE INDEX "PortalSession_ipAddress_idx" ON "PortalSession"("ipAddress");

-- CreateIndex
CREATE INDEX "PortalSession_macAddress_idx" ON "PortalSession"("macAddress");

-- CreateIndex
CREATE INDEX "PortalSession_portalId_idx" ON "PortalSession"("portalId");

-- CreateIndex
CREATE INDEX "PortalSession_startTime_idx" ON "PortalSession"("startTime");

-- CreateIndex
CREATE INDEX "PortalSession_status_idx" ON "PortalSession"("status");

-- CreateIndex
CREATE INDEX "PortalSession_subscriberId_idx" ON "PortalSession"("subscriberId");

-- CreateIndex
CREATE INDEX "PortalVoucherPool_enabled_idx" ON "PortalVoucherPool"("enabled");

-- CreateIndex
CREATE INDEX "PortalVoucherPool_portalId_idx" ON "PortalVoucherPool"("portalId");

-- CreateIndex
CREATE INDEX "PortalVoucherPool_voucherPrefix_idx" ON "PortalVoucherPool"("voucherPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "PppoeProfile_name_key" ON "PppoeProfile"("name");

-- CreateIndex
CREATE INDEX "PppoeProfile_enabled_idx" ON "PppoeProfile"("enabled");

-- CreateIndex
CREATE INDEX "PppoeProfile_interfaceName_idx" ON "PppoeProfile"("interfaceName");

-- CreateIndex
CREATE INDEX "PppoeSession_ipAddress_idx" ON "PppoeSession"("ipAddress");

-- CreateIndex
CREATE INDEX "PppoeSession_profileId_idx" ON "PppoeSession"("profileId");

-- CreateIndex
CREATE INDEX "PppoeSession_startTime_idx" ON "PppoeSession"("startTime");

-- CreateIndex
CREATE INDEX "PppoeSession_status_idx" ON "PppoeSession"("status");

-- CreateIndex
CREATE INDEX "PppoeSession_username_idx" ON "PppoeSession"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_code_idx" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_status_idx" ON "Promotion"("status");

-- CreateIndex
CREATE INDEX "PromotionPlan_planId_idx" ON "PromotionPlan"("planId");

-- CreateIndex
CREATE INDEX "PromotionPlan_promotionId_idx" ON "PromotionPlan"("promotionId");

-- CreateIndex
CREATE INDEX "ProvisioningTemplate_isActive_idx" ON "ProvisioningTemplate"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orderNumber_key" ON "PurchaseOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orderDate_idx" ON "PurchaseOrder"("orderDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_vendorId_idx" ON "PurchaseOrder"("vendorId");

-- CreateIndex
CREATE INDEX "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "QosConfig_enabled_idx" ON "QosConfig"("enabled");

-- CreateIndex
CREATE INDEX "QosConfig_priority_idx" ON "QosConfig"("priority");

-- CreateIndex
CREATE INDEX "QuickReply_category_idx" ON "QuickReply"("category");

-- CreateIndex
CREATE INDEX "QuickReply_shortcut_idx" ON "QuickReply"("shortcut");

-- CreateIndex
CREATE INDEX "RadiusAccountingLog_acctStartTime_idx" ON "RadiusAccountingLog"("acctStartTime");

-- CreateIndex
CREATE INDEX "RadiusAccountingLog_createdAt_idx" ON "RadiusAccountingLog"("createdAt");

-- CreateIndex
CREATE INDEX "RadiusAccountingLog_nasIp_idx" ON "RadiusAccountingLog"("nasIp");

-- CreateIndex
CREATE INDEX "RadiusAccountingLog_username_idx" ON "RadiusAccountingLog"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusAttributeDef_name_key" ON "RadiusAttributeDef"("name");

-- CreateIndex
CREATE INDEX "RadiusAttributeDef_attrType_idx" ON "RadiusAttributeDef"("attrType");

-- CreateIndex
CREATE INDEX "RadiusAttributeDef_enabled_idx" ON "RadiusAttributeDef"("enabled");

-- CreateIndex
CREATE INDEX "RadiusAttributeDef_vendorId_idx" ON "RadiusAttributeDef"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusGroup_name_key" ON "RadiusGroup"("name");

-- CreateIndex
CREATE INDEX "RadiusGroup_priority_idx" ON "RadiusGroup"("priority");

-- CreateIndex
CREATE INDEX "RadiusPacketMapping_enabled_idx" ON "RadiusPacketMapping"("enabled");

-- CreateIndex
CREATE INDEX "RadiusPacketMapping_packetType_idx" ON "RadiusPacketMapping"("packetType");

-- CreateIndex
CREATE INDEX "RadiusPacketMapping_priority_idx" ON "RadiusPacketMapping"("priority");

-- CreateIndex
CREATE INDEX "RadiusPacketRule_mappingId_idx" ON "RadiusPacketRule"("mappingId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusProxyRealm_name_key" ON "RadiusProxyRealm"("name");

-- CreateIndex
CREATE INDEX "RadiusProxyRealm_enabled_idx" ON "RadiusProxyRealm"("enabled");

-- CreateIndex
CREATE INDEX "RadiusProxyRealm_sortOrder_idx" ON "RadiusProxyRealm"("sortOrder");

-- CreateIndex
CREATE INDEX "RadiusProxyServer_priority_idx" ON "RadiusProxyServer"("priority");

-- CreateIndex
CREATE INDEX "RadiusProxyServer_realmId_idx" ON "RadiusProxyServer"("realmId");

-- CreateIndex
CREATE INDEX "RadiusProxyServer_status_idx" ON "RadiusProxyServer"("status");

-- CreateIndex
CREATE INDEX "RadiusSession_nasIp_idx" ON "RadiusSession"("nasIp");

-- CreateIndex
CREATE INDEX "RadiusSession_radiusUserId_idx" ON "RadiusSession"("radiusUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RadiusUser_subscriberId_key" ON "RadiusUser"("subscriberId");

-- CreateIndex
CREATE INDEX "RadiusUser_subscriberId_idx" ON "RadiusUser"("subscriberId");

-- CreateIndex
CREATE INDEX "RecoveryEscalation_invoiceId_idx" ON "RecoveryEscalation"("invoiceId");

-- CreateIndex
CREATE INDEX "RecoveryEscalation_level_idx" ON "RecoveryEscalation"("level");

-- CreateIndex
CREATE INDEX "RecoveryEscalation_subscriberId_idx" ON "RecoveryEscalation"("subscriberId");

-- CreateIndex
CREATE INDEX "RecoverySla_invoiceId_idx" ON "RecoverySla"("invoiceId");

-- CreateIndex
CREATE INDEX "RecoverySla_status_idx" ON "RecoverySla"("status");

-- CreateIndex
CREATE INDEX "RecoverySla_subscriberId_idx" ON "RecoverySla"("subscriberId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceTemplate_areaId_idx" ON "RecurringInvoiceTemplate"("areaId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceTemplate_nextGenerateAt_idx" ON "RecurringInvoiceTemplate"("nextGenerateAt");

-- CreateIndex
CREATE INDEX "RecurringInvoiceTemplate_planId_idx" ON "RecurringInvoiceTemplate"("planId");

-- CreateIndex
CREATE INDEX "RecurringInvoiceTemplate_status_idx" ON "RecurringInvoiceTemplate"("status");

-- CreateIndex
CREATE INDEX "RecurringInvoiceTemplate_subscriberId_idx" ON "RecurringInvoiceTemplate"("subscriberId");

-- CreateIndex
CREATE INDEX "ReferralCampaign_endDate_idx" ON "ReferralCampaign"("endDate");

-- CreateIndex
CREATE INDEX "ReferralCampaign_startDate_idx" ON "ReferralCampaign"("startDate");

-- CreateIndex
CREATE INDEX "ReferralCampaign_status_idx" ON "ReferralCampaign"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_subscriberId_key" ON "ReferralCode"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_code_idx" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_status_idx" ON "ReferralCode"("status");

-- CreateIndex
CREATE INDEX "ReferralEnrollment_campaignId_idx" ON "ReferralEnrollment"("campaignId");

-- CreateIndex
CREATE INDEX "ReferralEnrollment_status_idx" ON "ReferralEnrollment"("status");

-- CreateIndex
CREATE INDEX "ReferralEnrollment_subscriberId_idx" ON "ReferralEnrollment"("subscriberId");

-- CreateIndex
CREATE INDEX "ReferralTracking_refereeId_idx" ON "ReferralTracking"("refereeId");

-- CreateIndex
CREATE INDEX "ReferralTracking_referrerId_idx" ON "ReferralTracking"("referrerId");

-- CreateIndex
CREATE INDEX "ReferralTracking_status_idx" ON "ReferralTracking"("status");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "RepairRecord_createdAt_idx" ON "RepairRecord"("createdAt");

-- CreateIndex
CREATE INDEX "RepairRecord_equipmentId_idx" ON "RepairRecord"("equipmentId");

-- CreateIndex
CREATE INDEX "RepairRecord_status_idx" ON "RepairRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Reseller_code_key" ON "Reseller"("code");

-- CreateIndex
CREATE INDEX "Reseller_parentId_idx" ON "Reseller"("parentId");

-- CreateIndex
CREATE INDEX "Reseller_phone_idx" ON "Reseller"("phone");

-- CreateIndex
CREATE INDEX "Reseller_status_idx" ON "Reseller"("status");

-- CreateIndex
CREATE INDEX "ResellerCommissionPayout_period_idx" ON "ResellerCommissionPayout"("period");

-- CreateIndex
CREATE INDEX "ResellerCommissionPayout_resellerId_idx" ON "ResellerCommissionPayout"("resellerId");

-- CreateIndex
CREATE INDEX "ResellerCommissionPayout_status_idx" ON "ResellerCommissionPayout"("status");

-- CreateIndex
CREATE INDEX "Reward_enabled_idx" ON "Reward"("enabled");

-- CreateIndex
CREATE INDEX "RewardRedemption_memberId_idx" ON "RewardRedemption"("memberId");

-- CreateIndex
CREATE INDEX "RewardRedemption_rewardId_idx" ON "RewardRedemption"("rewardId");

-- CreateIndex
CREATE INDEX "RewardRedemption_status_idx" ON "RewardRedemption"("status");

-- CreateIndex
CREATE INDEX "ScheduledMessage_recipientId_idx" ON "ScheduledMessage"("recipientId");

-- CreateIndex
CREATE INDEX "ScheduledMessage_scheduledAt_idx" ON "ScheduledMessage"("scheduledAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_idx" ON "ScheduledMessage"("status");

-- CreateIndex
CREATE INDEX "SecurityProfile_enabled_idx" ON "SecurityProfile"("enabled");

-- CreateIndex
CREATE INDEX "SecurityProfile_interfaceId_idx" ON "SecurityProfile"("interfaceId");

-- CreateIndex
CREATE INDEX "SessionEvent_authResult_idx" ON "SessionEvent"("authResult");

-- CreateIndex
CREATE INDEX "SessionEvent_createdAt_idx" ON "SessionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_eventType_createdAt_idx" ON "SessionEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SessionEvent_eventType_idx" ON "SessionEvent"("eventType");

-- CreateIndex
CREATE INDEX "SessionEvent_nasSessionId_idx" ON "SessionEvent"("nasSessionId");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_idx" ON "SessionEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SessionEvent_subscriberId_idx" ON "SessionEvent"("subscriberId");

-- CreateIndex
CREATE INDEX "SessionEvent_username_idx" ON "SessionEvent"("username");

-- CreateIndex
CREATE INDEX "SmtpProfile_isDefault_idx" ON "SmtpProfile"("isDefault");

-- CreateIndex
CREATE INDEX "Splitter_oltId_idx" ON "Splitter"("oltId");

-- CreateIndex
CREATE INDEX "Splitter_portId_idx" ON "Splitter"("portId");

-- CreateIndex
CREATE INDEX "Splitter_status_idx" ON "Splitter"("status");

-- CreateIndex
CREATE INDEX "StockAdjustment_createdAt_idx" ON "StockAdjustment"("createdAt");

-- CreateIndex
CREATE INDEX "StockAdjustment_equipmentId_idx" ON "StockAdjustment"("equipmentId");

-- CreateIndex
CREATE INDEX "StockTransfer_createdAt_idx" ON "StockTransfer"("createdAt");

-- CreateIndex
CREATE INDEX "StockTransfer_equipmentId_idx" ON "StockTransfer"("equipmentId");

-- CreateIndex
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");

-- CreateIndex
CREATE INDEX "Subnet_allocationStrategy_idx" ON "Subnet"("allocationStrategy");

-- CreateIndex
CREATE INDEX "Subnet_areaId_idx" ON "Subnet"("areaId");

-- CreateIndex
CREATE INDEX "Subnet_captivePortalId_idx" ON "Subnet"("captivePortalId");

-- CreateIndex
CREATE INDEX "Subnet_cgnatPoolId_idx" ON "Subnet"("cgnatPoolId");

-- CreateIndex
CREATE INDEX "Subnet_cidr_idx" ON "Subnet"("cidr");

-- CreateIndex
CREATE INDEX "Subnet_parentId_idx" ON "Subnet"("parentId");

-- CreateIndex
CREATE INDEX "Subnet_tcEnabled_idx" ON "Subnet"("tcEnabled");

-- CreateIndex
CREATE INDEX "Subnet_tcSubnetIndex_idx" ON "Subnet"("tcSubnetIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_code_key" ON "Subscriber"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_serviceUsername_key" ON "Subscriber"("serviceUsername");

-- CreateIndex
CREATE INDEX "Subscriber_areaId_idx" ON "Subscriber"("areaId");

-- CreateIndex
CREATE INDEX "Subscriber_areaId_status_idx" ON "Subscriber"("areaId", "status");

-- CreateIndex
CREATE INDEX "Subscriber_code_idx" ON "Subscriber"("code");

-- CreateIndex
CREATE INDEX "Subscriber_macAddress_idx" ON "Subscriber"("macAddress");

-- CreateIndex
CREATE INDEX "Subscriber_phone_idx" ON "Subscriber"("phone");

-- CreateIndex
CREATE INDEX "Subscriber_planId_idx" ON "Subscriber"("planId");

-- CreateIndex
CREATE INDEX "Subscriber_planId_status_idx" ON "Subscriber"("planId", "status");

-- CreateIndex
CREATE INDEX "Subscriber_radiusGroupId_idx" ON "Subscriber"("radiusGroupId");

-- CreateIndex
CREATE INDEX "Subscriber_serviceUsername_idx" ON "Subscriber"("serviceUsername");

-- CreateIndex
CREATE INDEX "Subscriber_status_createdAt_idx" ON "Subscriber"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Subscriber_status_idx" ON "Subscriber"("status");

-- CreateIndex
CREATE INDEX "SubscriberAddOn_addOnServiceId_idx" ON "SubscriberAddOn"("addOnServiceId");

-- CreateIndex
CREATE INDEX "SubscriberAddOn_status_idx" ON "SubscriberAddOn"("status");

-- CreateIndex
CREATE INDEX "SubscriberAddOn_subscriberId_idx" ON "SubscriberAddOn"("subscriberId");

-- CreateIndex
CREATE INDEX "SubscriberChargeOverride_status_idx" ON "SubscriberChargeOverride"("status");

-- CreateIndex
CREATE INDEX "SubscriberChargeOverride_subscriberId_idx" ON "SubscriberChargeOverride"("subscriberId");

-- CreateIndex
CREATE INDEX "SubscriberChargeOverride_validFrom_idx" ON "SubscriberChargeOverride"("validFrom");

-- CreateIndex
CREATE INDEX "SubscriberGracePeriod_status_idx" ON "SubscriberGracePeriod"("status");

-- CreateIndex
CREATE INDEX "SubscriberGracePeriod_subscriberId_idx" ON "SubscriberGracePeriod"("subscriberId");

-- CreateIndex
CREATE INDEX "SubscriberTimeAccess_subscriberId_idx" ON "SubscriberTimeAccess"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriberTimeAccess_subscriberId_timeAccessPolicyId_key" ON "SubscriberTimeAccess"("subscriberId", "timeAccessPolicyId");

-- CreateIndex
CREATE INDEX "SubscriberTopUp_expiresAt_idx" ON "SubscriberTopUp"("expiresAt");

-- CreateIndex
CREATE INDEX "SubscriberTopUp_status_idx" ON "SubscriberTopUp"("status");

-- CreateIndex
CREATE INDEX "SubscriberTopUp_subscriberId_idx" ON "SubscriberTopUp"("subscriberId");

-- CreateIndex
CREATE INDEX "SyslogConfig_enabled_idx" ON "SyslogConfig"("enabled");

-- CreateIndex
CREATE INDEX "SyslogMessage_facility_idx" ON "SyslogMessage"("facility");

-- CreateIndex
CREATE INDEX "SyslogMessage_hostname_idx" ON "SyslogMessage"("hostname");

-- CreateIndex
CREATE INDEX "SyslogMessage_severity_idx" ON "SyslogMessage"("severity");

-- CreateIndex
CREATE INDEX "SyslogMessage_source_idx" ON "SyslogMessage"("source");

-- CreateIndex
CREATE INDEX "SyslogMessage_timestamp_idx" ON "SyslogMessage"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "SystemInterface_name_key" ON "SystemInterface"("name");

-- CreateIndex
CREATE INDEX "SystemInterface_enabled_idx" ON "SystemInterface"("enabled");

-- CreateIndex
CREATE INDEX "SystemInterface_role_idx" ON "SystemInterface"("role");

-- CreateIndex
CREATE INDEX "SystemInterface_type_idx" ON "SystemInterface"("type");

-- CreateIndex
CREATE INDEX "TcClassMapping_ipAddress_idx" ON "TcClassMapping"("ipAddress");

-- CreateIndex
CREATE INDEX "TcClassMapping_isActive_idx" ON "TcClassMapping"("isActive");

-- CreateIndex
CREATE INDEX "TcClassMapping_subnetId_idx" ON "TcClassMapping"("subnetId");

-- CreateIndex
CREATE INDEX "TcClassMapping_subscriberId_idx" ON "TcClassMapping"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "TcClassMapping_subscriberId_subnetId_direction_key" ON "TcClassMapping"("subscriberId", "subnetId", "direction");

-- CreateIndex
CREATE INDEX "TdsEntry_depositedDate_idx" ON "TdsEntry"("depositedDate");

-- CreateIndex
CREATE INDEX "TdsEntry_period_idx" ON "TdsEntry"("period");

-- CreateIndex
CREATE INDEX "TdsEntry_status_idx" ON "TdsEntry"("status");

-- CreateIndex
CREATE INDEX "TdsEntry_type_idx" ON "TdsEntry"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Technician_userId_key" ON "Technician"("userId");

-- CreateIndex
CREATE INDEX "Technician_status_idx" ON "Technician"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TimeAccessPolicy_name_key" ON "TimeAccessPolicy"("name");

-- CreateIndex
CREATE INDEX "TimeAccessPolicy_enabled_idx" ON "TimeAccessPolicy"("enabled");

-- CreateIndex
CREATE INDEX "TopUpProduct_isActive_idx" ON "TopUpProduct"("isActive");

-- CreateIndex
CREATE INDEX "TopUpProduct_type_idx" ON "TopUpProduct"("type");

-- CreateIndex
CREATE INDEX "UptimeCheck_createdAt_idx" ON "UptimeCheck"("createdAt");

-- CreateIndex
CREATE INDEX "UptimeCheck_status_idx" ON "UptimeCheck"("status");

-- CreateIndex
CREATE INDEX "UptimeCheck_targetId_idx" ON "UptimeCheck"("targetId");

-- CreateIndex
CREATE INDEX "UptimeTarget_paused_idx" ON "UptimeTarget"("paused");

-- CreateIndex
CREATE INDEX "UptimeTarget_type_idx" ON "UptimeTarget"("type");

-- CreateIndex
CREATE INDEX "UsageLog_subscriberId_idx" ON "UsageLog"("subscriberId");

-- CreateIndex
CREATE INDEX "UsageLog_subscriberId_timestamp_idx" ON "UsageLog"("subscriberId", "timestamp");

-- CreateIndex
CREATE INDEX "UsageLog_timestamp_idx" ON "UsageLog"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "UserActionHistory_actionType_idx" ON "UserActionHistory"("actionType");

-- CreateIndex
CREATE INDEX "UserActionHistory_createdAt_idx" ON "UserActionHistory"("createdAt");

-- CreateIndex
CREATE INDEX "UserActionHistory_entityType_entityId_idx" ON "UserActionHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "UserActionHistory_subscriberId_idx" ON "UserActionHistory"("subscriberId");

-- CreateIndex
CREATE INDEX "UserBillingCycle_cycleStartDate_idx" ON "UserBillingCycle"("cycleStartDate");

-- CreateIndex
CREATE INDEX "UserBillingCycle_status_idx" ON "UserBillingCycle"("status");

-- CreateIndex
CREATE INDEX "UserBillingCycle_subscriberId_idx" ON "UserBillingCycle"("subscriberId");

-- CreateIndex
CREATE INDEX "UserRadiusAttribute_attributeDefId_idx" ON "UserRadiusAttribute"("attributeDefId");

-- CreateIndex
CREATE INDEX "UserRadiusAttribute_subscriberId_idx" ON "UserRadiusAttribute"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRadiusAttribute_subscriberId_attributeDefId_key" ON "UserRadiusAttribute"("subscriberId", "attributeDefId");

-- CreateIndex
CREATE INDEX "UserSession_loginAt_idx" ON "UserSession"("loginAt");

-- CreateIndex
CREATE INDEX "UserSession_status_idx" ON "UserSession"("status");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserWidgetConfig_userId_idx" ON "UserWidgetConfig"("userId");

-- CreateIndex
CREATE INDEX "UserWidgetConfig_widgetId_idx" ON "UserWidgetConfig"("widgetId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWidgetConfig_userId_widgetId_key" ON "UserWidgetConfig"("userId", "widgetId");

-- CreateIndex
CREATE INDEX "Vendor_category_idx" ON "Vendor"("category");

-- CreateIndex
CREATE INDEX "Vendor_name_idx" ON "Vendor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Vlan_vlanId_key" ON "Vlan"("vlanId");

-- CreateIndex
CREATE INDEX "Vlan_vlanId_idx" ON "Vlan"("vlanId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_code_key" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Voucher_code_idx" ON "Voucher"("code");

-- CreateIndex
CREATE INDEX "Voucher_status_idx" ON "Voucher"("status");

-- CreateIndex
CREATE INDEX "VoucherTemplate_isActive_idx" ON "VoucherTemplate"("isActive");

-- CreateIndex
CREATE INDEX "WanEvent_action_idx" ON "WanEvent"("action");

-- CreateIndex
CREATE INDEX "WanEvent_createdAt_idx" ON "WanEvent"("createdAt");

-- CreateIndex
CREATE INDEX "WanEvent_wanName_idx" ON "WanEvent"("wanName");

-- CreateIndex
CREATE INDEX "WanLink_status_idx" ON "WanLink"("status");

-- CreateIndex
CREATE INDEX "Warehouse_status_idx" ON "Warehouse"("status");

-- CreateIndex
CREATE INDEX "Webhook_createdAt_idx" ON "Webhook"("createdAt");

-- CreateIndex
CREATE INDEX "Webhook_enabled_idx" ON "Webhook"("enabled");

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_approvalStatus_idx" ON "WhatsAppTemplate"("approvalStatus");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_category_idx" ON "WhatsAppTemplate"("category");

-- CreateIndex
CREATE INDEX "WhatsAppTemplate_status_idx" ON "WhatsAppTemplate"("status");

-- CreateIndex
CREATE INDEX "WinLossAnalysis_competitorId_idx" ON "WinLossAnalysis"("competitorId");

-- CreateIndex
CREATE INDEX "WinLossAnalysis_createdAt_idx" ON "WinLossAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "WinLossAnalysis_result_idx" ON "WinLossAnalysis"("result");

-- CreateIndex
CREATE INDEX "WinLossAnalysis_subscriberId_idx" ON "WinLossAnalysis"("subscriberId");

-- CreateIndex
CREATE INDEX "nas_nasname" ON "nas"("nasname");

-- CreateIndex
CREATE UNIQUE INDEX "radacct_acctuniqueid_key" ON "radacct"("acctuniqueid");

-- CreateIndex
CREATE INDEX "radacct_calss_idx" ON "radacct"("class");

-- CreateIndex
CREATE INDEX "radacct_start_user_idx" ON "radacct"("acctstarttime", "username");

-- CreateIndex
CREATE INDEX "radcheck_username" ON "radcheck"("username", "attribute");

-- CreateIndex
CREATE INDEX "radgroupcheck_groupname" ON "radgroupcheck"("groupname", "attribute");

-- CreateIndex
CREATE INDEX "radgroupreply_groupname" ON "radgroupreply"("groupname", "attribute");

-- CreateIndex
CREATE UNIQUE INDEX "radius_daily_stats_stat_date_key" ON "radius_daily_stats"("stat_date");

-- CreateIndex
CREATE INDEX "rad_daily_stats_date" ON "radius_daily_stats"("stat_date");

-- CreateIndex
CREATE INDEX "rad_prov_log_created" ON "radius_provisioning_log"("created_at");

-- CreateIndex
CREATE INDEX "rad_prov_log_username" ON "radius_provisioning_log"("username");

-- CreateIndex
CREATE INDEX "radpostauth_class_idx" ON "radpostauth"("class");

-- CreateIndex
CREATE INDEX "radpostauth_username_idx" ON "radpostauth"("username");

-- CreateIndex
CREATE INDEX "radreply_username" ON "radreply"("username", "attribute");

-- CreateIndex
CREATE INDEX "radusergroup_username" ON "radusergroup"("username");

-- CreateIndex
CREATE INDEX "wifi_offload_events_createdAt_idx" ON "wifi_offload_events"("createdAt");

-- CreateIndex
CREATE INDEX "wifi_offload_events_eventType_idx" ON "wifi_offload_events"("eventType");

-- CreateIndex
CREATE INDEX "wifi_offload_events_interfaceType_idx" ON "wifi_offload_events"("interfaceType");

-- CreateIndex
CREATE INDEX "wifi_offload_events_sessionId_idx" ON "wifi_offload_events"("sessionId");

-- CreateIndex
CREATE INDEX "wifi_offload_peers_peerType_idx" ON "wifi_offload_peers"("peerType");

-- CreateIndex
CREATE INDEX "wifi_offload_peers_status_idx" ON "wifi_offload_peers"("status");

-- CreateIndex
CREATE INDEX "wifi_offload_policies_imsiPrefix_idx" ON "wifi_offload_policies"("imsiPrefix");

-- CreateIndex
CREATE INDEX "wifi_offload_policies_isActive_idx" ON "wifi_offload_policies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "wifi_offload_sessions_sessionId_key" ON "wifi_offload_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "wifi_offload_sessions_imsi_idx" ON "wifi_offload_sessions"("imsi");

-- CreateIndex
CREATE INDEX "wifi_offload_sessions_startTime_idx" ON "wifi_offload_sessions"("startTime");

-- CreateIndex
CREATE INDEX "wifi_offload_sessions_status_idx" ON "wifi_offload_sessions"("status");

-- CreateIndex
CREATE INDEX "_PromoUsage_B_index" ON "_PromoUsage"("B");

-- AddForeignKey
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "NetworkAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertComment" ADD CONSTRAINT "AlertComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertSuppression" ADD CONSTRAINT "AlertSuppression_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "CollectionAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaBudgetLimit" ADD CONSTRAINT "AreaBudgetLimit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandwidthLog" ADD CONSTRAINT "BandwidthLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BandwidthThrottleConfig" ADD CONSTRAINT "BandwidthThrottleConfig_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchProvisioningJob" ADD CONSTRAINT "BatchProvisioningJob_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProvisioningTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchProvisioningJob" ADD CONSTRAINT "BatchProvisioningJob_startedBy_fkey" FOREIGN KEY ("startedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptivePortal" ADD CONSTRAINT "CaptivePortal_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "SystemInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptivePortal" ADD CONSTRAINT "CaptivePortal_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptivePortal" ADD CONSTRAINT "CaptivePortal_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "CollectionAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CgnatMapping" ADD CONSTRAINT "CgnatMapping_cgnatPoolId_fkey" FOREIGN KEY ("cgnatPoolId") REFERENCES "CgnatPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoaEvent" ADD CONSTRAINT "CoaEvent_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionAgent" ADD CONSTRAINT "CollectionAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Technician"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintComment" ADD CONSTRAINT "ComplaintComment_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintComment" ADD CONSTRAINT "ComplaintComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataUsage" ADD CONSTRAINT "DataUsage_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceConfigHistory" ADD CONSTRAINT "DeviceConfigHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceInterface" ADD CONSTRAINT "DeviceInterface_connectedDeviceId_fkey" FOREIGN KEY ("connectedDeviceId") REFERENCES "NetworkDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceInterface" ADD CONSTRAINT "DeviceInterface_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhcpReservation" ADD CONSTRAINT "DhcpReservation_dhcpSubnetId_fkey" FOREIGN KEY ("dhcpSubnetId") REFERENCES "DhcpSubnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhcpSubnet" ADD CONSTRAINT "DhcpSubnet_captivePortalId_fkey" FOREIGN KEY ("captivePortalId") REFERENCES "CaptivePortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhcpV6Pool" ADD CONSTRAINT "DhcpV6Pool_dhcpV6SubnetId_fkey" FOREIGN KEY ("dhcpV6SubnetId") REFERENCES "DhcpV6Subnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhcpV6PrefixDelegation" ADD CONSTRAINT "DhcpV6PrefixDelegation_dhcpV6SubnetId_fkey" FOREIGN KEY ("dhcpV6SubnetId") REFERENCES "DhcpV6Subnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DhcpV6Reservation" ADD CONSTRAINT "DhcpV6Reservation_dhcpV6SubnetId_fkey" FOREIGN KEY ("dhcpV6SubnetId") REFERENCES "DhcpV6Subnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_captivePortalId_fkey" FOREIGN KEY ("captivePortalId") REFERENCES "CaptivePortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DnsRecord" ADD CONSTRAINT "DnsRecord_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "SystemInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSession" ADD CONSTRAINT "EnterpriseSession_enterpriseUserId_fkey" FOREIGN KEY ("enterpriseUserId") REFERENCES "EnterpriseUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSession" ADD CONSTRAINT "EnterpriseSession_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "EnterpriseSubscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseSubscriber" ADD CONSTRAINT "EnterpriseSubscriber_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseUser" ADD CONSTRAINT "EnterpriseUser_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "EnterpriseSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_assignedSubscriberId_fkey" FOREIGN KEY ("assignedSubscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentInspection" ADD CONSTRAINT "EquipmentInspection_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentRepair" ADD CONSTRAINT "EquipmentRepair_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentReturn" ADD CONSTRAINT "EquipmentReturn_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirewallRule" ADD CONSTRAINT "FirewallRule_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "SystemInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedLegalNotice" ADD CONSTRAINT "GeneratedLegalNotice_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedLegalNotice" ADD CONSTRAINT "GeneratedLegalNotice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedLegalNotice" ADD CONSTRAINT "GeneratedLegalNotice_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentUpdate" ADD CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationTransaction" ADD CONSTRAINT "IntegrationTransaction_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "IntegrationConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringInvoiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpAddress" ADD CONSTRAINT "IpAddress_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpMacHistory" ADD CONSTRAINT "IpMacHistory_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpsAlert" ADD CONSTRAINT "IpsAlert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "IpsDetectionRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpsAlert" ADD CONSTRAINT "IpsAlert_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpsBlockRule" ADD CONSTRAINT "IpsBlockRule_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbArticle" ADD CONSTRAINT "KbArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KbCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbArticleVersion" ADD CONSTRAINT "KbArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "KbArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KbCategory" ADD CONSTRAINT "KbCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KbCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LdapConfig" ADD CONSTRAINT "LdapConfig_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "EnterpriseSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCommunication" ADD CONSTRAINT "LeadCommunication_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRecord" ADD CONSTRAINT "LeaveRecord_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "Technician"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyMember" ADD CONSTRAINT "LoyaltyMember_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NasClientConfig" ADD CONSTRAINT "NasClientConfig_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NasSession" ADD CONSTRAINT "NasSession_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NdpiAppRule" ADD CONSTRAINT "NdpiAppRule_appNdpiId_fkey" FOREIGN KEY ("appNdpiId") REFERENCES "NdpiApp"("ndpiId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkAlert" ADD CONSTRAINT "NetworkAlert_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkAlert" ADD CONSTRAINT "NetworkAlert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkDevice" ADD CONSTRAINT "NetworkDevice_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkDevice" ADD CONSTRAINT "NetworkDevice_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NetworkDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OltPort" ADD CONSTRAINT "OltPort_oltDeviceId_fkey" FOREIGN KEY ("oltDeviceId") REFERENCES "NetworkDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlanInstallment" ADD CONSTRAINT "PaymentPlanInstallment_paymentPlanId_fkey" FOREIGN KEY ("paymentPlanId") REFERENCES "PaymentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "RadiusGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsHistory" ADD CONSTRAINT "PointsHistory_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LoyaltyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAccessRule" ADD CONSTRAINT "PortalAccessRule_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalAdZone" ADD CONSTRAINT "PortalAdZone_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalEventLog" ADD CONSTRAINT "PortalEventLog_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalMacWhitelist" ADD CONSTRAINT "PortalMacWhitelist_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSchedule" ADD CONSTRAINT "PortalSchedule_overridePortalId_fkey" FOREIGN KEY ("overridePortalId") REFERENCES "CaptivePortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSchedule" ADD CONSTRAINT "PortalSchedule_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalSession" ADD CONSTRAINT "PortalSession_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalVoucherPool" ADD CONSTRAINT "PortalVoucherPool_portalId_fkey" FOREIGN KEY ("portalId") REFERENCES "CaptivePortal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PppoeSession" ADD CONSTRAINT "PppoeSession_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PppoeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPlan" ADD CONSTRAINT "PromotionPlan_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPlan" ADD CONSTRAINT "PromotionPlan_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTemplate" ADD CONSTRAINT "ProvisioningTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvisioningTemplate" ADD CONSTRAINT "ProvisioningTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QosConfig" ADD CONSTRAINT "QosConfig_targetPlanId_fkey" FOREIGN KEY ("targetPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusPacketRule" ADD CONSTRAINT "RadiusPacketRule_mappingId_fkey" FOREIGN KEY ("mappingId") REFERENCES "RadiusPacketMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusProxyServer" ADD CONSTRAINT "RadiusProxyServer_realmId_fkey" FOREIGN KEY ("realmId") REFERENCES "RadiusProxyRealm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusSession" ADD CONSTRAINT "RadiusSession_radiusUserId_fkey" FOREIGN KEY ("radiusUserId") REFERENCES "RadiusUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiusUser" ADD CONSTRAINT "RadiusUser_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEscalation" ADD CONSTRAINT "RecoveryEscalation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEscalation" ADD CONSTRAINT "RecoveryEscalation_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryEscalation" ADD CONSTRAINT "RecoveryEscalation_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySla" ADD CONSTRAINT "RecoverySla_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySla" ADD CONSTRAINT "RecoverySla_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceTemplate" ADD CONSTRAINT "RecurringInvoiceTemplate_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceTemplate" ADD CONSTRAINT "RecurringInvoiceTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringInvoiceTemplate" ADD CONSTRAINT "RecurringInvoiceTemplate_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralTracking" ADD CONSTRAINT "ReferralTracking_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralTracking" ADD CONSTRAINT "ReferralTracking_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Subscriber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRecord" ADD CONSTRAINT "RepairRecord_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reseller" ADD CONSTRAINT "Reseller_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Reseller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommissionPayout" ADD CONSTRAINT "ResellerCommissionPayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "Reseller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LoyaltyMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardRedemption" ADD CONSTRAINT "RewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "Reward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityProfile" ADD CONSTRAINT "SecurityProfile_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "SystemInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_nasSessionId_fkey" FOREIGN KEY ("nasSessionId") REFERENCES "NasSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subnet" ADD CONSTRAINT "Subnet_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subnet" ADD CONSTRAINT "Subnet_captivePortalId_fkey" FOREIGN KEY ("captivePortalId") REFERENCES "CaptivePortal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subnet" ADD CONSTRAINT "Subnet_cgnatPoolId_fkey" FOREIGN KEY ("cgnatPoolId") REFERENCES "CgnatPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subnet" ADD CONSTRAINT "Subnet_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Subnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subnet" ADD CONSTRAINT "Subnet_vlanId_fkey" FOREIGN KEY ("vlanId") REFERENCES "Vlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_assignedDeviceId_fkey" FOREIGN KEY ("assignedDeviceId") REFERENCES "NetworkDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_radiusGroupId_fkey" FOREIGN KEY ("radiusGroupId") REFERENCES "RadiusGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberAddOn" ADD CONSTRAINT "SubscriberAddOn_addOnServiceId_fkey" FOREIGN KEY ("addOnServiceId") REFERENCES "AddOnService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberAddOn" ADD CONSTRAINT "SubscriberAddOn_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberChargeOverride" ADD CONSTRAINT "SubscriberChargeOverride_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberGracePeriod" ADD CONSTRAINT "SubscriberGracePeriod_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTimeAccess" ADD CONSTRAINT "SubscriberTimeAccess_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTimeAccess" ADD CONSTRAINT "SubscriberTimeAccess_timeAccessPolicyId_fkey" FOREIGN KEY ("timeAccessPolicyId") REFERENCES "TimeAccessPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTopUp" ADD CONSTRAINT "SubscriberTopUp_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriberTopUp" ADD CONSTRAINT "SubscriberTopUp_topUpProductId_fkey" FOREIGN KEY ("topUpProductId") REFERENCES "TopUpProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemInterface" ADD CONSTRAINT "SystemInterface_parentInterfaceId_fkey" FOREIGN KEY ("parentInterfaceId") REFERENCES "SystemInterface"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TcClassMapping" ADD CONSTRAINT "TcClassMapping_subnetId_fkey" FOREIGN KEY ("subnetId") REFERENCES "Subnet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsEntry" ADD CONSTRAINT "TdsEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsEntry" ADD CONSTRAINT "TdsEntry_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Technician" ADD CONSTRAINT "Technician_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UptimeCheck" ADD CONSTRAINT "UptimeCheck_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "UptimeTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActionHistory" ADD CONSTRAINT "UserActionHistory_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBillingCycle" ADD CONSTRAINT "UserBillingCycle_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRadiusAttribute" ADD CONSTRAINT "UserRadiusAttribute_attributeDefId_fkey" FOREIGN KEY ("attributeDefId") REFERENCES "RadiusAttributeDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRadiusAttribute" ADD CONSTRAINT "UserRadiusAttribute_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWidgetConfig" ADD CONSTRAINT "UserWidgetConfig_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "DashboardWidget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_usedBySubscriberId_fkey" FOREIGN KEY ("usedBySubscriberId") REFERENCES "Subscriber"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromoUsage" ADD CONSTRAINT "_PromoUsage_A_fkey" FOREIGN KEY ("A") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PromoUsage" ADD CONSTRAINT "_PromoUsage_B_fkey" FOREIGN KEY ("B") REFERENCES "Subscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

