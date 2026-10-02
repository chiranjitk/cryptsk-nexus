'use client';

import React from 'react';

// Network / AAA
import AaaGroupsPage from '@/components/pages/aaa-groups-page';
import AaaRadiusPage from '@/components/pages/aaa-radius-page';
import AaaSessionsPage from '@/components/pages/aaa-sessions-page';
import AaaUsersPage from '@/components/pages/aaa-users-page';

// Network / Core
import AuthLogPage from '@/components/pages/auth-log-page';
import BatchProvisioningPage from '@/components/pages/batch-provisioning-page';
import CaptivePortalPage from '@/components/pages/captive-portal-page';
import DhcpPage from '@/components/pages/dhcp-page';
import Dhcpv6Page from '@/components/pages/dhcpv6-page';
import DnsPage from '@/components/pages/dns-page';
import DynamicRoutingPage from '@/components/pages/dynamic-routing-page';
import FtthGponPage from '@/components/pages/ftth-gpon-page';
import InterfacesPage from '@/components/pages/interfaces-page';
import IpamPage from '@/components/pages/ipam-page';
import IpamCgnatTab from '@/components/pages/ipam-cgnat-tab';
import MikrotikManagerPage from '@/components/pages/mikrotik-manager-page';
import MultiwanPage from '@/components/pages/multiwan-page';
import NasClientsPage from '@/components/pages/nas-clients-page';
import PppoeServerPage from '@/components/pages/pppoe-server-page';
import SessionEnginePage from '@/components/pages/session-engine-page';
import SessionHistoryPage from '@/components/pages/session-history-page';
import SessionsPage from '@/components/pages/sessions-page';
import SshDeviceManagerPage from '@/components/pages/ssh-device-manager-page';
import Tr069AcsPage from '@/components/pages/tr069-acs-page';
import VpnServerPage from '@/components/pages/vpn-server-page';
import WifiOffloadPage from '@/components/pages/wifi-offload-page';

// Network / QoS & Bandwidth
import BandwidthMgmtPage from '@/components/pages/bandwidth-mgmt-page';
import BandwidthPage from '@/components/pages/bandwidth-page';
import QosMonitorPage from '@/components/pages/qos-monitor-page';
import TimeAccessPage from '@/components/pages/time-access-page';

// Network / Security
import DdosProtectionPage from '@/components/pages/ddos-protection-page';
import FirewallPage from '@/components/pages/firewall-page';
import IpsPage from '@/components/pages/ips-page';
import SecurityPage from '@/components/pages/security-page';

// Network / Monitoring
import AppAwarenessPage from '@/components/pages/app-awareness-page';
import BwReportsPage from '@/components/pages/bw-reports-page';
import DiagnosticToolsPage from '@/components/pages/diagnostic-tools-page';
import GrafanaDashboardsPage from '@/components/pages/grafana-dashboards-page';
import IpMacHistoryPage from '@/components/pages/ip-mac-history-page';
import LatencyMonitorPage from '@/components/pages/latency-monitor-page';
import NatLogsPage from '@/components/pages/nat-logs-page';
import NetworkAlertsPage from '@/components/pages/network-alerts-page';
import NetworkHealthEnhancedPage from '@/components/pages/network-health-enhanced-page';
import SnmpManagerPage from '@/components/pages/snmp-manager-page';
import SpeedTestPage from '@/components/pages/speed-test-page';
import SyslogServerPage from '@/components/pages/syslog-server-page';
import TrafficAnalyticsPage from '@/components/pages/traffic-analytics-page';
import UptimeMonitorPage from '@/components/pages/uptime-monitor-page';

// Subscriber Management
import DevicesPage from '@/components/pages/devices-page';
import PlansPage from '@/components/pages/plans-page';
import PlanRecommendationPage from '@/components/pages/plan-recommendation-page';
import Subscriber360Page from '@/components/pages/subscriber-360-page';
import SubscribersPage from '@/components/pages/subscribers-page';

// RADIUS & Auth
import EnterpriseAuthPage from '@/components/pages/enterprise-auth-page';
import RadiusAttributesPage from '@/components/pages/radius-attributes-page';
import RadiusProxyPage from '@/components/pages/radius-proxy-page';
import CoaEventsPage from '@/components/pages/coa-events-page';

// CRM
import ComplaintsPage from '@/components/pages/complaints-page';
import IncidentsPage from '@/components/pages/incidents-page';
import LeadsPage from '@/components/pages/leads-page';
import TechniciansPage from '@/components/pages/technicians-page';

// Field Service
import InstallationsPage from '@/components/pages/installations-page';
import InventoryPage from '@/components/pages/inventory-page';

// Billing & Finance
import BillingPage from '@/components/pages/billing-page';
import CyclicBillingPage from '@/components/pages/cyclic-billing-page';
import GracePeriodsPage from '@/components/pages/grace-periods-page';
import PaymentsPage from '@/components/pages/payments-page';
import InvoicesPage from '@/components/pages/invoices-page';
import VouchersPage from '@/components/pages/vouchers-page';
import AddOnServicesPage from '@/components/pages/add-on-services-page';
import TopUpsPage from '@/components/pages/top-ups-page';
import ChargeOverridesPage from '@/components/pages/charge-overrides-page';
import GstTaxPage from '@/components/pages/gst-tax-page';

