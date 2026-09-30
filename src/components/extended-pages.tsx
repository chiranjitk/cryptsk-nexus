'use client';

import React from 'react';

// ─── Extended Pages (Tier 2 – lazy-loaded to avoid OOM) ──────────────

// Network / AAA
import AaaGroupsPage from '@/components/pages/aaa-groups-page';
import AaaRadiusPage from '@/components/pages/aaa-radius-page';
import AaaUsersPage from '@/components/pages/aaa-users-page';

// Network / Core
import BatchProvisioningPage from '@/components/pages/batch-provisioning-page';
import CaptivePortalPage from '@/components/pages/captive-portal-page';
import Dhcpv6Page from '@/components/pages/dhcpv6-page';
import DynamicRoutingPage from '@/components/pages/dynamic-routing-page';
import FtthGponPage from '@/components/pages/ftth-gpon-page';
import InterfacesPage from '@/components/pages/interfaces-page';
import IpamPage from '@/components/pages/ipam-page';
import IpamCgnatTab from '@/components/pages/ipam-cgnat-tab';
import MikrotikManagerPage from '@/components/pages/mikrotik-manager-page';
import MultiwanPage from '@/components/pages/multiwan-page';
import PppoeServerPage from '@/components/pages/pppoe-server-page';
import SessionEnginePage from '@/components/pages/session-engine-page';
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
import PlanRecommendationPage from '@/components/pages/plan-recommendation-page';
import Subscriber360Page from '@/components/pages/subscriber-360-page';

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
import CyclicBillingPage from '@/components/pages/cyclic-billing-page';
import GracePeriodsPage from '@/components/pages/grace-periods-page';
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
import DashboardWidgetsPage from '@/components/pages/dashboard-widgets-page';
import UsersPage from '@/components/pages/users-page';
import AreasPage from '@/components/pages/areas-page';
import EquipmentPage from '@/components/pages/equipment-page';
import NotificationsPage from '@/components/pages/notifications-page';
import ApiKeysPage from '@/components/pages/api-keys-page';
import AuditLogPage from '@/components/pages/audit-log-page';
import BackupPage from '@/components/pages/backup-page';
import IntegrationsPage from '@/components/pages/integrations-page';
import KnowledgeBasePage from '@/components/pages/knowledge-base-page';
import ModuleManagerPage from '@/components/pages/module-manager-page';
import IspProfilePage from '@/components/pages/isp-profile-page';

