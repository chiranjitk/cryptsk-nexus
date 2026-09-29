"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LayoutDashboard,
  ExternalLink,
  Maximize2,
  Minimize2,
  Database,
  Server,
  Wifi,
  WifiOff,
  Search,
  Monitor,
  Link2,
  Settings,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface GrafanaDashboard {
  id: string;
  uid: string;
  title: string;
  tags: string[];
  type: string;
  uri: string;
  url: string;
  isStarred: boolean;
  folderTitle?: string;
  folderUid?: string;
}

interface GrafanaDatasource {
  name: string;
  type: string;
  url: string;
  isDefault: boolean;
}

export default function GrafanaDashboardsPage() {
  const queryClient = useQueryClient();
  const [embedUrl, setEmbedUrl] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [configUrl, setConfigUrl] = useState("");
  const [configApiKey, setConfigApiKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const { data: configData } = useQuery<{
    configured: boolean;
    url: string;
  }>({
    queryKey: ["grafana-config"],
    queryFn: () => apiFetch("/api/grafana-dashboards?action=config"),
    refetchInterval: false,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery<{
    connected: boolean;
    configured: boolean;
    health: Record<string, unknown>;
    dashboardCount: number;
    datasourceCount: number;
    datasources: GrafanaDatasource[];
    error?: string;
  }>({
    queryKey: ["grafana-stats"],
    queryFn: () => apiFetch("/api/grafana-dashboards?action=stats"),
    refetchInterval: 15000,
  });

  const { data: dashboardsData } = useQuery<{ dashboards: GrafanaDashboard[] }>({
    queryKey: ["grafana-dashboards"],
    queryFn: () => apiFetch("/api/grafana-dashboards?action=dashboards"),
    enabled: statsData?.connected === true,
    refetchInterval: 30000,
  });

  // Populate config dialog fields when dialog opens
  useEffect(() => {
    if (configOpen && configData) {
      setConfigUrl(configData.url || "");
      setConfigApiKey("");
      setTestResult(null);
    }
  }, [configOpen, configData]);

  const dashboards = (dashboardsData?.dashboards || []).filter((d) =>
    !searchQuery || d.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openDashboard = (uid: string) => {
    const url = configData?.url + "/d/" + uid;
    window.open(url, "_blank");
  };

  const openGrafana = () => {
    if (configData?.url) {
      window.open(configData.url, "_blank");
    }
  };

  const embedDashboard = (uid: string) => {
    if (configData?.url) {
      setEmbedUrl(configData.url + "/d/" + uid + "?kiosk&orgId=1");
      setIframeKey((k) => k + 1);
    }
  };

  const handleTestConnection = async () => {
    if (!configUrl.trim()) {
      toast({ title: "Error", description: "Please enter a Grafana URL", variant: "destructive" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch<{ success: boolean; error?: string }>("/api/grafana-dashboards", {
        method: "POST",
        body: JSON.stringify({
          action: "test-connection",
          grafanaUrl: configUrl.trim(),
          grafanaApiKey: configApiKey.trim(),
        }),
      });
      setTestResult(result);
      if (result.success) {
        toast({ title: "Success", description: "Connected to Grafana successfully!" });
      } else {
        toast({ title: "Connection Failed", description: result.error || "Unknown error", variant: "destructive" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTestResult({ success: false, error: msg });
      toast({ title: "Connection Failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!configUrl.trim()) {
      toast({ title: "Error", description: "Please enter a Grafana URL", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/grafana-dashboards", {
        method: "POST",
        body: JSON.stringify({
          action: "save-config",
          grafanaUrl: configUrl.trim(),
          grafanaApiKey: configApiKey.trim(),
        }),
      });
      toast({ title: "Saved", description: "Grafana configuration saved successfully" });
      queryClient.invalidateQueries({ queryKey: ["grafana-config"] });
      queryClient.invalidateQueries({ queryKey: ["grafana-stats"] });
      queryClient.invalidateQueries({ queryKey: ["grafana-dashboards"] });
      setConfigOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = configData?.configured === true;
  const isConnected = statsData?.connected === true;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grafana Dashboards"
        description="View and embed Grafana dashboards from your monitoring server"
        icon={LayoutDashboard}
        actions={
          <div className="flex items-center gap-2">
            {isConnected && (
              <Button variant="outline" onClick={openGrafana}>
                <ExternalLink className="mr-2 h-4 w-4" /> Open Grafana
              </Button>
            )}
            <Button variant="outline" size="icon" onClick={() => setConfigOpen(true)}>
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* Configuration Dialog */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grafana Configuration</DialogTitle>
            <DialogDescription>
              Configure the connection to your external Grafana server. The URL and API key are stored securely in the database.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="grafana-url">Grafana URL</Label>
              <Input
                id="grafana-url"
                placeholder="http://your-grafana-server:3000"
                value={configUrl}
                onChange={(e) => { setConfigUrl(e.target.value); setTestResult(null); }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grafana-api-key">API Key (optional)</Label>
              <Input
                id="grafana-api-key"
                type="password"
                placeholder="Grafana API Key (optional)"
                value={configApiKey}
                onChange={(e) => { setConfigApiKey(e.target.value); setTestResult(null); }}
              />
              <p className="text-xs text-muted-foreground">
                Required if your Grafana server has authentication enabled.
              </p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${testResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{testResult.success ? "Connection successful!" : testResult.error || "Connection failed"}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleTestConnection} disabled={testing || !configUrl.trim()}>
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Test Connection
              </Button>
              <Button onClick={handleSaveConfig} disabled={saving || !configUrl.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Not Configured Banner */}
      {!isConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-amber-100 p-3">
                <Settings className="h-6 w-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg text-amber-900">
                  Grafana Not Configured
                </h3>
                <p className="text-sm text-amber-700">
                  Connect to your Grafana server to view dashboards and monitoring data.
                </p>
              </div>
              <Button onClick={() => setConfigOpen(true)}>
                <Settings className="mr-2 h-4 w-4" /> Configure
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dashboards">Dashboards</TabsTrigger>
          <TabsTrigger value="embedded">Embedded</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Connection Status */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`rounded-full p-3 ${isConnected ? "bg-emerald-50" : "bg-red-50"}`}>
                  {isConnected ? (
                    <Wifi className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <WifiOff className="h-6 w-6 text-red-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {isConnected
                      ? "Connected to Grafana"
                      : isConfigured
                        ? "Grafana Not Reachable"
                        : "Grafana Not Configured"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isConnected
                      ? `Connected to ${configData?.url}`
                      : isConfigured
                        ? `Could not connect to Grafana at ${configData?.url}. Check the server and network.`
                        : "Go to Settings to configure your Grafana server URL."}
                  </p>
                  {statsData?.error && !isConnected && isConfigured && (
                    <p className="text-xs text-red-500 mt-1">{statsData.error}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          {isConnected && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2">
                    <LayoutDashboard className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{statsData?.dashboardCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Dashboards</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-purple-50 p-2">
                    <Database className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{statsData?.datasourceCount ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Data Sources</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-50 p-2">
                    <Server className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold truncate max-w-[140px]" title={configData?.url || ""}>
                      {configData?.url ? new URL(configData.url).host : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Server</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Data Sources */}
          {statsData?.datasources && statsData.datasources.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Database className="h-4 w-4" /> Data Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {statsData.datasources.map((ds, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{ds.name}</span>
                        {ds.isDefault && <Badge className="text-xs">Default</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{ds.type}</Badge>
                        <span className="text-xs text-muted-foreground">{ds.url}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dashboards" className="space-y-4 mt-4">
          {!isConnected ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>
                  {!isConfigured
                    ? "Grafana is not configured. Click the settings icon to set up your Grafana server."
                    : "Grafana server is not reachable. Cannot load dashboards."}
                </p>
                {!isConfigured && (
                  <Button className="mt-4" onClick={() => setConfigOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" /> Configure Grafana
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Search */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search dashboards..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openGrafana()}
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> Open in Grafana
                </Button>
              </div>

              {/* Dashboard Grid */}
              {dashboards.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <LayoutDashboard className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>{searchQuery ? "No dashboards match your search." : "No dashboards found in Grafana."}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {dashboards.map((d) => (
                    <Card key={d.uid} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => openDashboard(d.uid)}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm font-medium leading-tight">{d.title}</CardTitle>
                          <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        {d.tags && d.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {d.tags.map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        {d.folderTitle && (
                          <p className="text-xs text-muted-foreground">Folder: {d.folderTitle}</p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); openDashboard(d.uid); }}>
                            <ExternalLink className="mr-1 h-3 w-3" /> Open
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); embedDashboard(d.uid); }}>
                            <Monitor className="mr-1 h-3 w-3" /> Embed
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="embedded" className="space-y-4 mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Paste a Grafana dashboard URL or select from the Dashboards tab
                  </label>
                  <Input
                    placeholder="e.g. http://your-grafana-server:3000/d/abc123/my-dashboard?kiosk"
                    value={embedUrl}
                    onChange={(e) => setEmbedUrl(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  disabled={!embedUrl}
                >
                  {isFullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {embedUrl ? (
            <Card className={isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}>
              <CardContent className="p-0 h-full">
                <iframe
                  key={iframeKey}
                  src={embedUrl}
                  className="w-full border-0"
                  style={{ height: isFullscreen ? "100vh" : "700px" }}
                  title="Grafana Dashboard"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Select a dashboard to embed or paste a URL above.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
