"use client";

// ═══════════════════════════════════════════════════════════════
// Integration Logs — global cross-integration API call viewer
// (new capability: previously logs were only per-integration modals)
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogsTable } from "@/components/integrations/shared";

export function IntegrationLogsPage() {
  const [statusFilter, setStatusFilter] = useState("all");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Integration Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Unified audit trail of every outbound API call across all payment gateways and communication channels. Auto-refreshes every 15s.</p>
        </div>
        <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => window.location.reload()}><RefreshCw className="h-3 w-3 mr-1" />Refresh</Button>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-muted p-1 h-auto">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="success" className="text-xs">Success</TabsTrigger>
          <TabsTrigger value="failed" className="text-xs">Failed</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">Pending</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="p-4">
          <LogsTable key={statusFilter} compact />
        </CardContent>
      </Card>
    </div>
  );
}

export default IntegrationLogsPage;