// Reseller & Agents
import AgentsPage from '@/components/pages/agents-page';
import ResellerPage from '@/components/pages/reseller-page';
import ResellerAnalyticsPage from '@/components/pages/reseller-analytics-page';

// Collections
import CollectionPage from '@/components/pages/collection-page';
import SmartCollectionsPage from '@/components/pages/smart-collections-page';
import DueRecoveryPage from '@/components/pages/due-recovery-page';

// Reports & Analytics
import ActionHistoryPage from '@/components/pages/action-history-page';
import DataExportPage from '@/components/pages/data-export-page';
import ReportsPage from '@/components/pages/reports-page';
import RevenueForecastPage from '@/components/pages/revenue-forecast-page';
import RevenueLeakagePage from '@/components/pages/revenue-leakage-page';
import RevenueReportsPage from '@/components/pages/revenue-reports-page';
import TechnicianPerformancePage from '@/components/pages/technician-performance-page';
import ZoneBudgetsPage from '@/components/pages/zone-budgets-page';

// Marketing
import AnnouncementsPage from '@/components/pages/announcements-page';
import PromotionsPage from '@/components/pages/promotions-page';
import ReferralPage from '@/components/pages/referral-page';
import LoyaltyGamificationPage from '@/components/pages/loyalty-gamification-page';
import HotspotPage from '@/components/pages/hotspot-page';

// AI & Intelligence
import AiAdvisorPage from '@/components/pages/ai-advisor-page';
import AiDiagnosisPage from '@/components/pages/ai-diagnosis-page';
import ChurnAlertsPage from '@/components/pages/churn-alerts-page';
import ChurnPredictionPage from '@/components/pages/churn-prediction-page';
import CompetitorAnalysisPage from '@/components/pages/competitor-analysis-page';
import CompetitorIntelPage from '@/components/pages/competitor-intel-page';
import ComplianceSlaPage from '@/components/pages/compliance-sla-page';
import WhatsappBotPage from '@/components/pages/whatsapp-bot-page';

// Admin & Settings
import DashboardPage from '@/components/pages/dashboard-page';
import DashboardWidgetsPage from '@/components/pages/dashboard-widgets-page';
import UsersPage from '@/components/pages/users-page';
import AreasPage from '@/components/pages/areas-page';
import EquipmentPage from '@/components/pages/equipment-page';
import NotificationsPage from '@/components/pages/notifications-page';
import ApiKeysPage from '@/components/pages/api-keys-page';
import AuditLogPage from '@/components/pages/audit-log-page';
import BackupPage from '@/components/pages/backup-page';
import IntegrationsPage from '@/components/pages/integrations-page';
import AlertCenterPage from '@/components/pages/alert-center-page';
import AlertRulesPage from '@/components/pages/alert-rules-page';
import AlertSuppressionsPage from '@/components/pages/alert-suppressions-page';
import AlertHistoryPage from '@/components/pages/alert-history-page';
import NotificationRulesPage from '@/components/pages/notification-rules-page';
import PaymentGatewaysPage from '@/components/pages/payment-gateways-page';
import SmsGatewayPage from '@/components/pages/sms-gateway-page';
import EmailGatewayPage from '@/components/pages/email-gateway-page';
import WhatsappPushPage from '@/components/pages/whatsapp-push-page';
import WebhooksPage from '@/components/pages/webhooks-page';
import IntegrationLogsPage from '@/components/pages/integration-logs-page';
import KnowledgeBasePage from '@/components/pages/knowledge-base-page';
import ModuleManagerPage from '@/components/pages/module-manager-page';
import IspProfilePage from '@/components/pages/isp-profile-page';

// Auth
import LoginPage from '@/components/pages/login-page';

