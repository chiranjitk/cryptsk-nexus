'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// Drag-and-Drop Visual Builder for Captive Portal Content Blocks
// Task ID: 8 — Feature #1
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  MeasuringStrategy } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DesignSettings, PortalPageDesign } from './portal-config';
import { DEFAULT_CONTENT_BLOCKS } from './portal-config';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger } from '@/components/ui/tooltip';
import {
  Megaphone,
  Tag,
  Building,
  Type,
  MapPin,
  FormInput,
  Star,
  Share2,
  Clock,
  Thermometer,
  MessageSquare,
  FileText,
  Mail,
  QrCode,
  GripVertical,
  Eye,
  EyeOff,
  Smartphone,
  Tablet,
  Monitor,
  Layers,
  Plus,
  RotateCcw,
  Save,
  ChevronDown,
  Trash2,
  X,
  Wifi,
  type LucideIcon } from 'lucide-react';

// ── Block Icon Map ─────────────────────────────────────────────────────────

interface BlockMeta {
  icon: LucideIcon;
  label: string;
  category: string;
}

const BLOCK_ICONS: Record<string, BlockMeta> = {
  ads: { icon: Megaphone, label: 'Ad Banner', category: 'Marketing' },
  promotion: { icon: Tag, label: 'Promotion', category: 'Marketing' },
  logo: { icon: Building, label: 'Hotel Logo', category: 'Branding' },
  title: { icon: Type, label: 'Title & Subtitle', category: 'Content' },
  hotelInfo: { icon: MapPin, label: 'Hotel Info', category: 'Content' },
  form: { icon: FormInput, label: 'Login Form', category: 'Auth' },
  amenities: { icon: Star, label: 'Amenities', category: 'Content' },
  social: { icon: Share2, label: 'Social Media', category: 'Connect' },
  clock: { icon: Clock, label: 'Live Clock', category: 'Content' },
  weather: { icon: Thermometer, label: 'Weather Widget', category: 'Content' },
  survey: { icon: MessageSquare, label: 'Guest Survey', category: 'Feedback' },
  terms: { icon: FileText, label: 'Terms & Conditions', category: 'Legal' },
  marketingOptIn: { icon: Mail, label: 'Marketing Opt-In', category: 'Marketing' },
  qrCode: { icon: QrCode, label: 'QR Code', category: 'Auth' } };

const ALL_BLOCK_IDS = Object.keys(BLOCK_ICONS);

// ── Types ──────────────────────────────────────────────────────────────────

type DevicePreview = 'phone' | 'tablet' | 'desktop';

interface DndBuilderProps {
  design: PortalPageDesign;
  onUpdateSettings: (partial: Partial<DesignSettings>) => void;
  onUpdateDesign: (partial: Partial<PortalPageDesign>) => void;
  onSave: () => void;
}

// ── Visibility helpers ─────────────────────────────────────────────────────

function getBlockVisibility(blockId: string, design: DesignSettings): boolean {
  switch (blockId) {
    case 'ads': return design.showAds;
    case 'promotion': return design.showPromotion;
    case 'clock': return design.showClock;
    case 'weather': return design.showWeather;
    case 'hotelInfo': return design.showHotelInfo;
    case 'amenities': return design.showAmenities;
    case 'social': return design.showSocialMedia;
    case 'survey': return design.surveyConfig.enabled;
    case 'marketingOptIn': return design.marketingOptIn.enabled;
    case 'qrCode': return design.enableQrCode;
    case 'logo': return !!design.settings; // always visible
    case 'title': return true;
    case 'form': return true;
    case 'terms': return !!design.termsText || !!design.termsUrl;
    default: return true;
  }
}

function getVisibilityToggle(blockId: string, design: DesignSettings): { key: string; value: boolean } | null {
  switch (blockId) {
    case 'ads': return { key: 'showAds', value: design.showAds };
    case 'promotion': return { key: 'showPromotion', value: design.showPromotion };
    case 'clock': return { key: 'showClock', value: design.showClock };
    case 'weather': return { key: 'showWeather', value: design.showWeather };
    case 'hotelInfo': return { key: 'showHotelInfo', value: design.showHotelInfo };
    case 'amenities': return { key: 'showAmenities', value: design.showAmenities };
    case 'social': return { key: 'showSocialMedia', value: design.showSocialMedia };
    case 'survey': return { key: 'surveyConfig.enabled', value: design.surveyConfig.enabled };
    case 'marketingOptIn': return { key: 'marketingOptIn.enabled', value: design.marketingOptIn.enabled };
    case 'qrCode': return { key: 'enableQrCode', value: design.enableQrCode };
    default: return null;
  }
}

