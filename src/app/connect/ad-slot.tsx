'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ExternalLink, Play, Code, ImageIcon } from 'lucide-react';
import DOMPurify from '@/lib/stubs/dompurify';

// ────────────────────────────────────────────────────────────
// Types — match the /api/wifi/ad-campaigns/serve response shape
// ────────────────────────────────────────────────────────────

interface AdSlotProps {
  slot: 'banner' | 'interstitial' | 'footer' | 'sidebar';
  tenantId: string;
  partnerId?: string;
  className?: string;
  /** Design accent color from portal config */
  accentColor?: string;
  /** Whether the page has a dark background */
  dark?: boolean;
}

/** Shape returned by GET /api/wifi/ad-campaigns/serve */
export interface ServedCampaign {
  id: string;
  name: string;
  advertiser: string;
  creativeUrl: string;
  creativeType: string;
  linkUrl: string | null;
  slot: string;
  priority: number;
}

// ────────────────────────────────────────────────────────────
// Impression deduplication tracker (module-scoped)
// ────────────────────────────────────────────────────────────

const firedImpressions = new Set<string>();

// ────────────────────────────────────────────────────────────
// Slot dimension presets — ensure every slot has explicit sizing
// ────────────────────────────────────────────────────────────

interface SlotPreset {
  wrapper: string;
  container: string;
  media: string;
  wrapperStyle?: React.CSSProperties;
  showAdvertiserOverlay: boolean;
  /** Aspect ratio for video (width/height) */
  videoAspectRatio: number;
}

function getSlotPreset(slot: AdSlotProps['slot']): SlotPreset {
  switch (slot) {
    case 'banner':
      return {
        wrapper: 'w-full',
        container: 'w-full rounded-lg border overflow-hidden shadow-sm',
        media: 'w-full h-[160px] md:h-[180px] object-cover rounded-lg',
        showAdvertiserOverlay: true,
        videoAspectRatio: 16 / 9,
      };
    case 'interstitial':
      return {
        wrapper: 'w-full',
        container: 'w-full rounded-xl border overflow-hidden shadow-md',
        media: 'w-full h-[220px] md:h-[280px] object-cover rounded-xl',
        showAdvertiserOverlay: true,
        videoAspectRatio: 16 / 9,
      };
    case 'footer':
      return {
        wrapper: 'w-full',
        container: 'w-full rounded-md border overflow-hidden shadow-sm',
        media: 'w-full h-[120px] md:h-[140px] object-cover rounded-md',
        showAdvertiserOverlay: true,
        videoAspectRatio: 16 / 9,
      };
    case 'sidebar':
      return {
        wrapper: 'w-full max-w-[180px]',
        container: 'w-full rounded-lg border overflow-hidden shadow-sm',
        media: 'w-full h-[350px] md:h-[450px] object-cover rounded-lg',
        wrapperStyle: { width: 180 },
        showAdvertiserOverlay: true,
        videoAspectRatio: 9 / 16,
      };
    default:
      return {
        wrapper: 'w-full',
        container: 'w-full rounded-lg border overflow-hidden shadow-sm',
        media: 'w-full h-[100px] object-cover rounded-lg',
        showAdvertiserOverlay: false,
        videoAspectRatio: 16 / 9,
      };
  }
}

// ────────────────────────────────────────────────────────────
// Creative Type Icons
// ────────────────────────────────────────────────────────────

function CreativeTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'video':
      return <Play className="w-2.5 h-2.5" />;
    case 'html':
      return <Code className="w-2.5 h-2.5" />;
    default:
      return <ImageIcon className="w-2.5 h-2.5" />;
  }
}

// ────────────────────────────────────────────────────────────
// Ad Slot Component — with rotation support
// ────────────────────────────────────────────────────────────

const ROTATION_INTERVAL_MS = 8000; // Rotate every 8 seconds

