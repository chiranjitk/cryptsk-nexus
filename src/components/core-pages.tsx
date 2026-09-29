'use client';

import React from 'react';

// ─── Core Pages (Tier 1 – always compiled) ─────────────────────────
import DashboardPage from '@/components/pages/dashboard-page';
import SubscribersPage from '@/components/pages/subscribers-page';
import PlansPage from '@/components/pages/plans-page';
import AaaSessionsPage from '@/components/pages/aaa-sessions-page';
import SessionHistoryPage from '@/components/pages/session-history-page';
import AuthLogPage from '@/components/pages/auth-log-page';
import SessionsPage from '@/components/pages/sessions-page';
import NasClientsPage from '@/components/pages/nas-clients-page';
import DevicesPage from '@/components/pages/devices-page';
import DhcpPage from '@/components/pages/dhcp-page';
import DnsPage from '@/components/pages/dns-page';
import BillingPage from '@/components/pages/billing-page';
import PaymentsPage from '@/components/pages/payments-page';
import InvoicesPage from '@/components/pages/invoices-page';
import VouchersPage from '@/components/pages/vouchers-page';

export const CORE_PAGES: Record<string, React.ComponentType> = {
  'Dashboard': DashboardPage,
  'Subscribers': SubscribersPage,
  'Plans': PlansPage,
  'Active Sessions': AaaSessionsPage,
  'Session History': SessionHistoryPage,
  'Authentication Log': AuthLogPage,
  'Sessions': SessionsPage,
  'NAS Clients': NasClientsPage,
  'NAS Devices': DevicesPage,
  'DHCP Server': DhcpPage,
  'DNS Server': DnsPage,
  'Billing': BillingPage,
  'Payments': PaymentsPage,
  'Invoices': InvoicesPage,
  'Vouchers': VouchersPage,
};
