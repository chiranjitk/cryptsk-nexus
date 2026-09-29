"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Users, Lock, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function RolesPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const roles = data?.roles || [];

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">
          {roles.length} roles · RBAC matrix · per spec §08_SECURITY_RBAC
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.map((role: any) => (
            <Card key={role.id} className="cryptsk-card-load card-lift overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${
                      role.isBreakGlass ? "bg-rose-500/10" : "bg-primary/10"
                    }`}>
                      {role.isBreakGlass ? (
                        <Lock className="size-5 text-rose-500" />
                      ) : (
                        <Shield className="size-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {role.name}
                        {role.isBreakGlass && (
                          <Badge variant="secondary" className="text-[9px] bg-rose-500/10 text-rose-600">
                            Break-glass
                          </Badge>
                        )}
                        {role.isSystem && (
                          <Badge variant="outline" className="text-[9px]">System</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">{role.slug}</CardDescription>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1 text-xs">
                      <Users className="size-3 text-muted-foreground" />
                      <span className="font-medium">{role.userCount}</span>
                      <span className="text-muted-foreground">users</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <Check className="size-3 text-muted-foreground" />
                      <span className="font-medium">{role.permissionCount}</span>
                      <span className="text-muted-foreground">perms</span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {role.description && (
                  <p className="text-xs text-muted-foreground mb-3">{role.description}</p>
                )}
                <div className="space-y-1.5 max-h-48 overflow-y-auto cryptsk-scrollbar">
                  {Object.entries(role.permissions).map(([resource, actions]: [string, any]) => (
                    <div key={resource} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{resource}</span>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {(actions as string[]).map((action) => (
                          <Badge
                            key={action}
                            variant="outline"
                            className="text-[9px] px-1 py-0 border-primary/20 text-primary/70"
                          >
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                  {role.permissionCount === 0 && (
                    <p className="text-xs text-muted-foreground italic">No permissions assigned</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