function toggleVisibility(blockId: string, design: DesignSettings, onUpdate: (p: Partial<DesignSettings>) => void) {
  const toggle = getVisibilityToggle(blockId, design);
  if (!toggle) return;
  if (toggle.key === 'surveyConfig.enabled') {
    onUpdate({ surveyConfig: { ...design.surveyConfig, enabled: !toggle.value } });
  } else if (toggle.key === 'marketingOptIn.enabled') {
    onUpdate({ marketingOptIn: { ...design.marketingOptIn, enabled: !toggle.value } });
  } else {
    onUpdate({ [toggle.key]: !toggle.value } as any);
  }
}

// ── Simplified block previews ──────────────────────────────────────────────

function BlockPreviewContent({ blockId, design }: { blockId: string; design: PortalPageDesign }) {
  const s = design.settings;
  const brandColor = design.brandColor || '#14b8a6';

  switch (blockId) {
    case 'ads':
      return (
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="h-8 flex-1 rounded bg-muted border border-dashed border-muted-foreground/30 flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">Ad Slot — {s.adSlotType}</span>
          </div>
        </div>
      );
    case 'promotion':
      return (
        <div className="px-3 py-2 space-y-1">
          <div className="flex gap-2 items-center">
            <div className="w-10 h-10 rounded bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <Tag className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold truncate">{s.promotionTitle || 'Special Offer'}</div>
              <div className="text-[9px] text-muted-foreground truncate">{s.promotionDesc || 'Book 3 nights, get the 4th free!'}</div>
            </div>
          </div>
          {s.useCarouselMode && (
            <div className="flex gap-1 justify-center pt-1">
              {[0, 1, 2].map(i => (
                <div key={i} className={cn('w-1.5 h-1.5 rounded-full', i === 0 ? 'bg-teal-500' : 'bg-muted-foreground/30')} />
              ))}
            </div>
          )}
        </div>
      );
    case 'logo':
      return (
        <div className="px-3 py-3 flex items-center justify-center">
          {design.logoUrl ? (
            <img src={design.logoUrl} alt="Logo" className="h-8 object-contain" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Building className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="text-[10px] text-muted-foreground ml-2">{s.logoSize} logo</span>
        </div>
      );
    case 'title':
      return (
        <div className="px-3 py-3 text-center space-y-0.5">
          <div className="text-sm font-bold" style={{ color: design.textColor || '#fff' }}>{design.title || 'Welcome to StaySuite'}</div>
          <div className="text-[10px]" style={{ color: design.textColor || '#fff', opacity: 0.7 }}>{design.subtitle || 'Connect to WiFi'}</div>
        </div>
      );
    case 'hotelInfo':
      return (
        <div className="px-3 py-2 space-y-1">
          <div className="text-[10px] font-semibold">{s.hotelName || 'StaySuite Hotel'}</div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <MapPin className="h-2.5 w-2.5" />
            <span>{s.hotelAddress || '123 Hospitality Ave'}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Wifi className="h-2.5 w-2.5" />
            <span>{s.hotelPhone || '+1-555-0100'}</span>
          </div>
        </div>
      );
    case 'form':
      return (
        <div className="px-3 py-2 space-y-1.5">
          <div className="h-6 rounded border border-muted-foreground/20 bg-background/50 flex items-center px-2">
            <span className="text-[9px] text-muted-foreground">Username</span>
          </div>
          <div className="h-6 rounded border border-muted-foreground/20 bg-background/50 flex items-center px-2">
            <span className="text-[9px] text-muted-foreground">Password</span>
          </div>
          <div className="h-6 rounded flex items-center justify-center text-[9px] font-medium text-white" style={{ backgroundColor: brandColor }}>
            {s.buttonLabel || 'Connect'}
          </div>
        </div>
      );
    case 'amenities':
      return (
        <div className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {(s.amenities || []).slice(0, 5).map((a) => (
              <span key={a} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted text-[8px] text-muted-foreground">
                <Star className="h-2 w-2" />{a}
              </span>
            ))}
            {(s.amenities || []).length > 5 && (
              <span className="text-[8px] text-muted-foreground">+{(s.amenities || []).length - 5} more</span>
            )}
          </div>
        </div>
      );
    case 'social':
      return (
        <div className="px-3 py-2 flex items-center gap-2">
          {['instagram', 'facebook', 'twitter'].map((p) => (
            <div key={p} className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
              <Share2 className="h-3 w-3 text-muted-foreground" />
            </div>
          ))}
        </div>
      );
    case 'clock':
      return (
        <div className="px-3 py-2 flex items-center justify-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-mono text-muted-foreground">12:34 PM</span>
        </div>
      );
    case 'weather':
      return (
        <div className="px-3 py-2 flex items-center justify-center gap-1.5">
          <Thermometer className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {s.weatherLocation ? `${s.weatherLocation} — 24°C` : 'Weather location not set'}
          </span>
        </div>
      );
    case 'survey':
      return (
        <div className="px-3 py-2 space-y-1">
          <div className="text-[9px] text-muted-foreground">{s.surveyConfig.question || 'How was your stay?'}</div>
          <div className="flex gap-1">
            {(s.surveyConfig.options || []).slice(0, 4).map((o) => (
              <span key={o} className="px-1.5 py-0.5 rounded bg-muted text-[8px] text-muted-foreground">{o}</span>
            ))}
          </div>
        </div>
      );
    case 'terms':
      return (
        <div className="px-3 py-2 flex items-center gap-1.5">
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">
            {s.termsText ? 'Custom terms text defined' : s.termsUrl ? 'Terms link configured' : 'Terms & Conditions'}
          </span>
        </div>
      );
    case 'marketingOptIn':
      return (
        <div className="px-3 py-2 flex items-center gap-1.5">
          <Mail className="h-3 w-3 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">Marketing opt-in checkbox</span>
        </div>
      );
    case 'qrCode':
      return (
        <div className="px-3 py-2 flex items-center justify-center gap-1.5">
          <QrCode className="h-4 w-4 text-muted-foreground" />
          <span className="text-[9px] text-muted-foreground">QR Code — {s.qrCodeConfig?.qrSize || 'medium'}</span>
        </div>
      );
    default:
      return <div className="px-3 py-2 text-[9px] text-muted-foreground">{blockId}</div>;
  }
}

// ── Sortable Block Card ────────────────────────────────────────────────────

interface SortableBlockProps {
  blockId: string;
  index: number;
  design: PortalPageDesign;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
  onToggleVisibility: (id: string) => void;
}

function SortableBlock({ blockId, index, design, isSelected, onSelect, onToggleVisibility }: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging } = useSortable({ id: blockId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined };

  const meta = BLOCK_ICONS[blockId];
  const Icon = meta?.icon || FormInput;
  const isVisible = getBlockVisibility(blockId, design.settings);

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drop indicator line */}
      <div className="h-0.5 -mt-px bg-transparent" />

      <div
        className={cn(
          'relative rounded-xl border-2 bg-white shadow-sm transition-all',
          isSelected
            ? 'border-teal-500 shadow-teal-500/10'
            : 'border-border hover:border-teal-300',
          isDragging && 'opacity-50 scale-[1.02] shadow-lg',
          !isVisible && 'opacity-60'
        )}
      >
        {/* Block Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 bg-muted/30 rounded-t-xl">
          {/* Drag Handle */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 -ml-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Block Icon & Label */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
              isSelected ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600' : 'bg-muted text-muted-foreground'
            )}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-medium truncate block">{meta?.label || blockId}</span>
              <span className="text-[10px] text-muted-foreground">{meta?.category}</span>
            </div>
          </div>

          {/* Index Badge */}
          <Badge variant="secondary" className="text-[9px] h-5 px-1.5 font-mono">{index + 1}</Badge>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleVisibility(blockId); }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={isVisible ? 'Hide block' : 'Show block'}
                >
                  {isVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{isVisible ? 'Hide block' : 'Show block'}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Block Preview Content */}
        <div
          className="px-1 py-1 cursor-pointer"
          onClick={() => onSelect(isSelected ? null : blockId)}
          onDoubleClick={() => onSelect(blockId)}
        >
          <BlockPreviewContent blockId={blockId} design={design} />
        </div>
      </div>
    </div>
  );
}

