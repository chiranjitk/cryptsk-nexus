'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Search,
  Eye,
  CheckCircle2,
  Building,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Coffee, Waves, Dumbbell, UtensilsCrossed, Wifi } from 'lucide-react';

// Re-export the PortalTemplate type so consumers can import from here
export interface PortalTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  design: Record<string, unknown>;
  colors: { bg: string; text: string; accent: string; gradientFrom?: string; gradientTo?: string };
  preview: string;
}

export interface PortalPageDesign {
  authFlow: string;
  title: string; subtitle: string; logoUrl: string;
  backgroundType: 'solid' | 'gradient' | 'image';
  backgroundColor: string; backgroundImageUrl: string;
  brandColor: string; textColor: string;
  settings: {
    layoutType: string;
    formStyle?: string;
    inputStyle?: string;
    buttonStyle?: string;
    buttonSize?: string;
    headingFontFamily?: string;
  };
}

interface TemplateGalleryProps {
  templates: PortalTemplate[];
  templateSearch: string;
  setTemplateSearch: (v: string) => void;
  catFilter: string;
  setCatFilter: (v: string) => void;
  templateSort: 'default' | 'az' | 'za';
  setTemplateSort: (v: 'default' | 'az' | 'za') => void;
  onApplyTemplate: (template: PortalTemplate) => void;
  currentDesign: PortalPageDesign;
  onOpenPreview: (template: PortalTemplate) => void;
  onOpenAiSuggest: () => void;
}

export default function TemplateGallery({
  templates,
  templateSearch,
  setTemplateSearch,
  catFilter,
  setCatFilter,
  templateSort,
  setTemplateSort,
  onApplyTemplate,
  currentDesign,
  onOpenPreview,
  onOpenAiSuggest,
}: TemplateGalleryProps) {
  const CATEGORIES = ['All', ...Array.from(new Set(templates.map(t => t.category)))];
  const CATEGORY_ICONS: Record<string, string> = { All: '🌟', Premium: '👑', Corporate: '💼', Lifestyle: '🌴', Modern: '✨', Seasonal: '❄️', Specialty: '🎰' };
  const isCurrent = (tmpl: PortalTemplate) => currentDesign.settings.layoutType === tmpl.design.layoutType && currentDesign.backgroundColor === tmpl.colors.bg;

  const searched = templateSearch
    ? templates.filter(t =>
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.category.toLowerCase().includes(templateSearch.toLowerCase())
      )
    : templates;
  const categoryFiltered = catFilter === 'All' ? searched : searched.filter(t => t.category === catFilter);
  const sorted = [...categoryFiltered].sort((a, b) => {
    if (templateSort === 'az') return a.name.localeCompare(b.name);
    if (templateSort === 'za') return b.name.localeCompare(a.name);
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" />Template Marketplace</h3>
          <p className="text-xs text-muted-foreground mt-1">{templates.length} professionally designed themes — pick one, then customize every detail</p>
        </div>
        {/* Feature #15: AI Design Button */}
        <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={onOpenAiSuggest}>
          <Wand2 className="h-3.5 w-3.5" />AI Design
        </Button>
      </div>
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search templates..."
          value={templateSearch}
          onChange={(e) => setTemplateSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>
      {/* Category filter pills + Sort */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={cn('px-2.5 py-1 text-[10px] font-medium rounded-full transition-all border',
                catFilter === cat ? 'bg-teal-500 text-white border-teal-500' : 'bg-card text-muted-foreground border-border hover:border-teal-300'
              )}>
              {CATEGORY_ICONS[cat] || '🏷️'} {cat}
            </button>
          ))}
        </div>
        <Select value={templateSort} onValueChange={(v) => setTemplateSort(v as 'default' | 'az' | 'za')}>
          <SelectTrigger className="w-[120px] h-7 text-[10px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="az">Name A–Z</SelectItem>
            <SelectItem value="za">Name Z–A</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* Template grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {sorted.map((tmpl) => (
          <div key={tmpl.id} className={cn('group relative rounded-xl overflow-hidden border-2 transition-all hover:shadow-lg',
            isCurrent(tmpl) ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-border hover:border-teal-300'
          )}>
            {/* Thumbnail */}
            <div className="h-28 relative" style={{ background: tmpl.preview }}>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white/90 p-3">
                <Building className="h-6 w-6 opacity-60" />
                <div className="text-[10px] font-semibold text-center drop-shadow">{tmpl.name}</div>
              </div>
              {/* Category badge */}
              <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-black/30 backdrop-blur-sm text-[8px] font-medium text-white/80">
                {CATEGORY_ICONS[tmpl.category] || ''} {tmpl.category}
              </div>
              {isCurrent(tmpl) && (
                <div className="absolute top-1.5 right-1.5 bg-teal-500 rounded-full p-0.5"><CheckCircle2 className="h-3 w-3 text-white" /></div>
              )}
            </div>
            <div className="p-2.5 bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{tmpl.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{tmpl.description}</p>
                </div>
                <div className="flex gap-0.5 ml-2 flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-300/50" style={{ background: tmpl.colors.accent }} />
                  <div className="w-2.5 h-2.5 rounded-full border border-gray-300/50" style={{ background: tmpl.colors.bg }} />
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onApplyTemplate(tmpl)}
                  className={cn('flex-1 text-[10px] font-medium py-1.5 rounded-lg transition-all',
                    isCurrent(tmpl) ? 'bg-teal-500 text-white' : 'bg-primary text-primary-foreground hover:opacity-90'
                  )}>
                  {isCurrent(tmpl) ? 'Applied' : 'Apply'}
                </button>
                <button onClick={(e) => { e.stopPropagation(); onOpenPreview(tmpl); }}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-teal-300 transition-all">
                  <Eye className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {sorted.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">No templates match your search.</p>
        </div>
      )}
    </div>
  );
}
