'use client';

import { useEffect, useState, useMemo } from 'react';
import { Building2, Filter, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Partner {
  id: string;
  name: string;
}

interface PropertySelectorProps {
  /** Currently selected property ID, or sentinel like 'all' */
  value: string;
  /** Callback when selection changes */
  onValueChange: (value: string) => void;
  /** Show "All Properties" option (default: true) */
  showAll?: boolean;
  /** Sentinel value for "all" (default: 'all') */
  allValue?: string;
  /** Label for the "all" option (default: 'All Properties') */
  allLabel?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Additional CSS classes for the trigger */
  className?: string;
  /** Show a Building2 icon before the dropdown */
  showIcon?: boolean;
  /** Use Filter icon instead of Building2 */
  filterIcon?: boolean;
  /** Auto-hide when only 1 property exists (default: false) */
  hideIfSingle?: boolean;
  /** Use compact/sm size */
  compact?: boolean;
  /** Custom property list — if provided, skips internal fetch */
  properties?: Partner[];
}

// Module-level cache so all PropertySelector instances share one fetch
let cachedProperties: Partner[] | null = null;
let cachedFetchTime = 0;
let fetchInProgress: Promise<Partner[]> | null = null;
const CACHE_TTL = 60_000; // 1 minute

async function fetchPropertiesOnce(): Promise<Partner[]> {
  // Return cached if fresh
  if (cachedProperties && Date.now() - cachedFetchTime < CACHE_TTL) {
    return cachedProperties;
  }
  // Deduplicate concurrent fetches
  if (fetchInProgress) return fetchInProgress;

  fetchInProgress = (async () => {
    try {
      const res = await fetch('/api/properties?limit=100');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        cachedProperties = json.data.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
        }));
        cachedFetchTime = Date.now();
        return cachedProperties;
      }
      return cachedProperties || [];
    } catch {
      return cachedProperties || [];
    } finally {
      fetchInProgress = null;
    }
  })();

  return fetchInProgress;
}

export function PropertySelector({
  value,
  onValueChange,
  showAll = true,
  allValue = 'all',
  allLabel = 'All Properties',
  placeholder = 'Select property',
  className = 'w-full sm:w-48',
  showIcon = false,
  filterIcon = false,
  hideIfSingle = false,
  compact = false,
  properties: externalProperties,
}: PropertySelectorProps) {
  const [internalProperties, setInternalProperties] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch properties if not externally provided
  useEffect(() => {
    if (externalProperties) return;

    let cancelled = false;
    setLoading(true);

    fetchPropertiesOnce().then((props) => {
      if (!cancelled) {
        setInternalProperties(props);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [externalProperties]);

  const properties = externalProperties || internalProperties;

  // Memoize: should we render at all?
  const shouldHide = useMemo(() => {
    if (!hideIfSingle) return false;
    if (showAll) return properties.length <= 1;
    return properties.length <= 1;
  }, [hideIfSingle, showAll, properties.length]);

  if (shouldHide) return null;

  const IconComponent = filterIcon ? Filter : Building2;

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={className}
        size={compact ? 'sm' : 'default'}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : showIcon || filterIcon ? (
          <IconComponent className="h-4 w-4 mr-1 text-muted-foreground" />
        ) : null}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showAll && (
          <SelectItem value={allValue}>
            {allLabel}
          </SelectItem>
        )}
        {properties.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default PropertySelector;
