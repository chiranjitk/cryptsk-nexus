'use client';

/**
 * SurveyWidget — F12 Guest Survey
 *
 * Standalone survey widget for embedding in the captive portal.
 * Fetches its configuration from the public /api/wifi/satisfaction/active endpoint
 * and submits to the public /api/wifi/satisfaction/submit endpoint.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface SurveyWidgetProps {
  tenantId: string;
  propertyId: string;
  sessionId?: string;
  guestId?: string;
}

interface SurveyConfig {
  enabled: boolean;
  title: string;
  description: string;
  categories: string[];
  showCommentBox: boolean;
}

interface CategoryRating {
  speed: number;
  coverage: number;
  easeOfConnect: number;
}

type WidgetState = 'loading' | 'active' | 'submitting' | 'thankyou' | 'error' | 'disabled';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getCategoryLabel(key: string): string {
  switch (key) {
    case 'speed': return 'Speed';
    case 'coverage': return 'Coverage';
    case 'easeOfConnect': return 'Ease of Connection';
    default: return key.charAt(0).toUpperCase() + key.slice(1);
  }
}

function getCategoryIcon(key: string): string {
  switch (key) {
    case 'speed': return '\u26A1';
    case 'coverage': return '\uD83D\uDCF6';
    case 'easeOfConnect': return '\uD83D\uDD12';
    default: return '\u2728';
  }
}

// ─── Star Row Component ────────────────────────────────────────────────────────

function StarRow({
  value,
  onChange,
  size = 'md',
  readonly = false,
}: {
  value: number;
  onChange?: (val: number) => void;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const sizeClass =
    size === 'lg' ? 'h-8 w-8' : size === 'md' ? 'h-6 w-6' : 'h-5 w-5';
  const gapClass = size === 'lg' ? 'gap-2' : 'gap-1';

  return (
    <div className={`flex items-center ${gapClass}`} role="radiogroup">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered ?? value);
        return (
          <button
            key={star}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(star)}
            onMouseEnter={() => !readonly && setHovered(star)}
            onMouseLeave={() => !readonly && setHovered(null)}
            className={`focus:outline-none transition-transform ${
              !readonly ? 'hover:scale-110 active:scale-95' : ''
            }`}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              className={`${sizeClass} transition-colors ${
                filled
                  ? 'text-amber-400 fill-amber-400'
                  : 'text-gray-200 dark:text-gray-700'
              } ${!readonly ? 'cursor-pointer' : ''}`}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Widget ────────────────────────────────────────────────────────────────

export default function SurveyWidget({
  tenantId,
  propertyId,
  sessionId,
  guestId,
}: SurveyWidgetProps) {
  const [state, setState] = useState<WidgetState>('loading');
  const [config, setConfig] = useState<SurveyConfig | null>(null);
  const [overallRating, setOverallRating] = useState(0);
  const [categoryRatings, setCategoryRatings] = useState<CategoryRating>({
    speed: 0,
    coverage: 0,
    easeOfConnect: 0,
  });
  const [comment, setComment] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // ─── Fetch survey config ──────────────────────────────────────────

  const fetchConfig = useCallback(async () => {
    try {
      const params = new URLSearchParams({ tenantId, propertyId });
      const res = await fetch(`/api/wifi/satisfaction/active?${params}`);
      if (!res.ok) { setState('error'); setErrorMsg('Failed to load survey'); return; }
      const json = await res.json();

      if (!json.success || !json.data) {
        setState('error');
        setErrorMsg('Failed to load survey configuration');
        return;
      }

      const data = json.data as SurveyConfig;
      if (!data.enabled) {
        setState('disabled');
        return;
      }

      setConfig(data);
      setState('active');
    } catch {
      setState('error');
      setErrorMsg('Unable to reach survey service');
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // ─── Update a single category rating ──────────────────────────────

  const updateCategory = (key: keyof CategoryRating, val: number) => {
    setCategoryRatings((prev) => ({ ...prev, [key]: val }));
  };

  // ─── Submit ───────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (overallRating === 0) return;

    setState('submitting');
    setErrorMsg('');

    // Build categories payload — only include categories that are
    // configured AND the guest has rated (> 0)
    const categories: Partial<CategoryRating> = {};
    if (config?.categories.includes('speed') && categoryRatings.speed > 0) {
      categories.speed = categoryRatings.speed;
    }
    if (config?.categories.includes('coverage') && categoryRatings.coverage > 0) {
      categories.coverage = categoryRatings.coverage;
    }
    if (config?.categories.includes('easeOfConnect') && categoryRatings.easeOfConnect > 0) {
      categories.easeOfConnect = categoryRatings.easeOfConnect;
    }

    try {
      const res = await fetch('/api/wifi/satisfaction/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          propertyId,
          sessionId: sessionId || undefined,
          guestId: guestId || undefined,
          rating: overallRating,
          comment: comment.trim() || undefined,
          categories: Object.keys(categories).length > 0 ? categories : undefined,
          deviceType: detectDeviceType(),
        }),
      });
      if (!res.ok) { setState('error'); setErrorMsg(`Server error (${res.status})`); return; }
      const json = await res.json();

      if (res.status === 429) {
        setState('error');
        setErrorMsg(json.error || 'Too many submissions. Please try again later.');
        return;
      }

      if (!json.success) {
        setState('error');
        setErrorMsg(json.error || 'Submission failed');
        return;
      }

      setState('thankyou');
    } catch {
      setState('error');
      setErrorMsg('Network error — please check your connection and try again.');
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6 flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading survey...</p>
        </CardContent>
      </Card>
    );
  }

  // ─── Disabled ─────────────────────────────────────────────────────

  if (state === 'disabled') {
    return null;
  }

  // ─── Thank You ────────────────────────────────────────────────────

  if (state === 'thankyou') {
    return (
      <Card className="w-full max-w-md mx-auto border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/10">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
          <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
            Thank You!
          </h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Your feedback helps us improve our WiFi service. We appreciate you
            taking the time to share your experience.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────

  if (state === 'error') {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3">
          <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-3">
            <MessageSquare className="h-8 w-8 text-red-500 dark:text-red-400" />
          </div>
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setErrorMsg('');
              setState('active');
            }}
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── Active Survey Form ───────────────────────────────────────────

  const isSubmitting = state === 'submitting';
  const canSubmit = overallRating > 0 && !isSubmitting;
  const hasCategories =
    config && config.categories && config.categories.length > 0;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="p-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1.5">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            <h3 className="text-lg font-semibold">{config?.title}</h3>
          </div>
          <p className="text-sm text-muted-foreground">{config?.description}</p>
        </div>

        {/* Overall Rating */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Overall Rating</Label>
          <div className="flex items-center justify-center gap-3">
            <StarRow
              value={overallRating}
              onChange={setOverallRating}
              size="lg"
            />
            {overallRating > 0 && (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {overallRating}/5
              </span>
            )}
          </div>
        </div>

        {/* Category Ratings */}
        {hasCategories && (
          <div className="space-y-3">
            <Label className="text-sm font-medium">Rate Categories</Label>
            <div className="space-y-3">
              {config!.categories.map((key) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base" role="img" aria-hidden>
                      {getCategoryIcon(key)}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {getCategoryLabel(key)}
                    </span>
                  </div>
                  <StarRow
                    value={categoryRatings[key as keyof CategoryRating] ?? 0}
                    onChange={(val) =>
                      updateCategory(key as keyof CategoryRating, val)
                    }
                    size="sm"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comment Box */}
        {config?.showCommentBox && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Comments{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="Tell us more about your experience..."
              value={comment}
              onChange={(e) => {
                if (e.target.value.length <= 1000) {
                  setComment(e.target.value);
                }
              }}
              rows={3}
              className="resize-none"
            />
            <p className="text-[11px] text-muted-foreground text-right tabular-nums">
              {comment.length}/1000
            </p>
          </div>
        )}

        {/* Submit Button */}
        <Button
          className="w-full"
          size="lg"
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Submitting...
            </>
          ) : (
            'Submit Feedback'
          )}
        </Button>

        {overallRating === 0 && !isSubmitting && (
          <p className="text-xs text-center text-muted-foreground">
            Please select an overall rating to submit
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Device detection ───────────────────────────────────────────────────────────

function detectDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';

  const ua = navigator.userAgent;

  if (/tablet|ipad|playbook|silk/i.test(ua) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'phone';
  }
  return 'desktop';
}