export function AdSlot({
  slot,
  tenantId,
  partnerId,
  className = '',
  accentColor = '#6366f1',
  dark = false,
}: AdSlotProps) {
  const [campaigns, setCampaigns] = useState<ServedCampaign[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const impressionFiredRef = useRef(false);
  const htmlRef = useRef<HTMLDivElement>(null);

  const campaign = campaigns[currentIndex] ?? null;

  // ── Fetch active campaigns on mount ──
  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams({ slot, tenantId });
    if (partnerId) params.set('partnerId', partnerId);

    fetch(`/api/wifi/ad-campaigns/serve?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        const list: ServedCampaign[] = data?.data?.campaigns ?? [];
        if (list.length > 0) {
          setCampaigns(list);
        }
      })
      .catch(() => {
        // Silently render null on error
      });

    return () => controller.abort();
  }, [slot, tenantId, partnerId]);

  // ── Rotate campaigns ──
  useEffect(() => {
    if (campaigns.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % campaigns.length);
      setLoaded(false);
      setErrored(false);
      impressionFiredRef.current = false;
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [campaigns.length]);

  // ── Render HTML creative via ref ──
  useEffect(() => {
    if (campaign?.creativeType === 'html' && htmlRef.current && campaign.creativeUrl) {
      if (campaign.creativeUrl.trim().startsWith('<')) {
        htmlRef.current.innerHTML = DOMPurify.sanitize(campaign.creativeUrl, {
          ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'br', 'hr', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel', 'width', 'height', 'colspan', 'rowspan'],
        });
        setLoaded(true);
      } else {
        fetch(campaign.creativeUrl)
          .then(r => r.text())
          .then(html => {
            if (htmlRef.current) {
              htmlRef.current.innerHTML = DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['div', 'span', 'p', 'a', 'img', 'h1', 'h2', 'h3', 'h4', 'br', 'hr', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption'],
                ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel', 'width', 'height', 'colspan', 'rowspan'],
              });
            }
            setLoaded(true);
          })
          .catch(() => { setLoaded(true); setErrored(true); });
      }
    }
  }, [campaign]);

  // ── Fire impression once per campaign per page ──
  const fireImpression = useCallback((campaignId: string) => {
    if (impressionFiredRef.current) return;
    if (firedImpressions.has(campaignId)) return;
    impressionFiredRef.current = true;
    firedImpressions.add(campaignId);

    const payload = JSON.stringify({ campaignId, event: 'impression' });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/wifi/ad-campaigns/track',
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      fetch('/api/wifi/ad-campaigns/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }, []);

  // Fire impression when media loads
  useEffect(() => {
    if (campaign && loaded) fireImpression(campaign.id);
  }, [campaign, loaded, fireImpression]);

  // ── Click handler ──
  const handleClick = useCallback(() => {
    if (!campaign) return;
    const payload = JSON.stringify({ campaignId: campaign.id, event: 'click' });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/wifi/ad-campaigns/track',
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      fetch('/api/wifi/ad-campaigns/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
    if (campaign.linkUrl) {
      window.open(campaign.linkUrl, '_blank', 'noopener,noreferrer');
    }
  }, [campaign]);

  // ── No campaign → render nothing ──
  if (!campaign) return null;

  const preset = getSlotPreset(slot);
  const creativeType = campaign.creativeType || 'image';
  const borderColor = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const bgSemi = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)';
  const badgeBg = dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.45)';

  // ── Render creative based on type ──
  const renderCreative = () => {
    switch (creativeType) {
      case 'video':
        return (
          <div className={preset.media} style={{ position: 'relative' }}>
            <video
              key={campaign.id}
              src={campaign.creativeUrl}
              autoPlay
              muted
              loop
              playsInline
              className="w-full h-full object-cover"
              onLoadedData={() => setLoaded(true)}
              onError={() => { setLoaded(true); setErrored(true); }}
              preload="auto"
            />
            {/* Play icon overlay for discoverability */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity">
              <Play className="w-10 h-10 text-white drop-shadow-lg" />
            </div>
          </div>
        );
      case 'html':
        return (
          <div
            ref={htmlRef}
            className={preset.media}
            style={{
              overflow: 'hidden',
              background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
            }}
          />
        );
      default:
        // Image
        return (
          <img
            key={campaign.id}
            src={campaign.creativeUrl}
            alt={campaign.name || 'Advertisement'}
            className={preset.media}
            loading="eager"
            onLoad={() => setLoaded(true)}
            onError={() => { setLoaded(true); setErrored(true); }}
            draggable={false}
          />
        );
    }
  };

  return (
    <div
      className={`relative group ${preset.wrapper} ${className}`}
      role="complementary"
      aria-label="Advertisement"
      style={preset.wrapperStyle}
    >
      <button
        type="button"
        onClick={handleClick}
        className={[
          'relative overflow-hidden cursor-pointer',
          'transition-all duration-300 ease-out',
          'hover:scale-[1.01] hover:shadow-md active:scale-[0.99]',
          loaded ? 'opacity-100' : 'opacity-0',
          preset.container,
        ].join(' ')}
        style={{
          borderColor,
          backgroundColor: bgSemi,
          minHeight: creativeType === 'html' ? 100 : undefined,
        }}
        tabIndex={0}
        aria-label={campaign.name ? `Ad: ${campaign.name}` : 'Sponsored advertisement'}
      >
        {/* Creative content — image, video, or HTML */}
        {renderCreative()}

        {/* Error fallback */}
        {errored && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <p className="text-white text-xs font-medium truncate w-full">{campaign.name}</p>
            <p className="text-white/60 text-[10px] mt-0.5">{creativeType.toUpperCase()}</p>
          </div>
        )}

        {/* Advertiser name overlay */}
        {preset.showAdvertiserOverlay && campaign.advertiser && (
          <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/60 to-transparent">
            <p className="text-white text-xs font-semibold truncate">{campaign.advertiser}</p>
          </div>
        )}

        {/* Label badge with slot type + creative type — top-right corner */}
        <span
          className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none select-none"
          style={{
            backgroundColor: badgeBg,
            color: dark ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(4px)',
          }}
          aria-hidden="true"
        >
          Ad · {slot.charAt(0).toUpperCase() + slot.slice(1)} · {creativeType}
          <CreativeTypeIcon type={creativeType} />
          {campaign.linkUrl && <ExternalLink className="w-2.5 h-2.5" />}
        </span>

        {/* Rotation indicator dots (when multiple campaigns) */}
        {campaigns.length > 1 && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1">
            {campaigns.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-300"
                style={{
                  width: i === currentIndex ? 12 : 5,
                  height: 4,
                  backgroundColor: i === currentIndex ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)',
                }}
              />
            ))}
          </div>
        )}
      </button>

      {/* Hover glow ring */}
      {accentColor && (
        <div
          className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ boxShadow: `inset 0 0 0 1px ${accentColor}30, 0 0 12px ${accentColor}10` }}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Convenience Wrappers
// ────────────────────────────────────────────────────────────

export function AdBannerSlot(props: Omit<AdSlotProps, 'slot'>) {
  return <AdSlot {...props} slot="banner" />;
}

export function AdInterstitialSlot(props: Omit<AdSlotProps, 'slot'>) {
  return <AdSlot {...props} slot="interstitial" />;
}

export function AdFooterSlot(props: Omit<AdSlotProps, 'slot'>) {
  return <AdSlot {...props} slot="footer" />;
}

export function AdSidebarSlot(props: Omit<AdSlotProps, 'slot'>) {
  return <AdSlot {...props} slot="sidebar" />;
}

export type { AdSlotProps };
