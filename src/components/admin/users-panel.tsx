"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, MoreHorizontal, Trash2, Edit, KeyRound, Lock, Unlock, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ResetLinkDialog } from "@/components/admin/reset-link-dialog";

type Role = { id: string; name: string; slug: string };
type UserRow = {
  id: string; email: string; username: string; name: string | null;
  status: string; lastLoginAt: string | null; loginAttempts: number;
  lockedUntil: string | null; forcePasswordChange: boolean; mfaEnabled: boolean;
  createdAt: string; roles: { role: Role }[];
};

export function UsersPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = React.useState("");
  const [showCreate, setShowCreate] = React.useState(false);
  const [editUser, setEditUser] = React.useState<UserRow | null>(null);
  const [resetLinkUser, setResetLinkUser] = React.useState<UserRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles-simple"],
    queryFn: async () => {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const users: UserRow[] = data?.users || [];
  const roles: Role[] = rolesData?.roles || [];

  const filtered = users.filter((u) =>
    !search ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 cryptsk-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">
            {users.length} users · {roles.length} roles available
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="size-4" /> Add User
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All Users</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search users…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-48 pl-8 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="size-6 rounded-full border-2 border-primary border-t-transparent cryptsk-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>MFA</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((user) => (
                    <TableRow key={user.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                              {(user.name || user.username).charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{user.name || user.username}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{user.username}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map(({ role }) => (
                            <Badge key={role.id} variant="secondary" className="text-[10px]">
                              {role.name}
                            </Badge>
                          ))}
                          {user.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            user.status === "active"
                              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600"
                              : user.status === "suspended" || user.status === "locked"
                              ? "border-rose-500/30 bg-rose-500/5 text-rose-600"
                              : "border-amber-500/30 bg-amber-500/5 text-amber-600"
                          }
                        >
                          {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? "locked" : user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                            })
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        {user.mfaEnabled ? (
                          <Shield className="size-4 text-emerald-500" />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
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
                            <DropdownMenuItem onClick={() => setEditUser(user)}>
                              <Edit className="mr-2 size-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetLinkUser(user)}>
                              <KeyRound className="mr-2 size-4" /> Generate reset link
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600 focus:bg-rose-500/10"
                              onClick={() => {
                                if (confirm(`Delete user ${user.email}?`)) deleteUser.mutate(user.id);
                              }}
                            >
                              <Trash2 className="mr-2 size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(showCreate || editUser) && (
        <UserDialog
          user={editUser}
          roles={roles}
          onClose={() => { setShowCreate(false); setEditUser(null); }}
          onSaved={() => {
            setShowCreate(false);
            setEditUser(null);
            qc.invalidateQueries({ queryKey: ["users"] });
          }}
        />
      )}

      {resetLinkUser && (
        <ResetLinkDialog
          title="Generate reset link"
          description="One-time sign-in reset link — the user sets a new password themselves. No password is displayed here."
          endpoint={`/api/users/${resetLinkUser.id}/reset-link`}
          email={resetLinkUser.email}
          onClose={() => setResetLinkUser(null)}
        />
      )}
    </div>
  );
}

function UserDialog({
  user, roles, onClose, onSaved,
}: {
  user: UserRow | null; roles: Role[]; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!user;
  const [email, setEmail] = React.useState(user?.email || "");
  const [username, setUsername] = React.useState(user?.username || "");
  const [name, setName] = React.useState(user?.name || "");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState(user?.status || "active");
  const [selectedRoles, setSelectedRoles] = React.useState<string[]>(
    user?.roles.map((r) => r.role.id) || []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const url = isEdit ? `/api/users/${user!.id}` : "/api/users";
      const method = isEdit ? "PATCH" : "POST";
      const body: Record<string, unknown> = { email, username, name, status, roleIds: selectedRoles };
      if (password) body.password = password;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }

      toast({ title: isEdit ? "User updated" : "User created" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function toggleRole(id: string) {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg cryptsk-card-load">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit User" : "Add New User"}</DialogTitle>
          <DialogDescription>
            {isEdit ? `Editing ${user!.email}` : "Create a new platform user"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Username</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} required className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{isEdit ? "New Password (leave blank to keep)" : "Password"}</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={!isEdit}
              placeholder={isEdit ? "•••••••• (unchanged)" : "Set password"}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Roles ({selectedRoles.length} selected)</Label>
            <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1 cryptsk-scrollbar">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                    className="size-4 rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{role.name}</p>
                    <p className="text-[10px] text-muted-foreground">{role.slug}</p>
                  </div>
                  {role.slug === "super_admin" && (
                    <Badge variant="secondary" className="text-[9px]">Break-glass</Badge>
                  )}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{isEdit ? "Save Changes" : "Create User"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