export const ALL_PAGES: Record<string, React.ComponentType> = {
  // Network / AAA
  AaaGroups: AaaGroupsPage,
  AaaRadius: AaaRadiusPage,
  AaaSessions: AaaSessionsPage,
  AaaUsers: AaaUsersPage,

  // Network / Core
  AuthLog: AuthLogPage,
  BatchProvisioning: BatchProvisioningPage,
  CaptivePortal: CaptivePortalPage,
  Dhcp: DhcpPage,
  Dhcpv6: Dhcpv6Page,
  Dns: DnsPage,
  DynamicRouting: DynamicRoutingPage,
  FtthGpon: FtthGponPage,
  Interfaces: InterfacesPage,
  Ipam: IpamPage,
  IpamCgnat: IpamCgnatTab,
  MikrotikManager: MikrotikManagerPage,
  Multiwan: MultiwanPage,
  NasClients: NasClientsPage,
  PppoeServer: PppoeServerPage,
  SessionEngine: SessionEnginePage,
  SessionHistory: SessionHistoryPage,
  Sessions: SessionsPage,
  SshDeviceManager: SshDeviceManagerPage,
  Tr069Acs: Tr069AcsPage,
  VpnServer: VpnServerPage,
  WifiOffload: WifiOffloadPage,

  // Network / QoS & Bandwidth
  BandwidthMgmt: BandwidthMgmtPage,
  Bandwidth: BandwidthPage,
  QosMonitor: QosMonitorPage,
  TimeAccess: TimeAccessPage,

  // Network / Security
  DdosProtection: DdosProtectionPage,
  Firewall: FirewallPage,
  Ips: IpsPage,
  Security: SecurityPage,

  // Network / Monitoring
  AppAwareness: AppAwarenessPage,
  BwReports: BwReportsPage,
  DiagnosticTools: DiagnosticToolsPage,
  GrafanaDashboards: GrafanaDashboardsPage,
  IpMacHistory: IpMacHistoryPage,
  LatencyMonitor: LatencyMonitorPage,
  NatLogs: NatLogsPage,
  NetworkAlerts: NetworkAlertsPage,
  NetworkHealthEnhanced: NetworkHealthEnhancedPage,
  SnmpManager: SnmpManagerPage,
  SpeedTest: SpeedTestPage,
  SyslogServer: SyslogServerPage,
  TrafficAnalytics: TrafficAnalyticsPage,
  UptimeMonitor: UptimeMonitorPage,

  // Subscriber Management
  Devices: DevicesPage,
  Plans: PlansPage,
  PlanRecommendation: PlanRecommendationPage,
  Subscriber360: Subscriber360Page,
  Subscribers: SubscribersPage,

  // RADIUS & Auth
  EnterpriseAuth: EnterpriseAuthPage,
  RadiusAttributes: RadiusAttributesPage,
  RadiusProxy: RadiusProxyPage,
  CoaEvents: CoaEventsPage,

  // CRM
  Complaints: ComplaintsPage,
  Incidents: IncidentsPage,
  Leads: LeadsPage,
  Technicians: TechniciansPage,

  // Field Service
  Installations: InstallationsPage,
  Inventory: InventoryPage,

  // Billing & Finance
  Billing: BillingPage,
  CyclicBilling: CyclicBillingPage,
  GracePeriods: GracePeriodsPage,
  Payments: PaymentsPage,
  Invoices: InvoicesPage,
  Vouchers: VouchersPage,
  AddOnServices: AddOnServicesPage,
  TopUps: TopUpsPage,
  ChargeOverrides: ChargeOverridesPage,
  GstTax: GstTaxPage,

  // Reseller & Agents
  Agents: AgentsPage,
  Reseller: ResellerPage,
  ResellerAnalytics: ResellerAnalyticsPage,

  // Collections
  Collection: CollectionPage,
  SmartCollections: SmartCollectionsPage,
  DueRecovery: DueRecoveryPage,

  // Reports & Analytics
  ActionHistory: ActionHistoryPage,
  DataExport: DataExportPage,
  Reports: ReportsPage,
  RevenueForecast: RevenueForecastPage,
  RevenueLeakage: RevenueLeakagePage,
  RevenueReports: RevenueReportsPage,
  TechnicianPerformance: TechnicianPerformancePage,
  ZoneBudgets: ZoneBudgetsPage,

  // Marketing
  Announcements: AnnouncementsPage,
  Promotions: PromotionsPage,
  Referral: ReferralPage,
  LoyaltyGamification: LoyaltyGamificationPage,
  Hotspot: HotspotPage,

  // AI & Intelligence
  AiAdvisor: AiAdvisorPage,
  AiDiagnosis: AiDiagnosisPage,
  ChurnAlerts: ChurnAlertsPage,
  ChurnPrediction: ChurnPredictionPage,
  CompetitorAnalysis: CompetitorAnalysisPage,
  CompetitorIntel: CompetitorIntelPage,
  ComplianceSla: ComplianceSlaPage,
  WhatsappBot: WhatsappBotPage,

  // Admin & Settings
  Dashboard: DashboardPage,
  DashboardWidgets: DashboardWidgetsPage,
  Users: UsersPage,
  Areas: AreasPage,
  Equipment: EquipmentPage,
  Notifications: NotificationsPage,
  ApiKeys: ApiKeysPage,
  AuditLog: AuditLogPage,
  Backup: BackupPage,
  Integrations: IntegrationsPage,
  'Payment Gateways': PaymentGatewaysPage,
  'SMS Gateway': SmsGatewayPage,
  'Email Gateway': EmailGatewayPage,
  'WhatsApp & Push': WhatsappPushPage,
  'Webhooks': WebhooksPage,
  'Integration Logs': IntegrationLogsPage,
  'Alert Center': AlertCenterPage,
  'Alert Rules': AlertRulesPage,
  'Suppressions': AlertSuppressionsPage,
  'Alert History': AlertHistoryPage,
  'Notification Rules': NotificationRulesPage,
  KnowledgeBase: KnowledgeBasePage,
  ModuleManager: ModuleManagerPage,
  IspProfile: IspProfilePage,

  // Auth
  Login: LoginPage,
};
