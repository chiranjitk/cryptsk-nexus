"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Users, Receipt, Activity, Network, TrendingUp, TrendingDown,
  Building2, Handshake, Loader2, Wallet, AlertCircle, Phone, Mail,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { apiFetch, formatINR } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface Partner {
  id: string;
  name: string;
  code: string;
  status: string;
}

interface DistributionHub {
  id: string;
  name: string;
  code: string;
  status: string;
  partnerCount: number;
}

interface PartnerReport {
  partner: {
    id: string;
    name: string;
    code: string;
    status: string;
    distributionHubId: string;
    createdAt: string;
  };
  subscriberStats: {
    total: number;
    active: number;
    suspended: number;
    disconnected: number;
    trial: number;
    pendingActivation: number;
  };
  billingSummary: {
    totalRevenue: number;
    outstanding: number;
    collectedThisMonth: number;
  };
  sessionStats: { activeSessions: number };
  ipPoolUtilization: Array<{
    id: string;
    poolType: string;
    startIp: string;
    endIp: string;
    description: string;
  }>;
  recentSubscribers: Array<{
    id: string;
    code: string;
    name: string;
    phone: string;
    email: string;
    status: string;
    createdAt: string;
  }>;
}

interface HubReport {
  distributionHub: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
  totals: {
    totalPartners: number;
    totalSubscribers: number;
    totalRevenue: number;
    totalOutstanding: number;
  };
  perPartnerBreakdown: Array<{
    partnerId: string;
    name: string;
    code: string;
    status: string;
    subscriberCount: number;
    revenue: number;
    outstanding: number;
  }>;
}

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700 border-green-200",
  SUSPENDED: "bg-amber-100 text-amber-700 border-amber-200",
  DISCONNECTED: "bg-red-100 text-red-700 border-red-200",
  TRIAL: "bg-blue-100 text-blue-700 border-blue-200",
  PENDING_ACTIVATION: "bg-gray-100 text-gray-600 border-gray-200",
};

// ─── Component ──────────────────────────────────────────────

