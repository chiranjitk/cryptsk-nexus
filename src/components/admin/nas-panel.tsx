"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Server, Trash2, Radio, MoreHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type NasDevice = {
  id: number; nasname: string; shortname: string | null; type: string;
  ports: number | null; description: string | null; isActive: boolean;
  lastSeenAt: string | null; createdAt: string;
};

const NAS_TYPES = ["mikrotik", "cisco", "juniper", "pppoe", "pptp", "other"];

export function NasPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["nas"],
    queryFn: async () => {
      const res = await fetch("/api/nas");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const deleteNas = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/nas?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "NAS device deleted" });
      qc.invalidateQueries({ queryKey: ["nas"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const devices: NasDevice[] = data?.devices || [];
  const filtered = devices.filter((d) =>
    !search || d.nasname.includes(search) || (d.shortname || "").includes(search) || d.type.includes(search)
  );

  function getTypeBadge(type: string) {
    const colors: Record<string, string> = {
      mikrotik: "border-orange-500/30 bg-orange-500/5 text-orange-600",
      cisco: "border-blue-500/30 bg-blue-500/5 text-blue-600",
      juniper: "border-emerald-500/30 bg-emerald-500/5 text-emerald-600",
      pppoe: "border-violet-500/30 bg-violet-500/5 text-violet-600",
    };
    return colors[type] || "border-muted bg-muted/50 text-muted-foreground";
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NAS Devices</h1>
          <p className="text-sm text-muted-foreground">
            {devices.length} NAS devices · FreeRADIUS clients
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Add NAS
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Network Access Servers</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search NAS…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48 pl-8 text-sm" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>NAS IP / Hostname</TableHead>
                    <TableHead>Short Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ports</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((d) => (
                    <TableRow key={d.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                            <Server className="size-4 text-primary" />
                          </div>
                          <span className="text-sm font-mono font-medium">{d.nasname}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{d.shortname || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${getTypeBadge(d.type)}`}>{d.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">{d.ports || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{d.description || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never"}
                      </TableCell>
                      <TableCell>
                        {d.isActive ? (
                          <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-600">
                            <div className="size-1.5 rounded-full bg-emerald-500 mr-1.5 cryptsk-pulse-dot" /> Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem><Radio className="mr-2 size-4" /> Test Auth</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                              onClick={() => { if (confirm(`Delete NAS ${d.nasname}?`)) deleteNas.mutate(d.id); }}
                            >
                              <Trash2 className="mr-2 size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No NAS devices found. Click "Add NAS" to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <CreateNasDialog onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); qc.invalidateQueries({ queryKey: ["nas"] }); }} />
      )}
    </div>
  );
}

function CreateNasDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [nasname, setNasname] = React.useState("");
  const [shortname, setShortname] = React.useState("");
  const [type, setType] = React.useState("mikrotik");
  const [secret, setSecret] = React.useState("");
  const [ports, setPorts] = React.useState("");
  const [description, setDescription] = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/nas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nasname, shortname, type, secret, ports: ports || null, description }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      toast({ title: "NAS device created", description: `${nasname} synced to FreeRADIUS nas table` });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>Add NAS Device</DialogTitle>
          <DialogDescription>Network Access Server — syncs to FreeRADIUS nas table</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">NAS IP / Hostname</Label>
              <Input value={nasname} onChange={(e) => setNasname(e.target.value)} required placeholder="192.168.1.1" className="h-9 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Short Name</Label>
              <Input value={shortname} onChange={(e) => setShortname(e.target.value)} placeholder="Mikrotik-Office" className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                {NAS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ports</Label>
              <Input type="number" value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="1812" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">RADIUS Secret</Label>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required placeholder="shared-secret" className="h-9 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Main office router" className="h-9" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Create NAS</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