export const EXTENDED_PAGES: Record<string, React.ComponentType> = {
  // Network / AAA
  'AAA Groups': AaaGroupsPage,
  'AAA RADIUS': AaaRadiusPage,
  'AAA Users': AaaUsersPage,

  // Network / Core
  'Batch Provisioning': BatchProvisioningPage,
  'Captive Portal': CaptivePortalPage,
  'DHCPv6 Server': Dhcpv6Page,
  'Dynamic Routing': DynamicRoutingPage,
  'FTTH/GPON': FtthGponPage,
  'System Interfaces': InterfacesPage,
  'Subnets (IPAM)': IpamPage,
  'IPAM CGNAT': IpamCgnatTab,
  'MikroTik Manager': MikrotikManagerPage,
  'MultiWAN': MultiwanPage,
  'PPPoE Server': PppoeServerPage,
  'Session Engine': SessionEnginePage,
  'SSH Device Manager': SshDeviceManagerPage,
  'TR-069 ACS': Tr069AcsPage,
  'VPN Server': VpnServerPage,
  'WiFi Offload': WifiOffloadPage,

  // Network / QoS & Bandwidth
  'Bandwidth Mgmt': BandwidthMgmtPage,
  'Bandwidth': BandwidthPage,
  'QoS Monitor': QosMonitorPage,
  'Time Access': TimeAccessPage,

  // Network / Security
  'DDoS Protection': DdosProtectionPage,
  'Firewall Rules': FirewallPage,
  'IPS / Anomaly Detection': IpsPage,
  'Security Profiles': SecurityPage,

  // Network / Monitoring
  'App Awareness': AppAwarenessPage,
  'BW Reports': BwReportsPage,
  'Diagnostic Tools': DiagnosticToolsPage,
  'Grafana Dashboards': GrafanaDashboardsPage,
  'IP-MAC History': IpMacHistoryPage,
  'Latency Monitor': LatencyMonitorPage,
  'NAT Logs': NatLogsPage,
  'Network Alerts': NetworkAlertsPage,
  'Network Health': NetworkHealthEnhancedPage,
  'SNMP Manager': SnmpManagerPage,
  'Speed Test': SpeedTestPage,
  'Syslog Server': SyslogServerPage,
  'Traffic Analytics': TrafficAnalyticsPage,
  'Uptime Monitor': UptimeMonitorPage,

  // Subscriber Management
  'Plan Recommendation': PlanRecommendationPage,
  '360° Customer View': Subscriber360Page,

  // RADIUS & Auth
  'Enterprise Auth': EnterpriseAuthPage,
  'RADIUS Attributes': RadiusAttributesPage,
  'RADIUS Proxy': RadiusProxyPage,
  'CoA Tracking': CoaEventsPage,

  // CRM
  'Complaints': ComplaintsPage,
  'Incidents': IncidentsPage,
  'Leads': LeadsPage,
  'Technicians': TechniciansPage,

  // Field Service
  'Installations': InstallationsPage,
  'Inventory': InventoryPage,

  // Billing & Finance
  'Cyclic Billing': CyclicBillingPage,
  'Grace Periods': GracePeriodsPage,
  'Add-on Services': AddOnServicesPage,
  'Top-Ups': TopUpsPage,
  'Charge Override': ChargeOverridesPage,
  'GST/Tax': GstTaxPage,

  // Reseller & Agents
  'Agents': AgentsPage,
  'Reseller': ResellerPage,
  'Reseller Intelligence': ResellerAnalyticsPage,

  // Collections
  'Collection': CollectionPage,
  'Smart Collections': SmartCollectionsPage,
  'Due Recovery': DueRecoveryPage,

  // Reports & Analytics
  'Action History': ActionHistoryPage,
  'Data Export': DataExportPage,
  'Reports': ReportsPage,
  'Revenue Forecast': RevenueForecastPage,
  'Revenue Leakage': RevenueLeakagePage,
  'Revenue Reports': RevenueReportsPage,
  'Tech Performance': TechnicianPerformancePage,
  'Zone Budgets': ZoneBudgetsPage,

  // Marketing
  'Announcements': AnnouncementsPage,
  'Promotions': PromotionsPage,
  'Referral': ReferralPage,
  'Loyalty Gamification': LoyaltyGamificationPage,
  'Hotspot': HotspotPage,

  // AI & Intelligence
  'AI Advisor': AiAdvisorPage,
  'AI Diagnosis': AiDiagnosisPage,
  'Churn Alerts': ChurnAlertsPage,
  'Churn Prediction': ChurnPredictionPage,
  'Competitor Analysis': CompetitorAnalysisPage,
  'Competitor Intel': CompetitorIntelPage,
  'Compliance & SLA': ComplianceSlaPage,
  'WhatsApp Bot': WhatsappBotPage,

  // Admin & Settings
  'Dashboard Widgets': DashboardWidgetsPage,
  'Admin Users': UsersPage,
  'Areas': AreasPage,
  'Equipment': EquipmentPage,
  'Notifications': NotificationsPage,
  'API Keys': ApiKeysPage,
  'Audit Log': AuditLogPage,
  'Backup': BackupPage,
  'Integrations': IntegrationsPage,
  'Knowledge Base': KnowledgeBasePage,
  'Module Manager': ModuleManagerPage,
  'ISP Profile': IspProfilePage,
};
