// ─── Lazy Page Loaders ─────────────────────────────────────────
// Maps page label strings (matching MODULES registry & currentPage state)
// to lazy import() functions.  Each import() is wrapped in an arrow
// function so Turbopack does NOT evaluate them at module load time —
// they are only called when React.lazy() triggers the actual chunk load.
//
// Keys use the EXACT label strings from the MODULES registry pages array.
// For pages that exist in the filesystem but are NOT in the registry
// (orphan pages), the PascalCase key from all-pages.tsx is used.
// ─────────────────────────────────────────────────────────────────

export const PAGE_LOADERS: Record<string, () => Promise<{default: React.ComponentType}>> = {
  // ══════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════
  'Dashboard': () => import('@/components/pages/dashboard-page'),
  'Dashboard Widgets': () => import('@/components/pages/dashboard-widgets-page'),

  // ══════════════════════════════════════════════════════════════
  // SUBSCRIBERS
  // ══════════════════════════════════════════════════════════════
  'Subscribers': () => import('@/components/pages/subscribers-page'),
  'Plans': () => import('@/components/pages/plans-page'),
  '360° Customer View': () => import('@/components/pages/subscriber-360-page'),
  'Batch Provisioning': () => import('@/components/pages/batch-provisioning-page'),

  // ══════════════════════════════════════════════════════════════
  // NETWORK — Infrastructure
  // ══════════════════════════════════════════════════════════════
  'NAS Clients': () => import('@/components/pages/nas-clients-page'),
  'Subnets (IPAM)': () => import('@/components/pages/ipam-page'),
  'System Interfaces': () => import('@/components/pages/interfaces-page'),
  'DHCP Server': () => import('@/components/pages/dhcp-page'),
  'DNS Server': () => import('@/components/pages/dns-page'),
  'PPPoE Server': () => import('@/components/pages/pppoe-server-page'),
  'Captive Portal': () => import('@/components/pages/captive-portal-page'),
  'MultiWAN': () => import('@/components/pages/multiwan-page'),
  'Dynamic Routing': () => import('@/components/pages/dynamic-routing-page'),
  'FTTH/GPON': () => import('@/components/pages/ftth-gpon-page'),
  'Network Health': () => import('@/components/pages/network-health-enhanced-page'),
  'DHCPv6 Server': () => import('@/components/pages/dhcpv6-page'),

  // ══════════════════════════════════════════════════════════════
  // POLICY — Bandwidth, firewall, security
  // ══════════════════════════════════════════════════════════════
  'Bandwidth Mgmt': () => import('@/components/pages/bandwidth-mgmt-page'),
  'Time Access': () => import('@/components/pages/time-access-page'),
  'QoS Monitor': () => import('@/components/pages/qos-monitor-page'),
  'Firewall Rules': () => import('@/components/pages/firewall-page'),
  'IPS / Anomaly Detection': () => import('@/components/pages/ips-page'),
  'DDoS Protection': () => import('@/components/pages/ddos-protection-page'),
  'VPN Server': () => import('@/components/pages/vpn-server-page'),
  'Security Profiles': () => import('@/components/pages/security-page'),

  // ══════════════════════════════════════════════════════════════
  // MONITORING
  // ══════════════════════════════════════════════════════════════
  'Active Sessions': () => import('@/components/pages/sessions-page'),
  'Session History': () => import('@/components/pages/session-history-page'),
  'Authentication Log': () => import('@/components/pages/auth-log-page'),
  'Bandwidth': () => import('@/components/pages/bandwidth-page'),
  'Traffic Analytics': () => import('@/components/pages/traffic-analytics-page'),
  'BW Reports': () => import('@/components/pages/bw-reports-page'),
  'App Awareness': () => import('@/components/pages/app-awareness-page'),
  'Uptime Monitor': () => import('@/components/pages/uptime-monitor-page'),
  'Latency Monitor': () => import('@/components/pages/latency-monitor-page'),
  'Speed Test': () => import('@/components/pages/speed-test-page'),
  'Syslog Server': () => import('@/components/pages/syslog-server-page'),
  'Diagnostic Tools': () => import('@/components/pages/diagnostic-tools-page'),
  'IP-MAC History': () => import('@/components/pages/ip-mac-history-page'),
  'Zone Budgets': () => import('@/components/pages/zone-budgets-page'),
  'NAT Logs': () => import('@/components/pages/nat-logs-page'),
  'Network Alerts': () => import('@/components/pages/network-alerts-page'),
  'Grafana Dashboards': () => import('@/components/pages/grafana-dashboards-page'),

  // ══════════════════════════════════════════════════════════════
  // SERVICES
  // ══════════════════════════════════════════════════════════════
  'TR-069 ACS': () => import('@/components/pages/tr069-acs-page'),
  'MikroTik Manager': () => import('@/components/pages/mikrotik-manager-page'),
  'SSH Device Manager': () => import('@/components/pages/ssh-device-manager-page'),
  'SNMP Manager': () => import('@/components/pages/snmp-manager-page'),
  'RADIUS Proxy': () => import('@/components/pages/radius-proxy-page'),
  'RADIUS Attributes': () => import('@/components/pages/radius-attributes-page'),
  'Enterprise Auth': () => import('@/components/pages/enterprise-auth-page'),
  'WiFi Offload': () => import('@/components/pages/wifi-offload-page'),
  'Hotspot': () => import('@/components/pages/hotspot-page'),
  'Tech Performance': () => import('@/components/pages/technician-performance-page'),
  'CoA Tracking': () => import('@/components/pages/coa-events-page'),

  // ══════════════════════════════════════════════════════════════
  // OPERATIONS
  // ══════════════════════════════════════════════════════════════
  'Billing': () => import('@/components/pages/billing-page'),
  'Invoices': () => import('@/components/pages/invoices-page'),
  'Payments': () => import('@/components/pages/payments-page'),
  'Vouchers': () => import('@/components/pages/vouchers-page'),
  'Complaints': () => import('@/components/pages/complaints-page'),
  'Technicians': () => import('@/components/pages/technicians-page'),
  'Agents': () => import('@/components/pages/agents-page'),
  'Installations': () => import('@/components/pages/installations-page'),
  'Inventory': () => import('@/components/pages/inventory-page'),
  'Incidents': () => import('@/components/pages/incidents-page'),
  'Leads': () => import('@/components/pages/leads-page'),
  'Reseller': () => import('@/components/pages/reseller-page'),
  'Action History': () => import('@/components/pages/action-history-page'),
  'Announcements': () => import('@/components/pages/announcements-page'),

  // ══════════════════════════════════════════════════════════════
  // FINANCE
  // ══════════════════════════════════════════════════════════════
  'Reports': () => import('@/components/pages/reports-page'),
  'Revenue Reports': () => import('@/components/pages/revenue-reports-page'),
  'Revenue Forecast': () => import('@/components/pages/revenue-forecast-page'),
  'Collection': () => import('@/components/pages/collection-page'),
  'Due Recovery': () => import('@/components/pages/due-recovery-page'),
  'GST/Tax': () => import('@/components/pages/gst-tax-page'),
  'Referral': () => import('@/components/pages/referral-page'),
  'Loyalty Gamification': () => import('@/components/pages/loyalty-gamification-page'),
  'Charge Override': () => import('@/components/pages/charge-overrides-page'),
  'Cyclic Billing': () => import('@/components/pages/cyclic-billing-page'),
  'Grace Periods': () => import('@/components/pages/grace-periods-page'),
  'Add-on Services': () => import('@/components/pages/add-on-services-page'),
  'Top-Ups': () => import('@/components/pages/top-ups-page'),
  'Smart Collections': () => import('@/components/pages/smart-collections-page'),
  'Revenue Leakage': () => import('@/components/pages/revenue-leakage-page'),
  'Compliance & SLA': () => import('@/components/pages/compliance-sla-page'),
  'Data Export': () => import('@/components/pages/data-export-page'),
  'Reseller Intelligence': () => import('@/components/pages/reseller-analytics-page'),

  // ══════════════════════════════════════════════════════════════
  // AI INTELLIGENCE
  // ══════════════════════════════════════════════════════════════
  'AI Advisor': () => import('@/components/pages/ai-advisor-page'),
  'AI Diagnosis': () => import('@/components/pages/ai-diagnosis-page'),
  'Churn Alerts': () => import('@/components/pages/churn-alerts-page'),
  'Churn Prediction': () => import('@/components/pages/churn-prediction-page'),
  'Competitor Analysis': () => import('@/components/pages/competitor-analysis-page'),
  'Competitor Intel': () => import('@/components/pages/competitor-intel-page'),
  'WhatsApp Bot': () => import('@/components/pages/whatsapp-bot-page'),

  // ══════════════════════════════════════════════════════════════
  // PARTNER MANAGEMENT
  // ══════════════════════════════════════════════════════════════
  'Distribution Hubs': () => import('@/components/pages/distribution-hub-page'),
  'Partners': () => import('@/components/pages/partner-page'),
  'Partner Users': () => import('@/components/pages/partner-users-page'),
  'Partner Reports': () => import('@/components/pages/partner-reports-page'),

  // ══════════════════════════════════════════════════════════════
  // SETTINGS
  // ══════════════════════════════════════════════════════════════
  'ISP Profile': () => import('@/components/pages/isp-profile-page'),
  'Admin Users': () => import('@/components/pages/users-page'),
  'Areas': () => import('@/components/pages/areas-page'),
  'Equipment': () => import('@/components/pages/equipment-page'),
  'Promotions': () => import('@/components/pages/promotions-page'),
  'Notifications': () => import('@/components/pages/notifications-page'),
  'API Keys': () => import('@/components/pages/api-keys-page'),
  'Audit Log': () => import('@/components/pages/audit-log-page'),
  'Automation Jobs': () => import('@/components/pages/automation-jobs-page'),
  'Backup': () => import('@/components/pages/backup-page'),
  'Integrations': () => import('@/components/pages/integrations-page'),
  'Knowledge Base': () => import('@/components/pages/knowledge-base-page'),
  'Module Manager': () => import('@/components/pages/module-manager-page'),
  'System Health': () => import('@/components/pages/system-health-page'),
  'VPP Gateway': () => import('@/components/pages/vpp-gateway-page'),

  // ══════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════
  'Login': () => import('@/components/pages/login-page'),

  // ══════════════════════════════════════════════════════════════
  // SELF-CARE PORTAL (has its own layout, no AppShell)
  // ══════════════════════════════════════════════════════════════
  'SelfCare': () => import('@/components/pages/selfcare/selfcare-layout'),

  // ══════════════════════════════════════════════════════════════
  // ORPHAN PAGES — exist in filesystem + all-pages.tsx but NOT in
  // the MODULES registry.  Included for completeness so that any
  // code referencing them by their PascalCase key still works.
  // ══════════════════════════════════════════════════════════════
  'AaaGroups': () => import('@/components/pages/aaa-groups-page'),
  'AaaRadius': () => import('@/components/pages/aaa-radius-page'),
  'AaaSessions': () => import('@/components/pages/aaa-sessions-page'),
  'AaaUsers': () => import('@/components/pages/aaa-users-page'),
  'Devices': () => import('@/components/pages/devices-page'),
  'PlanRecommendation': () => import('@/components/pages/plan-recommendation-page'),
  'SessionEngine': () => import('@/components/pages/session-engine-page'),
  'IpamCgnat': () => import('@/components/pages/ipam-cgnat-tab'),
};
