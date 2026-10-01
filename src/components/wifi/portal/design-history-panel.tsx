'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { History, Save, Undo2, Trash2, Loader2 } from 'lucide-react';

interface DesignHistoryEntry {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  designSettings: any;
}

interface DesignHistoryPanelProps {
  portalId: string;
  designHistory: DesignHistoryEntry[];
  setDesignHistory: React.Dispatch<React.SetStateAction<DesignHistoryEntry[]>>;
  currentDesign: any;
  onRestore: (entry: DesignHistoryEntry) => void;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
  onSaveSnapshot: () => void;
  saveHistoryOpen: boolean;
  setSaveHistoryOpen: (v: boolean) => void;
  historySnapshotName: string;
  setHistorySnapshotName: (v: string) => void;
  historySnapshotDesc: string;
  setHistorySnapshotDesc: (v: string) => void;
  restoreHistoryEntry: DesignHistoryEntry | null;
  setRestoreHistoryEntry: (entry: DesignHistoryEntry | null) => void;
  restoreConfirmOpen: boolean;
  setRestoreConfirmOpen: (v: boolean) => void;
  restoringHistory: boolean;
  handleSaveSnapshot: () => Promise<void>;
  handleRestoreSnapshot: () => Promise<void>;
  apiMutate: (url: string, options?: RequestInit) => Promise<{ data: any; error: string | null }>;
}

export default function DesignHistoryPanel({
  portalId,
  designHistory,
  setDesignHistory,
  currentDesign,
  onRestore,
  toast,
  onSaveSnapshot,
  saveHistoryOpen,
  setSaveHistoryOpen,
  historySnapshotName,
  setHistorySnapshotName,
  historySnapshotDesc,
  setHistorySnapshotDesc,
  restoreHistoryEntry,
  setRestoreHistoryEntry,
  restoreConfirmOpen,
  setRestoreConfirmOpen,
  restoringHistory,
  handleSaveSnapshot,
  handleRestoreSnapshot,
  apiMutate,
}: DesignHistoryPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold flex items-center gap-1.5"><History className="h-3.5 w-3.5" />Design History</Label>
        <Button variant="outline" size="sm" className="text-[10px] h-7" onClick={onSaveSnapshot}>
          <Save className="h-3 w-3 mr-1" />Save Snapshot
        </Button>
      </div>
      {designHistory.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">No snapshots saved yet. Save a snapshot to preserve your current design.</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {designHistory.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between rounded-lg border p-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{entry.name}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-1 ml-2 flex-shrink-0">
                <Button variant="outline" size="sm" className="text-[10px] h-6 px-2" onClick={() => {
                  setRestoreHistoryEntry(entry);
                  setRestoreConfirmOpen(true);
                }}>
                  <Undo2 className="h-3 w-3 mr-1" />Restore
                </Button>
                <Button variant="outline" size="sm" className="text-[10px] h-6 px-2 text-destructive hover:text-destructive" onClick={async () => {
                  await apiMutate(`/api/wifi/portal/design-history?id=${entry.id}`, { method: 'DELETE' });
                  setDesignHistory(prev => prev.filter(h => h.id !== entry.id));
                  toast({ title: 'Snapshot deleted' });
                }}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