export default function PartnerReportsPage() {
  const [activeTab, setActiveTab] = useState("partners");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedHubId, setSelectedHubId] = useState<string>("");

  // ── Queries ──
  const { data: partnersData } = useQuery<{ partners: Partner[] }>({
    queryKey: ["partners-list-reports"],
    queryFn: async () => apiFetch("/api/partners"),
  });

  const { data: hubsData } = useQuery<{ hubs: DistributionHub[] }>({
    queryKey: ["hubs-list-reports"],
    queryFn: async () => apiFetch("/api/distribution-hubs"),
  });

  const partners = partnersData?.partners || [];
  const hubs = hubsData?.hubs || [];

  // Auto-select first partner / hub once data loads
  React.useEffect(() => {
    if (!selectedPartnerId && partners.length > 0) {
      setSelectedPartnerId(partners[0].id);
    }
  }, [partners, selectedPartnerId]);

  React.useEffect(() => {
    if (!selectedHubId && hubs.length > 0) {
      setSelectedHubId(hubs[0].id);
    }
  }, [hubs, selectedHubId]);

  const { data: partnerReport, isLoading: partnerLoading } = useQuery<PartnerReport>({
    queryKey: ["partner-report", selectedPartnerId],
    queryFn: async () => apiFetch(`/api/partner-reports/${selectedPartnerId}`),
    enabled: !!selectedPartnerId,
  });

  const { data: hubReport, isLoading: hubLoading } = useQuery<HubReport>({
    queryKey: ["hub-report", selectedHubId],
    queryFn: async () => apiFetch(`/api/distribution-hub-reports/${selectedHubId}`),
    enabled: !!selectedHubId,
  });

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Partner Reports</h1>
        <p className="text-sm text-muted-foreground">
          Per-partner and distribution-hub consolidated statistics
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="partners" className="gap-2">
            <Handshake className="h-4 w-4" />
            Per Partner
          </TabsTrigger>
          <TabsTrigger value="hubs" className="gap-2">
            <Building2 className="h-4 w-4" />
            Per Hub
          </TabsTrigger>
        </TabsList>

        {/* Per Partner Report */}
        <TabsContent value="partners" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 max-w-md">
            <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
              <SelectTrigger>
                <SelectValue placeholder="Select partner" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedPartnerId ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Select a partner to view its report.</p>
              </CardContent>
            </Card>
          ) : partnerLoading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : partnerReport ? (
            <div className="space-y-6">
              {/* Header */}
              <Card>
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{partnerReport.partner.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Code: {partnerReport.partner.code}
                      {" • "}
                      Status:{" "}
                      <Badge className={STATUS_STYLES[partnerReport.partner.status]}>
                        {partnerReport.partner.status}
                      </Badge>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for partner report sections */}
              <Tabs defaultValue="subscribers">
                <TabsList className="grid grid-cols-4 w-full max-w-2xl">
                  <TabsTrigger value="subscribers" className="gap-1 text-xs sm:text-sm">
                    <Users className="h-3.5 w-3.5" />
                    Subscribers
                  </TabsTrigger>
                  <TabsTrigger value="billing" className="gap-1 text-xs sm:text-sm">
                    <Receipt className="h-3.5 w-3.5" />
                    Billing
                  </TabsTrigger>
                  <TabsTrigger value="sessions" className="gap-1 text-xs sm:text-sm">
                    <Activity className="h-3.5 w-3.5" />
                    Sessions
                  </TabsTrigger>
                  <TabsTrigger value="ip-pools" className="gap-1 text-xs sm:text-sm">
                    <Network className="h-3.5 w-3.5" />
                    IP Pools
                  </TabsTrigger>
                </TabsList>

                {/* Subscribers Tab */}
                <TabsContent value="subscribers" className="mt-4 space-y-4">
                  <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      { label: "Total", value: partnerReport.subscriberStats.total, icon: Users, color: "amber" },
                      { label: "Active", value: partnerReport.subscriberStats.active, icon: Users, color: "green" },
                      { label: "Suspended", value: partnerReport.subscriberStats.suspended, icon: AlertCircle, color: "orange" },
                      { label: "Disconnected", value: partnerReport.subscriberStats.disconnected, icon: AlertCircle, color: "red" },
                      { label: "Trial", value: partnerReport.subscriberStats.trial, icon: Users, color: "blue" },
                      { label: "Pending", value: partnerReport.subscriberStats.pendingActivation, icon: Users, color: "gray" },
                    ].map((stat) => (
                      <Card key={stat.label}>
                        <CardContent className="p-4 text-center">
                          <stat.icon className={`h-5 w-5 mx-auto mb-1 text-${stat.color}-600`} />
                          <p className="text-2xl font-bold tabular-nums">{stat.value}</p>
                          <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                            {stat.label}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Recent Subscribers</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {partnerReport.recentSubscribers.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No subscribers under this partner yet.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Contact</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Joined</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {partnerReport.recentSubscribers.map((s) => (
                                <TableRow key={s.id}>
                                  <TableCell>
                                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                      {s.code}
                                    </code>
                                  </TableCell>
                                  <TableCell className="font-medium">{s.name}</TableCell>
                                  <TableCell className="text-sm">
                                    <div>{s.phone || "—"}</div>
                                    {s.email && (
                                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Mail className="h-3 w-3" /> {s.email}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={STATUS_STYLES[s.status]}>
                                      {s.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {new Date(s.createdAt).toLocaleDateString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Billing Tab */}
                <TabsContent value="billing" className="mt-4 space-y-4">
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                    <Card>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-green-100 text-green-700">
                          <TrendingUp className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Revenue</p>
                          <p className="text-2xl font-bold tabular-nums">
                            {formatINR(partnerReport.billingSummary.totalRevenue)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-red-100 text-red-700">
                          <TrendingDown className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Outstanding</p>
                          <p className="text-2xl font-bold tabular-nums">
                            {formatINR(partnerReport.billingSummary.outstanding)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wider text-muted-foreground">Collected (Month)</p>
                          <p className="text-2xl font-bold tabular-nums">
                            {formatINR(partnerReport.billingSummary.collectedThisMonth)}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Sessions Tab */}
                <TabsContent value="sessions" className="mt-4 space-y-4">
                  <Card>
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                        <Activity className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Sessions</p>
                        <p className="text-2xl font-bold tabular-nums">
                          {partnerReport.sessionStats.activeSessions}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* IP Pools Tab */}
                <TabsContent value="ip-pools" className="mt-4 space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">IP Pool Utilization</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {partnerReport.ipPoolUtilization.length === 0 ? (
                        <div className="p-6 text-center text-muted-foreground text-sm">
                          No IP pools assigned to this partner.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Start IP</TableHead>
                                <TableHead>End IP</TableHead>
                                <TableHead>Description</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {partnerReport.ipPoolUtilization.map((pool) => (
                                <TableRow key={pool.id}>
                                  <TableCell>
                                    <Badge variant="outline">{pool.poolType}</Badge>
                                  </TableCell>
                                  <TableCell className="font-mono">{pool.startIp}</TableCell>
                                  <TableCell className="font-mono">{pool.endIp}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {pool.description || "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </TabsContent>

        {/* Per Hub Report */}
        <TabsContent value="hubs" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 max-w-md">
            <Select value={selectedHubId} onValueChange={setSelectedHubId}>
              <SelectTrigger>
                <SelectValue placeholder="Select distribution hub" />
              </SelectTrigger>
              <SelectContent>
                {hubs.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name} ({h.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedHubId ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Select a distribution hub to view its consolidated report.</p>
              </CardContent>
            </Card>
          ) : hubLoading ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : hubReport ? (
            <div className="space-y-6">
              {/* Header */}
              <Card>
                <CardContent className="p-4 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-lg font-semibold">{hubReport.distributionHub.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Code: {hubReport.distributionHub.code}
                      {" • "}
                      Status:{" "}
                      <Badge className={STATUS_STYLES[hubReport.distributionHub.status]}>
                        {hubReport.distributionHub.status}
                      </Badge>
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Totals */}
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                      <Handshake className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Partners</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {hubReport.totals.totalPartners}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Subscribers</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {hubReport.totals.totalSubscribers}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-green-100 text-green-700">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Revenue</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatINR(hubReport.totals.totalRevenue)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-red-100 text-red-700">
                      <TrendingDown className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Outstanding</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {formatINR(hubReport.totals.totalOutstanding)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Per-partner breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Per-Partner Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {hubReport.perPartnerBreakdown.length === 0 ? (
                    <div className="p-6 text-center text-muted-foreground text-sm">
                      No partners under this hub.
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Partner</TableHead>
                            <TableHead>Code</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Subscribers</TableHead>
                            <TableHead className="text-right">Revenue</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hubReport.perPartnerBreakdown.map((p) => (
                            <TableRow key={p.partnerId}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell>
                                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                  {p.code}
                                </code>
                              </TableCell>
                              <TableCell>
                                <Badge className={STATUS_STYLES[p.status]}>
                                  {p.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center tabular-nums">
                                {p.subscriberCount}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatINR(p.revenue)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatINR(p.outstanding)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