// ── Drag Overlay ───────────────────────────────────────────────────────────

function DragOverlayContent({ blockId, design }: { blockId: string; design: PortalPageDesign }) {
  const meta = BLOCK_ICONS[blockId];
  const Icon = meta?.icon || FormInput;
  return (
    <div className="rounded-xl border-2 border-teal-500 bg-white shadow-xl p-3 opacity-90 scale-[1.03]">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-600 flex items-center justify-center">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-xs font-medium">{meta?.label || blockId}</span>
      </div>
      <div className="mt-1">
        <BlockPreviewContent blockId={blockId} design={design} />
      </div>
    </div>
  );
}

// ── Properties Panel ───────────────────────────────────────────────────────

interface PropertiesPanelProps {
  blockId: string | null;
  design: PortalPageDesign;
  onUpdateSettings: (partial: Partial<DesignSettings>) => void;
  onUpdateDesign: (partial: Partial<PortalPageDesign>) => void;
  onDeselect: () => void;
  onSwitchToTab: (tabId: string) => void;
}

function PropertiesPanel({ blockId, design, onUpdateSettings, onUpdateDesign, onDeselect, onSwitchToTab }: PropertiesPanelProps) {
  const s = design.settings;

  if (!blockId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <FormInput className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">No Block Selected</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Click a block on the canvas to edit its properties</p>
      </div>
    );
  }

  const meta = BLOCK_ICONS[blockId];
  const Icon = meta?.icon || FormInput;

  const updateSetting = (key: string, value: unknown) => {
    if (key.startsWith('surveyConfig.') || key.startsWith('marketingOptIn.') || key.startsWith('qrCodeConfig.') || key.startsWith('autoRenewalConfig.') || key.startsWith('speedTestConfig.') || key.startsWith('planSelectorConfig.') || key.startsWith('marketingCaptureConfig.')) {
      const [objKey, fieldKey] = key.split('.');
      onUpdateSettings({ [objKey]: { ...(s as any)[objKey], [fieldKey]: value } } as any);
    } else {
      onUpdateSettings({ [key]: value } as any);
    }
  };

  const updateSocialLink = (platform: string, url: string) => {
    const newLinks = (s.socialLinks || []).map((l) =>
      l.platform === platform ? { ...l, url } : l
    );
    onUpdateSettings({ socialLinks: newLinks });
  };

  const updateAmenity = (index: number, value: string) => {
    const newAmenities = [...(s.amenities || [])];
    newAmenities[index] = value;
    onUpdateSettings({ amenities: newAmenities });
  };

  const removeAmenity = (index: number) => {
    const newAmenities = (s.amenities || []).filter((_, i) => i !== index);
    onUpdateSettings({ amenities: newAmenities });
  };

  const addAmenity = () => {
    onUpdateSettings({ amenities: [...(s.amenities || []), 'New Amenity'] });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/40 text-teal-600 flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{meta?.label || blockId}</div>
            <div className="text-[10px] text-muted-foreground">{meta?.category}</div>
          </div>
        </div>
        <button onClick={onDeselect} className="p-1 rounded hover:bg-muted text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="p-4 space-y-4">
          {/* Logo Block */}
          {blockId === 'logo' && (
            <>
              <PropSection title="Logo Settings">
                <PropField label="Logo URL">
                  <Input
                    value={design.logoUrl || ''}
                    onChange={(e) => onUpdateDesign({ logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                    className="text-xs h-8"
                  />
                </PropField>
                <PropField label="Logo Size">
                  <Select value={s.logoSize} onValueChange={(v) => onUpdateSettings({ logoSize: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
              </PropSection>
            </>
          )}

          {/* Title Block */}
          {blockId === 'title' && (
            <>
              <PropSection title="Title Settings">
                <PropField label="Title Text">
                  <Input
                    value={design.title || ''}
                    onChange={(e) => onUpdateDesign({ title: e.target.value })}
                    placeholder="Welcome to StaySuite"
                    className="text-xs h-8"
                  />
                </PropField>
                <PropField label="Subtitle Text">
                  <Input
                    value={design.subtitle || ''}
                    onChange={(e) => onUpdateDesign({ subtitle: e.target.value })}
                    placeholder="Connect to WiFi"
                    className="text-xs h-8"
                  />
                </PropField>
                <PropField label="Heading Font">
                  <Select value={s.headingFontFamily} onValueChange={(v) => onUpdateSettings({ headingFontFamily: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Inter', 'Poppins', 'Playfair Display', 'Roboto', 'Montserrat', 'Open Sans', 'Lato', 'Raleway'].map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </PropField>
                <PropField label="Heading Size">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0.8"
                      max="1.5"
                      step="0.1"
                      value={s.headingSize || 1}
                      onChange={(e) => onUpdateSettings({ headingSize: parseFloat(e.target.value) })}
                      className="flex-1 accent-teal-500"
                    />
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{(s.headingSize || 1).toFixed(1)}x</span>
                  </div>
                </PropField>
                <PropField label="Welcome Message">
                  <Input
                    value={s.welcomeMessage || ''}
                    onChange={(e) => onUpdateSettings({ welcomeMessage: e.target.value })}
                    className="text-xs h-8"
                  />
                </PropField>
              </PropSection>
            </>
          )}

          {/* Form Block */}
          {blockId === 'form' && (
            <>
              <PropSection title="Form Settings">
                <PropField label="Form Style">
                  <Select value={s.formStyle} onValueChange={(v) => onUpdateSettings({ formStyle: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rounded">Rounded</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                      <SelectItem value="glass">Glass</SelectItem>
                      <SelectItem value="pill">Pill</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
                <PropField label="Input Style">
                  <Select value={s.inputStyle} onValueChange={(v) => onUpdateSettings({ inputStyle: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rounded">Rounded</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                      <SelectItem value="pill">Pill</SelectItem>
                      <SelectItem value="underline">Underline</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
                <PropField label="Button Style">
                  <Select value={s.buttonStyle} onValueChange={(v) => onUpdateSettings({ buttonStyle: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="filled">Filled</SelectItem>
                      <SelectItem value="outlined">Outlined</SelectItem>
                      <SelectItem value="gradient">Gradient</SelectItem>
                      <SelectItem value="pill">Pill</SelectItem>
                      <SelectItem value="rounded">Rounded</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
                <PropField label="Button Label">
                  <Input
                    value={s.buttonLabel || ''}
                    onChange={(e) => onUpdateSettings({ buttonLabel: e.target.value })}
                    placeholder="Connect"
                    className="text-xs h-8"
                  />
                </PropField>
                <PropField label="Button Size">
                  <Select value={s.buttonSize} onValueChange={(v) => onUpdateSettings({ buttonSize: v as any })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
              </PropSection>
            </>
          )}

          {/* Hotel Info Block */}
          {blockId === 'hotelInfo' && (
            <>
              <PropSection title="Hotel Info">
                <PropToggle label="Show Hotel Info" checked={s.showHotelInfo} onChange={(v) => onUpdateSettings({ showHotelInfo: v })} />
                <PropField label="Hotel Name">
                  <Input value={s.hotelName || ''} onChange={(e) => onUpdateSettings({ hotelName: e.target.value })} className="text-xs h-8" />
                </PropField>
                <PropField label="Address">
                  <Input value={s.hotelAddress || ''} onChange={(e) => onUpdateSettings({ hotelAddress: e.target.value })} className="text-xs h-8" />
                </PropField>
                <PropField label="Phone">
                  <Input value={s.hotelPhone || ''} onChange={(e) => onUpdateSettings({ hotelPhone: e.target.value })} className="text-xs h-8" />
                </PropField>
                <PropField label="Website">
                  <Input value={s.hotelWebsite || ''} onChange={(e) => onUpdateSettings({ hotelWebsite: e.target.value })} className="text-xs h-8" placeholder="www.example.com" />
                </PropField>
              </PropSection>
            </>
          )}

          {/* Amenities Block */}
          {blockId === 'amenities' && (
            <>
              <PropSection title="Amenities">
                <PropToggle label="Show Amenities" checked={s.showAmenities} onChange={(v) => onUpdateSettings({ showAmenities: v })} />
                <div className="space-y-1.5">
                  {(s.amenities || []).map((a, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input value={a} onChange={(e) => updateAmenity(i, e.target.value)} className="text-xs h-7 flex-1" />
                      <button onClick={() => removeAmenity(i)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="text-[10px] h-7 w-full" onClick={addAmenity}>
                    <Plus className="h-3 w-3 mr-1" /> Add Amenity
                  </Button>
                </div>
              </PropSection>
            </>
          )}

          {/* Social Media Block */}
          {blockId === 'social' && (
            <>
              <PropSection title="Social Media">
                <PropToggle label="Show Social Media" checked={s.showSocialMedia} onChange={(v) => onUpdateSettings({ showSocialMedia: v })} />
                <div className="space-y-2">
                  {(s.socialLinks || []).map((link) => (
                    <div key={link.platform} className="space-y-0.5">
                      <Label className="text-[10px] text-muted-foreground capitalize">{link.platform}</Label>
                      <Input
                        value={link.url}
                        onChange={(e) => updateSocialLink(link.platform, e.target.value)}
                        placeholder="https://..."
                        className="text-xs h-7"
                      />
                    </div>
                  ))}
                </div>
              </PropSection>
            </>
          )}

          {/* Clock Block */}
          {blockId === 'clock' && (
            <>
              <PropSection title="Live Clock">
                <PropToggle label="Show Clock" checked={s.showClock} onChange={(v) => onUpdateSettings({ showClock: v })} />
                <p className="text-[10px] text-muted-foreground">Displays current local time to guests.</p>
              </PropSection>
            </>
          )}

          {/* Weather Block */}
          {blockId === 'weather' && (
            <>
              <PropSection title="Weather Widget">
                <PropToggle label="Show Weather" checked={s.showWeather} onChange={(v) => onUpdateSettings({ showWeather: v })} />
                <PropField label="Location">
                  <Input
                    value={s.weatherLocation || ''}
                    onChange={(e) => onUpdateSettings({ weatherLocation: e.target.value })}
                    placeholder="e.g. Paris, London, New York"
                    className="text-xs h-8"
                  />
                </PropField>
              </PropSection>
            </>
          )}

          {/* Promotion Block */}
          {blockId === 'promotion' && (
            <>
              <PropSection title="Promotion">
                <PropToggle label="Show Promotion" checked={s.showPromotion} onChange={(v) => onUpdateSettings({ showPromotion: v })} />
                <PropField label="Title">
                  <Input value={s.promotionTitle || ''} onChange={(e) => onUpdateSettings({ promotionTitle: e.target.value })} className="text-xs h-8" />
                </PropField>
                <PropField label="Description">
                  <Input value={s.promotionDesc || ''} onChange={(e) => onUpdateSettings({ promotionDesc: e.target.value })} className="text-xs h-8" />
                </PropField>
                <PropToggle label="Carousel Mode" checked={s.useCarouselMode} onChange={(v) => onUpdateSettings({ useCarouselMode: v })} />
              </PropSection>
            </>
          )}

          {/* Ads Block */}
          {blockId === 'ads' && (
            <>
              <PropSection title="Ad Banner">
                <PropToggle label="Show Ads" checked={s.showAds} onChange={(v) => onUpdateSettings({ showAds: v })} />
                <PropField label="Slot Type">
                  <Select value={s.adSlotType || 'banner'} onValueChange={(v) => onUpdateSettings({ adSlotType: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="banner">Banner</SelectItem>
                      <SelectItem value="sidebar">Sidebar</SelectItem>
                      <SelectItem value="interstitial">Interstitial</SelectItem>
                      <SelectItem value="native">Native</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
              </PropSection>
            </>
          )}

          {/* Survey Block */}
          {blockId === 'survey' && (
            <>
              <PropSection title="Guest Survey">
                <PropToggle label="Enabled" checked={s.surveyConfig.enabled} onChange={(v) => onUpdateSettings({ surveyConfig: { ...s.surveyConfig, enabled: v } })} />
                <PropField label="Question">
                  <Input value={s.surveyConfig.question} onChange={(e) => onUpdateSettings({ surveyConfig: { ...s.surveyConfig, question: e.target.value } })} className="text-xs h-8" />
                </PropField>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Options</Label>
                  {s.surveyConfig.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Input value={opt} onChange={(e) => {
                        const newOpts = [...s.surveyConfig.options];
                        newOpts[i] = e.target.value;
                        onUpdateSettings({ surveyConfig: { ...s.surveyConfig, options: newOpts } });
                      }} className="text-xs h-7 flex-1" />
                      <button onClick={() => onUpdateSettings({ surveyConfig: { ...s.surveyConfig, options: s.surveyConfig.options.filter((_, idx) => idx !== i) } })} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="text-[10px] h-7 w-full" onClick={() => onUpdateSettings({ surveyConfig: { ...s.surveyConfig, options: [...s.surveyConfig.options, 'Option'] } })}>
                    <Plus className="h-3 w-3 mr-1" /> Add Option
                  </Button>
                </div>
              </PropSection>
            </>
          )}

          {/* Terms Block */}
          {blockId === 'terms' && (
            <>
              <PropSection title="Terms & Conditions">
                <PropField label="Terms Text">
                  <Input value={s.termsText || ''} onChange={(e) => onUpdateSettings({ termsText: e.target.value })} className="text-xs h-8" placeholder="Enter terms text" />
                </PropField>
                <PropField label="Terms URL">
                  <Input value={s.termsUrl || ''} onChange={(e) => onUpdateSettings({ termsUrl: e.target.value })} className="text-xs h-8" placeholder="https://..." />
                </PropField>
              </PropSection>
            </>
          )}

          {/* Marketing Opt-In Block */}
          {blockId === 'marketingOptIn' && (
            <>
              <PropSection title="Marketing Opt-In">
                <PropToggle label="Enabled" checked={s.marketingOptIn.enabled} onChange={(v) => onUpdateSettings({ marketingOptIn: { ...s.marketingOptIn, enabled: v } })} />
                <PropToggle label="Email Consent" checked={s.marketingOptIn.emailConsent} onChange={(v) => onUpdateSettings({ marketingOptIn: { ...s.marketingOptIn, emailConsent: v } })} />
                <PropToggle label="Phone Consent" checked={s.marketingOptIn.phoneConsent} onChange={(v) => onUpdateSettings({ marketingOptIn: { ...s.marketingOptIn, phoneConsent: v } })} />
                <PropField label="Consent Text">
                  <Input value={s.marketingOptIn.consentText} onChange={(e) => onUpdateSettings({ marketingOptIn: { ...s.marketingOptIn, consentText: e.target.value } })} className="text-xs h-8" />
                </PropField>
              </PropSection>
            </>
          )}

          {/* QR Code Block */}
          {blockId === 'qrCode' && (
            <>
              <PropSection title="QR Code">
                <PropToggle label="Enabled" checked={s.enableQrCode} onChange={(v) => onUpdateSettings({ enableQrCode: v })} />
                <PropField label="QR Size">
                  <Select value={s.qrCodeConfig?.qrSize || 'medium'} onValueChange={(v) => onUpdateSettings({ qrCodeConfig: { ...s.qrCodeConfig, qrSize: v as any } })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                    </SelectContent>
                  </Select>
                </PropField>
                <PropToggle label="Show on Success" checked={s.qrCodeConfig?.showOnSuccess ?? true} onChange={(v) => onUpdateSettings({ qrCodeConfig: { ...s.qrCodeConfig, showOnSuccess: v } })} />
                <PropToggle label="Include SSID" checked={s.qrCodeConfig?.includeSSID ?? true} onChange={(v) => onUpdateSettings({ qrCodeConfig: { ...s.qrCodeConfig, includeSSID: v } })} />
              </PropSection>
            </>
          )}

          {/* Go to relevant tab link */}
          <Separator />
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-8"
              onClick={() => {
                const tabMap: Record<string, string> = {
                  logo: 'layout', title: 'typography', form: 'formstyle',
                  hotelInfo: 'content', amenities: 'content', social: 'content',
                  clock: 'content', weather: 'content', promotion: 'content',
                  ads: 'advanced', survey: 'advanced', terms: 'advanced',
                  marketingOptIn: 'advanced', qrCode: 'advanced' };
                onSwitchToTab(tabMap[blockId] || 'content');
              }}
            >
              Open in Settings Tab →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helper sub-components for Properties ───────────────────────────────────

function PropSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      {children}
    </div>
  );
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PropToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} className="scale-75" />
    </div>
  );
}

// ── Main DnD Builder Component ─────────────────────────────────────────────

export function DndBuilder({ design, onUpdateSettings, onUpdateDesign, onSave }: DndBuilderProps) {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [devicePreview, setDevicePreview] = useState<DevicePreview>('phone');
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const blockOrder = design.settings.contentBlockOrder || [...DEFAULT_CONTENT_BLOCKS];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  // Available blocks not yet in the order
  const availableBlocks = useMemo(() => {
    return ALL_BLOCK_IDS.filter((id) => !blockOrder.includes(id));
  }, [blockOrder]);

  // Group available blocks by category
  const groupedAvailable = useMemo(() => {
    const groups: Record<string, typeof ALL_BLOCK_IDS> = {};
    availableBlocks.forEach((id) => {
      const cat = BLOCK_ICONS[id]?.category || 'Other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(id);
    });
    return groups;
  }, [availableBlocks]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = blockOrder.indexOf(active.id as string);
    const newIndex = blockOrder.indexOf(over.id as string);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(blockOrder, oldIndex, newIndex);
      onUpdateSettings({ contentBlockOrder: newOrder });
    }
  }, [blockOrder, onUpdateSettings]);

  const handleAddBlock = useCallback((blockId: string) => {
    const newOrder = [...blockOrder, blockId];
    onUpdateSettings({ contentBlockOrder: newOrder });
    setSelectedBlock(blockId);
    setAddMenuOpen(false);
  }, [blockOrder, onUpdateSettings]);

  const handleRemoveBlock = useCallback((blockId: string) => {
    const newOrder = blockOrder.filter((id) => id !== blockId);
    onUpdateSettings({ contentBlockOrder: newOrder });
    if (selectedBlock === blockId) setSelectedBlock(null);
  }, [blockOrder, selectedBlock, onUpdateSettings]);

  const handleResetLayout = useCallback(() => {
    onUpdateSettings({ contentBlockOrder: [...DEFAULT_CONTENT_BLOCKS] });
    setSelectedBlock(null);
  }, [onUpdateSettings]);

  const handleToggleVisibility = useCallback((blockId: string) => {
    toggleVisibility(blockId, design.settings, onUpdateSettings);
  }, [design.settings, onUpdateSettings]);

  const handleSwitchToTab = useCallback((_tabId: string) => {
    // This is a no-op in the builder itself — the parent will handle routing
  }, []);

  // Canvas width based on device preview
  const canvasWidth = devicePreview === 'phone' ? 'w-[320px] sm:w-[360px]' :
    devicePreview === 'tablet' ? 'w-[480px] sm:w-[560px]' : 'w-full';

  return (
    <div className="flex flex-col h-full -m-5">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 flex-shrink-0 flex-wrap">
        {/* Add Block */}
        <DropdownMenu open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" disabled={availableBlocks.length === 0}>
              <Plus className="h-3.5 w-3.5" /> Add Block <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {Object.entries(groupedAvailable).map(([category, ids]) => (
              <React.Fragment key={category}>
                <DropdownMenuLabel className="text-[10px] text-muted-foreground">{category}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {ids.map((id) => {
                    const m = BLOCK_ICONS[id];
                    const Ic = m?.icon || FormInput;
                    return (
                      <DropdownMenuItem key={id} onClick={() => handleAddBlock(id)} className="text-xs gap-2">
                        <Ic className="h-3.5 w-3.5 text-muted-foreground" />
                        {m?.label || id}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </React.Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Reset Layout */}
        <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5" onClick={handleResetLayout}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset Layout
        </Button>

        <div className="flex-1" />

        {/* Device Preview Buttons */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {([['phone', Smartphone], ['tablet', Tablet], ['desktop', Monitor]] as const).map(([v, Ic]) => (
            <Tooltip key={v}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setDevicePreview(v)}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    devicePreview === v
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Ic className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{v.charAt(0).toUpperCase() + v.slice(1)}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Save Button */}
        <Button size="sm" className="text-xs h-8 gap-1.5 bg-teal-600 hover:bg-teal-700" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      </div>

      {/* ── Main Area: Canvas + Properties ────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ── Visual Canvas (70%) ────────────────────────────────── */}
        <div className="flex-[7] overflow-auto bg-muted/20 p-4">
          <div className="flex justify-center">
            <div className={cn(
              'transition-all duration-300',
              canvasWidth,
              devicePreview === 'phone' && 'max-w-[360px]',
              devicePreview === 'tablet' && 'max-w-[560px]',
            )}>
              {/* Device Frame */}
              <div className={cn(
                'relative bg-white shadow-xl overflow-hidden mx-auto transition-all',
                devicePreview === 'phone' && 'rounded-[28px] border-[6px] border-gray-800',
                devicePreview === 'tablet' && 'rounded-[16px] border-[4px] border-gray-800',
                devicePreview === 'desktop' && 'rounded-lg border-2 border-gray-300',
              )}>
                {/* Notch (phone) */}
                {devicePreview === 'phone' && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-gray-800 rounded-b-2xl z-10" />
                )}

                {/* Grid Background */}
                <div
                  className="w-full min-h-[500px] p-3 space-y-2 overflow-y-auto max-h-[70vh]"
                  style={{
                    backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
                    backgroundSize: '20px 20px' }}
                >
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    measuring={{
                      droppable: {
                        strategy: MeasuringStrategy.Always } }}
                  >
                    <SortableContext
                      items={blockOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      {blockOrder.map((blockId, index) => (
                        <SortableBlock
                          key={blockId}
                          blockId={blockId}
                          index={index}
                          design={design}
                          isSelected={selectedBlock === blockId}
                          onSelect={setSelectedBlock}
                          onToggleVisibility={handleToggleVisibility}
                        />
                      ))}
                    </SortableContext>

                    <DragOverlay>
                      {activeId ? (
                        <DragOverlayContent blockId={activeId} design={design} />
                      ) : null}
                    </DragOverlay>
                  </DndContext>

                  {/* Empty state */}
                  {blockOrder.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Layers className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">No blocks added</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Add blocks using the toolbar above</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Properties Panel (30%) ─────────────────────────────── */}
        <div className="flex-[3] border-l bg-card min-w-[260px] max-w-[340px] flex-shrink-0">
          {/* Remove block button */}
          {selectedBlock && blockOrder.includes(selectedBlock) && (
            <div className="px-3 py-1.5 border-b bg-muted/20">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs h-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 gap-1"
                onClick={() => handleRemoveBlock(selectedBlock)}
              >
                <Trash2 className="h-3 w-3" /> Remove Block
              </Button>
            </div>
          )}
          <PropertiesPanel
            blockId={selectedBlock}
            design={design}
            onUpdateSettings={onUpdateSettings}
            onUpdateDesign={onUpdateDesign}
            onDeselect={() => setSelectedBlock(null)}
            onSwitchToTab={handleSwitchToTab}
          />
        </div>
      </div>
    </div>
  );
}

