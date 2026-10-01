'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Wand2, Star, Umbrella, Building, Key, MapPin, Wine, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiSuggestDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: () => Promise<void>;
  currentDesign: any;
  toast: (opts: { title: string; description?: string; variant?: string }) => void;
  aiHotelType: string;
  setAiHotelType: (v: string) => void;
  aiBrandColor: string;
  setAiBrandColor: (v: string) => void;
  aiAccentColor: string;
  setAiAccentColor: (v: string) => void;
  aiGenerating: boolean;
}

export default function AiSuggestDialog({
  open,
  onClose,
  onApply,
  currentDesign,
  toast,
  aiHotelType,
  setAiHotelType,
  aiBrandColor,
  setAiBrandColor,
  aiAccentColor,
  setAiAccentColor,
  aiGenerating,
}: AiSuggestDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-amber-500" />AI Design Studio</DialogTitle>
          <DialogDescription>Let AI suggest the optimal portal design based on your hotel type and brand colors.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Hotel Type */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Hotel Type</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { value: 'luxury', label: 'Luxury', icon: Star },
                { value: 'resort', label: 'Resort', icon: Umbrella },
                { value: 'business', label: 'Business', icon: Building },
                { value: 'budget', label: 'Budget', icon: Key },
                { value: 'hostel', label: 'Hostel', icon: MapPin },
                { value: 'boutique', label: 'Boutique', icon: Wine },
              ].map((opt) => {
                const Icon = opt.icon;
                const isActive = aiHotelType === opt.value;
                return (
                  <button key={opt.value} onClick={() => setAiHotelType(opt.value)}
                    className={cn('flex items-center gap-2 p-2.5 rounded-lg border-2 text-xs transition-all',
                      isActive ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                    )}>
                    <Icon className={cn('h-4 w-4', isActive ? 'text-teal-600' : 'text-muted-foreground')} />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Colors */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Brand Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={aiBrandColor} onChange={(e) => setAiBrandColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                <Input value={aiBrandColor} onChange={(e) => setAiBrandColor(e.target.value)} className="text-xs font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Accent Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={aiAccentColor} onChange={(e) => setAiAccentColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                <Input value={aiAccentColor} onChange={(e) => setAiAccentColor(e.target.value)} className="text-xs font-mono" />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onClose()}>Cancel</Button>
          <Button size="sm" onClick={onApply} disabled={aiGenerating}>
            {aiGenerating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />AI is designing...</> : <><Wand2 className="h-3.5 w-3.5 mr-1" />Generate Design</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
