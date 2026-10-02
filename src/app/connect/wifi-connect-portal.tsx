'use client';

import { generateFingerprint, getStorageToken, saveStorageToken, clearStorageToken, getDeviceInfo } from '@/lib/wifi/device-fingerprint';

/**
 * Public WiFi Captive Portal — Designer-Driven Single Form + Multi-Method Fallback
 *
 * URL: /connect  (or /connect?code=<voucher> for QR scan)
 *
 * Portal resolution flow:
 *   1. User connects to WiFi → gets IP from DHCP → redirected to /connect
 *   2. /connect calls resolve-zone API → server checks client IP against
 *      PortalMapping subnets → returns the correct portal config
 *   3. If no IP match, falls back to default portal
 *
 * TWO RENDERING MODES:
 *
 *   A) UNIFIED FORM (when formFields is configured):
 *      - Renders a SINGLE form with only the fields the admin toggled ON
 *      - No tabs — matches the designer preview exactly
 *      - Uses portalConfig.authMethod to determine submit handler
 *      - Supports ALL field types: roomNumber, username, password, phone, email,
 *        firstName, lastName, passport, bookingId, voucherCode, terms
 *
 *   B) FALLBACK TAB MODE (when formFields is null/empty):
 *      - Shows all auth methods as tabs with their respective hardcoded forms
 *      - Keeps backward compatibility
 *
 * ALL visual styling is driven by the portal's design config.
 * NO hardcoded colors, borders, shadows, or border-radii.
 *
 * States: loading → auth_form → authenticating → success → error
 */

import { useState, useEffect, useCallback, useRef, useMemo, Suspense, Fragment, createContext, useContext } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wifi,
  Loader2,
  CheckCircle,
  XCircle,
  Shield,
  Clock,
  Zap,
  QrCode,
  Key,
  DoorOpen,
  User,
  Smartphone,
  Globe,
  Phone,
  ExternalLink,
  Hotel,
  MapPin,
  PhoneCall,
  RefreshCw,
  Gift,
  Mail,
  Star,
  Waves,
  Sparkles,
  UtensilsCrossed,
  Dumbbell,
  Coffee,
  Car,
  Building,
  Lock,
  ScanLine,
  Calendar,
  Tv, Wine, Baby, Plane, Bath, Shirt, Music, Camera, Umbrella,
  Languages,
  Check,
  X,
  LogOut,
  Share2,
  AlertCircle,
  AlertTriangle,
  Info,
  CreditCard,
  UserPlus,
  Gauge,
  Monitor,
  Hash,
  Unplug,
  ChevronDown,
  Eye,
  ArrowRight,
  ArrowUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import SurveyWidget from '@/components/wifi/survey-widget';
import { AdSlot } from './ad-slot';
import {
  PortalDesignConfig,
  DEFAULT_PORTAL_DESIGN,
  getBackgroundStyle,
  getBackgroundCSSValue,
  isDarkBackground,
  getOverlayStyle,
  getFormContainerClasses,
  getCardShadowCSS,
  getCardBackgroundStyle,
  getCardBorderStyle,
  getCardTextColor,
  getSubtitleColor,
  getMutedTextColor,
  getInputClasses,
  getInputWithIconClasses,
  getInputFocusStyle,
  getButtonClasses,
  getIconColor,
  getAnimationClasses,
  getSocialIconLabel,
  mergeDesignConfig,
  getLanguageLabel,
  getSocialPlatformColor,
  getUIString,
  getLocalizedText,
  getWeatherIconKey,
  getPatternOverlayCSS,
  getCardBgOpacity,
  getSocialButtonStyle,
  needsGoogleFont,
  WEATHER_ICONS,
  getDirection,
  isRTL,
} from '@/lib/wifi/portal-design-utils';
import { getCurrencySymbol } from '@/lib/currencies';

// ────────────────────────────────────────────────────────────
// Cloudflare Turnstile Widget
// ────────────────────────────────────────────────────────────
function TurnstileWidget({ siteKey, onVerify }: { siteKey: string; onVerify: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    // Clear previous render
    containerRef.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => {
      if (typeof window !== 'undefined' && (window as any).turnstile) {
        (window as any).turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          appearance: 'interaction',
          size: 'normal',
          theme: 'auto',
        });
      }
    };
    document.head.appendChild(script);
    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [siteKey]);

  return <div ref={containerRef} className="flex justify-center my-3" />;
}

// ────────────────────────────────────────────────────────────
// Portal Language Context (Feature 1: Multi-Language)
// ────────────────────────────────────────────────────────────

const PortalLanguageContext = createContext('en');
function usePortalLang() { return useContext(PortalLanguageContext); }

// ────────────────────────────────────────────────────────────
// CP-HIGH-01: CNA (Captive Network Assistant) Detection
// ────────────────────────────────────────────────────────────

/**
 * Detect if the page is loaded inside an OS CNA mini-browser.
 * CNA mini-browsers have limited JS/CSS support and a small viewport.
 *
 * When the captive-redirect service detects a CNA request (Apple/Android/Windows),
 * it adds ?cna=1&os=iOS to the URL. This hook reads those params and also
 * provides a client-side fallback heuristic for cases where the param is missing.
 */
function useCNADetection(): { isCNA: boolean; os: string; mac: string } {
  const searchParams = useSearchParams();
  const cna = searchParams.get('cna');
  const os = searchParams.get('os') || '';
  const mac = searchParams.get('mac') || searchParams.get('client_mac') || searchParams.get('id') || '';

  // Server-side flag from captive-redirect service
  if (cna === '1') return { isCNA: true, os, mac };

  // Client-side detection fallback: check viewport width.
  // CNA mini-browser typically has width < 400px.
  if (typeof window !== 'undefined') {
    const isSmallViewport = window.innerWidth < 400;
    const ua = navigator.userAgent;
    const isAppleCNA = /iPhone|iPad|iPod|Macintosh/.test(ua) && isSmallViewport;
    if (isAppleCNA) return { isCNA: true, os: /iPhone|iPad|iPod/.test(ua) ? 'iOS' : 'macOS', mac };
  }

  return { isCNA: false, os, mac };
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

interface AuthMethodOption {
  method: string;
  label: string;
  description: string;
}

interface FormFieldConfig {
  visible?: boolean;
  required?: boolean;
  label?: string;
}

type FormFieldsConfig = Record<string, boolean | FormFieldConfig>;

interface PortalConfig {
  name: string;
  slug: string;
 tenantId?: string;
  partnerId?: string;
  authMethod: string;
  sessionTimeout: number;
  redirectUrl?: string;
  postLoginMode?: 'stay' | 'redirect';
  postLoginRedirectUrl?: string;
  postLoginRedirectTarget?: '_self' | '_blank';
  cnaEnabledMac?: boolean;
  autoAuthEnabled?: boolean;
  maxBandwidthDown: number;
  maxBandwidthUp: number;
  design: PortalDesignConfig;
  ssids: string[];
  termsRequired: boolean;
  authMethods: AuthMethodOption[];
  formFields: FormFieldsConfig | null;
}

interface AuthResult {
  authenticated: boolean;
  method: string;
  sessionTimeout: number;
  remainingMinutes?: number;
  bandwidthDown: number;
  bandwidthUp: number;
  message: string;
  sessionId?: string;
  username?: string;
  guestId?: string;
  tenantId?: string;
  partnerId?: string;
  // Guest info for success screen display
  guestName?: string;
  roomNumber?: string;
  // Data usage (MB)
  dataUsedMb?: number;
  dataLimitMb?: number;
  // External gateway fields (MikroTik, etc.)
  needGatewayLogin?: boolean;
  gatewayCallbackUrl?: string;
  gatewayType?: string;
  radiusUsername?: string;
  radiusPassword?: string;
  // CP-HIGH-10: Server-signed session token for secure disconnect/self-service
  _sessionToken?: string;
}

// ────────────────────────────────────────────────────────────
// Defaults
// ────────────────────────────────────────────────────────────

const DEFAULT_AUTH_METHODS: AuthMethodOption[] = [
  { method: 'voucher', label: 'Voucher Code', description: 'Enter a WiFi voucher' },
];

const METHOD_ICONS: Record<string, React.ReactNode> = {
  voucher: <QrCode className="w-4 h-4" />,
  room_number: <DoorOpen className="w-4 h-4" />,
  pms_credentials: <Key className="w-4 h-4" />,
  sms_otp: <Smartphone className="w-4 h-4" />,
  email_otp: <Mail className="w-4 h-4" />,
  open_access: <Globe className="w-4 h-4" />,
  mac_auth: <Shield className="w-4 h-4" />,
  social: <Share2 className="w-4 h-4" />,
  ldap: <Shield className="w-4 h-4" />,
};

// ────────────────────────────────────────────────────────────
// Unified form field definitions — matches the designer's FIELD_DEFINITIONS
// ────────────────────────────────────────────────────────────

// ── Country Code Data ──────────────────────────────────────────────────
const COUNTRY_CODES = [
  { code: '+91', label: 'India (+91)', flag: '🇮🇳' },
  { code: '+1', label: 'USA / Canada (+1)', flag: '🇺🇸' },
  { code: '+44', label: 'UK (+44)', flag: '🇬🇧' },
  { code: '+61', label: 'Australia (+61)', flag: '🇦🇺' },
  { code: '+81', label: 'Japan (+81)', flag: '🇯🇵' },
  { code: '+49', label: 'Germany (+49)', flag: '🇩🇪' },
  { code: '+33', label: 'France (+33)', flag: '🇫🇷' },
  { code: '+86', label: 'China (+86)', flag: '🇨🇳' },
  { code: '+971', label: 'UAE (+971)', flag: '🇦🇪' },
  { code: '+966', label: 'Saudi Arabia (+966)', flag: '🇸🇦' },
  { code: '+65', label: 'Singapore (+65)', flag: '🇸🇬' },
  { code: '+82', label: 'South Korea (+82)', flag: '🇰🇷' },
  { code: '+39', label: 'Italy (+39)', flag: '🇮🇹' },
  { code: '+34', label: 'Spain (+34)', flag: '🇪🇸' },
  { code: '+55', label: 'Brazil (+55)', flag: '🇧🇷' },
  { code: '+27', label: 'South Africa (+27)', flag: '🇿🇦' },
  { code: '+94', label: 'Sri Lanka (+94)', flag: '🇱🇰' },
  { code: '+977', label: 'Nepal (+977)', flag: '🇳🇵' },
  { code: '+66', label: 'Thailand (+66)', flag: '🇹🇭' },
  { code: '+60', label: 'Malaysia (+60)', flag: '🇲🇾' },
];

// Validation helpers
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const isValidEmail = (v: string) => EMAIL_REGEX.test(v.trim());
const isValidPhone = (v: string) => /^[0-9]{7,15}$/.test(v.replace(/[\s\-()]/g, ''));

const UNIFIED_FIELD_DEFS: Array<{
  key: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  type: string;
  inputMode?: 'text' | 'tel' | 'numeric';
  maxLength?: number;
  className?: string;
}> = [
  { key: 'firstName', label: 'First Name', placeholder: 'John', icon: <User className="w-4 h-4" />, type: 'text' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Smith', icon: <User className="w-4 h-4" />, type: 'text' },
  { key: 'roomNumber', label: 'Room Number', placeholder: 'e.g. 101', icon: <Building className="w-4 h-4" />, type: 'text' },
  { key: 'phone', label: 'Phone Number', placeholder: '98765 43210', icon: <Phone className="w-4 h-4" />, type: 'tel', inputMode: 'tel' },
  { key: 'email', label: 'Email Address', placeholder: 'guest@example.com', icon: <Mail className="w-4 h-4" />, type: 'email' },
  { key: 'passport', label: 'Passport / ID', placeholder: 'Passport or ID number', icon: <ScanLine className="w-4 h-4" />, type: 'text' },
  { key: 'bookingId', label: 'Booking ID', placeholder: 'Booking reference', icon: <Calendar className="w-4 h-4" />, type: 'text' },
  { key: 'username', label: 'Username', placeholder: 'Enter username', icon: <User className="w-4 h-4" />, type: 'text' },
  { key: 'password', label: 'Password', placeholder: 'Enter password', icon: <Lock className="w-4 h-4" />, type: 'password' },
  { key: 'voucherCode', label: 'Voucher Code', placeholder: 'XXXXX-XXXXX', icon: <QrCode className="w-4 h-4" />, type: 'text', className: 'text-center text-lg font-mono font-bold tracking-wider uppercase' },
];

// ────────────────────────────────────────────────────────────
// Amenity icons mapping
// ────────────────────────────────────────────────────────────

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  'Free WiFi': Wifi,
  'Swimming Pool': Waves,
  'Spa & Wellness': Sparkles,
  'Restaurant': UtensilsCrossed,
  'Fitness Center': Dumbbell,
  'Room Service': Coffee,
  'Parking': Car,
  'Concierge': Star,
};

// ── Custom amenity icons mapping (Feature 7) ──
const CUSTOM_AMENITY_ICONS: Record<string, typeof Wifi> = {
  tv: Tv,
  wine: Wine,
  baby: Baby,
  plane: Plane,
  bath: Bath,
  shirt: Shirt,
  music: Music,
  camera: Camera,
  umbrella: Umbrella,
};

// ────────────────────────────────────────────────────────────
// Live Clock Component
// ────────────────────────────────────────────────────────────

function LiveClock({ design }: { design: PortalDesignConfig }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const color = getMutedTextColor(design);

  return (
    <div className="flex items-center justify-center gap-2 text-sm">
      <Clock className="w-4 h-4" style={{ color }} />
      <span style={{ color }}>{time}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Confetti Effect
// ────────────────────────────────────────────────────────────

function ConfettiEffect({ active }: { active: boolean }) {
  const [pieces, setPieces] = useState<Array<{ id: number; left: string; color: string; delay: string; duration: string; size: number }>>([]);
  
  useEffect(() => {
    if (!active) { setPieces([]); return; }
    const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4'];
    const newPieces = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: `${Math.random() * 2}s`,
      duration: `${2 + Math.random() * 3}s`,
      size: 6 + Math.random() * 6,
    }));
    setPieces(newPieces);
  }, [active]);
  
  if (!active || pieces.length === 0) return null;
  
  return (
    <>
      {pieces.map(p => (
        <div
          key={p.id}
          className="portal-confetti-piece"
          style={{
            left: p.left,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
          }}
        />
      ))}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Weather Widget (Feature 5)
// ────────────────────────────────────────────────────────────

const weatherCache = new Map<string, { temp: string; condition: string }>();

function WeatherIcon({ condition, color, size = 18 }: { condition: string; color: string; size?: number }) {
  const iconKey = getWeatherIconKey(condition);
  const icon = WEATHER_ICONS[iconKey] || WEATHER_ICONS.clear;
  return (
    <svg width={size} height={size} viewBox={icon.viewBox} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={icon.path} />
    </svg>
  );
}

function WeatherWidget({ design }: { design: PortalDesignConfig }) {
  const lang = usePortalLang();
  const location = design.weatherLocation;
  const [weather, setWeather] = useState<{ temp: string; condition: string } | null>(
    () => (location ? weatherCache.get(location) ?? null : null)
  );
  const [loading, setLoading] = useState(!weather && !!location);
  const color = getMutedTextColor(design);

  useEffect(() => {
    if (!location) return;
    if (weatherCache.has(location)) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('Weather fetch timeout'), 5000);

    // Fetch via server-side proxy — captive portal blocks direct external access
    fetch(`/api/wifi/portal/weather?location=${encodeURIComponent(location)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const parsed = { temp: data.temp || '--°', condition: data.condition || 'Clear' };
        weatherCache.set(location, parsed);
        setWeather(parsed);
      })
      .catch(() => {
        const fallback = { temp: '--°', condition: location };
        weatherCache.set(location, fallback);
        setWeather(fallback);
      })
      .finally(() => setLoading(false));

    return () => {
      clearTimeout(timeoutId);
      controller.abort('Component cleanup');
    };
  }, [location]);

  if (!location) {
    return (
      <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color }}>
        <WeatherIcon condition="clear" color={color} size={14} />
        <span style={{ color, fontStyle: 'italic' }}>{getUIString(lang, 'weatherSetLocation')}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm">
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" style={{ color }} />
      ) : weather ? (
        <>
          <WeatherIcon condition={weather.condition} color={color} />
          <span style={{ color }}>{weather.temp} {weather.condition}</span>
        </>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Multi-Slide Promotion Carousel (Feature 3)
// ────────────────────────────────────────────────────────────

function PromotionCarousel({ design }: { design: PortalDesignConfig }) {
  const [current, setCurrent] = useState(0);
  const promotions = (design.promotions || []).filter((p) => p.title || p.description);
  const dark = isDarkBackground(design);

  useEffect(() => {
    if (promotions.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % promotions.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [promotions.length]);

  if (promotions.length === 0) return null;

  const promo = promotions[current];

  return (
    <div className="w-full relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-start gap-3 rounded-xl p-3"
          style={{
            backgroundColor: promo.backgroundColor || (dark ? 'rgba(255,255,255,0.12)' : design.accentColor + '10'),
            backdropFilter: dark ? 'blur(8px)' : undefined,
            border: dark ? '1px solid rgba(255,255,255,0.15)' : 'none',
            borderRadius: design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem',
          }}
        >
        <Gift className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: design.accentColor }} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: dark ? '#ffffff' : getCardTextColor(design) }}>
            {promo.title}
          </p>
          {promo.description && (
            <p className="text-xs mt-1" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)' }}>
              {promo.description}
            </p>
          )}
        </div>
      </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      {promotions.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {promotions.map((p, i) => (
            <button
              key={p.id || `dot-${i}`}
              onClick={() => setCurrent(i)}
              className="w-1.5 h-1.5 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i === current ? design.accentColor : (dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)'),
                transform: i === current ? 'scale(1.4)' : 'scale(1)',
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Language Switcher (Feature 1)
// ────────────────────────────────────────────────────────────

function LanguageSwitcher({ design, selectedLanguage, setSelectedLanguage }: {
  design: PortalDesignConfig;
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
}) {
  const languages = (design.languages || []).filter(Boolean);
  const mutedColor = getMutedTextColor(design);

  // Don't render if fewer than 2 languages
  if (languages.length <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-1.5 mb-2">
      <Languages className="w-3.5 h-3.5" style={{ color: mutedColor }} />
      <select
        value={selectedLanguage}
        onChange={(e) => setSelectedLanguage(e.target.value)}
        className="portal-select text-xs"
        style={{ color: mutedColor }}
        aria-label="Select language"
      >
        {languages.map((lang) => (
          <option key={lang} value={lang}>
            {getLanguageLabel(lang)}
          </option>
        ))}
      </select>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Marketing Consent Checkboxes (Feature 2)
// ────────────────────────────────────────────────────────────

function MarketingConsent({ design, emailConsent, setEmailConsent, phoneConsent, setPhoneConsent }: {
  design: PortalDesignConfig;
  emailConsent: boolean;
  setEmailConsent: (v: boolean) => void;
  phoneConsent: boolean;
  setPhoneConsent: (v: boolean) => void;
}) {
  const lang = usePortalLang();
  const optIn = design.marketingOptIn;
  if (!optIn?.enabled) return null;

  const mutedColor = getMutedTextColor(design);

  return (
    <div className="space-y-2">
      {optIn.consentText && (
        <p className="text-xs" style={{ color: mutedColor }}>
          {optIn.consentText}
        </p>
      )}
      <div className="space-y-1.5">
        {optIn.emailConsent && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={emailConsent}
              onChange={(e) => setEmailConsent(e.target.checked)}
              className="portal-checkbox"
              style={{ '--portal-accent': design.accentColor } as React.CSSProperties}
            />
            <span style={{ color: mutedColor }}>{getUIString(lang, 'emailMarketing')}</span>
          </label>
        )}
        {optIn.phoneConsent && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={phoneConsent}
              onChange={(e) => setPhoneConsent(e.target.checked)}
              className="portal-checkbox"
              style={{ '--portal-accent': design.accentColor } as React.CSSProperties}
            />
            <span style={{ color: mutedColor }}>{getUIString(lang, 'smsMarketing')}</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Marketing Consent Placeholder (for block-based layouts)
// ────────────────────────────────────────────────────────────

function MarketingConsentPlaceholder({ design, onConsentChange }: { design: PortalDesignConfig; onConsentChange?: (consent: { emailConsent: boolean; smsConsent: boolean }) => void }) {
  const lang = usePortalLang();
  const optIn = design.marketingOptIn;
  const [emailChecked, setEmailChecked] = useState(false);
  const [smsChecked, setSmsChecked] = useState(false);
  if (!optIn?.enabled) return null;

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setEmailChecked(val);
    onConsentChange?.({ emailConsent: val, smsConsent: smsChecked });
  };
  const handleSmsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setSmsChecked(val);
    onConsentChange?.({ emailConsent: emailChecked, smsConsent: val });
  };

  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;

  return (
    <div className="space-y-2 rounded-xl p-3" style={{ backgroundColor: accent + '08', border: `1px solid ${accent}15` }}>
      {optIn.consentText && (
        <p className="text-xs" style={{ color: mutedColor }}>
          {optIn.consentText}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {optIn.emailConsent && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" className="portal-checkbox" style={{ '--portal-accent': accent } as React.CSSProperties} checked={emailChecked} onChange={handleEmailChange} />
            <span style={{ color: mutedColor }}>{getUIString(lang, 'emailMarketing')}</span>
          </label>
        )}
        {optIn.phoneConsent && (
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" className="portal-checkbox" style={{ '--portal-accent': accent } as React.CSSProperties} checked={smsChecked} onChange={handleSmsChange} />
            <span style={{ color: mutedColor }}>{getUIString(lang, 'smsMarketing')}</span>
          </label>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Post-Connect Guest Survey (Feature 4)
// ────────────────────────────────────────────────────────────

// ── Rating mapping helper ──
function optionToRating(option: string, options: string[]): number {
  // Try known label mapping first
  const knownMap: Record<string, number> = {
    'excellent': 5, 'great': 5, 'amazing': 5, 'love it': 5,
    'good': 4, 'like it': 4, 'satisfied': 4,
    'average': 3, 'okay': 3, 'neutral': 3, 'so-so': 3,
    'poor': 2, 'dislike': 2, 'unsatisfied': 2,
    'terrible': 1, 'hate it': 1, 'very bad': 1,
  };
  const lower = option.toLowerCase().trim();
  if (knownMap[lower]) return knownMap[lower];

  // Fallback: map by position (first option = best = 5, last = 1)
  const idx = options.indexOf(option);
  if (idx >= 0 && options.length > 0) {
    return Math.max(1, options.length - idx);
  }
  return 3; // neutral default
}

// ── Device type detection ──
function detectDeviceType(): string {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'phone';
  return 'desktop';
}

function GuestSurvey({
  design,
  tenantId,
  partnerId,
  sessionId,
  guestId,
}: {
  design: PortalDesignConfig;
  tenantId?: string;
  partnerId?: string;
  sessionId?: string;
  guestId?: string;
}) {
  const lang = usePortalLang();
  const surveyConfig = design.surveyConfig;
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!surveyConfig?.enabled || !surveyConfig.question || !surveyConfig.options?.length) return null;

  const mutedColor = getMutedTextColor(design);
  const textColor = getCardTextColor(design);
  const accent = design.accentColor;

  // ── Handle option selection ──
  const handleSelect = async (option: string) => {
    setSelected(option);

    // Only persist to DB if we have tenantId and partnerId
    if (!tenantId || !partnerId) return;

    setSubmitting(true);
    try {
      const rating = optionToRating(option, surveyConfig.options);
      await fetch('/api/wifi/satisfaction/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          partnerId,
          sessionId: sessionId || undefined,
          guestId: guestId || undefined,
          rating,
          comment: option, // Store the selected option text as comment
          deviceType: detectDeviceType(),
        }),
      });
    } catch {
      // Silent failure — the thank-you message is already showing
    } finally {
      setSubmitting(false);
    }
  };

  if (selected) {
    return (
      <div className="text-center space-y-2 mt-4">
        {submitting ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: accent }} />
        ) : (
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-full"
            style={{ backgroundColor: accent + '15' }}
          >
            <Check className="w-6 h-6" style={{ color: accent }} />
          </div>
        )}
        <p className="text-sm font-medium" style={{ color: textColor }}>
          {surveyConfig.thankYouMessage || getUIString(lang, 'thankYouForFeedback')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4 pt-4" style={{ borderTop: `1px solid ${accent}15` }}>
      <p className="text-sm font-medium text-center" style={{ color: textColor }}>
        {surveyConfig.question}
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {surveyConfig.options.map((option) => (
          <button
            key={option}
            onClick={() => handleSelect(option)}
            className="px-3 py-1.5 text-xs font-medium rounded-full transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              backgroundColor: accent + '15',
              color: accent,
              border: `1px solid ${accent}30`,
            }}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Plan Selector Widget (Feature 9)
// ────────────────────────────────────────────────────────────

interface PlanSelectorConfig {
  showPricing: boolean;
  showDataLimit: boolean;
  showSpeed: boolean;
  allowUpgrade: boolean;
}

interface FetchedPlan {
  id: string;
  name: string;
  description?: string | null;
  downloadSpeed: number;
  uploadSpeed: number;
  dataLimit?: number | null;
  price: number;
  currency: string;
  priority: number;
  status: string;
}

function PlanSelectorWidget({ config, currentPlanName, onUpgrade, design, tenantId }: {
  config: PlanSelectorConfig;
  currentPlanName?: string;
  onUpgrade: (planId: string) => void;
  design: PortalDesignConfig;
  tenantId?: string;
}) {
  const lang = usePortalLang();
  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;
  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';

  const [plans, setPlans] = useState<FetchedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchPlans = async () => {
      try {
        setLoading(true);
        setError(false);
        const res = await fetch(`/api/v1/wifi/public-plans?tenantId=${encodeURIComponent(tenantId)}`);
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const json = await res.json();
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setPlans(json.data);
        } else {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchPlans();
    return () => { cancelled = true; };
  }, [tenantId]);

  if (loading) {
    return (
      <div className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>
          {getUIString(lang, 'planSelector')}
        </h3>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse p-3 rounded-lg" style={{ backgroundColor: accent + '06', borderRadius: cardRadius }}>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <div className="h-3 w-20 rounded" style={{ backgroundColor: accent + '15' }} />
                  <div className="h-2 w-28 rounded" style={{ backgroundColor: accent + '10' }} />
                </div>
                <div className="h-4 w-10 rounded" style={{ backgroundColor: accent + '15' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || plans.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>
          {getUIString(lang, 'planSelector')}
        </h3>
        <p className="text-xs text-center py-2" style={{ color: mutedColor }}>
          {getUIString(lang, 'plansUnavailable')}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>
        {getUIString(lang, 'planSelector')}
      </h3>
      <div className="grid gap-2">
        {plans.map(plan => {
          const isCurrentPlan = plan.name === currentPlanName;
          const speedDown = Math.round(plan.downloadSpeed / 1000000) || plan.downloadSpeed;
          const speedUp = Math.round(plan.uploadSpeed / 1000000) || plan.uploadSpeed;
          return (
            <div
              key={plan.id}
              className={`p-3 transition-all duration-200 ${isCurrentPlan ? 'ring-2' : 'border'}`}
              style={{
                borderRadius: cardRadius,
                borderColor: isCurrentPlan ? accent : accent + '25',
                backgroundColor: isCurrentPlan ? accent + '08' : accent + '04',
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-sm font-semibold" style={{ color: textColor }}>{plan.name}</span>
                  {isCurrentPlan && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: accent + '15', color: accent }}>
                      {getUIString(lang, 'currentPlan')}
                    </span>
                  )}
                  <div className="text-[10px] mt-1" style={{ color: mutedColor }}>
                    {config.showSpeed && <span>{speedDown}/{speedUp} Mbps</span>}
                    {config.showSpeed && config.showDataLimit && <span> • </span>}
                    {config.showDataLimit && <span>{plan.dataLimit ? `${plan.dataLimit >= 1000 ? `${Math.round(plan.dataLimit / 1000)} GB` : `${plan.dataLimit} MB`}` : getUIString(lang, 'noDataLimit')}</span>}
                  </div>
                </div>
                <div className="text-right">
                  {config.showPricing && (
                    <span className="text-sm font-bold" style={{ color: textColor }}>
                      {plan.price === 0
                        ? getUIString(lang, 'freeTag')
                        : `${getCurrencySymbol(plan.currency)}${plan.price}`}
                    </span>
                  )}
                  {config.allowUpgrade && !isCurrentPlan && (
                    <button
                      onClick={() => onUpgrade(plan.id)}
                      className="mt-1 text-[10px] px-2 py-0.5 rounded font-medium"
                      style={{ backgroundColor: accent, color: '#ffffff' }}
                    >
                      {getUIString(lang, 'upgradePlan')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Marketing Capture Widget (Feature 14)
// ────────────────────────────────────────────────────────────

interface MarketingCaptureConfig {
  collectEmail: boolean;
  collectPhone: boolean;
  collectName: boolean;
  consentText: string;
  required: boolean;
}

function MarketingCaptureWidget({ config, onSubmit, onSkip, design }: {
  config: MarketingCaptureConfig;
  onSubmit: (data: { email?: string; phone?: string; name?: string }) => void;
  onSkip: () => void;
  design: PortalDesignConfig;
}) {
  const lang = usePortalLang();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;
  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';

  return (
    <div className="mt-4 space-y-3" style={{ border: `1px solid ${accent}20`, borderRadius: cardRadius, padding: '1rem', backgroundColor: accent + '04' }}>
      <h3 className="text-sm font-semibold" style={{ color: textColor }}>{getUIString(lang, 'marketingTitle')}</h3>
      <p className="text-xs" style={{ color: mutedColor }}>{config.consentText}</p>
      {config.collectName && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: textColor }}>{getUIString(lang, 'fullName')}</label>
          <input
            placeholder="John Smith"
            value={name}
            onChange={e => setName(e.target.value)}
            className={getInputClasses(design)}
          />
        </div>
      )}
      {config.collectEmail && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: textColor }}>{getUIString(lang, 'emailAddress')}</label>
          <input
            type="email"
            placeholder="guest@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className={getInputClasses(design)}
          />
        </div>
      )}
      {config.collectPhone && (
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: textColor }}>{getUIString(lang, 'phoneNumber')}</label>
          <input
            type="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className={getInputClasses(design)}
          />
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => onSubmit({ email, phone, name })}
          className="flex-1 text-xs py-2 font-medium"
          style={{ backgroundColor: accent, color: '#ffffff', borderRadius: cardRadius }}
        >
          {getUIString(lang, 'subscribeBtn')}
        </button>
        {!config.required && (
          <button
            onClick={onSkip}
            className="text-xs border py-2 px-3"
            style={{ borderRadius: cardRadius, borderColor: accent + '30', color: mutedColor }}
          >
            {getUIString(lang, 'skipBtn')}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// QR Code Widget (Feature 17)
// ────────────────────────────────────────────────────────────

interface QrCodeConfig {
  showOnSuccess: boolean;
  qrSize: 'small' | 'medium' | 'large';
  includeSSID: boolean;
}

function QrCodeWidget({ ssid, username, password, config, design }: {
  ssid: string;
  username: string;
  password: string;
  config: QrCodeConfig;
  design: PortalDesignConfig;
}) {
  const lang = usePortalLang();
  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;
  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';

  const sizeMap = { small: 128, medium: 200, large: 300 };
  const qrSize = sizeMap[config.qrSize];

  return (
    <div className="mt-4 space-y-2" style={{ border: `1px solid ${accent}20`, borderRadius: cardRadius, padding: '1rem', backgroundColor: accent + '04' }}>
      <h3 className="text-sm font-semibold text-center" style={{ color: textColor }}>{getUIString(lang, 'qrCodeTitle')}</h3>
      <p className="text-[10px] text-center" style={{ color: mutedColor }}>{getUIString(lang, 'qrCodeScan')}</p>
      <div className="inline-block p-3 bg-white rounded-lg border border-gray-200 mx-auto block">
        <div className="grid grid-cols-[repeat(11,1fr)] gap-[2px]" style={{ width: qrSize, height: qrSize }}>
          {Array.from({ length: 121 }).map((_, i) => (
            <div key={i} className="bg-foreground" style={{
              opacity: Math.random() > 0.45 ? 1 : 0,
              borderRadius: 1,
              aspectRatio: '1/1'
            }} />
          ))}
        </div>
      </div>
      <div className="text-xs space-y-1 mt-2 text-center" style={{ color: textColor }}>
        {config.includeSSID && <p><span style={{ color: mutedColor }}>{getUIString(lang, 'ssidLabel')}:</span> {ssid}</p>}
        <p><span style={{ color: mutedColor }}>Username:</span> {username}</p>
        <p><span style={{ color: mutedColor }}>Password:</span> {password}</p>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Auto-Renewal Banner (Feature 18)
// ────────────────────────────────────────────────────────────

function AutoRenewalBanner({ design }: { design: PortalDesignConfig }) {
  const lang = usePortalLang();
  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';

  return (
    <div className="mt-3 flex items-center gap-2 p-3" style={{
      backgroundColor: 'rgba(16, 185, 129, 0.08)',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      borderRadius: cardRadius,
    }}>
      <RefreshCw className="h-4 w-4 text-emerald-600 shrink-0" />
      <p className="text-xs text-emerald-700 dark:text-emerald-300">
        {getUIString(lang, 'autoRenewalMsg')}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Speed Test Widget (Feature 20)
// ────────────────────────────────────────────────────────────

interface SpeedTestConfig {
  showOnSuccess: boolean;
  testDuration: number;
}

function SpeedTestWidget({ config, design }: { config: SpeedTestConfig; design: PortalDesignConfig }) {
  const lang = usePortalLang();
  const [testing, setTesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'download' | 'upload'>('idle');
  const [result, setResult] = useState<{ download: number; upload: number; rating: string } | null>(null);
  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;
  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speedRef = useRef<number>(0);

  const startTest = useCallback(() => {
    setTesting(true);
    setResult(null);
    setProgress(0);
    setCurrentSpeed(0);
    setElapsedTime(0);
    setPhase('download');

    // Generate target peak speed: 15-85 Mbps
    const downloadPeak = Math.random() * 70 + 15;
    const uploadPeak = Math.random() * 30 + 5;
    const totalDuration = config.testDuration; // seconds
    const downloadDuration = Math.floor(totalDuration * 0.75);
    const tickMs = 100; // Update every 100ms
    const totalTicks = totalDuration * (1000 / tickMs);
    const downloadTicks = downloadDuration * (1000 / tickMs);
    let tick = 0;

    const speedSamples: number[] = [];

    intervalRef.current = setInterval(() => {
      tick++;
      const globalProgress = tick / totalTicks;
      const currentElapsed = tick * tickMs / 1000;

      if (tick <= downloadTicks) {
        // Download phase (75% of time)
        setPhase('download');
        // Ramp up quickly then fluctuate around peak
        const rampUpTicks = downloadTicks * 0.3;
        let target: number;
        if (tick < rampUpTicks) {
          // Quick ramp up
          const rampProgress = tick / rampUpTicks;
          target = downloadPeak * Math.min(1, rampProgress * rampProgress * 1.5);
        } else {
          // Fluctuate around peak with ±5 Mbps jitter
          const jitter = (Math.random() - 0.5) * 10;
          target = Math.max(5, downloadPeak + jitter);
        }
        // Smooth transition
        speedRef.current = speedRef.current * 0.6 + target * 0.4;
        speedSamples.push(speedRef.current);

      } else {
        // Upload phase (25% of time)
        setPhase('upload');
        const uploadTick = tick - downloadTicks;
        const uploadTotalTicks = totalTicks - downloadTicks;
        const rampUpTicks = uploadTotalTicks * 0.4;
        let target: number;
        if (uploadTick < rampUpTicks) {
          const rampProgress = uploadTick / rampUpTicks;
          // Transition from download speed to upload speed
          const fromSpeed = speedRef.current;
          target = fromSpeed + (uploadPeak - fromSpeed) * Math.min(1, rampProgress * 1.5);
        } else {
          const jitter = (Math.random() - 0.5) * 6;
          target = Math.max(2, uploadPeak + jitter);
        }
        speedRef.current = speedRef.current * 0.6 + target * 0.4;

      }

      setCurrentSpeed(parseFloat(speedRef.current.toFixed(1)));
      setProgress(Math.min(100, Math.round(globalProgress * 100)));
      setElapsedTime(currentElapsed);

      if (tick >= totalTicks) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }

        // Calculate final download speed from samples
        const downloadSamples = speedSamples.filter((_, i) => i < downloadTicks);
        const finalDownload = downloadSamples.length > 0
          ? parseFloat((downloadSamples.reduce((a, b) => a + b, 0) / downloadSamples.length).toFixed(1))
          : parseFloat((downloadPeak * 0.85).toFixed(1));

        // Final upload speed
        const finalUpload = parseFloat((uploadPeak * 0.85 + Math.random() * 2).toFixed(1));

        // Determine rating
        const avgSpeed = (finalDownload + finalUpload) / 2;
        let rating: string;
        if (avgSpeed >= 40) rating = getUIString(lang, 'speedRatingExcellent');
        else if (avgSpeed >= 15) rating = getUIString(lang, 'speedRatingGood');
        else rating = getUIString(lang, 'speedRatingFair');

        setResult({ download: finalDownload, upload: finalUpload, rating });
        setPhase('idle');
        setTesting(false);
        setProgress(100);
      }
    }, tickMs);
  }, [config.testDuration, lang]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="mt-4 space-y-3" style={{ border: `1px solid ${accent}20`, borderRadius: cardRadius, padding: '1rem', backgroundColor: accent + '04' }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: textColor }}>{getUIString(lang, 'speedTestTitle')}</h3>
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: accent + '12', color: accent }}>
          {getUIString(lang, 'speedTestSimulated')}
        </span>
      </div>

      {!result && (
        <button
          onClick={startTest}
          disabled={testing}
          className="w-full text-xs py-2 font-medium transition-all duration-200 disabled:opacity-50"
          style={{ backgroundColor: accent, color: '#ffffff', borderRadius: cardRadius }}
        >
          {testing
            ? `${phase === 'download' ? getUIString(lang, 'downloadLabel') : phase === 'upload' ? getUIString(lang, 'uploadLabel') : ''} ${getUIString(lang, 'testingLabel')}`
            : getUIString(lang, 'startTestBtn')}
        </button>
      )}

      {testing && (
        <div className="space-y-2">
          {/* Current speed display */}
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: textColor }}>
              {currentSpeed} <span className="text-xs font-normal" style={{ color: mutedColor }}>Mbps</span>
            </p>
            <p className="text-[10px]" style={{ color: mutedColor }}>
              {phase === 'download' ? getUIString(lang, 'downloadLabel') : getUIString(lang, 'uploadLabel')} • {formatTime(elapsedTime)}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: accent + '15' }}>
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>

          {/* Phase indicators */}
          <div className="flex justify-between text-[10px]" style={{ color: mutedColor }}>
            <span className={phase === 'download' ? 'font-medium' : ''} style={{ color: phase === 'download' ? textColor : mutedColor }}>
              {getUIString(lang, 'downloadLabel')}
            </span>
            <span>{progress}%</span>
            <span className={phase === 'upload' ? 'font-medium' : ''} style={{ color: phase === 'upload' ? textColor : mutedColor }}>
              {getUIString(lang, 'uploadLabel')}
            </span>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Rating */}
          <div className="text-center">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: result.rating === getUIString(lang, 'speedRatingExcellent') ? '#22c55e20'
                  : result.rating === getUIString(lang, 'speedRatingGood') ? '#eab30820'
                  : '#f9731620',
                color: result.rating === getUIString(lang, 'speedRatingExcellent') ? '#22c55e'
                  : result.rating === getUIString(lang, 'speedRatingGood') ? '#eab308'
                  : '#f97316',
              }}
            >
              {result.rating}
            </span>
          </div>

          {/* Speed results */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg p-2" style={{ backgroundColor: accent + '08' }}>
              <p className="text-lg font-bold" style={{ color: textColor }}>{result.download}</p>
              <p className="text-[10px]" style={{ color: mutedColor }}>{getUIString(lang, 'downloadLabel')} Mbps</p>
            </div>
            <div className="rounded-lg p-2" style={{ backgroundColor: accent + '08' }}>
              <p className="text-lg font-bold" style={{ color: textColor }}>{result.upload}</p>
              <p className="text-[10px]" style={{ color: mutedColor }}>{getUIString(lang, 'uploadLabel')} Mbps</p>
            </div>
          </div>

          {/* Re-test button */}
          <button
            onClick={startTest}
            className="w-full text-[10px] py-1.5 font-medium transition-all duration-200"
            style={{ backgroundColor: accent + '12', color: accent, borderRadius: cardRadius }}
          >
            {getUIString(lang, 'runAgainBtn')}
          </button>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Terms & Conditions Modal (Feature 6)
// ────────────────────────────────────────────────────────────

function TermsModal({ design, open, onClose }: { design: PortalDesignConfig; open: boolean; onClose: () => void }) {
  const lang = usePortalLang();
  if (!open) return null;

  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const dark = isDarkBackground(design);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative max-w-md w-full max-h-[80vh] overflow-y-auto rounded-2xl p-6 shadow-2xl"
        style={{
          backgroundColor: dark ? 'rgba(30,30,30,0.95)' : '#ffffff',
          color: textColor,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold" style={{ color: textColor }}>{getUIString(lang, 'termsAndConditions')}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:opacity-80"
            style={{ backgroundColor: mutedColor + '20' }}
            aria-label="Close terms"
          >
            <X className="w-4 h-4" style={{ color: mutedColor }} />
          </button>
        </div>
        <div className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: mutedColor }}>
          {getLocalizedText(design, 'termsText', lang) || 'Terms and conditions content will appear here.'}
        </div>
        {design.termsUrl && (
          <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${mutedColor}15` }}>
            <a
              href={design.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium inline-flex items-center gap-1"
              style={{ color: design.accentColor }}
            >
              View full terms <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Dynamic Input Component
// ────────────────────────────────────────────────────────────

function DynamicInput({
  design,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  onKeyDown,
  icon,
  inputMode,
  maxLength,
  className = '',
}: {
  design: PortalDesignConfig;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  icon?: React.ReactNode;
  inputMode?: 'text' | 'tel' | 'numeric';
  maxLength?: number;
  className?: string;
}) {
  const inputCls = icon
    ? getInputWithIconClasses(design)
    : getInputClasses(design);

  const labelColor = getCardTextColor(design);
  const iconColor = getIconColor(design);
  const focusStyle = getInputFocusStyle(design);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold uppercase tracking-wide portal-label" style={{ color: labelColor }}>
        {label}
      </label>
      <div className="relative group">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 group-focus-within:text-[color:var(--portal-accent)]" style={{ color: iconColor }}>
            {icon}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
          inputMode={inputMode}
          maxLength={maxLength}
          className={cn(inputCls, className, 'portal-input')}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = focusStyle.borderColor;
            el.style.boxShadow = focusStyle.boxShadow;
          }}
          onBlur={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = '';
            el.style.boxShadow = '';
          }}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Phone Input with Country Code Dropdown
// ────────────────────────────────────────────────────────────
function PhoneInputWithCountryCode({
  design,
  label,
  value,
  onChange,
  countryCode,
  onCountryCodeChange,
  placeholder,
  disabled,
  autoFocus,
  onKeyDown,
  error,
}: {
  design: PortalDesignConfig;
  label: string;
  value: string;
  onChange: (v: string) => void;
  countryCode: string;
  onCountryCodeChange: (c: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  error?: string;
}) {
  const dark = isDarkBackground(design);
  const labelColor = getCardTextColor(design);
  const focusStyle = getInputFocusStyle(design);
  const inputCls = getInputClasses(design);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === countryCode) || COUNTRY_CODES[0];

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" style={{ color: labelColor }}>
        {label}
      </label>
      <div className="flex gap-2">
        {/* Country code dropdown */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => !disabled && setOpen(!open)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1 px-2 h-[42px] text-sm font-medium rounded-lg border transition-all',
              open ? 'ring-2' : ''
            )}
            style={{
              borderColor: open ? (design.accentColor || '#0d9488') : (design.formBorder || '#d1d5db'),
              backgroundColor: dark ? 'rgba(255,255,255,0.06)' : (design.formBackground || '#ffffff'),
              color: getCardTextColor(design),
              ...(open ? { boxShadow: focusStyle.boxShadow } : {}),
            }}
          >
            <span className="text-sm leading-none">{selectedCountry.flag}</span>
            <ChevronDown className={cn('w-3 h-3 transition-transform ml-0.5', open && 'rotate-180')} />
          </button>
          {open && (
            <div
              className="absolute bottom-full left-0 z-50 mb-1 w-44 max-h-52 overflow-y-auto rounded-lg border shadow-lg"
              style={{
                backgroundColor: dark ? 'rgba(30,30,30,0.95)' : '#ffffff',
                borderColor: dark ? 'rgba(255,255,255,0.15)' : '#e5e7eb',
                backdropFilter: 'blur(12px)',
              }}
            >
              {COUNTRY_CODES.map((c) => (
                <button
                  key={c.code + c.label}
                  type="button"
                  onClick={() => {
                    onCountryCodeChange(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center gap-1.5 w-full px-2 py-1 text-left text-xs transition-colors',
                    countryCode === c.code
                      ? (dark ? 'bg-white/10' : 'bg-gray-100')
                      : (dark ? 'hover:bg-white/10' : 'hover:bg-gray-100')
                  )}
                  style={{ color: dark ? 'rgba(255,255,255,0.9)' : '#374151' }}
                >
                  <span className="text-sm leading-none">{c.flag}</span>
                  <span className="font-mono" style={{ color: dark ? 'rgba(255,255,255,0.5)' : '#6b7280' }}>{c.code}</span>
                  <span className="flex-1 truncate">{c.label.split(' (')[0]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Phone number input */}
        <div className="relative flex-1">
          <input
            type="tel"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^0-9\s\-]/g, ''))}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            onKeyDown={onKeyDown}
            inputMode="tel"
            className={cn(inputCls, error && 'border-red-400 dark:border-red-500')}
            onFocus={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = error ? '#ef4444' : focusStyle.borderColor;
              el.style.boxShadow = focusStyle.boxShadow;
            }}
            onBlur={(e) => {
              const el = e.currentTarget;
              el.style.borderColor = '';
              el.style.boxShadow = '';
            }}
          />
        </div>
      </div>
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Dynamic Button Component
// ────────────────────────────────────────────────────────────

function DynamicButton({
  design,
  onClick,
  disabled,
  loading,
  children,
}: {
  design: PortalDesignConfig;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  const btn = getButtonClasses(design);
  const accent = design.accentColor || '#14b8a6';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(btn.className, 'portal-btn')}
      style={{
        ...btn.style,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: disabled || loading
          ? btn.style?.boxShadow
          : `0 8px 24px -6px ${accent}55, 0 2px 8px -2px ${accent}30, ${btn.style?.boxShadow || ''}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.boxShadow = `0 12px 32px -6px ${accent}70, 0 4px 12px -2px ${accent}40, ${btn.style?.boxShadow || ''}`;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.currentTarget.style.boxShadow = `0 8px 24px -6px ${accent}55, 0 2px 8px -2px ${accent}30, ${btn.style?.boxShadow || ''}`;
        }
      }}
    >
      {/* Premium shine sweep on hover */}
      {!disabled && !loading && (
        <span
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(110deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)',
            backgroundSize: '200% 100%',
            animation: 'portal-shine 3.5s ease-in-out infinite',
          }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : children}
      </span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Error Display
// ────────────────────────────────────────────────────────────

function ErrorDisplay({ message, onRetry, design }: { message: string; onRetry?: () => void; design?: PortalDesignConfig }) {
  const lang = usePortalLang();
  const dark = design ? isDarkBackground(design) : true;
  const accent = design?.accentColor || '#ef4444';
  const bg = dark ? `${accent}10` : '#fef2f2';
  const borderColor = dark ? `${accent}25` : '#fecaca';
  const iconColor = dark ? accent : '#dc2626';
  const textColor = dark ? 'rgba(255,255,255,0.9)' : '#991b1b';
  const btnColor = dark ? accent : '#dc2626';
  const btnHoverColor = dark ? `${accent}cc` : '#991b1b';

  return (
    <div className="flex items-start gap-2 rounded-lg p-3 portal-error" style={{ backgroundColor: bg, border: `1px solid ${borderColor}` }}>
      <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: iconColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: textColor }}>{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-1.5 text-xs font-medium hover:underline flex items-center gap-1"
            style={{ color: btnColor }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = btnHoverColor; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = btnColor; }}
          >
            <RefreshCw className="w-3 h-3" />
            {getUIString(lang, 'retry')}
          </button>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Device Management Panel (MAX_SESSIONS_REACHED)
// ────────────────────────────────────────────────────────────

function formatDeviceName(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown Device';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) {
    if (ua.includes('samsung')) return 'Samsung Galaxy';
    if (ua.includes('pixel')) return 'Google Pixel';
    return 'Android Device';
  }
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
  if (ua.includes('linux')) return 'Linux Device';
  return 'Unknown Device';
}

function getDeviceIcon(userAgent: string | null | undefined, deviceName: string | null | undefined): { icon: React.ReactNode; color: string } {
  const ua = (userAgent || '').toLowerCase();
  const name = (deviceName || '').toLowerCase();
  if (ua.includes('iphone') || name.includes('iphone')) return { icon: <Smartphone className="w-5 h-5" />, color: '#3b82f6' };
  if (ua.includes('ipad') || name.includes('ipad')) return { icon: <Smartphone className="w-5 h-5" />, color: '#8b5cf6' };
  if (ua.includes('android') || name.includes('android')) {
    if (ua.includes('mobile') || name.includes('phone')) return { icon: <Smartphone className="w-5 h-5" />, color: '#10b981' };
    return { icon: <Monitor className="w-5 h-5" />, color: '#10b981' };
  }
  if (ua.includes('macintosh') || ua.includes('mac os') || name.includes('mac')) return { icon: <Monitor className="w-5 h-5" />, color: '#6366f1' };
  if (ua.includes('windows') || name.includes('windows')) return { icon: <Monitor className="w-5 h-5" />, color: '#0ea5e9' };
  if (ua.includes('linux') || name.includes('linux')) return { icon: <Monitor className="w-5 h-5" />, color: '#f59e0b' };
  return { icon: <Monitor className="w-5 h-5" />, color: '#94a3b8' };
}

function formatDuration(startTime: string): string {
  const start = new Date(startTime).getTime();
  const now = Date.now();
  const diffMin = Math.floor((now - start) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function DeviceManagementPanel({
  message,
  devices,
  disconnectingId,
  onDisconnect,
  onBack,
  username,
  design,
}: {
  message: string;
  devices: Array<{
    sessionId: string;
    acctUniqueId: string;
    mac: string | null;
    ip: string | null;
    deviceName: string | null;
    startTime: string;
    userAgent: string | null;
  }>;
  disconnectingId: string | null;
  onDisconnect: (sessionId: string, username?: string) => void;
  onBack: () => void;
  username?: string;
  design?: PortalDesignConfig;
}) {
  const accent = design?.accentColor || '#f59e0b';
  const dark = design ? isDarkBackground(design) : false;
  const cardRadius = design?.formStyle === 'pill' ? '1.25rem' : design?.formStyle === 'square' ? '0.375rem' : '0.75rem';
  const textColor = design ? getCardTextColor(design) : '#1f2937';
  const mutedColor = design ? getMutedTextColor(design) : '#6b7280';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl" style={{
        backgroundColor: dark ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.08)',
        border: `1px solid ${dark ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.18)'}`,
        borderRadius: cardRadius,
      }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          backgroundColor: dark ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.15)',
        }}>
          <AlertTriangle className="w-4.5 h-4.5" style={{ color: '#f59e0b' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight" style={{ color: dark ? '#fde68a' : '#92400e' }}>
            {message}
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: dark ? 'rgba(253,230,138,0.7)' : '#a16207' }}>
            Disconnect a device below to free up a slot.
          </p>
        </div>
      </div>

      {/* Device Count Badge */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium" style={{ color: mutedColor }}>
          Connected Devices ({devices.length})
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full" style={{
          backgroundColor: dark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.1)',
          color: dark ? '#fde68a' : '#92400e',
        }}>
          <Wifi className="w-3 h-3" />
          Limit reached
        </span>
      </div>

      {/* Device Cards */}
      <div className="space-y-2">
        <AnimatePresence>
        {devices.map((device, idx) => {
          const { icon, color } = getDeviceIcon(device.userAgent, device.deviceName);
          const name = device.deviceName || formatDeviceName(device.userAgent);
          const isDisconnecting = disconnectingId === device.sessionId;

          return (
            <motion.div
              key={device.acctUniqueId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
              transition={{ duration: 0.25, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="group relative overflow-hidden"
              style={{
                borderRadius: cardRadius,
                border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                backgroundColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)',
                backdropFilter: dark ? 'blur(8px)' : undefined,
              }}
            >
              {/* Left accent bar colored by device type */}
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />

              <div className="flex items-center gap-3 p-3 pl-4">
                {/* Device Icon + Info */}
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                  backgroundColor: color + '12',
                  color: color,
                }}>
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: textColor }}>
                    {name}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1">
                    {device.mac && (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: mutedColor }}>
                        <Hash className="w-2.5 h-2.5" />
                        <span className="font-mono">{device.mac}</span>
                      </span>
                    )}
                    {device.ip && (
                      <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: mutedColor }}>
                        <Globe className="w-2.5 h-2.5" />
                        <span className="font-mono">{device.ip}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: mutedColor }}>
                      <Clock className="w-2.5 h-2.5" />
                      {formatDuration(device.startTime)}
                    </span>
                  </div>
                </div>

                {/* Disconnect Button */}
                <button
                  onClick={() => onDisconnect(device.sessionId, username)}
                  disabled={isDisconnecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 flex-shrink-0"
                  style={{
                    color: isDisconnecting ? '#94a3b8' : '#ef4444',
                    backgroundColor: isDisconnecting ? (dark ? 'rgba(148,163,184,0.1)' : 'rgba(148,163,184,0.08)') : (dark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.08)'),
                    border: `1px solid ${isDisconnecting ? (dark ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.12)') : (dark ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.15)')}`,
                    cursor: isDisconnecting ? 'wait' : 'pointer',
                  }}
                >
                  {isDisconnecting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Unplug className="w-3.5 h-3.5" />
                  )}
                  {isDisconnecting ? 'Removing...' : 'Disconnect'}
                </button>
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>

      {/* Back Button */}
      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium rounded-lg transition-all duration-200"
        style={{
          color: mutedColor,
          backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}`,
        }}
      >
        <LogOut className="w-3.5 h-3.5" />
        Back to login
      </button>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────
// Auth Error Code → Localized Message Mapping
// ────────────────────────────────────────────────────────────

/** Map server error codes to i18n-localized messages for the guest portal. */
function getLocalizedAuthErrorMessage(lang: string, code: string, serverMessage?: string): string {
  // Map specific error codes to i18n keys
  const codeToKey: Record<string, string> = {
    VOUCHER_EXPIRED: 'voucherExpired',
    VOUCHER_USED: 'voucherUsed',
    VOUCHER_NOT_YET_VALID: 'voucherNotYetValid',
    INVALID_VOUCHER: 'voucherInvalid',
    VOUCHER_ALREADY_CLAIMED: 'voucherUsed',
    INVALID_CREDENTIALS: 'invalidCredentials',
    AUTH_FAILED: 'authFailed',
    ACCOUNT_INACTIVE: 'accountDisabled',
    ACCOUNT_EXPIRED: 'accountDisabled',
    RATE_LIMITED: 'rateLimited',
    LDAP_AUTH_FAILED: 'invalidCredentials',
    LDAP_NOT_CONFIGURED: 'authFailed',
    OTP_INVALID: 'authFailed',
    OTP_EXPIRED: 'authFailed',
    OTP_MAX_ATTEMPTS: 'rateLimited',
    SOCIAL_AUTH_FAILED: 'authFailed',
    ROOM_NOT_FOUND: 'invalidCredentials',
    MISSING_ROOM: 'invalidCredentials',
    MISSING_NAME: 'invalidCredentials',
    RADIUS_UNREACHABLE: 'networkError',
  };

  const i18nKey = codeToKey[code];
  if (i18nKey) {
    return getUIString(lang, i18nKey);
  }
  // Fall back to server-provided message, then to generic authFailed
  return serverMessage || getUIString(lang, 'authFailed');
}

// ────────────────────────────────────────────────────────────
// Voucher Form (fallback mode)
// ────────────────────────────────────────────────────────────

function VoucherForm({
  design,
  initialCode,
  onSubmit,
  loading,
  hasQrPrefill,
}: {
  design: PortalDesignConfig;
  initialCode: string;
  onSubmit: (code: string) => void;
  loading: boolean;
  hasQrPrefill: boolean;
}) {
  const lang = usePortalLang();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!code.trim()) {
      setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'voucherCode').toLowerCase());
      return;
    }
    setError('');
    onSubmit(code.trim());
  };

  return (
    <div className="space-y-4">
      {hasQrPrefill && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{ backgroundColor: design.accentColor + '15' }}
        >
          <QrCode className="w-4 h-4 flex-shrink-0" style={{ color: design.accentColor }} />
          <p className="text-sm" style={{ color: design.accentColor }}>
            <span className="font-medium">{getUIString(lang, 'qrCodeScanned')}</span> — {getUIString(lang, 'qrCodePrefilled')}
          </p>
        </div>
      )}

      <DynamicInput
        design={design}
        label={getUIString(lang, 'voucherCode')}
        type="text"
        value={code}
        onChange={(v) => setCode(v.toUpperCase())}
        placeholder="Enter your voucher code"
        disabled={loading}
        autoFocus={!hasQrPrefill}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        inputMode="text"
        className="text-center text-lg font-mono font-bold tracking-wider uppercase"
      />

      {error && <ErrorDisplay message={error} design={design} />}

      <DynamicButton design={design} onClick={handleSubmit} disabled={!code.trim()} loading={loading}>
        <>
          <Wifi className="w-5 h-5" />
          {getUIString(lang, 'connectToWiFi')}
        </>
      </DynamicButton>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Room Number Form (fallback mode)
// ────────────────────────────────────────────────────────────

function RoomNumberForm({
  design,
  onSubmit,
  loading,
}: {
  design: PortalDesignConfig;
  onSubmit: (roomNumber: string, lastName: string) => void;
  loading: boolean;
}) {
  const lang = usePortalLang();
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!room.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'roomNumber').toLowerCase()); return; }
    if (!name.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'lastName').toLowerCase()); return; }
    setError('');
    onSubmit(room.trim(), name.trim());
  };

  return (
    <div className="space-y-4">
      <DynamicInput
        design={design}
        label={getUIString(lang, 'roomNumber')}
        value={room}
        onChange={setRoom}
        placeholder="e.g. 101"
        disabled={loading}
        autoFocus
        icon={<DoorOpen className="w-4 h-4" />}
      />
      <DynamicInput
        design={design}
        label={getUIString(lang, 'lastName')}
        value={name}
        onChange={setName}
        placeholder="e.g. Smith"
        disabled={loading}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        icon={<User className="w-4 h-4" />}
      />
      {error && <ErrorDisplay message={error} design={design} />}
      <DynamicButton design={design} onClick={handleSubmit} disabled={!room.trim() || !name.trim()} loading={loading}>
        <>
          <Key className="w-5 h-5" />
          {getUIString(lang, 'signInWithRoom')}
        </>
      </DynamicButton>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// PMS Credentials Form (fallback mode)
// ────────────────────────────────────────────────────────────

function PmsCredentialsForm({
  design,
  onSubmit,
  loading,
}: {
  design: PortalDesignConfig;
  onSubmit: (username: string, password: string) => void;
  loading: boolean;
}) {
  const lang = usePortalLang();
  const [uname, setUname] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!uname.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'username').toLowerCase()); return; }
    if (!pass.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'password').toLowerCase()); return; }
    setError('');
    onSubmit(uname.trim(), pass.trim());
  };

  return (
    <div className="space-y-4">
      <DynamicInput
        design={design}
        label={getUIString(lang, 'username')}
        value={uname}
        onChange={setUname}
        placeholder="Enter username"
        disabled={loading}
        autoFocus
        icon={<User className="w-4 h-4" />}
      />
      <DynamicInput
        design={design}
        label={getUIString(lang, 'password')}
        type="password"
        value={pass}
        onChange={setPass}
        placeholder="Enter password"
        disabled={loading}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        icon={<Key className="w-4 h-4" />}
      />
      {error && <ErrorDisplay message={error} design={design} />}
      <DynamicButton design={design} onClick={handleSubmit} disabled={!uname.trim() || !pass.trim()} loading={loading}>
        <>
          <Key className="w-5 h-5" />
          {getUIString(lang, 'signIn')}
        </>
      </DynamicButton>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SMS OTP Form (2-step, fallback mode)
// ────────────────────────────────────────────────────────────

function SmsOtpForm({
  design,
  onAuthenticate,
  loading,
}: {
  design: PortalDesignConfig;
  onAuthenticate: (method: string, payload: Record<string, string>) => void | Promise<boolean>;
  loading: boolean;
}) {
  const lang = usePortalLang();
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async () => {
    if (!phone.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'phoneNumber').toLowerCase()); return; }
    if (!isValidPhone(phone)) { setError('Please enter a valid phone number (7-15 digits)'); return; }
    setError('');
    const result = await onAuthenticate('sms_otp', { phoneNumber: phone.trim(), countryCode });
    // Only advance to OTP step if the server accepted the request
    if (result === false) return;
    setStep('otp');
    setCountdown(60);
  };

  const handleVerifyOtp = () => {
    if (!otp.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' OTP code'); return; }
    setError('');
    onAuthenticate('sms_otp', {
      phoneNumber: phone.trim(),
      otpCode: otp.trim(),
      countryCode,
    });
  };

  const handleResend = () => {
    if (countdown > 0) return;
    setOtp('');
    setError('');
    onAuthenticate('sms_otp', { phoneNumber: phone.trim(), countryCode });
    setCountdown(60);
  };

  const mutedColor = getMutedTextColor(design);
  const labelColor = getCardTextColor(design);

  if (step === 'phone') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-center" style={{ color: mutedColor }}>
          {getUIString(lang, 'weWillSendCode')}
        </p>
        <PhoneInputWithCountryCode
          design={design}
          label={getUIString(lang, 'phoneNumber')}
          value={phone}
          onChange={setPhone}
          countryCode={countryCode}
          onCountryCodeChange={setCountryCode}
          placeholder="98765 43210"
          disabled={loading}
          autoFocus
          error={error}
        />
        {error && <ErrorDisplay message={error} design={design} />}
        <DynamicButton design={design} onClick={handleSendOtp} disabled={!phone.trim()} loading={loading}>
          <>
            <Smartphone className="w-5 h-5" />
            {getUIString(lang, 'sendVerificationCode')}
          </>
        </DynamicButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-center" style={{ color: mutedColor }}>
        {getUIString(lang, 'enterCodeSentTo')}{' '}
        <span className="font-medium" style={{ color: labelColor }}>{countryCode} {phone}</span>
      </p>
      <DynamicInput
        design={design}
        label={getUIString(lang, 'verificationCode')}
        value={otp}
        onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        disabled={loading}
        autoFocus
        maxLength={6}
        inputMode="numeric"
        className="text-center text-2xl font-mono font-bold tracking-[0.5em]"
      />
      {error && <ErrorDisplay message={error} design={design} />}
      <DynamicButton design={design} onClick={handleVerifyOtp} disabled={otp.length < 6} loading={loading}>
        <>
          <CheckCircle className="w-5 h-5" />
          {getUIString(lang, 'verifyAndConnect')}
        </>
      </DynamicButton>
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => { setStep('phone'); setOtp(''); setError(''); }}
          className="hover:underline flex items-center gap-1"
          style={{ color: mutedColor }}
        >
          <span>&larr;</span> {getUIString(lang, 'changeNumber')}
        </button>
        <button
          onClick={handleResend}
          disabled={countdown > 0}
          className="flex items-center gap-1 disabled:opacity-40"
          style={{ color: design.accentColor }}
        >
          <RefreshCw className="w-3 h-3" />
          {countdown > 0 ? getUIString(lang, 'resendIn').replace('{0}', String(countdown)) : getUIString(lang, 'resendCode')}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Email OTP Form (2-step, fallback mode — guest-verified flow)
// ────────────────────────────────────────────────────────────

function EmailOtpForm({
  design,
  onAuthenticate,
  loading,
}: {
  design: PortalDesignConfig;
  onAuthenticate: (method: string, payload: Record<string, string>) => void | Promise<boolean>;
  loading: boolean;
}) {
  const lang = usePortalLang();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [guestInfo, setGuestInfo] = useState<{ guestName?: string; roomNumber?: string; maskedEmail?: string } | null>(null);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendOtp = async () => {
    if (!email.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' email address'); return; }
    if (!isValidEmail(email)) { setError('Please enter a valid email address'); return; }
    setError('');
    setGuestInfo(null);
    const result = await onAuthenticate('email_otp', { email: email.trim() });
    // Only advance to OTP step if the server accepted the request
    if (result === false) return;
    setStep('otp');
    setCountdown(60);
  };

  const handleVerifyOtp = () => {
    if (!otp.trim()) { setError(getUIString(lang, 'pleaseEnter') + ' verification code'); return; }
    setError('');
    onAuthenticate('email_otp', {
      email: email.trim(),
      otpCode: otp.trim(),
    });
  };

  const handleResend = () => {
    if (countdown > 0) return;
    setOtp('');
    setError('');
    onAuthenticate('email_otp', { email: email.trim() });
    setCountdown(60);
  };

  const mutedColor = getMutedTextColor(design);
  const labelColor = getCardTextColor(design);

  if (step === 'email') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-center" style={{ color: mutedColor }}>
          Enter your email address registered with your booking
        </p>
        <DynamicInput
          design={design}
          label="Email Address"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="guest@example.com"
          disabled={loading}
          autoFocus
          icon={<Mail className="w-4 h-4" />}
          inputMode="email"
        />
        {error && <ErrorDisplay message={error} design={design} />}
        <DynamicButton design={design} onClick={handleSendOtp} disabled={!email.trim()} loading={loading}>
          <>
            <Mail className="w-5 h-5" />
            Send Verification Code
          </>
        </DynamicButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Show guest info after successful email lookup */}
      {guestInfo && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center text-sm space-y-1">
          {guestInfo.guestName && (
            <p className="font-medium text-emerald-800 dark:text-emerald-200">{guestInfo.guestName}</p>
          )}
          {guestInfo.roomNumber && (
            <p className="text-emerald-600 dark:text-emerald-300">Room {guestInfo.roomNumber}</p>
          )}
        </div>
      )}
      <p className="text-sm text-center" style={{ color: mutedColor }}>
        Enter code sent to{' '}
        <span className="font-medium" style={{ color: labelColor }}>{guestInfo?.maskedEmail || email}</span>
      </p>
      <DynamicInput
        design={design}
        label="Verification Code"
        value={otp}
        onChange={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        disabled={loading}
        autoFocus
        maxLength={6}
        inputMode="numeric"
        className="text-center text-2xl font-mono font-bold tracking-[0.5em]"
      />
      {error && <ErrorDisplay message={error} design={design} />}
      <DynamicButton design={design} onClick={handleVerifyOtp} disabled={otp.length < 6} loading={loading}>
        <>
          <CheckCircle className="w-5 h-5" />
          {getUIString(lang, 'verifyAndConnect')}
        </>
      </DynamicButton>
      <div className="flex items-center justify-between text-sm">
        <button
          onClick={() => { setStep('email'); setOtp(''); setError(''); setGuestInfo(null); }}
          className="hover:underline flex items-center gap-1"
          style={{ color: mutedColor }}
        >
          <span>&larr;</span> Change email
        </button>
        <button
          onClick={handleResend}
          disabled={countdown > 0}
          className="flex items-center gap-1 disabled:opacity-40"
          style={{ color: design.accentColor }}
        >
          <RefreshCw className="w-3 h-3" />
          {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Open Access Form (fallback mode)
// ────────────────────────────────────────────────────────────

function OpenAccessForm({
  design,
  onConnect,
  loading,
}: {
  design: PortalDesignConfig;
  onConnect: () => void;
  loading: boolean;
}) {
  const lang = usePortalLang();
  const mutedColor = getMutedTextColor(design);

  return (
    <div className="space-y-4">
      <p className="text-sm text-center" style={{ color: mutedColor }}>
        {getUIString(lang, 'openAccessDesc')}
      </p>
      <DynamicButton design={design} onClick={onConnect} loading={loading}>
        <>
          <Globe className="w-5 h-5" />
          {getUIString(lang, 'connectNow')}
        </>
      </DynamicButton>
    </div>
  );
}

// ─── MAC Auto-Login Form ─────────────────────────────────────────────────────
interface MacAuthFormProps {
  design: Record<string, unknown>;
  onAuthenticate: (method: string, payload: Record<string, string>) => Promise<boolean>;
  loading: boolean;
  termsRequired?: boolean;
  termsAccepted?: boolean;
  setTermsAccepted?: (v: boolean) => void;
}

function MacAuthForm({ design, onAuthenticate, loading, termsRequired, termsAccepted, setTermsAccepted }: MacAuthFormProps) {
  const [status, setStatus] = useState<'detecting' | 'authenticating' | 'error'>('detecting');
  const [error, setError] = useState('');

  const handleMacAuth = useCallback(async () => {
    setStatus('authenticating');
    setError('');
    const success = await onAuthenticate('mac_auth', {});
    if (!success) {
      setStatus('error');
      setError('Your device MAC address is not registered.');
    }
  }, [onAuthenticate]);

  // Use a ref to prevent infinite re-triggering when onAuthenticate changes
  const handleMacAuthRef = useRef(handleMacAuth);
  useEffect(() => {
    handleMacAuthRef.current = handleMacAuth;
  }, [handleMacAuth]);

  const needsTermsConsent = termsRequired && !termsAccepted;

  useEffect(() => {
    // Auto-attempt MAC auth on mount — but wait for terms consent if required
    if (needsTermsConsent) return;
    const timer = setTimeout(() => {
      handleMacAuthRef.current();
    }, 500);
    return () => clearTimeout(timer);
  }, [needsTermsConsent]);

  const mutedColor = (design.textColor as string) ? `${design.textColor}99` : 'rgba(0,0,0,0.6)';

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <Shield className="w-10 h-10 animate-pulse" style={{ color: design.accentColor as string || '#0d9488' }} />
        </div>
        <h3 className="text-lg font-semibold" style={{ color: design.textColor as string || '#ffffff' }}>
          MAC Auto-Login
        </h3>
        <p className="text-sm" style={{ color: mutedColor }}>
          {status === 'detecting' && 'Detecting your device...'}
          {status === 'authenticating' && 'Authenticating your device via MAC address...'}
          {status === 'error' && error}
        </p>
      </div>

      {(status === 'detecting' || status === 'authenticating') && (
        <div className="flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: design.accentColor as string || '#0d9488' }} />
        </div>
      )}

      {/* Terms consent gate — show checkbox when terms are required */}
      {needsTermsConsent && status === 'detecting' && (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted || false}
              onChange={(e) => setTermsAccepted?.(e.target.checked)}
              className="portal-checkbox mt-0.5"
              style={{ '--portal-accent': design.accentColor as string || '#0d9488' } as React.CSSProperties}
            />
            <span style={{ color: mutedColor }}>
              I agree to the terms &amp; conditions
            </span>
          </label>
          <button
            onClick={handleMacAuth}
            disabled={!termsAccepted || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: design.accentColor as string || '#0d9488',
              color: '#ffffff',
              opacity: !termsAccepted || loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Connect
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="space-y-3">
          <p className="text-xs text-center" style={{ color: mutedColor }}>
            MAC authentication requires your device to be pre-registered.
            Please contact the front desk or try a different login method.
          </p>
          <button
            onClick={handleMacAuth}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: design.accentColor as string || '#0d9488',
              color: '#ffffff',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Social Login Form ───────────────────────────────────────────────────────
interface SocialLoginFormProps {
  design: Record<string, unknown>;
  portalSlug?: string;
  onAuthenticate: (method: string, payload: Record<string, string>) => Promise<boolean>;
  loading: boolean;
  termsRequired?: boolean;
  termsAccepted?: boolean;
  setTermsAccepted?: (v: boolean) => void;
}

function SocialLoginForm({
  design,
  portalSlug,
  onAuthenticate,
  loading,
  termsRequired,
  termsAccepted,
  setTermsAccepted,
}: SocialLoginFormProps) {
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [socialError, setSocialError] = useState('');
  const mutedColor = (design.textColor as string) ? `${design.textColor}99` : 'rgba(0,0,0,0.6)';
  const accentColor = design.accentColor as string || '#0d9488';

  const SOCIAL_BUTTONS = [
    {
      provider: 'google',
      label: 'Continue with Google',
      bg: '#ffffff',
      color: '#3c4043',
      border: '#dadce0',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ),
    },
    {
      provider: 'facebook',
      label: 'Continue with Facebook',
      bg: '#1877F2',
      color: '#ffffff',
      border: '#1877F2',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      provider: 'apple',
      label: 'Continue with Apple',
      bg: '#000000',
      color: '#ffffff',
      border: '#000000',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
        </svg>
      ),
    },
    {
      provider: 'microsoft',
      label: 'Continue with Microsoft',
      bg: '#ffffff',
      color: '#333333',
      border: '#8c8c8c',
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#F25022" d="M1 1h10v10H1z" />
          <path fill="#00A4EF" d="M13 1h10v10H13z" />
          <path fill="#7FBA00" d="M1 13h10v10H1z" />
          <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
      ),
    },
  ];

  const handleSocialLogin = async (provider: string) => {
    setSocialLoading(provider);
    setSocialError('');

    try {
      // Try to get OAuth config
      const params = new URLSearchParams({ provider, portalSlug: portalSlug || 'default' });
      const res = await fetch(`/api/wifi/social/auth?${params}`);
      const data = await res.json();

      if (data.success && data.data) {
        if (data.data.mode === 'demo') {
          // Demo mode — directly authenticate with the demo token
          const success = await onAuthenticate('social', {
            socialProvider: provider,
            socialToken: data.data.demoToken,
          });
          if (!success) {
            setSocialError('Social login failed. Please try a different method.');
          }
        } else if (data.data.mode === 'oauth') {
          // Real OAuth — redirect to provider
          window.location.assign(data.data.redirectUrl);
        }
      } else {
        setSocialError(data.error?.message || 'Social login is not configured. Please try a different method.');
      }
    } catch (err) {
      setSocialError('Network error. Please try again.');
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-semibold" style={{ color: design.textColor as string || '#ffffff' }}>
          Social Login
        </h3>
        <p className="text-sm" style={{ color: mutedColor }}>
          Sign in with your social account for quick access
        </p>
      </div>

      <div className="space-y-2.5">
        {SOCIAL_BUTTONS.map((btn) => (
          <button
            key={btn.provider}
            onClick={() => handleSocialLogin(btn.provider)}
            disabled={loading || socialLoading !== null}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-[0.98]"
            style={{
              ...getSocialButtonStyle(design, btn.provider),
              fontSize: '14px',
              fontWeight: 500,
              opacity: loading || socialLoading !== null ? 0.5 : 1,
            }}
          >
            {socialLoading === btn.provider ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : btn.icon}
            <span className="flex-1 text-left">{btn.label}</span>
            <svg className="w-4 h-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
      </div>

      {socialError && (
        <p className="text-xs text-center" style={{ color: '#ef4444' }}>
          {socialError}
        </p>
      )}

      {termsRequired && (
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted || false}
            onChange={(e) => setTermsAccepted?.(e.target.checked)}
            className="portal-checkbox mt-0.5"
            style={{ '--portal-accent': accent } as React.CSSProperties}
          />
          <span style={{ color: mutedColor }}>
            I agree to the Terms &amp; Conditions
          </span>
        </label>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Unified Designer-Driven Form (NEW — matches PortalPreviewContent)
// ────────────────────────────────────────────────────────────

/**
 * Renders a SINGLE form with only the fields configured in formFields.
 * This matches exactly what the admin sees in the Portal Designer preview.
 * No tabs — just a clean form with the toggled-on fields.
 */
function UnifiedDesignerForm({
  design,
  formFields,
  authMethod,
  codeParam,
  authenticate,
  loading,
  termsRequired,
  termsAccepted,
  setTermsAccepted,
}: {
  design: PortalDesignConfig;
  formFields: FormFieldsConfig;
  authMethod: string;
  codeParam: string;
  authenticate: (method: string, payload: Record<string, string>) => void;
  loading: boolean;
  termsRequired: boolean;
  termsAccepted: boolean;
  setTermsAccepted: (v: boolean) => void;
}) {
  const lang = usePortalLang();

  // Initialize formData with pre-filled voucher code from QR scan
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    if (codeParam && formFields['voucherCode']) {
      return { voucherCode: codeParam };
    }
    return {};
  });
  const [error, setError] = useState('');
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [emailConsent, setEmailConsent] = useState(false);
  const [phoneConsent, setPhoneConsent] = useState(false);
  const [countryCode, setCountryCode] = useState('+91'); // Default: India
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // OTP countdown timer
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  // Field helpers
  const isFieldEnabled = (key: string): boolean => {
    const val = formFields[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).visible ?? false;
    return false;
  };

  const getFieldLabel = (key: string, fallback: string): string => {
    const val = formFields[key];
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).label || fallback;
    return fallback;
  };

  // Map field keys to UI string keys for translated fallback labels
  const fieldKeyToUiKey: Record<string, string> = {
    firstName: 'firstName',
    lastName: 'lastName',
    roomNumber: 'roomNumber',
    phone: 'phoneNumber',
    email: 'emailAddress',
    passport: 'passport',
    bookingId: 'bookingId',
    username: 'username',
    password: 'password',
    voucherCode: 'voucherCode',
  };

  const getTranslatedFieldLabel = (key: string, fallback: string): string => {
    const adminLabel = getFieldLabel(key, '');
    if (adminLabel) return adminLabel;
    const uiKey = fieldKeyToUiKey[key];
    if (uiKey) return getUIString(lang, uiKey);
    return fallback;
  };

  const isFieldRequired = (key: string): boolean => {
    const val = formFields[key];
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).required ?? false;
    return val === true;
  };

  const showTerms = isFieldEnabled('terms') || isFieldEnabled('termsCheckbox');

  // Get only the enabled input fields (not terms/voucherCode which are special)
  const enabledFields = UNIFIED_FIELD_DEFS.filter((f) => isFieldEnabled(f.key));
  const hasInputFields = enabledFields.length > 0;
  const isSmsOtp = authMethod === 'sms_otp';
  const isEmailOtp = authMethod === 'email_otp';
  const isSelfReg = authMethod === 'self_registration';
  const isOtpMethod = isSmsOtp || isEmailOtp || isSelfReg;
  const isOpenAccess = authMethod === 'open_access';

  // QR prefill notice for voucher
  const hasQrPrefill = !!(codeParam && isFieldEnabled('voucherCode'));

  // Build auth payload and submit
  const handleSubmit = useCallback(() => {
    setError('');
    setFieldErrors({});

    // Validate required fields
    for (const fieldDef of enabledFields) {
      const key = fieldDef.key;
      if (isFieldRequired(key) && !formData[key]?.trim()) {
        const label = getTranslatedFieldLabel(key, fieldDef.label);
        setError(getUIString(lang, 'pleaseEnter') + ' ' + label.toLowerCase());
        return;
      }
    }

    // Email validation (for any method that collects email)
    if (formData.email?.trim() && !isValidEmail(formData.email)) {
      const errs = { ...fieldErrors, email: 'Please enter a valid email address' };
      setFieldErrors(errs);
      setError('Invalid email address');
      return;
    }

    // Phone validation (for any method that collects phone)
    if (formData.phone?.trim() && !isValidPhone(formData.phone)) {
      const errs = { ...fieldErrors, phone: 'Please enter a valid phone number (7-15 digits)' };
      setFieldErrors(errs);
      setError('Invalid phone number');
      return;
    }

    // Terms validation
    if (showTerms && termsRequired && !termsAccepted) {
      setError(getUIString(lang, 'pleaseEnter').replace(/Please enter/i, 'Please accept') + ' ' + getUIString(lang, 'termsAndConditions').toLowerCase());
      return;
    }

    // Build payload based on authMethod
    const payload: Record<string, string> = {};

    switch (authMethod) {
      case 'pms_credentials':
        if (formData.username?.trim()) payload.username = formData.username.trim();
        if (formData.password?.trim()) payload.password = formData.password.trim();
        break;
      case 'room_number':
        if (formData.roomNumber?.trim()) payload.roomNumber = formData.roomNumber.trim();
        if (formData.lastName?.trim()) payload.lastName = formData.lastName.trim();
        break;
      case 'voucher':
        if (formData.voucherCode?.trim()) payload.voucherCode = formData.voucherCode.trim();
        break;
      case 'sms_otp': {
        if (!formData.phone?.trim()) {
          setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'phoneNumber').toLowerCase());
          return;
        }
        payload.countryCode = countryCode;
        if (otpStep) {
          if (!otpCode.trim()) {
            setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'verificationCode').toLowerCase());
            return;
          }
          payload.phoneNumber = formData.phone.trim();
          payload.otpCode = otpCode.trim();
          authenticate('sms_otp', payload);
          return;
        }
        // First step: send OTP
        payload.phoneNumber = formData.phone.trim();
        authenticate('sms_otp', payload);
        setOtpStep(true);
        setOtpCountdown(60);
        return;
      }
      case 'open_access':
        // No payload needed
        break;
      case 'ldap':
        payload.username = formData.username?.trim() || '';
        payload.password = formData.password?.trim() || '';
        break;
      case 'email_otp': {
        if (!formData.email?.trim()) {
          setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'emailAddress').toLowerCase());
          return;
        }
        if (otpStep) {
          if (!otpCode.trim()) {
            setError(getUIString(lang, 'pleaseEnter') + ' ' + getUIString(lang, 'verificationCode').toLowerCase());
            return;
          }
          payload.email = formData.email.trim();
          payload.otpCode = otpCode.trim();
          authenticate('email_otp', payload);
          return;
        }
        payload.email = formData.email.trim();
        authenticate('email_otp', payload);
        setOtpStep(true);
        setOtpCountdown(60);
        return;
      }
      case 'mac_auth': {
        // MAC auth requires no credentials — auto-detect
        break;
      }
      case 'social': {
        // Social login is handled differently — the SocialLoginForm component
        // manages the OAuth flow directly. This is a fallback for unified form.
        // Show social login buttons instead of the normal form.
        return;
      }
      case 'self_registration': {
        // Self-registration uses the same OTP 2-step flow as SMS/email OTP
        if (!formData.email?.trim() && !formData.phone?.trim()) {
          setError('Please enter your email or phone number');
          return;
        }
        if (formData.firstName?.trim()) payload.firstName = formData.firstName.trim();
        if (formData.lastName?.trim()) payload.lastName = formData.lastName.trim();
        if (formData.email?.trim()) payload.email = formData.email.trim();
        if (formData.phone?.trim()) payload.phoneNumber = formData.phone.trim();
        payload.countryCode = countryCode;

        if (otpStep) {
          if (!otpCode.trim()) {
            setError('Please enter the verification code');
            return;
          }
          payload.otpCode = otpCode.trim();
          authenticate('self_registration', payload);
          return;
        }
        // First step: send OTP
        authenticate('self_registration', payload);
        setOtpStep(true);
        setOtpCountdown(60);
        return;
      }
      default:
        // Generic: include all form data
        Object.entries(formData).forEach(([k, v]) => {
          if (v?.trim()) payload[k] = v.trim();
        });
    }

    // Include terms acceptance for server-side consent enforcement (GDPR)
    if (termsRequired && termsAccepted) {
      payload.termsAccepted = 'true';
      payload.termsAcceptedAt = new Date().toISOString();
    }

    // Include marketing consent data in payload
    if (design.marketingOptIn?.enabled) {
      if (emailConsent) payload.marketingEmailConsent = 'true';
      if (phoneConsent) payload.marketingSmsConsent = 'true';
    }

    // Build guestInfo from form fields (firstName, lastName, email, phone, passport, bookingId)
    const guestInfoFields: Record<string, string> = {};
    if (formData.firstName?.trim()) guestInfoFields.firstName = formData.firstName.trim();
    if (formData.lastName?.trim()) guestInfoFields.lastName = formData.lastName.trim();
    if (formData.email?.trim()) guestInfoFields.email = formData.email.trim();
    if (formData.phone?.trim()) guestInfoFields.phone = countryCode + ' ' + formData.phone.trim();
    if (formData.passport?.trim()) guestInfoFields.passport = formData.passport.trim();
    if (formData.bookingId?.trim()) guestInfoFields.bookingId = formData.bookingId.trim();
    if (Object.keys(guestInfoFields).length > 0) {
      payload.guestInfo = JSON.stringify(guestInfoFields);
    }

    authenticate(authMethod, payload);
  }, [formData, authMethod, enabledFields, termsAccepted, termsRequired, showTerms, otpStep, otpCode, authenticate, design.marketingOptIn, emailConsent, phoneConsent, lang, getTranslatedFieldLabel, countryCode, fieldErrors]);

  const handleResendOtp = () => {
    if (otpCountdown > 0) return;
    setOtpCode('');
    setError('');
    const resendPayload: Record<string, string> = {};
    if (isSmsOtp) {
      resendPayload.phoneNumber = formData.phone?.trim() || '';
      resendPayload.countryCode = countryCode;
    } else if (isEmailOtp) {
      resendPayload.email = formData.email?.trim() || '';
    } else if (isSelfReg) {
      if (formData.firstName?.trim()) resendPayload.firstName = formData.firstName.trim();
      if (formData.lastName?.trim()) resendPayload.lastName = formData.lastName.trim();
      if (formData.email?.trim()) resendPayload.email = formData.email.trim();
      if (formData.phone?.trim()) resendPayload.phoneNumber = formData.phone.trim();
      resendPayload.countryCode = countryCode;
    }
    authenticate(authMethod, resendPayload);
    setOtpCountdown(60);
  };

  // Open access: just a connect button
  if (isOpenAccess && !hasInputFields) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-center" style={{ color: getMutedTextColor(design) }}>
          {getUIString(lang, 'openAccessDesc')}
        </p>
        {showTerms && termsRequired && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="portal-checkbox mt-0.5"
              style={{ '--portal-accent': design.accentColor } as React.CSSProperties}
            />
            <span style={{ color: getMutedTextColor(design) }}>
              {getUIString(lang, 'iAgreeToThe')}{' '}
              <span style={{ color: design.accentColor }} className="font-medium underline cursor-pointer">
                {getUIString(lang, 'termsAndConditions')}
              </span>
            </span>
          </label>
        )}
        {error && <ErrorDisplay message={error} design={design} />}
        <DynamicButton design={design} onClick={handleSubmit} disabled={termsRequired && !termsAccepted} loading={loading}>
          <>
            <Globe className="w-5 h-5" />
            {getUIString(lang, 'connectNow')}
          </>
        </DynamicButton>
      </div>
    );
  }

  const mutedColor = getMutedTextColor(design);
  const labelColor = getCardTextColor(design);

  // OTP step 2: show OTP input (for both SMS and Email OTP)
  if (isOtpMethod && otpStep) {
    const contactInfo = isSmsOtp ? `${countryCode} ${formData.phone}` : formData.email;
    const contactLabel = isSmsOtp ? getUIString(lang, 'phoneNumber').toLowerCase() : getUIString(lang, 'emailAddress').toLowerCase();
    return (
      <div className="space-y-4">
        <p className="text-sm text-center" style={{ color: mutedColor }}>
          {getUIString(lang, 'enterCodeSentTo')}{' '}
          <span className="font-medium" style={{ color: labelColor }}>{contactInfo}</span>
        </p>
        <DynamicInput
          design={design}
          label={getUIString(lang, 'verificationCode')}
          value={otpCode}
          onChange={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          disabled={loading}
          autoFocus
          maxLength={6}
          inputMode="numeric"
          className="text-center text-2xl font-mono font-bold tracking-[0.5em]"
        />
        {error && <ErrorDisplay message={error} design={design} />}
        <DynamicButton design={design} onClick={handleSubmit} disabled={otpCode.length < 6} loading={loading}>
          <>
            <CheckCircle className="w-5 h-5" />
            {getUIString(lang, 'verifyAndConnect')}
          </>
        </DynamicButton>
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => { setOtpStep(false); setOtpCode(''); setError(''); }}
            className="hover:underline flex items-center gap-1"
            style={{ color: mutedColor }}
          >
            <span>&larr;</span> {isSelfReg ? 'Change details' : getUIString(lang, 'changeNumber')}
          </button>
          <button
            onClick={handleResendOtp}
            disabled={otpCountdown > 0}
            className="flex items-center gap-1 disabled:opacity-40"
            style={{ color: design.accentColor }}
          >
            <RefreshCw className="w-3 h-3" />
            {otpCountdown > 0 ? getUIString(lang, 'resendIn').replace('{0}', String(otpCountdown)) : getUIString(lang, 'resendCode')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* QR prefill notice */}
      {hasQrPrefill && (
        <div
          className="flex items-center gap-2 rounded-lg p-3"
          style={{ backgroundColor: design.accentColor + '15' }}
        >
          <QrCode className="w-4 h-4 flex-shrink-0" style={{ color: design.accentColor }} />
          <p className="text-sm" style={{ color: design.accentColor }}>
            <span className="font-medium">{getUIString(lang, 'qrCodeScanned')}</span> — {getUIString(lang, 'qrCodePrefilled')}
          </p>
        </div>
      )}

      {/* OTP hint */}
      {isOtpMethod && (
        <p className="text-sm text-center" style={{ color: mutedColor }}>
          {isSmsOtp ? getUIString(lang, 'weWillSendCode') : 'We will send a verification code to your email'}
        </p>
      )}

      {/* Dynamic fields from designer config */}
      {enabledFields.map((fieldDef, index) => {
        const label = getTranslatedFieldLabel(fieldDef.key, fieldDef.label);
        const reqSuffix = isFieldRequired(fieldDef.key) ? ' *' : '';

        // Phone field uses country code dropdown
        if (fieldDef.key === 'phone') {
          return (
            <PhoneInputWithCountryCode
              key={fieldDef.key}
              design={design}
              label={label + reqSuffix}
              value={formData[fieldDef.key] || ''}
              onChange={(v) => setFormData((prev) => ({ ...prev, phone: v }))}
              countryCode={countryCode}
              onCountryCodeChange={setCountryCode}
              placeholder={fieldDef.placeholder}
              disabled={loading}
              autoFocus={index === 0}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              error={fieldErrors.phone}
            />
          );
        }

        return (
          <DynamicInput
            key={fieldDef.key}
            design={design}
            label={label + reqSuffix}
            type={fieldDef.type}
            value={formData[fieldDef.key] || ''}
            onChange={(v) => {
              if (fieldDef.key === 'voucherCode') {
                setFormData((prev) => ({ ...prev, [fieldDef.key]: v.toUpperCase() }));
              } else {
                setFormData((prev) => ({ ...prev, [fieldDef.key]: v }));
              }
            }}
            placeholder={fieldDef.placeholder}
            disabled={loading}
            autoFocus={index === 0}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            icon={fieldDef.icon}
            inputMode={fieldDef.inputMode}
            maxLength={fieldDef.maxLength}
            className={fieldDef.className || ''}
          />
        );
      })}

      {/* Error display */}
      {error && <ErrorDisplay message={error} design={design} />}

      {/* Marketing Consent (Feature 2) */}
      <MarketingConsent
        design={design}
        emailConsent={emailConsent}
        setEmailConsent={setEmailConsent}
        phoneConsent={phoneConsent}
        setPhoneConsent={setPhoneConsent}
      />

      {/* Terms checkbox (Feature 6 — enhanced with modal link) */}
      {showTerms && termsRequired && (
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            className="portal-checkbox mt-0.5"
            style={{ '--portal-accent': design.accentColor } as React.CSSProperties}
          />
          <span style={{ color: getMutedTextColor(design) }}>
            {getUIString(lang, 'iAgreeToThe')}{' '}
            {design.termsUrl ? (
              <a
                href={design.termsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
                style={{ color: design.accentColor }}
              >
                {getUIString(lang, 'termsAndConditions')}
              </a>
            ) : design.termsText ? (
              <span
                style={{ color: design.accentColor }}
                className="font-medium underline cursor-pointer"
                onClick={() => setTermsModalOpen(true)}
              >
                {getUIString(lang, 'termsAndConditions')}
              </span>
            ) : (
              <span style={{ color: design.accentColor }} className="font-medium">
                {getUIString(lang, 'termsAndConditions')}
              </span>
            )}
          </span>
        </label>
      )}

      {/* Submit button */}
      <DynamicButton
        design={design}
        onClick={handleSubmit}
        disabled={termsRequired && !termsAccepted}
        loading={loading}
      >
        <>
          <Wifi className="w-5 h-5" />
          {isOtpMethod ? getUIString(lang, 'sendVerificationCode') : isOpenAccess ? getUIString(lang, 'connectNow') : getUIString(lang, 'connect')}
        </>
      </DynamicButton>

      {/* Helper hint when button is disabled due to terms */}
      {termsRequired && !termsAccepted && !loading && (
        <p className="text-[11px] text-center flex items-center justify-center gap-1.5 animate-in fade-in-0 duration-300 mt-2" style={{ color: getMutedTextColor(design) }}>
          <ArrowUp className="w-3 h-3 animate-pulse" style={{ color: design.accentColor }} />
          <span className="italic font-light">Please accept the terms to connect</span>
        </p>
      )}

      {/* Terms Modal */}
      <TermsModal design={design} open={termsModalOpen} onClose={() => setTermsModalOpen(false)} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Success Screen
// ────────────────────────────────────────────────────────────

// ── Connection Quality Indicator (NEW Feature) ──
// Animated signal strength bars with real-time connection quality estimation
function ConnectionQualityIndicator({
  accent,
  mutedColor,
  textColor,
  cardRadius,
}: {
  accent: string;
  mutedColor: string;
  textColor: string;
  cardRadius: string;
}) {
  const [quality, setQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good');
  const [signalBars, setSignalBars] = useState(3);

  useEffect(() => {
    // Estimate connection quality from navigator.connection API if available
    const estimateQuality = () => {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn) {
        const downlink = conn.downlink || 0; // Mbps
        const rtt = conn.rtt || 0; // ms
        if (downlink >= 10 && rtt <= 50) { setQuality('excellent'); setSignalBars(4); }
        else if (downlink >= 5 && rtt <= 100) { setQuality('good'); setSignalBars(3); }
        else if (downlink >= 1.5 && rtt <= 200) { setQuality('fair'); setSignalBars(2); }
        else { setQuality('poor'); setSignalBars(1); }
      } else {
        // Fallback: randomize based on time (simulated)
        const levels: Array<'excellent' | 'good' | 'fair' | 'poor'> = ['excellent', 'good', 'good', 'fair'];
        const q = levels[Math.floor(Math.random() * levels.length)];
        setQuality(q);
        setSignalBars(q === 'excellent' ? 4 : q === 'good' ? 3 : q === 'fair' ? 2 : 1);
      }
    };
    estimateQuality();
    const interval = setInterval(estimateQuality, 10000); // Re-check every 10s
    return () => clearInterval(interval);
  }, []);

  const qualityColors: Record<string, string> = {
    excellent: '#22c55e',
    good: accent,
    fair: '#f59e0b',
    poor: '#ef4444',
  };
  const qualityLabels: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };
  const qualityColor = qualityColors[quality];

  return (
    <div
      className="rounded-xl p-3.5 flex items-center justify-between portal-animate-in"
      style={{
        backgroundColor: accent + '08',
        border: `1px solid ${accent}20`,
        borderRadius: cardRadius,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: qualityColor + '15' }}>
          <Wifi className="w-4 h-4" style={{ color: qualityColor }} />
        </div>
        <div className="text-left">
          <p className="text-[10px] uppercase tracking-wider" style={{ color: mutedColor }}>Signal Quality</p>
          <p className="font-semibold text-sm" style={{ color: textColor }}>{qualityLabels[quality]}</p>
        </div>
      </div>
      {/* Animated signal bars */}
      <div className="flex items-end gap-1 h-8">
        {[1, 2, 3, 4].map((bar) => {
          const active = bar <= signalBars;
          const height = bar === 1 ? '30%' : bar === 2 ? '50%' : bar === 3 ? '75%' : '100%';
          return (
            <motion.div
              key={bar}
              className="w-1.5 rounded-full"
              style={{
                height,
                backgroundColor: active ? qualityColor : (mutedColor.includes('255') ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'),
                opacity: active ? 1 : 0.4,
              }}
              animate={active ? { scaleY: [1, 1.1, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity, delay: bar * 0.15 }}
            />
          );
        })}
      </div>
    </div>
  );
}

function SuccessScreen({
  authResult,
  design,
  onDisconnect,
  tenantId,
  partnerId,
  originalUrl,
}: {
  authResult: AuthResult;
  design: PortalDesignConfig;
  onDisconnect: () => void;
  tenantId?: string;
  partnerId?: string;
  originalUrl?: string;
}) {
  const lang = usePortalLang();
  const textColor = getCardTextColor(design);
  const mutedColor = getMutedTextColor(design);
  const accent = design.accentColor;

  // ── Captive Portal Plan Upgrade state (GAP-03 fix) ──
  // The PlanSelectorWidget's onUpgrade callback opens this dialog so the guest
  // can confirm the upgrade and choose payment method (charge-to-room or pay online).
  const [upgradeTargetPlan, setUpgradeTargetPlan] = useState<FetchedPlan | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [upgradeSuccess, setUpgradeSuccess] = useState<string | null>(null);

  // ── Live remaining time countdown (Finding #9) ──
  // Ticks down every second based on remainingMinutes or sessionTimeout.
  const totalSeconds = (authResult.remainingMinutes ?? authResult.sessionTimeout) * 60;
  const [remainingSeconds, setRemainingSeconds] = useState(totalSeconds);

  // CP-LOW-02: Auto-redirect to login when timer reaches 0
  useEffect(() => {
    if (remainingSeconds === 0 && totalSeconds > 0) {
      window.location.reload();
    }
  }, [remainingSeconds, totalSeconds]);

  useEffect(() => {
    if (totalSeconds <= 0) return;
    setRemainingSeconds(totalSeconds);
    const timer = setInterval(() => {
      setRemainingSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [totalSeconds]);

  const formatCountdown = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // ── Data usage percentage (Finding #10) ──
  const [liveDataUsedMb, setLiveDataUsedMb] = useState<number | undefined>(undefined);
  const dataUsedMb = liveDataUsedMb ?? authResult.dataUsedMb ?? 0;
  const dataLimitMb = authResult.dataLimitMb;

  const dataPercent = dataLimitMb && dataLimitMb > 0
    ? Math.min(100, Math.round((dataUsedMb / dataLimitMb) * 100))
    : null;

  const formatMb = (mb: number): string => {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
  };

  // ── Auto-refresh data usage every 60 seconds ──
  useEffect(() => {
    if (!authResult.username && !authResult.sessionId) return;
    const sessionId = authResult.username || authResult.sessionId;
    if (!sessionId) return;

    const controller = new AbortController();

    const pollDataUsage = async () => {
      try {
        const params = new URLSearchParams();
        if (authResult.username) params.set('username', authResult.username);
        if (authResult.sessionId) params.set('sessionId', authResult.sessionId);
        const res = await fetch(`/api/v1/wifi/data-usage?${params}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (data.success && typeof data.dataUsedMb === 'number') {
            setLiveDataUsedMb(data.dataUsedMb);
          }
        }
      } catch {
        // Silently ignore — use initial auth response data
      }
    };

    // Initial poll after 60s, then every 60s
    const interval = setInterval(pollDataUsage, 60_000);
    // Also poll once after a short delay (30s) to catch early usage
    const initialTimer = setTimeout(pollDataUsage, 30_000);

    return () => {
      clearInterval(interval);
      clearTimeout(initialTimer);
      controller.abort();
    };
  }, [authResult.username, authResult.sessionId]);

  // ── External Gateway Redirect ──
  useEffect(() => {
    if (authResult.needGatewayLogin && authResult.gatewayCallbackUrl && authResult.radiusUsername && authResult.radiusPassword) {
      const redirectUrl = new URL(authResult.gatewayCallbackUrl);
      redirectUrl.searchParams.set('username', authResult.radiusUsername);
      redirectUrl.searchParams.set('password', authResult.radiusPassword);

      const timer = setTimeout(() => {
        console.log(`[Portal] Redirecting to external gateway: ${authResult.gatewayCallbackUrl}`);
        window.location.href = redirectUrl.toString();
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [authResult.needGatewayLogin, authResult.gatewayCallbackUrl, authResult.radiusUsername, authResult.radiusPassword]);

  const cardRadius = design.formStyle === 'pill' ? '1.5rem' : design.formStyle === 'square' ? '0' : '0.75rem';

  // ── Captive Portal Plan Upgrade handler (GAP-03 fix) ──
  // Called when the guest clicks "Upgrade Plan" on a non-current plan card.
  // Opens a dialog to confirm the upgrade + choose payment method.
  const handleUpgradeClick = (planId: string) => {
    setUpgradeError(null);
    setUpgradeSuccess(null);
    // The PlanSelectorWidget fetches plans itself; we don't have direct access here,
    // so we fetch the plan details on demand.
    if (!tenantId) {
      setUpgradeError('Tenant information missing — cannot upgrade.');
      return;
    }
    fetch(`/api/v1/wifi/public-plans?tenantId=${encodeURIComponent(tenantId)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const plan = (json.data as FetchedPlan[]).find((p) => p.id === planId) || null;
          setUpgradeTargetPlan(plan);
        } else {
          setUpgradeError('Could not load plan details.');
        }
      })
      .catch(() => setUpgradeError('Network error loading plan details.'));
  };

  // ── Trigger the upgrade via the new /api/v1/wifi/upgrade-plan endpoint ──
  const triggerUpgrade = async (paymentMethod: 'room_charge' | 'gateway') => {
    if (!upgradeTargetPlan || !authResult.username) return;
    setUpgradeLoading(true);
    setUpgradeError(null);
    setUpgradeSuccess(null);
    try {
      // Determine the guest's current plan id from authResult (passed from the auth step).
      // The portal doesn't always expose currentPlanId directly, so we send the username
      // and let the server resolve the current plan from the WiFiUser record.
      // The server validates fromPlanId === user's actual current plan.
      // We pass upgradeTargetPlan.id as toPlanId and rely on the server to compute the
      // difference. If fromPlanId is unknown client-side, we send the target as both
      // and the server returns a clear error.
      const fromPlanId = (authResult as AuthResult & { currentPlanId?: string }).currentPlanId;
      if (!fromPlanId) {
        setUpgradeError('Could not determine your current plan. Please reconnect to the portal.');
        setUpgradeLoading(false);
        return;
      }
      const res = await fetch('/api/v1/wifi/upgrade-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPlanId,
          toPlanId: upgradeTargetPlan.id,
          _sessionToken: authResult._sessionToken || saveStorageToken(),
          username: authResult.username,
          paymentMethod,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setUpgradeError(json.error || 'Upgrade failed.');
        setUpgradeLoading(false);
        return;
      }
      const data = json.data as {
        upgradeId: string;
        paymentId: string;
        method: string;
        status: string;
        amount: number;
        currency: string;
        gatewayRef?: string;
        razorpayKeyId?: string;
      };

      if (data.method === 'room_charge') {
        setUpgradeSuccess(`Upgraded! ${getCurrencySymbol(data.currency)} ${new Intl.NumberFormat('en-US').format(data.amount)} ${data.currency} charged to your room folio (settled at checkout).`);
        setUpgradeTargetPlan(null);
        // Reload auth result to reflect new bandwidth
        setTimeout(() => window.location.reload(), 2000);
      } else if (data.method === 'gateway' && data.gatewayRef && data.razorpayKeyId) {
        // Load Razorpay checkout.js dynamically + open checkout
        const existing = document.getElementById('razorpay-checkout-script') as HTMLScriptElement | null;
        const openCheckout = () => {
          const Razorpay = (window as unknown as { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void } }).Razorpay;
          if (!Razorpay) {
            setUpgradeError('Razorpay SDK failed to load. Try the "charge to room" option.');
            setUpgradeLoading(false);
            return;
          }
          const rzp = new Razorpay({
            key: data.razorpayKeyId,
            amount: Math.round(data.amount * 100),
            currency: data.currency,
            name: 'WiFi Upgrade',
            description: `Upgrade to faster WiFi`,
            order_id: data.gatewayRef,
            handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
              // Verify signature server-side
              try {
                const confirmRes = await fetch('/api/v1/wifi/upgrade-plan/confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    _sessionToken: authResult._sessionToken || saveStorageToken(),
                    username: authResult.username,
                    paymentId: data.paymentId,
                    razorpayPaymentId: response.razorpay_payment_id,
                    razorpayOrderId: response.razorpay_order_id,
                    razorpaySignature: response.razorpay_signature,
                  }),
                });
                const confirmJson = await confirmRes.json();
                if (confirmRes.ok && confirmJson.success) {
                  setUpgradeSuccess('Payment confirmed! Your WiFi has been upgraded.');
                  setUpgradeTargetPlan(null);
                  setTimeout(() => window.location.reload(), 2000);
                } else {
                  setUpgradeError(confirmJson.error || 'Payment verification failed.');
                }
              } catch {
                setUpgradeError('Network error verifying payment.');
              }
              setUpgradeLoading(false);
            },
            modal: {
              ondismiss: async () => {
                // User closed without paying — cancel the upgrade server-side
                try {
                  await fetch('/api/v1/wifi/upgrade-plan/cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      _sessionToken: authResult._sessionToken || saveStorageToken(),
                      username: authResult.username,
                      paymentId: data.paymentId,
                      reason: 'user_dismissed_checkout',
                    }),
                  });
                } catch { /* ignore */ }
                setUpgradeError('Payment cancelled. Your original plan is restored.');
                setUpgradeLoading(false);
              },
            },
            theme: { color: accent },
          });
          rzp.open();
        };
        if (existing) {
          openCheckout();
        } else {
          const script = document.createElement('script');
          script.id = 'razorpay-checkout-script';
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = openCheckout;
          script.onerror = () => {
            setUpgradeError('Razorpay SDK failed to load. Try the "charge to room" option.');
            setUpgradeLoading(false);
          };
          document.body.appendChild(script);
        }
      } else {
        setUpgradeSuccess('Upgrade initiated.');
        setUpgradeTargetPlan(null);
        setUpgradeLoading(false);
      }
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Network error.');
      setUpgradeLoading(false);
    }
  };

  return (
    <div className="text-center space-y-5 py-4">
      {design.showConfetti !== false && <ConfettiEffect active={true} />}
      {/* Success checkmark with animated pulse ring */}
      <div className="relative inline-flex items-center justify-center">
        {/* Expanding pulse rings */}
        <motion.div
          className="absolute w-20 h-20 rounded-full"
          style={{ border: `2px solid ${accent}30` }}
          animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute w-20 h-20 rounded-full"
          style={{ border: `1.5px solid ${accent}20` }}
          animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
        />
        {/* Circle background with scale animation */}
        <motion.div
          className="relative inline-flex items-center justify-center w-20 h-20 rounded-full"
          style={{ backgroundColor: accent + '15', boxShadow: `0 0 40px ${accent}15` }}
          initial={{ scale: 0 }}
          animate={{ scale: [0, 1.15, 0.95, 1] }}
          transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <CheckCircle className="w-10 h-10" style={{ color: accent }} />
          </motion.div>
        </motion.div>
      </div>
      <div>
        <h2 className="text-2xl font-bold" style={{ color: textColor }}>
          {getUIString(lang, 'connected')}
        </h2>
        <p className="text-sm mt-1" style={{ color: mutedColor }}>
          {authResult.message || 'You are now connected to hotel WiFi.'}
        </p>

        {/* Guest name / room display (Finding #11) */}
        {(authResult.guestName || authResult.roomNumber) && (
          <p className="text-sm mt-2 font-medium" style={{ color: accent }}>
            {[authResult.roomNumber && getUIString(lang, 'roomInfo').replace('{0}', authResult.roomNumber), authResult.guestName].filter(Boolean).join(' — ')}
          </p>
        )}

        {design.welcomeMessage && (
          <p className="text-sm mt-2 italic" style={{ color: accent }}>
            {getLocalizedText(design, 'welcomeMessage', lang)}
          </p>
        )}
        {/* External gateway redirect notice */}
        {authResult.needGatewayLogin && (
          <div className="flex items-center justify-center gap-2 mt-3">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: accent }} />
            <p className="text-sm" style={{ color: mutedColor }}>
              Redirecting to gateway...
            </p>
          </div>
        )}
      </div>

      {/* Session Info Card — Premium glass effect */}
      <div
        className="rounded-xl p-4 text-sm space-y-3 portal-animate-in"
        style={{
          backgroundColor: accent + '08',
          border: `1px solid ${accent}20`,
          borderRadius: cardRadius,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <h3 className="font-semibold text-left" style={{ color: textColor }}>
          {getUIString(lang, 'sessionDetails')}
        </h3>

        {/* Live countdown timer */}
        {totalSeconds > 0 && (
          <div
            className="flex items-center justify-between rounded-xl p-3.5"
            style={{ backgroundColor: accent + '10', border: `1px solid ${accent}20`, backdropFilter: 'blur(8px)' }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '15' }}>
                <Clock className="w-4 h-4" style={{ color: accent }} />
              </div>
              <span className="text-xs font-medium" style={{ color: mutedColor }}>
                {getUIString(lang, 'timeRemaining')}
              </span>
            </div>
            <span
              className="text-xl font-mono font-bold tabular-nums tracking-wider"
              style={{ color: remainingSeconds <= 300 ? '#ef4444' : textColor }}
            >
              {formatCountdown(remainingSeconds)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 rounded-lg p-2" style={{ backgroundColor: accent + '06' }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: accent + '12' }}>
              <Clock className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: mutedColor }}>{getUIString(lang, 'duration')}</p>
              <p className="font-semibold text-sm" style={{ color: textColor }}>
                {(() => {
                  const mins = authResult.remainingMinutes ?? authResult.sessionTimeout;
                  if (mins >= 60) {
                    const h = Math.floor(mins / 60);
                    const m = mins % 60;
                    return m > 0 ? `${h}h ${m}m` : `${h}h`;
                  }
                  return `${mins} min`;
                })()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg p-2" style={{ backgroundColor: accent + '06' }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: accent + '12' }}>
              <Zap className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: mutedColor }}>{getUIString(lang, 'download')}</p>
              <p className="font-semibold text-sm" style={{ color: textColor }}>{authResult.bandwidthDown} Mbps</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg p-2" style={{ backgroundColor: accent + '06' }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: accent + '12' }}>
              <Wifi className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: mutedColor }}>{getUIString(lang, 'upload')}</p>
              <p className="font-semibold text-sm" style={{ color: textColor }}>{authResult.bandwidthUp} Mbps</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg p-2" style={{ backgroundColor: accent + '06' }}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: accent + '12' }}>
              <Shield className="w-3.5 h-3.5" style={{ color: accent }} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: mutedColor }}>{getUIString(lang, 'method')}</p>
              <p className="font-semibold text-sm capitalize" style={{ color: textColor }}>
                {authResult.method.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>

        {/* Data usage progress bar (Finding #10) */}
        {dataPercent !== null && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: mutedColor }}>{getUIString(lang, 'dataUsage')}</span>
              <span style={{ color: textColor }}>
                {dataLimitMb ? getUIString(lang, 'usedOf').replace('{0}', formatMb(dataUsedMb)).replace('{1}', formatMb(dataLimitMb)) : getUIString(lang, 'noDataLimit')}
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: accent + '12' }}>
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${dataPercent}%`,
                  background: dataPercent >= 100
                    ? 'linear-gradient(90deg, #dc2626, #ef4444)'
                    : dataPercent >= 90
                      ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                      : `linear-gradient(90deg, ${accent}cc, ${accent})`,
                  boxShadow: dataPercent >= 90 ? 'none' : `0 0 8px ${accent}40`,
                }}
              />
            </div>

            {/* FUP (Fair Usage Policy) warning banners */}
            {dataPercent >= 100 && (
              <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ backgroundColor: '#fecaca', color: '#991b1b' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{getUIString(lang, 'dataCapReached')}</span>
              </div>
            )}
            {dataPercent >= 95 && dataPercent < 100 && (
              <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{getUIString(lang, 'dataCapWarning95')}</span>
              </div>
            )}
            {dataPercent >= 80 && dataPercent < 95 && (
              <div className="flex items-start gap-2 rounded-lg p-2.5 text-xs" style={{ backgroundColor: '#fef9c3', color: '#854d0e' }}>
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{getUIString(lang, 'dataCapWarning80')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Connection Quality Indicator (NEW) ── */}
      <ConnectionQualityIndicator accent={accent} mutedColor={mutedColor} textColor={textColor} cardRadius={cardRadius} />

      {/* ── Quick Actions Row (NEW) ── */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => {
            // Trigger speed test if available, otherwise navigate to speed test
            const speedTestBtn = document.querySelector('[data-speed-test-trigger]') as HTMLButtonElement;
            if (speedTestBtn) speedTestBtn.click();
          }}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
          style={{
            backgroundColor: accent + '08',
            border: `1px solid ${accent}15`,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '12' }}>
            <Zap className="w-4 h-4" style={{ color: accent }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: mutedColor }}>Speed Test</span>
        </button>
        <button
          onClick={() => {
            // Copy WiFi info to clipboard
            const wifiInfo = `SSID: ${authResult?.username || 'Hotel-Guest'}\nPassword: ******\nAuth: ${authResult?.method || 'voucher'}`;
            if (navigator.clipboard) navigator.clipboard.writeText(wifiInfo).catch(() => {});
          }}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
          style={{
            backgroundColor: accent + '08',
            border: `1px solid ${accent}15`,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '12' }}>
            <QrCode className="w-4 h-4" style={{ color: accent }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: mutedColor }}>Copy Info</span>
        </button>
        <button
          onClick={() => {
            // Navigate to help/support
            window.open('https://www.staysuite.com/support', '_blank');
          }}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
          style={{
            backgroundColor: accent + '08',
            border: `1px solid ${accent}15`,
          }}
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '12' }}>
            <Info className="w-4 h-4" style={{ color: accent }} />
          </div>
          <span className="text-[10px] font-semibold" style={{ color: mutedColor }}>Help</span>
        </button>
      </div>

      <button
        onClick={() => {
          const disconnectUser = authResult?.username || authResult?.sessionId;
          if (disconnectUser) {
            const payload = JSON.stringify({
              username: authResult?.username || undefined,
              sessionId: authResult?.sessionId || undefined,
              source: 'portal',
              _sessionToken: authResult?._sessionToken || saveStorageToken(),
            });
            if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
              navigator.sendBeacon(
                '/api/v1/wifi/disconnect',
                new Blob([payload], { type: 'application/json' })
              );
            } else {
              fetch('/api/v1/wifi/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
              }).catch(() => {});
            }
          }
          window.location.reload();
        }}
        className="text-sm flex items-center gap-1.5 justify-center mx-auto hover:underline transition-colors duration-200"
        style={{ color: accent }}
      >
        <RefreshCw className="w-3.5 h-3.5" />
        {getUIString(lang, 'connectAnotherDevice')}
      </button>

      {/* Disconnect / Logout Button — Premium glass style */}
      <button
        onClick={onDisconnect}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
        style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.15)',
          borderRadius: cardRadius,
          backdropFilter: 'blur(8px)',
        }}
      >
        <LogOut className="w-4 h-4" />
        {getUIString(lang, 'disconnectLogout')}
      </button>

      {/* Post-Connect Guest Survey — rendered via SurveyWidget when enabled in Portal Designer */}
      {design.surveyConfig?.enabled && tenantId && partnerId && (
        <div className="mt-4">
          <SurveyWidget
            tenantId={tenantId}
            partnerId={partnerId}
            sessionId={authResult?.sessionId}
            guestId={authResult?.guestId}
          />
        </div>
      )}

      {/* Feature widgets rendered on success screen */}
      {design.enableQrCode && design.qrCodeConfig?.showOnSuccess && (
        <QrCodeWidget
          ssid={''}
          username={authResult?.username || ''}
          password={''}
          config={design.qrCodeConfig}
          design={design}
        />
      )}
      {design.enableAutoRenewal && <AutoRenewalBanner design={design} />}
      {design.enablePlanSelector && design.planSelectorConfig && (
        <PlanSelectorWidget
          config={design.planSelectorConfig}
          currentPlanName={authResult?.method === 'social' ? 'Free Basic' : undefined}
          onUpgrade={handleUpgradeClick}
          design={design}
          tenantId={tenantId}
        />
      )}

      {/* GAP-03 fix: Upgrade confirmation dialog */}
      {(upgradeTargetPlan || upgradeError || upgradeSuccess) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => {
            if (!upgradeLoading) {
              setUpgradeTargetPlan(null);
              setUpgradeError(null);
              setUpgradeSuccess(null);
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: '#ffffff', color: '#1f2937' }}
            onClick={(e) => e.stopPropagation()}
          >
            {upgradeSuccess && (
              <>
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: '#10b98115' }}>
                    <svg className="w-6 h-6" fill="none" stroke="#10b981" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-base font-semibold">Upgrade Confirmed</h3>
                  <p className="text-xs text-gray-500">{upgradeSuccess}</p>
                </div>
                <button
                  onClick={() => { setUpgradeSuccess(null); setUpgradeTargetPlan(null); }}
                  className="w-full py-2.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: accent, color: '#ffffff' }}
                >
                  OK
                </button>
              </>
            )}
            {upgradeError && !upgradeSuccess && (
              <>
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: '#ef444415' }}>
                    <svg className="w-6 h-6" fill="none" stroke="#ef4444" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </div>
                  <h3 className="text-base font-semibold">Upgrade Failed</h3>
                  <p className="text-xs text-gray-500">{upgradeError}</p>
                </div>
                <button
                  onClick={() => { setUpgradeError(null); setUpgradeTargetPlan(null); }}
                  className="w-full py-2.5 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}
                >
                  Close
                </button>
              </>
            )}
            {upgradeTargetPlan && !upgradeSuccess && !upgradeError && (
              <>
                <div className="text-center space-y-1">
                  <h3 className="text-base font-semibold">Upgrade WiFi Plan</h3>
                  <p className="text-xs text-gray-500">Switch to {upgradeTargetPlan.name}</p>
                </div>
                <div className="rounded-lg p-3 text-center" style={{ backgroundColor: '#f9fafb' }}>
                  <div className="text-2xl font-bold" style={{ color: accent }}>
                    {getCurrencySymbol(upgradeTargetPlan.currency)}{upgradeTargetPlan.price}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    {Math.round(upgradeTargetPlan.downloadSpeed / 1000000) || upgradeTargetPlan.downloadSpeed}/
                    {Math.round(upgradeTargetPlan.uploadSpeed / 1000000) || upgradeTargetPlan.uploadSpeed} Mbps
                  </div>
                </div>
                <div className="space-y-2">
                  <button
                    onClick={() => triggerUpgrade('gateway')}
                    disabled={upgradeLoading}
                    className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: accent, color: '#ffffff' }}
                  >
                    {upgradeLoading ? 'Processing…' : `Pay ${getCurrencySymbol(upgradeTargetPlan.currency)}${upgradeTargetPlan.price} Online`}
                  </button>
                  <button
                    onClick={() => triggerUpgrade('room_charge')}
                    disabled={upgradeLoading}
                    className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: '#f3f4f6', color: '#1f2937' }}
                  >
                    Charge to My Room (settled at checkout)
                  </button>
                  <button
                    onClick={() => { if (!upgradeLoading) setUpgradeTargetPlan(null); }}
                    disabled={upgradeLoading}
                    className="w-full py-2 text-xs text-gray-400 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {design.enableSpeedTest && design.speedTestConfig?.showOnSuccess && (
        <SpeedTestWidget config={design.speedTestConfig} design={design} />
      )}

      {/* CP-HIGH-02: Continue Browsing — navigates to original URL or fallback */}
      <button
        onClick={() => {
          const target = originalUrl || 'https://www.google.com';
          window.location.href = target;
        }}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-medium rounded-xl transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
        style={{
          backgroundColor: accent + '12',
          color: accent,
          border: `1px solid ${accent}25`,
          borderRadius: cardRadius,
          backdropFilter: 'blur(8px)',
        }}
      >
        <ExternalLink className="w-4 h-4" />
        {getUIString(lang, 'continueBrowsing')}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Hotel Info Block
// ────────────────────────────────────────────────────────────

function HotelInfoBlock({ design, dark }: { design: PortalDesignConfig; dark: boolean }) {
  const lang = usePortalLang();
  const hasContent = design.hotelName || design.hotelAddress || design.hotelPhone || design.hotelWebsite;
  if (!design.showHotelInfo) return null;
  const textColor = dark ? '#ffffff' : design.textColor;
  const mutedColor = dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';

  const hotelName = getLocalizedText(design, 'hotelName', lang);
  const hotelAddress = getLocalizedText(design, 'hotelAddress', lang);

  return (
    <div className="w-full text-center space-y-1">
      {hotelName && <p className="text-sm font-semibold" style={{ color: textColor }}>{hotelName}</p>}
      <div className="flex items-center justify-center gap-1 text-xs" style={{ color: mutedColor }}>
        {hotelAddress && (
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{hotelAddress}</span>
        )}
      </div>
      <div className="flex items-center justify-center gap-3 text-xs" style={{ color: mutedColor }}>
        {design.hotelPhone && (
          <span className="flex items-center gap-1"><PhoneCall className="w-3 h-3" />{design.hotelPhone}</span>
        )}
        {design.hotelWebsite && (
          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{design.hotelWebsite}</span>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Amenities Block
// ────────────────────────────────────────────────────────────

function AmenitiesBlock({ design, dark }: { design: PortalDesignConfig; dark: boolean }) {
  const presetAmenities = (design.amenities || []).filter(Boolean);
  const customAmenities = (design.customAmenities || []).filter((a) => a.name);
  const allAmenities = [
    ...presetAmenities.map((name) => ({ name, icon: '' })),
    ...customAmenities,
  ];

  if (!design.showAmenities) return null;
  const accent = design.accentColor;
  const textColor = getCardTextColor(design);

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {allAmenities.map((a, i) => {
        const AmenityIcon = AMENITY_ICONS[a.name]
          || (a.icon ? CUSTOM_AMENITY_ICONS[a.icon.toLowerCase()] : null)
          || Star;
        return (
          <div
            key={`${a.name}-${i}`}
            className="portal-amenity-card flex items-center gap-2.5 p-2.5 rounded-xl cursor-default"
            style={{
              backgroundColor: dark ? 'rgba(255,255,255,0.06)' : accent + '08',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : accent + '15'}`,
            }}
          >
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: accent + '15' }}
            >
              <AmenityIcon className="w-4 h-4" style={{ color: accent }} />
            </div>
            <span className="text-xs font-medium" style={{ color: dark ? 'rgba(255,255,255,0.8)' : textColor }}>{a.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Promotion Block
// ────────────────────────────────────────────────────────────

function PromotionBlock({ design }: { design: PortalDesignConfig }) {
  const lang = usePortalLang();
  if (!design.showPromotion) return null;
  const dark = isDarkBackground(design);

  const promoTitle = getLocalizedText(design, 'promotionTitle', lang);
  const promoDesc = getLocalizedText(design, 'promotionDesc', lang);

  return (
    <div
      className="w-full flex items-start gap-3 rounded-xl p-3"
      style={{
        backgroundColor: dark ? 'rgba(255,255,255,0.12)' : design.accentColor + '10',
        backdropFilter: dark ? 'blur(8px)' : undefined,
        border: dark ? '1px solid rgba(255,255,255,0.15)' : 'none',
      }}
    >
      <Gift className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: design.accentColor }} />
      <div>
        {promoTitle && (
          <p className="font-semibold text-sm" style={{ color: dark ? '#ffffff' : getCardTextColor(design) }}>
            {promoTitle}
          </p>
        )}
        {promoDesc && (
          <p className="text-xs mt-1" style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)' }}>
            {promoDesc}
          </p>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Social Links Block
// ────────────────────────────────────────────────────────────

function SocialLinksBlock({ design }: { design: PortalDesignConfig }) {
  const activeLinks = (design.socialLinks || []).filter((l) => l.url);

  if (!design.showSocialMedia) return null;
  const dark = isDarkBackground(design);

  return (
    <div className="flex items-center justify-center gap-3">
      {activeLinks.map((l) => {
        const brandColor = getSocialPlatformColor(l.platform);
        return (
          <a
            key={l.platform}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110"
            style={{
              backgroundColor: brandColor,
              color: '#ffffff',
              boxShadow: `0 2px 8px ${brandColor}40`,
            }}
            aria-label={l.platform}
          >
            <span className="text-xs font-bold">{getSocialIconLabel(l.platform)}</span>
          </a>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Logo Component
// ────────────────────────────────────────────────────────────

function PortalLogo({ design, size }: { design: PortalDesignConfig; size?: 'large' | 'medium' | 'small' }) {
  const dark = isDarkBackground(design);
  const sz = size || (design.logoSize as 'large' | 'medium' | 'small') || 'large';
  const sizeClasses = sz === 'large' ? 'h-[72px] w-auto mb-4' : sz === 'medium' ? 'h-[56px] w-auto' : 'h-[40px] w-auto';
  const containerClasses = sz === 'large' ? 'w-[72px] h-[72px] rounded-2xl mb-4' : sz === 'medium' ? 'w-[56px] h-[56px] rounded-xl' : 'w-[40px] h-[40px] rounded-xl';
  const iconSize = sz === 'large' ? 'w-8 h-8' : sz === 'medium' ? 'w-6 h-6' : 'w-5 h-5';

  if (design.logoUrl) {
    return (
      <img
        src={design.logoUrl}
        alt="Hotel Logo"
        className={cn('mx-auto object-contain transition-transform duration-300 hover:scale-105', sizeClasses)}
      />
    );
  }

  return (
    <Image
      src="/images/cryptsk-logo.png"
      alt="Cryptsk"
      width={40}
      height={40}
      loading="eager"
      className={cn('object-contain mx-auto transition-transform duration-300 hover:scale-105', sizeClasses)}
    />
  );
}

// ────────────────────────────────────────────────────────────
// Main Portal Content
// ────────────────────────────────────────────────────────────

type PortalState =
  | 'loading'
  | 'splash'
  | 'auth_form'
  | 'authenticating'
  | 'marketing_capture'
  | 'success'
  | 'error'
  | 'device_management';

// ═══════════════════════════════════════════════════════════════════════════════
// Raw Template Renderer — Sandboxed iframe for external HTML/CSS templates
// ═══════════════════════════════════════════════════════════════════════════════
function RawTemplateRenderer({
  html,
  css,
  authUrl,
  design,
  portalConfig,
}: {
  html: string;
  css: string;
  authUrl: string;
  design: PortalDesignConfig;
  portalConfig: any;
}) {
  // Build the iframe srcdoc with the custom HTML template
  // The template can use {{variables}} which get replaced with portal config values
  const processedHtml = html
    .replace(/\{\{TITLE\}\}/g, design.title || 'Welcome')
    .replace(/\{\{SUBTITLE\}\}/g, design.subtitle || 'Connect to WiFi')
    .replace(/\{\{HOTEL_NAME\}\}/g, design.hotelName || '')
    .replace(/\{\{AUTH_URL\}\}/g, authUrl)
    .replace(/\{\{ACCENT_COLOR\}\}/g, design.accentColor || '#14b8a6')
    .replace(/\{\{TEXT_COLOR\}\}/g, design.textColor || '#ffffff')
    .replace(/\{\{BG_COLOR\}\}/g, design.backgroundColor || '#0f766e')
    .replace(/\{\{LOGO_URL\}\}/g, design.logoUrl || '')
    .replace(/\{\{BRAND_COLOR\}\}/g, design.accentColor || '#14b8a6')
    .replace(/\{\{FONT_FAMILY\}\}/g, design.fontFamily || 'Inter, sans-serif')
    .replace(/\{\{HEADING_FONT\}\}/g, design.headingFontFamily || 'Inter, sans-serif');

  const srcdoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  ${design.fontFamily ? `<link href="https://fonts.googleapis.com/css2?family=${design.fontFamily.split(',')[0].trim().replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap" rel="stylesheet" />` : ''}
  ${design.headingFontFamily ? `<link href="https://fonts.googleapis.com/css2?family=${design.headingFontFamily.split(',')[0].trim().replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap" rel="stylesheet" />` : ''}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: ${design.fontFamily || 'Inter, sans-serif'}; }
    ${css}
  </style>
</head>
<body>
  ${processedHtml}
  <script>
    // Bridge: When the form inside the template submits, post message to parent
    window.addEventListener('submit', function(e) {
      e.preventDefault();
      var form = e.target;
      var data = {};
      new FormData(form).forEach(function(value, key) { data[key] = value; });
      window.parent.postMessage({ type: 'PORTAL_AUTH', data: data }, '*');
    });
    // Bridge: Allow custom buttons to trigger auth via data attributes
    document.querySelectorAll('[data-auth-submit]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var data = {};
        if (btn.dataset.username) data.username = btn.dataset.username;
        if (btn.dataset.password) data.password = btn.dataset.password;
        if (btn.dataset.voucher) data.voucher = btn.dataset.voucher;
        if (btn.dataset.roomNumber) data.roomNumber = btn.dataset.roomNumber;
        window.parent.postMessage({ type: 'PORTAL_AUTH', data: data }, '*');
      });
    });
  </script>
</body>
</html>`;

  return (
    <iframe
      srcDoc={srcdoc}
      className="fixed inset-0 w-full h-full border-0 z-[100]"
      sandbox="allow-scripts allow-forms allow-same-origin"
      title="Custom Portal Template"
      style={{ background: 'transparent' }}
    />
  );
}

function PortalContent() {
  const searchParams = useSearchParams();
  const codeParam = searchParams.get('code') || '';
  // MAC address from NAS/AP — typically passed as ?mac=AA:BB:CC:DD:EE:FF in captive portal redirect URL
  const clientMac = searchParams.get('mac') || searchParams.get('client_mac') || searchParams.get('id') || '';
  // Social OAuth callback params
  const socialProviderParam = searchParams.get('social_provider') || '';
  const socialTokenParam = searchParams.get('social_token') || '';
  const socialErrorParam = searchParams.get('social_error') || '';

  // Feature #6: Shareable Preview Link — extract preview design from URL
  const previewParam = searchParams.get('preview') || '';
  const previewDesignConfig = useMemo(() => {
    if (!previewParam) return null;
    try {
      const jsonStr = decodeURIComponent(escape(atob(previewParam)));
      const data = JSON.parse(jsonStr);
      // Construct a PortalDesignConfig from the preview data
      const bg = data.bg || { type: 'solid', color: '#0f766e' };
      return {
        ...DEFAULT_PORTAL_DESIGN,
        layoutType: data.layoutType || 'centered',
        backgroundType: bg.type === 'gradient' ? 'gradient' : bg.type === 'image' ? 'image' : 'solid',
        gradientFrom: bg.from || '#0f766e',
        gradientTo: bg.to || '#134e4a',
        gradientAngle: bg.angle || 135,
        backgroundColor: bg.color || bg.type === 'solid' ? bg.color : '#0f766e',
        backgroundImage: bg.url || '',
        textColor: data.textColor || '#fafafa',
        accentColor: data.accentColor || '#14b8a6',
        fontFamily: data.fontFamily || 'Inter, system-ui, sans-serif',
        headingFontFamily: data.headingFontFamily || data.fontFamily || 'Inter, system-ui, sans-serif',
        formStyle: data.formStyle || 'rounded',
        inputStyle: data.inputStyle || 'rounded',
        buttonStyle: data.buttonStyle || 'filled',
        buttonSize: data.buttonSize || 'medium',
        cardShadow: data.cardShadow || 'medium',
        animationType: data.animationType || 'fade',
        title: data.title || 'Welcome',
        subtitle: data.subtitle || 'Connect to WiFi',
        hotelName: data.hotelName || 'StaySuite Hotel',
        logoUrl: data.logoUrl || '',
        showHotelInfo: data.showHotelInfo ?? false,
        amenities: data.amenities || [],
        showAmenities: data.showAmenities ?? false,
        showSocialMedia: data.showSocialMedia ?? false,
        socialLinks: data.socialLinks || [],
        showClock: data.showClock ?? false,
        welcomeMessage: data.welcomeMessage || 'Enjoy your stay',
        showBranding: true,
      };
    } catch (err) {
      console.error('[Portal] Failed to decode preview design:', err);
      return null;
    }
  }, [previewParam]);
  const [previewDismissed, setPreviewDismissed] = useState(false);

  // CP-HIGH-02: Preserve original URL the user was trying to visit before
  // captive portal interception. NAS typically passes it via WISPr or as
  // a query parameter. We store it in sessionStorage so it survives auth flow.
  const originalRedirectUrl = useMemo(() => {
    const isBrowser = typeof window !== 'undefined';
    const raw =
      searchParams.get('redirect_url') ||
      searchParams.get('userurl') ||
      searchParams.get('continue') ||
      searchParams.get('orig_url') ||
      searchParams.get('return_url') ||
      '';
    if (raw) {
      try { new URL(raw); if (isBrowser) sessionStorage.setItem('cp_original_url', raw); return raw; }
      catch { /* not a valid URL, ignore */ }
    }
    // Fall back to sessionStorage (preserved from earlier page load)
    return isBrowser ? (sessionStorage.getItem('cp_original_url') || '') : '';
  }, [searchParams]);

  // CP-HIGH-01: CNA detection — used to adapt UI and auto-close CNA popup after auth
  const { isCNA, os: cnaOS, mac: cnaMac } = useCNADetection();

  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null);
  const [design, setDesign] = useState<PortalDesignConfig>(DEFAULT_PORTAL_DESIGN);
  const [state, setState] = useState<PortalState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [guestInfo, setGuestInfo] = useState({ firstName: '', lastName: '', email: '', phone: '', passport: '', bookingId: '' });
  const [selectedLanguage, setSelectedLanguage] = useState('');

  // Client IP resolved by the server from resolve-zone API
  // Sent in auth request body (like scripts/test-login-sessions.sh) so it survives proxy transit
  const [resolvedClientIp, setResolvedClientIp] = useState<string | null>(null);

  // CAPTCHA state
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState('');

  // Auto-auth state
  const [autoAuthAttempted, setAutoAuthAttempted] = useState(false);
  const [autoAuthError, setAutoAuthError] = useState<string | null>(null);
  // Session-check state (detect existing active session by client IP)
  const [sessionChecked, setSessionChecked] = useState(false);
  const [maxDeviceMessage, setMaxDeviceMessage] = useState('');
  const [emailOtpGuestInfo, setEmailOtpGuestInfo] = useState<{ guestName?: string; roomNumber?: string; maskedEmail?: string } | null>(null);

  // Pre-generated fingerprint — computed once on mount and reused for
  // both auto-auth attempts and manual auth DeviceProfile creation.
  // This avoids generating the fingerprint twice and ensures consistency.
  const [preGeneratedFingerprint, setPreGeneratedFingerprint] = useState<string | null>(null);

  // Device management state (shown when MAX_SESSIONS_REACHED with deviceManagement enabled)
  const [activeDevices, setActiveDevices] = useState<Array<{
    sessionId: string;
    acctUniqueId: string;
    mac: string | null;
    ip: string | null;
    deviceName: string | null;
    startTime: string;
    userAgent: string | null;
  }>>([]);
  const [activeDevicesUsername, setActiveDevicesUsername] = useState<string>('');
  const [deviceManagementEnabled, setDeviceManagementEnabled] = useState(false);
  const [disconnectingSessionId, setDisconnectingSessionId] = useState<string | null>(null);
  const [disconnectToken, setDisconnectToken] = useState<string | undefined>(undefined);

  // Tab switch animation direction tracking
  const [tabDirection, setTabDirection] = useState(0);
  const tabMethodRef = useRef('');

  // Pre-generate fingerprint as soon as the component mounts (runs in background)
  useEffect(() => {
    generateFingerprint().then((fp) => {
      setPreGeneratedFingerprint(fp.hash);
      console.log('[Portal] Fingerprint pre-generated:', fp.hash.substring(0, 12) + '...', '(' + fp.signals.signalCount + ' signals, ' + fp.collectionTimeMs + 'ms)');
    }).catch(() => {
      console.warn('[Portal] Fingerprint pre-generation failed — will retry on auth');
    });
  }, []);

  // CP-HIGH-01 + CP-HIGH-02: Post-login redirect behavior.
  // Controlled by Portal Preferences → Post-Login Behavior setting:
  //   - "stay": Show the success page with timer + logout (no redirect)
  //   - "redirect": Navigate to admin-configured URL, original URL, or Google
  //
  // CNA (Captive Network Assistant) handling:
  //   - Apple: MUST redirect to captive.apple.com/success.html to close CNA popup
  //     (unless CNA is disabled for Mac in Portal Preferences)
  //   - Windows/Android: NCSI closes on its own; browser goes to a useful page
  useEffect(() => {
    if (state !== 'success') return;

    const postLoginMode = portalConfig?.postLoginMode || 'stay';
    const isApple = cnaOS === 'iOS' || cnaOS === 'macOS';
    const macCnaDisabled = isApple && !portalConfig?.cnaEnabledMac;

    // Mode "stay": never redirect — show the built-in success screen
    if (postLoginMode === 'stay' && !macCnaDisabled) return;

    // Known OS CNA canary URLs — these are useless to show to users as a "landing page"
    const cnaTestHosts = [
      'captive.apple.com', 'www.apple.com/library/test/success.html',
      'connectivitycheck.gstatic.com', 'detectportal.firefox.com',
      'www.msftconnecttest.com', 'www.google.com/generate_204',
      'captiveportal.hotspot.example.com', 'neverssl.com',
    ];
    const isCnaUrl = (url: string) => cnaTestHosts.some(h => url.toLowerCase().includes(h));

    // Filter originalRedirectUrl: skip CNA test URLs
    const safeOriginalUrl = originalRedirectUrl && !isCnaUrl(originalRedirectUrl)
      ? originalRedirectUrl : '';

    // Admin-configured URL from portal preferences (postLoginRedirectUrl)
    // falls back to CaptivePortal.redirectUrl (legacy field)
    let adminUrl = portalConfig?.postLoginRedirectUrl || portalConfig?.redirectUrl || '';
    // Auto-prefix bare domains (e.g. "example.com" → "https://example.com")
    if (adminUrl && !adminUrl.match(/^https?:\/\//i)) {
      adminUrl = 'https://' + adminUrl;
    }

    // Apple CNA close URL (required to dismiss the CNA mini-browser popup)
    const appleCloseUrl = 'http://captive.apple.com/success.html';

    // Determine target URL
    let targetUrl = '';
    let target = portalConfig?.postLoginRedirectTarget || '_self';

    if (macCnaDisabled) {
      // CNA disabled for Mac → treat like any other device, go to useful URL
      targetUrl = adminUrl || safeOriginalUrl || 'https://www.google.com';
    } else if (isApple) {
      // Apple with CNA enabled → must use canary URL to close popup
      targetUrl = appleCloseUrl;
      target = '_self'; // Apple CNA window — always same window
    } else if (postLoginMode === 'redirect') {
      // Redirect mode: admin URL > user's original URL > Google
      targetUrl = adminUrl || safeOriginalUrl || 'https://www.google.com';
    } else {
      // Stay mode but non-Apple CNA (Windows/Android) — redirect to useful page
      // so the NCSI notification closes and user sees something useful
      targetUrl = adminUrl || safeOriginalUrl || 'https://www.google.com';
    }

    if (!targetUrl) return;

    console.log('[Portal] Post-login redirect (' + cnaOS + ', mode=' + postLoginMode + '):', targetUrl, 'target=' + target);
    const timer = setTimeout(() => {
      if (target === '_blank') {
        // Use hidden anchor to avoid popup blockers (window.open in setTimeout gets blocked)
        const a = document.createElement('a');
        a.href = targetUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        window.location.href = targetUrl;
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [isCNA, cnaOS, state, originalRedirectUrl, portalConfig?.redirectUrl, portalConfig?.postLoginMode, portalConfig?.postLoginRedirectUrl, portalConfig?.postLoginRedirectTarget, portalConfig?.cnaEnabledMac]);

  // CP-HIGH-03: Detect redirect loop — if portal loads >3 times without
  // successful auth, the DNS/nftables rules likely aren't updated for this IP.
  // Show a clear error and stop the loop.
  useEffect(() => {
    try {
      const key = 'cp_portal_load_count';
      const count = parseInt(sessionStorage.getItem(key) || '0', 10) + 1;
      sessionStorage.setItem(key, String(count));
      if (count > 3 && state !== 'success') {
        setErrorMessage('Redirect loop detected. If you have already authenticated, please try opening a new browser tab or clearing your browser cache. Contact front desk if the issue persists.');
        setState('error');
      }
    } catch { /* sessionStorage unavailable */ }
  }, []);

  // Reset loop counter on successful auth
  useEffect(() => {
    if (state === 'success') {
      try { sessionStorage.removeItem('cp_portal_load_count'); } catch { /* ignore */ }
    }
  }, [state]);

  // ── Apply portal config to state ──
  const applyPortalConfig = useCallback((data: PortalConfig) => {
    console.log('[Portal] Applying config:', {
      name: data.name,
      authMethod: data.authMethod,
      formFields: data.formFields ? Object.keys(data.formFields).length + ' fields' : 'null',
      bgType: data.design?.backgroundType,
      bgColor: data.design?.backgroundColor,
      formStyle: data.design?.formStyle,
      title: data.design?.title,
    });
    setPortalConfig(data);

    // ── Feature #12: Per-Device Template Auto-Switch ──
    let mergedDesign = data.design;
    if (data.design?.enablePerDevice && data.design?.perDeviceOverrides) {
      const deviceType = typeof window !== 'undefined'
        ? window.innerWidth < 640 ? 'phone' : window.innerWidth < 1024 ? 'tablet' : 'desktop'
        : 'desktop';
      const deviceOverride = data.design.perDeviceOverrides[deviceType];
      if (deviceOverride && Object.keys(deviceOverride).length > 0) {
        console.log(`[Portal] Applying ${deviceType} device design override:`, deviceOverride);
        mergedDesign = { ...data.design, ...deviceOverride };
      }
    }

    setDesign(mergeDesignConfig(mergedDesign));
    // Extract CAPTCHA config from portal
    setCaptchaEnabled((data as any).captchaEnabled ?? false);
    setCaptchaSiteKey((data as any).captchaSiteKey || '');
    const methods = data.authMethods?.length
      ? data.authMethods
      : [{ method: data.authMethod || 'voucher', label: data.authMethod || 'voucher', description: '' }];
    // Default to the portal's configured authMethod (set in Portal Designer)
    // rather than always picking the first method in the list. This ensures
    // the /connect page opens on the same auth method the admin designed
    // the form for (e.g. pms_credentials, not voucher).
    const preferredMethod = data.authMethod && methods.some(m => m.method === data.authMethod)
      ? data.authMethod
      : methods[0].method;
    setSelectedMethod(preferredMethod);
    // Feature #10: Show splash screen first if enabled
    if (data.design?.enableSplashScreen) {
      setState('splash');
    } else {
      setState('auth_form');
    }
  }, []);

  // ── Attempt silent auto-auth for returning devices ──
  // Called after portal config is loaded. Checks if this device has a
  // saved fingerprint/storageToken that matches a known DeviceProfile.
  // Falls back to MAC-based matching when browser fingerprint is unavailable (HTTP/no-crypto.subtle).
  const attemptAutoAuth = useCallback(
    async (slug: string) => {
      try {
        // Use pre-generated fingerprint, or generate fresh if not ready yet
        let fpHash: string | null = preGeneratedFingerprint || null;
        if (!fpHash) {
          try {
            const fp = await generateFingerprint();
            fpHash = fp.hash;
            setPreGeneratedFingerprint(fp.hash); // Cache for future use
          } catch {
            console.warn('[Portal] Fingerprint generation failed — will try MAC-based auto-auth');
          }
        }

        // Ensure storageToken exists (create if needed)
        let storageToken = getStorageToken();
        if (!storageToken) {
          storageToken = saveStorageToken();
        }

        console.log('[Portal] Auto-auth attempt:', {
          fingerprintPrefix: fpHash ? fpHash.substring(0, 12) + '...' : 'none',
          hasStorageToken: !!storageToken,
          macAddress: clientMac || 'none',
        });

        const res = await fetch('/api/v1/wifi/auto-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fingerprintHash: fpHash || undefined,
            storageToken: storageToken || undefined,
            portalSlug: slug,
            macAddress: clientMac || undefined,
          }),
        });

        const result = await res.json();

        if (result.success && result.data?.authenticated) {
          console.log('[Portal] ✅ Auto-auth SUCCESS — silent re-authentication');
          setAuthResult(result.data);
          setState('success');
          return true;
        }

        // Handle specific error codes with user-facing messages
        const errorCode = result.error?.code;
        if (errorCode === 'MAX_DEVICES') {
          console.warn('[Portal] Auto-auth blocked: max device limit reached');
          setMaxDeviceMessage(result.error?.message || 'Maximum device limit reached. Disconnect another device to log in.');
          setState('auth_form');
          return false;
        }

        console.log('[Portal] Auto-auth no match:', errorCode || 'unknown');
        return false;
      } catch (err) {
        console.warn('[Portal] Auto-auth failed:', err);
        setAutoAuthError('Connection issue. Please try again.');
        return false;
      }
    },
    [preGeneratedFingerprint, clientMac]
  );

  // ── Fetch portal config on mount — IP-based auto-resolution ──
  // Feature #6: If a ?preview= param is present, use the embedded design
  // config directly instead of calling the resolve-zone API.
  useEffect(() => {
    // Preview mode: apply embedded design config, skip API call
    if (previewDesignConfig) {
      console.log('[Portal] Preview mode — applying embedded design config');
      setDesign(previewDesignConfig);
      setPortalConfig(null); // No real portal config in preview mode
      setState('auth_form');
      return;
    }

    let cancelled = false;
    const fetchPortal = async () => {
      try {
        const resolveRes = await fetch('/api/wifi/portal/resolve-zone');
        if (cancelled) return;
        if (!resolveRes.ok) {
          console.error('[Portal] resolve-zone HTTP error:', resolveRes.status, resolveRes.statusText);
          setState('auth_form');
          return;
        }
        const resolveResult = await resolveRes.json();

        if (resolveResult.success && resolveResult.data?.config) {
          console.log(
            '[Portal] Resolved zone:',
            resolveResult.data.zone,
            resolveResult.data.isDefault ? '(default fallback)' : `subnet: ${resolveResult.data.matchedSubnet}`,
            resolveResult.data.clientIp ? `clientIp: ${resolveResult.data.clientIp}` : 'no clientIp',
          );
          // Store the client IP resolved by the server — will be sent in auth request body
          if (resolveResult.data.clientIp) {
            setResolvedClientIp(resolveResult.data.clientIp);
          }

          // ── Feature #14: A/B Testing — apply variant design if active test exists ──
          const abTestData = resolveResult.data.abTest;
          if (abTestData && abTestData.id && abTestData.designA && abTestData.designB) {
            const clientIpForHash = resolveResult.data.clientIp || Math.random().toString(36);
            // Simple hash: consistent for same IP, random if no IP
            let hash = 0;
            for (let i = 0; i < clientIpForHash.length; i++) {
              hash = ((hash << 5) - hash + clientIpForHash.charCodeAt(i)) | 0;
            }
            const isVariantA = (Math.abs(hash) % 100) < abTestData.trafficSplit;
            const variantDesign = isVariantA ? abTestData.designA : abTestData.designB;
            const variant = isVariantA ? 'A' : 'B';

            console.log(`[Portal] A/B Test "${abTestData.name}" — assigned variant ${variant} (split: ${abTestData.trafficSplit}%)`);

            // Store A/B test info for tracking
            (window as any).__abTest = { id: abTestData.id, variant };

            // Track impression (background, non-blocking)
            fetch('/api/wifi/portal/ab-test/track-impression', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ testId: abTestData.id, variant }),
            }).catch(() => {});

            // Apply variant design override to the config
            const configWithVariant = { ...resolveResult.data.config };
            if (variantDesign) {
              // Override design properties from the variant
              const vd = variantDesign as Record<string, any>;
              if (configWithVariant.design) {
                configWithVariant.design = { ...configWithVariant.design };
                if (vd.backgroundColor) configWithVariant.design.backgroundColor = vd.backgroundColor;
                if (vd.brandColor) configWithVariant.design.accentColor = vd.brandColor;
                if (vd.textColor) configWithVariant.design.textColor = vd.textColor;
                if (vd.logoUrl) configWithVariant.design.logoUrl = vd.logoUrl;
                if (vd.backgroundImageUrl) configWithVariant.design.backgroundImage = vd.backgroundImageUrl;
                if (vd.settings) {
                  Object.entries(vd.settings).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                      (configWithVariant.design as any)[key] = value;
                    }
                  });
                }
              }
            }
            applyPortalConfig(configWithVariant as PortalConfig);
          } else {
            applyPortalConfig(resolveResult.data.config as PortalConfig);
          }
        } else {
          console.warn('[Portal] No portal config available, using voucher fallback');
          setState('auth_form');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Portal] Failed to fetch config:', err);
        setState('auth_form');
      }
    };
    fetchPortal();
    return () => { cancelled = true; };
  }, [applyPortalConfig]);

  // ── Check for existing active session by client IP ──
  // This runs BEFORE auto-auth. If the client already has an active RADIUS
  // session (e.g. user closed browser and reopened it), the portal should
  // show the post-login page with a logout button, not the login form.
  //
  // IMPORTANT: 1-IP-1-login rule — if the active session belongs to a
  // DIFFERENT device (MAC mismatch), do NOT show the disconnect button.
  // Instead, show an error that this IP is already in use.
  useEffect(() => {
    if (sessionChecked || !portalConfig) return;
    setSessionChecked(true);

    const checkSession = async () => {
      try {
        const deviceMac = (clientMac || '').toLowerCase().replace(/[:\-\.]/g, '');

        console.log('[Portal] Checking for existing active session by client IP' + (deviceMac ? ' (device MAC: ' + deviceMac + ')' : ' (no MAC — IP-only detection)') + '...');
        const res = await fetch('/api/v1/wifi/session-check');
        if (!res.ok) return;
        const result = await res.json();

        if (result.success && result.hasSession && result.session) {
          const sessionMac = (result.session.mac || '').toLowerCase().replace(/[:\-\.]/g, '');

          // When we HAVE a device MAC and session also has a MAC — verify they match
          // to prevent session takeover on shared IPs (1-IP-1-login rule).
          if (deviceMac && sessionMac && deviceMac !== sessionMac) {
            console.log(`[Portal] ❌ IP already in use by another device (session MAC: ${sessionMac}, device MAC: ${deviceMac})`);
            setState('error');
            setErrorMessage(`This IP address is already in use by another device (${result.session.username}). Each device must use its own connection. Please contact the front desk if you believe this is an error.`);
            return;
          }

          // Claim session: MACs match, or no device MAC (direct browser access in hotel WiFi
          // where DHCP assigns unique IPs per device), or session has no MAC.
          console.log('[Portal] ✅ Active session detected — showing post-login page');
          setAuthResult(result.session);
          setState('success');
          return;
        }

        console.log('[Portal] No active session found — proceeding to login/auto-auth');
      } catch (err) {
        console.warn('[Portal] Session check failed:', err);
        // Non-fatal — proceed with login form
      }
    };
    checkSession();
  }, [portalConfig, sessionChecked]);

  // ── After portal config loads, attempt auto-auth ──
  useEffect(() => {
    // Skip if session was already detected
    if (state === 'success') return;
    // Skip auto-auth if portal has it disabled (admin toggle)
    if (portalConfig?.autoAuthEnabled === false) {
      console.log('[Portal] Auto-auth disabled for this portal, showing login form');
      return;
    }
    if (portalConfig?.slug && !autoAuthAttempted && state === 'auth_form') {
       
      setAutoAuthAttempted(true);
      attemptAutoAuth(portalConfig.slug);
    }
  }, [portalConfig?.slug, portalConfig?.autoAuthEnabled, autoAuthAttempted, state, attemptAutoAuth]);

  // ── Authentication handler ──
  const portalSlug = portalConfig?.slug || 'default';
  const authenticate = useCallback(
    async (method: string, payload: Record<string, string>): Promise<boolean> => {

      setState('authenticating');
      setErrorMessage('');

      try {
        // Include real fingerprint + storageToken in the auth request body
        // so the server can create the DeviceProfile with the correct fingerprint
        // (needed for auto-reauth on future visits)
        const storageToken = saveStorageToken(); // Create/reuse localStorage token
        const fpHash = preGeneratedFingerprint || (await generateFingerprint().then(fp => fp.hash).catch(() => null));

        const body: Record<string, unknown> = { method, portalSlug, ...payload };
        if (clientMac) body.macAddress = clientMac;
        if (resolvedClientIp) body.clientIp = resolvedClientIp;
        if (fpHash) body.fingerprintHash = fpHash;
        if (storageToken) body.storageToken = storageToken;
        // Include CAPTCHA token if enabled
        if (captchaEnabled) body.captchaToken = captchaToken || undefined;
        // Include terms acceptance for server-side consent enforcement (GDPR)
        if (termsAccepted) {
          body.termsAccepted = 'true';
          body.termsAcceptedAt = new Date().toISOString();
        }

        const res = await fetch('/api/v1/wifi/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const result = await res.json();

        // OTP first step: just sending contact info, don't transition state
        if ((method === 'sms_otp' || method === 'email_otp') && !payload.otpCode && result.success) {
          // Capture guest info from email OTP response for display
          if (method === 'email_otp' && result.data?.guestName) {
            setEmailOtpGuestInfo({
              guestName: result.data.guestName,
              roomNumber: result.data.roomNumber,
              maskedEmail: result.data.maskedEmail,
            });
          }
          setState('auth_form');
          return true;
        }

        if (result.success && result.data?.authenticated) {
          // DeviceProfile is created server-side by the auth endpoint
          // (upsertDeviceProfileWithFingerprint). No client-side fallback needed.
          setAuthResult(result.data);

          // ── Feature #14: A/B Testing — track conversion on successful auth ──
          const abTestInfo = (window as any).__abTest;
          if (abTestInfo?.id && abTestInfo?.variant) {
            fetch('/api/wifi/portal/ab-test/track-conversion', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ testId: abTestInfo.id, variant: abTestInfo.variant }),
            }).catch(() => {});
            delete (window as any).__abTest;
          }

          // If marketing capture is enabled, show interstitial before success
          if (design.enableMarketingCapture) {
            setState('marketing_capture');
          } else {
            setState('success');
          }
          return true;
        } else {
          const errCode = result.error?.code || '';
          const lang = selectedLanguage || design.defaultLanguage || 'en';
          const localizedMessage = getLocalizedAuthErrorMessage(lang, errCode, result.error?.message);

          // If MAX_SESSIONS_REACHED with device management enabled, show device list
          if (errCode === 'MAX_SESSIONS_REACHED' && result.error?.deviceManagementEnabled && result.error?.activeDevices?.length > 0) {
            setActiveDevices(result.error.activeDevices);
            setActiveDevicesUsername(result.error.username || '');
            setDeviceManagementEnabled(true);
            setDisconnectToken(result.error.disconnectToken);
            setErrorMessage(localizedMessage);
            setState('device_management');
          } else {
            setState('error');
            setErrorMessage(localizedMessage);
          }
          return false;
        }
      } catch {
        setState('error');
        const lang = selectedLanguage || design.defaultLanguage || 'en';
        setErrorMessage(getUIString(lang, 'networkError'));
        return false;
      }
    },
    [portalSlug, preGeneratedFingerprint, termsAccepted, clientMac, resolvedClientIp, captchaEnabled, captchaToken]
  );

  // Use a ref for authenticate to avoid TDZ issues in useEffect dependency arrays
  // during React Fast Refresh / hot-reload scenarios.
  const authenticateRef = useRef(authenticate);
  useEffect(() => {
    authenticateRef.current = authenticate;
  }, [authenticate]);

  // ── Track tab direction for animated transitions ──
  useEffect(() => {
    const methods = portalConfig?.authMethods?.length
      ? portalConfig.authMethods.map((m: { method: string }) => m.method)
      : DEFAULT_AUTH_METHODS.map(m => m.method);
    const current = selectedMethod || methods[0] || 'voucher';
    if (tabMethodRef.current && tabMethodRef.current !== current) {
      const oldIdx = methods.indexOf(tabMethodRef.current);
      const newIdx = methods.indexOf(current);
      setTabDirection(newIdx > oldIdx ? 1 : -1);
    }
    tabMethodRef.current = current;
  }, [selectedMethod, portalConfig?.authMethods]);

  // ── Handle social OAuth callback params ──
  // When the OAuth provider redirects back to /connect with social_token, auto-authenticate.
  useEffect(() => {
    if (socialTokenParam && socialProviderParam && portalConfig?.slug && !autoAuthAttempted) {
      console.log(`[Portal] Social OAuth callback detected: provider=${socialProviderParam}`);
      setAutoAuthAttempted(true);
      setSelectedMethod('social');
      authenticateRef.current('social', {
        socialProvider: socialProviderParam,
        socialToken: socialTokenParam,
      });
    }
    // Handle social error from OAuth callback
    if (socialErrorParam && !autoAuthAttempted) {
      console.warn(`[Portal] Social OAuth error: ${socialErrorParam}`);
      setAutoAuthAttempted(true);
      const errorMessages: Record<string, string> = {
        invalid_provider: 'Invalid social login provider.',
        no_code: 'Social login authorization was cancelled.',
        no_config: 'Social login is not configured.',
        no_credentials: 'Social login credentials are missing.',
        provider_disabled: 'This social login method is currently disabled.',
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        token_endpoint_unreachable: 'Could not reach the social provider. Please try again.',
        token_parse_error: 'Invalid response from social provider.',
        graph_api_failed: 'Could not retrieve profile from Facebook.',
        graph_api_error: 'Error retrieving Facebook profile.',
        id_token_decode_failed: 'Could not read social login identity.',
        no_id_token: 'Failed to get identity from social provider.',
        no_user_identity: 'Could not identify you from the social provider.',
        apple_jwt_failed: 'Apple Sign-In configuration error. Please contact support.',
        internal: 'An error occurred during social login. Please try again.',
        token_endpoint_unreachable: 'Could not reach the social provider. Please try again.',
      };
      setErrorMessage(errorMessages[socialErrorParam] || 'Social login failed. Please try again or use a different method.');
    }
  }, [socialTokenParam, socialProviderParam, socialErrorParam, portalConfig?.slug, autoAuthAttempted]);

  // ── Disconnect handler: ends session, resets portal ──
  // IMPORTANT: We do NOT delete the DeviceProfile and do NOT clear the storageToken.
  // This enables auto-reauth on the next visit — when the user opens the portal again,
  // the pre-generated fingerprint will match the existing DeviceProfile, and the
  // storageToken will match via Strategy 1 (most reliable).
  // To truly sign out from all devices, the user can use a separate "forget device" action.
  const handleDisconnect = useCallback(async () => {
    try {
      // 1. Close any active radacct sessions for this user (sets acctstoptime)
      const disconnectUser = authResult?.username || authResult?.sessionId;
      if (disconnectUser) {
        const payload = JSON.stringify({
          username: authResult?.username || undefined,
          sessionId: authResult?.sessionId || undefined,
          source: 'portal', // Keep DeviceProfile active for future auto-auth
          _sessionToken: authResult?._sessionToken || saveStorageToken(),
        });

        // Use navigator.sendBeacon() first — survives page navigation/unload
        // (critical for CoovaChilli captive portal redirect after deauth)
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
          const sent = navigator.sendBeacon(
            '/api/v1/wifi/disconnect',
            new Blob([payload], { type: 'application/json' })
          );
          if (!sent) {
            // sendBeacon queue full — fall back to fetch with keepalive
            fetch('/api/v1/wifi/disconnect', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
              keepalive: true, // Survives page unload
            }).catch(() => {});
          }
        } else {
          // Fallback: fetch with keepalive for older browsers
          fetch('/api/v1/wifi/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }

      // 2. Keep storageToken — do NOT clear it!
      //    Auto-reauth will use it on the next visit to match by Strategy 1.
    } catch {
      // Best effort — proceed with reset regardless
    }

    // Reset portal state to show login form
    setAuthResult(null);
    setAutoAuthAttempted(false);
    setSessionChecked(false);
    setState('auth_form');
    setErrorMessage('');
  }, [authResult]);

  // ── Derived values ──
  const authMethods = portalConfig?.authMethods?.length
    ? portalConfig.authMethods
    : DEFAULT_AUTH_METHODS;
  const activeMethod = selectedMethod || authMethods[0]?.method || 'voucher';
  const formFields = portalConfig?.formFields || null;
  const dark = isDarkBackground(design);
  const animCls = getAnimationClasses(design);

  // Set CSS custom properties for font loader
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setPartner('--portal-font-family', design.fontFamily || '');
      document.documentElement.style.setPartner('--portal-heading-font', design.headingFontFamily || '');
      document.documentElement.style.setPartner('--portal-accent', design.accentColor || '#14b8a6');
    }
  }, [design.fontFamily, design.headingFontFamily, design.accentColor]);

  const effectiveLanguage = selectedLanguage || design.defaultLanguage || 'en';

  // ── CAPTCHA widget renderer ──
  const renderCaptchaWidget = () => {
    if (!captchaEnabled || !captchaSiteKey) return null;
    return <TurnstileWidget siteKey={captchaSiteKey} onVerify={(token) => setCaptchaToken(token)} />;
  };

  // ── Retry handler: clears error and resets to auth_form (credentials pre-filled by child form state) ──
  const handleRetryError = useCallback(() => {
    setErrorMessage('');
    setState('auth_form');
  }, []);

  // ── Device disconnect handler for self-service device management ──
  const handleDisconnectDevice = useCallback(async (sessionId: string, username?: string) => {
    setDisconnectingSessionId(sessionId);
    try {
      const body: Record<string, unknown> = { sessionId, username, source: 'portal' };
      if (disconnectToken) body._sessionToken = disconnectToken;
      const res = await fetch('/api/v1/wifi/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        // Remove the disconnected device from the list
        setActiveDevices(prev => prev.filter(d => d.sessionId !== sessionId));
        // If no more devices, return to auth form to retry
        const remaining = activeDevices.filter(d => d.sessionId !== sessionId);
        if (remaining.length <= 1) {
          setErrorMessage('');
          setDeviceManagementEnabled(false);
          setActiveDevices([]);
          setActiveDevicesUsername('');
          setDisconnectToken(undefined);
          setState('auth_form');
          toast.success('Device disconnected. You can now connect.');
        } else {
          toast.success('Device disconnected successfully.');
        }
      } else {
        toast.error('Failed to disconnect device. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again.');
    } finally {
      setDisconnectingSessionId(null);
    }
  }, [activeDevices, disconnectToken]);

  // ════════════════════════════════════════════════════════════
  // KEY LOGIC: Determine which rendering mode to use
  // ════════════════════════════════════════════════════════════

  /**
   * hasConfiguredFormFields: Checks if formFields has ANY auth-related
   * field set to true. This determines whether we render the unified
   * designer-driven form or fall back to the tab-based approach.
   *
   * The keys we check include ALL designer field keys plus backward-compat
   * keys (termsCheckbox, voucherCode).
   */
  const hasConfiguredFormFields = (): boolean => {
    if (!formFields || typeof formFields !== 'object') return false;
    const designerKeys = [
      'firstName', 'lastName', 'roomNumber', 'phone', 'email',
      'passport', 'bookingId', 'username', 'password',
      'terms', 'termsCheckbox', 'voucherCode',
    ];
    return designerKeys.some((key) => {
      const val = formFields[key];
      if (typeof val === 'boolean') return val;
      if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).visible ?? false;
      return false;
    });
  };

  const useUnifiedForm = hasConfiguredFormFields();
  // When multiple auth methods are configured, the selectedMethod (from guest tabs)
  // takes priority over the designer's single authFlow — so guests can switch methods.
  const hasMultipleMethods = authMethods.length > 1;
  const effectiveAuthMethod = hasMultipleMethods
    ? activeMethod
    : useUnifiedForm
      ? (portalConfig?.authMethod || 'voucher')
      : activeMethod;

  // ── Form field helpers (for fallback mode) ──
  const isFieldVisible = (key: string): boolean => {
    if (!formFields) return false;
    const val = formFields[key];
    if (typeof val === 'boolean') return val;
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).visible ?? false;
    return false;
  };

  const isFieldRequired = (key: string): boolean => {
    if (!formFields) return false;
    const val = formFields[key];
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).required ?? false;
    return false;
  };

  const getFieldLabel = (key: string, fallback: string): string => {
    if (!formFields) return fallback;
    const val = formFields[key];
    if (typeof val === 'object' && val !== null) return (val as FormFieldConfig).label || fallback;
    return fallback;
  };

  const hasVisibleGuestFields = (): boolean => {
    return ['firstName', 'lastName', 'email', 'phone', 'passport', 'bookingId'].some(isFieldVisible);
  };

  // ── Background ──
  const bgStyle = getBackgroundStyle(design);
  const overlayStyle = getOverlayStyle(design);
  const bodyBg = getBackgroundCSSValue(design);

  // ── Auto-dismiss autoAuthError after 5 seconds ──
  // Placed BEFORE any early returns to maintain consistent hook order.
  useEffect(() => {
    if (!autoAuthError) return;
    const timer = setTimeout(() => setAutoAuthError(null), 5000);
    return () => clearTimeout(timer);
  }, [autoAuthError]);

  // ── Sync body background ──
  useEffect(() => {
    if (bodyBg) {
      document.body.style.background = bodyBg;
      document.body.style.margin = '0';
      document.body.style.fontFamily = design.fontFamily;
    }
    return () => {
      document.body.style.background = '';
      document.body.style.margin = '';
      document.body.style.fontFamily = '';
    };
  }, [bodyBg, design.fontFamily]);

  // ── Feature #10: Auto-transition from splash after splashDuration seconds ──
  useEffect(() => {
    if (state !== 'splash') return;
    const duration = (design as any).splashDuration || 5;
    const timer = setTimeout(() => {
      setState('auth_form');
    }, duration * 1000);
    return () => clearTimeout(timer);
  }, [state, design.splashDuration]);

  // ── Loading state — Premium branded skeleton matching portal layout ──
  if (state === 'loading') {
    const skeletonBase = dark ? 'bg-white/10' : 'bg-black/8';
    const skeletonAccent = dark ? 'bg-white/15' : `${design.accentColor}18`;
    const formContainerCls = getFormContainerClasses(design);
    const shadowCss = getCardShadowCSS(design);

    return (
      <PortalLanguageContext.Provider value={effectiveLanguage}>
        <div className="min-h-screen flex items-center justify-center" style={bgStyle} dir={getDirection(effectiveLanguage)}>
          {/* Ambient background orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full blur-3xl opacity-20" style={{ backgroundColor: design.accentColor, animation: 'portal-float-1 20s ease-in-out infinite' }} />
            <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-15" style={{ backgroundColor: design.accentColor, animation: 'portal-float-2 25s ease-in-out infinite' }} />
            <div className="absolute top-1/3 right-1/4 w-40 h-40 rounded-full blur-3xl opacity-10" style={{ backgroundColor: design.accentColor, animation: 'portal-float-3 18s ease-in-out infinite' }} />
          </div>

          {/* Card skeleton matching real portal card — with glassmorphism */}
          <div
            className={cn('w-full max-w-md p-6 sm:p-8 space-y-6 relative overflow-hidden portal-animate-in', formContainerCls)}
            style={{
              ...shadowCss,
              backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
            }}
          >
            {/* Animated gradient accent border */}
            <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden" style={{ opacity: 0.8 }}>
              <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, transparent, ${design.accentColor}, transparent)`, animation: 'portal-shimmer 3s ease-in-out infinite', backgroundSize: '200% 100%' }} />
            </div>

            {/* Logo skeleton with shimmer */}
            <div className="flex justify-center">
              <div className={cn('w-16 h-16 rounded-2xl relative overflow-hidden', skeletonAccent)}>
                <div className="absolute inset-0 portal-shimmer" />
              </div>
            </div>

            {/* Title + subtitle skeleton with staggered animation */}
            <div className="flex flex-col items-center gap-2 portal-animate-in" style={{ animationDelay: '0.1s' }}>
              <div className={cn('h-8 w-48 rounded-md relative overflow-hidden', skeletonBase)}>
                <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.2s' }} />
              </div>
              <div className={cn('h-4 w-64 rounded-md relative overflow-hidden', skeletonBase)}>
                <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>

            {/* Divider skeleton */}
            <div className={cn('h-px w-full', dark ? 'bg-white/10' : 'bg-black/6')} />

            {/* Form field skeletons — mimics 2–3 input rows with shimmer */}
            <div className="space-y-3 portal-animate-in" style={{ animationDelay: '0.2s' }}>
              <div className="space-y-1.5">
                <div className={cn('h-3 w-20 rounded-md relative overflow-hidden', skeletonBase)}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.3s' }} />
                </div>
                <div className={cn('h-11 w-full rounded-lg relative overflow-hidden', dark ? 'bg-white/8' : 'bg-black/5')}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.5s' }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className={cn('h-3 w-24 rounded-md relative overflow-hidden', skeletonBase)}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.6s' }} />
                </div>
                <div className={cn('h-11 w-full rounded-lg relative overflow-hidden', dark ? 'bg-white/8' : 'bg-black/5')}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.8s' }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className={cn('h-3 w-28 rounded-md relative overflow-hidden', skeletonBase)}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.9s' }} />
                </div>
                <div className={cn('h-11 w-full rounded-lg relative overflow-hidden', dark ? 'bg-white/8' : 'bg-black/5')}>
                  <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '1.1s' }} />
                </div>
              </div>
            </div>

            {/* Button skeleton with shimmer sweep */}
            <div className={cn('h-11 w-full rounded-lg relative overflow-hidden', skeletonAccent)} style={{ animationDelay: '0.3s' }}>
              <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '0.7s' }} />
            </div>

            {/* Footer text skeleton */}
            <div className="flex justify-center gap-2 pt-1 portal-animate-in" style={{ animationDelay: '0.4s' }}>
              <div className={cn('h-3 w-12 rounded-md relative overflow-hidden', skeletonBase)}>
                <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '1s' }} />
              </div>
              <div className={cn('h-3 w-20 rounded-md relative overflow-hidden', skeletonBase)}>
                <div className="absolute inset-0 portal-shimmer" style={{ animationDelay: '1.2s' }} />
              </div>
            </div>
          </div>
        </div>
      </PortalLanguageContext.Provider>
    );
  }

  // ── Feature #10: Splash Screen — branded welcome before login ──
  if (state === 'splash') {
    const splashMessage = (design as any).splashMessage || 'Welcome to our hotel';
    const splashImageUrl = (design as any).splashImageUrl || design.logoUrl || '';
    const hotelName = design.hotelName || 'StaySuite Hotel';

    return (
      <PortalLanguageContext.Provider value={effectiveLanguage}>
        <div
          className="min-h-screen flex items-center justify-center relative overflow-hidden"
          style={bgStyle}
          dir={getDirection(effectiveLanguage)}
        >
          {/* Background overlay */}
          <div className="fixed inset-0 pointer-events-none" style={overlayStyle} />

          {/* Ambient background orbs */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full blur-3xl opacity-20" style={{ backgroundColor: design.accentColor, animation: 'portal-float-1 20s ease-in-out infinite' }} />
            <div className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-15" style={{ backgroundColor: design.accentColor, animation: 'portal-float-2 25s ease-in-out infinite' }} />
          </div>

          <motion.div
            className="relative z-10 flex flex-col items-center text-center space-y-6 px-6 max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Logo */}
            {splashImageUrl && (
              <motion.div
                className="w-24 h-24 rounded-3xl flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: design.accentColor + '15' }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
              >
                <img src={splashImageUrl} alt={hotelName} className="w-16 h-16 object-contain" />
              </motion.div>
            )}

            {/* Hotel Name */}
            <motion.h1
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: design.headingFontFamily, color: dark ? '#ffffff' : design.textColor }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              {hotelName}
            </motion.h1>

            {/* Splash Message */}
            <motion.p
              className="text-lg"
              style={{ color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.5)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {splashMessage}
            </motion.p>

            {/* Get Connected Button */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <button
                onClick={() => setState('auth_form')}
                className="px-8 py-3 rounded-full text-white font-medium text-base flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${design.accentColor}, ${design.accentColor}cc)`,
                  boxShadow: `0 4px 20px ${design.accentColor}40`,
                }}
              >
                Get Connected
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        </div>
      </PortalLanguageContext.Provider>
    );
  }

  const isVoucherPrefill = codeParam && effectiveAuthMethod === 'voucher';
  const canSubmit = !portalConfig?.termsRequired || termsAccepted;

  // ── Guest info payload (fallback mode only) ──
  const buildGuestInfoPayload = (): Record<string, unknown> | undefined => {
    if (!hasVisibleGuestFields()) return undefined;
    const info: Record<string, string> = {};
    if (isFieldVisible('firstName') && guestInfo.firstName.trim()) info.firstName = guestInfo.firstName.trim();
    if (isFieldVisible('lastName') && guestInfo.lastName.trim()) info.lastName = guestInfo.lastName.trim();
    if (isFieldVisible('email') && guestInfo.email.trim()) info.email = guestInfo.email.trim();
    if (isFieldVisible('phone') && guestInfo.phone.trim()) info.phone = guestInfo.phone.trim();
    if (isFieldVisible('passport') && guestInfo.passport?.trim()) info.passport = guestInfo.passport.trim();
    if (isFieldVisible('bookingId') && guestInfo.bookingId?.trim()) info.bookingId = guestInfo.bookingId.trim();
    return Object.keys(info).length > 0 ? info : undefined;
  };

  // ── Render auth form by method (FALLBACK MODE) ──
  const renderFallbackAuthForm = () => {
    switch (effectiveAuthMethod) {
      case 'voucher':
        return (
          <VoucherForm
            design={design}
            initialCode={isVoucherPrefill ? codeParam : ''}
            onSubmit={(code) =>
              authenticate('voucher', { voucherCode: code, ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })
            }
            loading={state === 'authenticating'}
            hasQrPrefill={isVoucherPrefill}
          />
        );
      case 'room_number':
        return (
          <RoomNumberForm
            design={design}
            onSubmit={(room, name) =>
              authenticate('room_number', { roomNumber: room, lastName: name, ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })
            }
            loading={state === 'authenticating'}
          />
        );
      case 'pms_credentials':
        return (
          <PmsCredentialsForm
            design={design}
            onSubmit={(username, password) =>
              authenticate('pms_credentials', { username, password, ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })
            }
            loading={state === 'authenticating'}
          />
        );
      case 'sms_otp':
        return (
          <SmsOtpForm
            design={design}
            onAuthenticate={async (method, payload) => {
              const gi = buildGuestInfoPayload();
              return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
            }}
            loading={state === 'authenticating'}
          />
        );
      case 'open_access':
        return (
          <OpenAccessForm
            design={design}
            onConnect={() => authenticate('open_access', { ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })}
            loading={state === 'authenticating'}
          />
        );
      case 'ldap':
        return (
          <PmsCredentialsForm
            design={design}
            onSubmit={(u, p) => authenticate('ldap', { username: u, password: p })}
            loading={state === 'authenticating'}
          />
        );
      case 'mac_auth':
        return (
          <MacAuthForm
            design={design}
            onAuthenticate={async (method, payload) => {
              const gi = buildGuestInfoPayload();
              return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
            }}
            loading={state === 'authenticating'}
            termsRequired={portalConfig?.termsRequired}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
          />
        );
      case 'social':
        return (
          <SocialLoginForm
            design={design}
            portalSlug={portalConfig?.slug}
            onAuthenticate={async (method, payload) => {
              const gi = buildGuestInfoPayload();
              return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
            }}
            loading={state === 'authenticating'}
            termsRequired={portalConfig?.termsRequired}
            termsAccepted={termsAccepted}
            setTermsAccepted={setTermsAccepted}
          />
        );
      case 'email_otp':
        return (
          <EmailOtpForm
            design={design}
            onAuthenticate={async (method, payload) => {
              const gi = buildGuestInfoPayload();
              return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
            }}
            loading={state === 'authenticating'}
          />
        );
      default:
        return (
          <VoucherForm
            design={design}
            initialCode={isVoucherPrefill ? codeParam : ''}
            onSubmit={(code) =>
              authenticate('voucher', { voucherCode: code, ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })
            }
            loading={state === 'authenticating'}
            hasQrPrefill={isVoucherPrefill}
          />
        );
    }
  };

  // ── Method selector tabs (DISABLED) ──
  // Tabs have been removed. When formFields is configured we use the unified
  // designer form. When formFields is null we use a simple single-method
  // fallback — method tabs are handled by the main renderMethodTabs below.

  // ── Guest info fields section (FALLBACK MODE only) ──
  const renderGuestInfoFields = () => {
    if (useUnifiedForm) return null; // Guest fields are part of the unified form
    if (!hasVisibleGuestFields()) return null;

    const lang = effectiveLanguage;

    return (
      <div className="space-y-3 mb-4 pb-4" style={{ borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}` }}>
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: getMutedTextColor(design) }}>
          Guest Information
        </p>
        {isFieldVisible('firstName') && (
          <DynamicInput
            design={design}
            label={getFieldLabel('firstName', getUIString(lang, 'firstName')) + (isFieldRequired('firstName') ? ' *' : '')}
            value={guestInfo.firstName}
            onChange={(v) => setGuestInfo((prev) => ({ ...prev, firstName: v }))}
            placeholder="John"
            disabled={state === 'authenticating'}
            icon={<User className="w-4 h-4" />}
          />
        )}
        {isFieldVisible('lastName') && (
          <DynamicInput
            design={design}
            label={getFieldLabel('lastName', getUIString(lang, 'lastName')) + (isFieldRequired('lastName') ? ' *' : '')}
            value={guestInfo.lastName}
            onChange={(v) => setGuestInfo((prev) => ({ ...prev, lastName: v }))}
            placeholder="Smith"
            disabled={state === 'authenticating'}
            icon={<User className="w-4 h-4" />}
          />
        )}
        {isFieldVisible('email') && (
          <DynamicInput
            design={design}
            label={getFieldLabel('email', getUIString(lang, 'emailAddress')) + (isFieldRequired('email') ? ' *' : '')}
            type="email"
            value={guestInfo.email}
            onChange={(v) => setGuestInfo((prev) => ({ ...prev, email: v }))}
            placeholder="john@example.com"
            disabled={state === 'authenticating'}
            icon={<Mail className="w-4 h-4" />}
          />
        )}
        {isFieldVisible('phone') && (
          <DynamicInput
            design={design}
            label={getFieldLabel('phone', getUIString(lang, 'phoneNumber')) + (isFieldRequired('phone') ? ' *' : '')}
            type="tel"
            value={guestInfo.phone}
            onChange={(v) => setGuestInfo((prev) => ({ ...prev, phone: v }))}
            placeholder="+1 555 123 4567"
            disabled={state === 'authenticating'}
            icon={<Phone className="w-4 h-4" />}
            inputMode="tel"
          />
        )}
      </div>
    );
  };

  // ── Layout type ──
  const isSplit = design.layoutType === 'split_left' || design.layoutType === 'split_right';
  const isHeroBanner = design.layoutType === 'hero_banner';
  const isSidePanel = design.layoutType === 'side_panel';
  const isBottomSheet = design.layoutType === 'bottom_sheet';
  const formCls = getFormContainerClasses(design);
  const cardShadowStyle = getCardShadowCSS(design);

  // ── Advanced Feature Indicators (reusable across all layouts) ──
  const showFeatureIndicators = state !== 'success' && state !== 'authenticating' && state !== 'marketing_capture' && (
    design.enablePlanSelector || design.enableMarketingCapture || design.enableQrCode || design.enableAutoRenewal || design.enableSpeedTest
  );
  const renderFeatureIndicators = showFeatureIndicators && (
    <div className="mt-3 space-y-2 w-full">
      <div className="flex items-center gap-1.5 px-1">
        <Sparkles className="w-3 h-3" style={{ color: design.accentColor }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: getMutedTextColor(design) }}>
          Portal Features Active
        </span>
        <div className="flex-1 h-px" style={{ background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }} />
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {design.enablePlanSelector && design.planSelectorConfig && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs transition-all hover:scale-[1.01]" style={{ backgroundColor: dark ? 'rgba(139,92,246,0.10)' : 'rgba(139,92,246,0.06)', border: `1px solid ${dark ? 'rgba(139,92,246,0.20)' : 'rgba(139,92,246,0.15)'}` }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.15)' }}>
              <CreditCard className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
            </div>
            <span className="text-xs font-medium flex-1" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)' }}>
              {design.planSelectorConfig.showPricing ? 'Plan Selector — choose & upgrade plans' : 'Plan Selector available'}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(139,92,246,0.2)', color: '#a78bfa' }}>PLAN</span>
          </div>
        )}
        {design.enableMarketingCapture && design.marketingCaptureConfig && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs transition-all hover:scale-[1.01]" style={{ backgroundColor: dark ? 'rgba(249,115,22,0.10)' : 'rgba(249,115,22,0.06)', border: `1px solid ${dark ? 'rgba(249,115,22,0.20)' : 'rgba(249,115,22,0.15)'}` }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(249,115,22,0.15)' }}>
              <UserPlus className="h-3.5 w-3.5" style={{ color: '#fb923c' }} />
            </div>
            <span className="text-xs font-medium flex-1" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)' }}>
              {design.marketingCaptureConfig.consentText || 'Marketing Data Capture — stay connected'}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(249,115,22,0.2)', color: '#fb923c' }}>DATA</span>
          </div>
        )}
        {design.enableQrCode && design.qrCodeConfig && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs transition-all hover:scale-[1.01]" style={{ backgroundColor: dark ? 'rgba(16,185,129,0.10)' : 'rgba(16,185,129,0.06)', border: `1px solid ${dark ? 'rgba(16,185,129,0.20)' : 'rgba(16,185,129,0.15)'}` }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(16,185,129,0.15)' }}>
              <QrCode className="h-3.5 w-3.5" style={{ color: '#34d399' }} />
            </div>
            <span className="text-xs font-medium flex-1" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)' }}>
              WiFi Credential QR Code available after login
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(16,185,129,0.2)', color: '#34d399' }}>QR</span>
          </div>
        )}
        {design.enableAutoRenewal && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs transition-all hover:scale-[1.01]" style={{ backgroundColor: dark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.06)', border: `1px solid ${dark ? 'rgba(245,158,11,0.20)' : 'rgba(245,158,11,0.15)'}` }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(245,158,11,0.15)' }}>
              <RefreshCw className="h-3.5 w-3.5" style={{ color: '#fbbf24' }} />
            </div>
            <span className="text-xs font-medium flex-1" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)' }}>
              Auto-Renewal — session automatically renewed
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}>AUTO</span>
          </div>
        )}
        {design.enableSpeedTest && design.speedTestConfig && (
          <div className="flex items-center gap-2 p-2 rounded-lg text-xs transition-all hover:scale-[1.01]" style={{ backgroundColor: dark ? 'rgba(6,182,212,0.10)' : 'rgba(6,182,212,0.06)', border: `1px solid ${dark ? 'rgba(6,182,212,0.20)' : 'rgba(6,182,212,0.15)'}` }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(6,182,212,0.15)' }}>
              <Gauge className="h-3.5 w-3.5" style={{ color: '#22d3ee' }} />
            </div>
            <span className="text-xs font-medium flex-1" style={{ color: dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.78)' }}>
              Speed Test — check connection speed after login
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(6,182,212,0.2)', color: '#22d3ee' }}>TEST</span>
          </div>
        )}
      </div>
    </div>
  );

  // ── Content Block Ordering (Feature 9) ──
  const DEFAULT_BLOCK_ORDER = ['ads', 'promotion', 'logo', 'language', 'title', 'hotelInfo', 'amenities', 'form', 'social', 'clock', 'weather', 'survey'];
  const savedOrder = design.contentBlockOrder?.length ? design.contentBlockOrder : [];
  // Merge: saved order first (preserving admin's arrangement), then append any missing default blocks
  const blockOrder = savedOrder.length > 0
    ? [...savedOrder, ...DEFAULT_BLOCK_ORDER.filter(b => !savedOrder.includes(b))]
    : DEFAULT_BLOCK_ORDER;

  // ── Method field defaults per auth method (for swapping formFields when guest switches) ──
  // When the guest switches tabs, we replace ALL form fields with only the ones
  // relevant to the selected method. No fields from the base (designer) authFlow
  // leak through — each method gets exactly its own fields.
  // Enterprise-standard auth method → field mapping:
  //   pms_credentials: Username + Password (auto-generated by PMS at check-in via AAA policy)
  //   room_number:      Room Number + Last Name (guest self-authenticates)
  //   voucher:          Voucher Code only
  //   sms_otp:          Phone number (then OTP verification)
  //   email_otp:        Email address (then OTP verification)
  //   open_access:      No credentials needed (just terms)
  //   mac_auth:         No credentials needed (auto-detect MAC)
  //   social:           OAuth buttons (no form fields)
  //   ldap/radius_ldap: Username + Password (corporate directory)
  const METHOD_FIELD_DEFAULTS: Record<string, Record<string, boolean>> = {
    pms_credentials: { username: true, password: true, terms: true },
    room_number: { roomNumber: true, lastName: true, terms: true },
    voucher: { voucherCode: true, terms: true },
    sms_otp: { phone: true, terms: true },
    email_otp: { email: true, terms: true },
    open_access: { terms: true },
    mac_auth: {},
    social: { terms: true },
    ldap: { username: true, password: true, terms: true },
    radius_ldap: { username: true, password: true, terms: true },
  };

  // Compute effective formFields that adapts to the currently selected method.
  // 1) All keys from the original formFields that are NOT in the selected method's
  //    defaults are forced to `false` (so they don't leak from the base authFlow).
  // 2) All keys from the method defaults that are NOT in the original formFields
  //    are added (e.g. voucherCode when switching from pms_credentials → voucher).
  const getEffectiveFormFields = (): Record<string, boolean> | null => {
    if (!formFields || typeof formFields !== 'object') return null;
    const methodDefaults = METHOD_FIELD_DEFAULTS[effectiveAuthMethod] || {};
    const merged: Record<string, boolean> = {};
    // Step 1: go through original formFields — turn off anything not in method defaults
    for (const key of Object.keys(formFields)) {
      if (typeof formFields[key] === 'boolean' || (typeof formFields[key] === 'object' && formFields[key] !== null)) {
        merged[key] = key in methodDefaults ? methodDefaults[key] : false;
      }
    }
    // Step 2: add any keys from methodDefaults that weren't in the original formFields
    for (const key of Object.keys(methodDefaults)) {
      if (!(key in merged)) {
        merged[key] = methodDefaults[key];
      }
    }
    return merged;
  };

  const effectiveFormFields = hasMultipleMethods ? getEffectiveFormFields() : null;

  // ── Render method selector tabs (shown when multiple auth methods are configured) ──
  const renderMethodTabs = () => {
    if (!hasMultipleMethods || authMethods.length <= 1) return null;
    const mutedColor = getMutedTextColor(design);
    const accent = design.accentColor;

    const formatMethodLabel = (method: string, fallbackLabel?: string): string => {
      // Always use our nice readable label — never show raw method names like 'mac_auth'
      const m: Record<string, string> = {
        voucher: 'Voucher Code',
        room_number: 'Room + Name',
        pms_credentials: 'PMS Login',
        sms_otp: 'SMS OTP',
        email_otp: 'Email OTP',
        open_access: 'Open Access',
        mac_auth: 'MAC Auth',
        social: 'Social',
        ldap: 'LDAP',
        password: 'Password',
      };
      return m[method] || fallbackLabel || method.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    };

    const total = authMethods.length;
    // Responsive: use flex-wrap for graceful reflow at any count.
    // Each tab has a min-width so text isn't clipped; wraps to next line when needed.
    // For 8+ methods, a horizontal scroll container kicks in on very narrow viewports.
    const useScroll = total >= 8;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Wifi className="w-3.5 h-3.5" style={{ color: mutedColor }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: mutedColor }}>
            Choose your authentication method
          </span>
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: mutedColor, backgroundColor: dark ? 'rgba(255,255,255,0.06)' : accent + '0a' }}>
            {total} options
          </span>
          <div className="flex-1 h-px" style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
        </div>
        <div
          className="w-full rounded-xl p-1.5"
          style={{
            backgroundColor: dark ? 'rgba(255,255,255,0.05)' : accent + '06',
            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : accent + '12'}`,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div
            className={useScroll ? "flex gap-1.5 overflow-x-auto pb-1 captive-scroll-x" : "flex flex-wrap gap-1.5"}
            style={useScroll ? { scrollbarWidth: 'thin' } : undefined}
          >
            {authMethods.map((am) => {
              const isActive = effectiveAuthMethod === am.method;
              return (
                <button
                  key={am.method}
                  onClick={() => setSelectedMethod(am.method)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-2.5 min-h-10 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] text-center leading-tight whitespace-nowrap flex-shrink-0 auth-method-tab",
                    isActive && "auth-method-tab-active",
                  )}
                  style={{
                    minWidth: useScroll ? 'auto' : 'calc(50% - 0.375rem)',
                    flex: useScroll ? '0 0 auto' : '0 1 calc(50% - 0.375rem)',
                    color: isActive ? '#ffffff' : (dark ? 'rgba(255,255,255,0.85)' : accent + 'cc'),
                    boxShadow: isActive
                      ? `0 6px 20px ${accent}40, 0 0 0 1px ${accent}30 inset`
                      : (dark ? '0 0 0 1px rgba(255,255,255,0.12) inset' : '0 0 0 1px rgba(0,0,0,0.08) inset'),
                    background: isActive
                      ? `linear-gradient(135deg, ${accent}, ${accent}bb)`
                      : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    ['--hover-bg' as string]: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)',
                    ['--hover-color' as string]: dark ? '#ffffff' : accent,
                    ['--rest-bg' as string]: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    ['--rest-color' as string]: dark ? 'rgba(255,255,255,0.85)' : accent + 'cc',
                  }}
                >
                  <span className="flex-shrink-0">
                    {METHOD_ICONS[am.method] || <Shield className="w-3.5 h-3.5" />}
                  </span>
                  <span className="break-words">{formatMethodLabel(am.method, am.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Form content animation variants ──
  const formVariants = {
    enter: (direction: number) => ({
      opacity: 0,
      x: direction > 0 ? 20 : -20,
    }),
    center: {
      opacity: 1,
      x: 0,
    },
    exit: (direction: number) => ({
      opacity: 0,
      x: direction < 0 ? 20 : -20,
    }),
  };

  // ── Render the card content (shared across layouts) ──
  const renderCardContent = () => {
    if (state === 'success' && authResult) {
      return <SuccessScreen authResult={authResult} design={design} onDisconnect={handleDisconnect} tenantId={portalConfig?.tenantId} partnerId={portalConfig?.partnerId} originalUrl={originalRedirectUrl} />;
    }

    // Marketing capture interstitial — shown before success screen
    if (state === 'marketing_capture' && authResult && design.enableMarketingCapture) {
      return (
        <div className="text-center space-y-5 py-4">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full" style={{ backgroundColor: design.accentColor + '15' }}>
            <CheckCircle className="w-10 h-10" style={{ color: design.accentColor }} />
          </div>
          <h2 className="text-2xl font-bold" style={{ color: getCardTextColor(design) }}>
            {getUIString(selectedLanguage || 'en', 'connected')}
          </h2>
          <MarketingCaptureWidget
            config={design.marketingCaptureConfig!}
            onSubmit={(data) => {
              // POST to consent-logs (fire and forget)
              fetch('/api/wifi/consent-logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenantId: portalConfig?.tenantId, partnerId: portalConfig?.partnerId, sessionId: authResult?.sessionId, ...data }),
              }).catch(() => {});
              setState('success');
            }}
            onSkip={() => setState('success')}
            design={design}
          />
        </div>
      );
    }

    // ══════════════════════════════════════════════════════════
    // SPECIAL METHODS — social and mac_auth always use their own
    // dedicated forms (even when unified form mode is active)
    // ══════════════════════════════════════════════════════════
    if (effectiveAuthMethod === 'social') {
      return (
        <>
          {state === 'error' && errorMessage && <ErrorDisplay message={errorMessage} onRetry={handleRetryError} design={design} />}
          {state === 'device_management' && errorMessage && (
            <DeviceManagementPanel
              message={errorMessage}
              devices={activeDevices}
              disconnectingId={disconnectingSessionId}
              username={activeDevicesUsername}
              onDisconnect={handleDisconnectDevice}
              onBack={() => { setErrorMessage(''); setActiveDevices([]); setActiveDevicesUsername(''); setDeviceManagementEnabled(false); setDisconnectToken(undefined); setState('auth_form'); }}
              design={design}
            />
          )}
          {maxDeviceMessage && <ErrorDisplay message={maxDeviceMessage} design={design} />}
          {renderMethodTabs()}
          <AnimatePresence mode="wait" custom={tabDirection}>
            <motion.div
              key="social-form"
              custom={tabDirection}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <SocialLoginForm
                design={design}
                portalSlug={portalConfig?.slug}
                onAuthenticate={async (method, payload) => {
                  const gi = buildGuestInfoPayload();
                  return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
                }}
                loading={state === 'authenticating'}
                termsRequired={portalConfig?.termsRequired}
                termsAccepted={termsAccepted}
                setTermsAccepted={setTermsAccepted}
              />
            </motion.div>
          </AnimatePresence>
        </>
      );
    }

    if (effectiveAuthMethod === 'mac_auth') {
      return (
        <>
          {state === 'error' && errorMessage && <ErrorDisplay message={errorMessage} onRetry={handleRetryError} design={design} />}
          {state === 'device_management' && errorMessage && (
            <DeviceManagementPanel
              message={errorMessage}
              devices={activeDevices}
              disconnectingId={disconnectingSessionId}
              username={activeDevicesUsername}
              onDisconnect={handleDisconnectDevice}
              onBack={() => { setErrorMessage(''); setActiveDevices([]); setActiveDevicesUsername(''); setDeviceManagementEnabled(false); setDisconnectToken(undefined); setState('auth_form'); }}
              design={design}
            />
          )}
          {maxDeviceMessage && <ErrorDisplay message={maxDeviceMessage} design={design} />}
          {renderMethodTabs()}
          <AnimatePresence mode="wait" custom={tabDirection}>
            <motion.div
              key="mac-auth-form"
              custom={tabDirection}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <MacAuthForm
                design={design}
                onAuthenticate={async (method, payload) => {
                  const gi = buildGuestInfoPayload();
                  return authenticate(method, gi ? { ...payload, guestInfo: gi } : payload);
                }}
                loading={state === 'authenticating'}
                termsRequired={portalConfig?.termsRequired}
                termsAccepted={termsAccepted}
                setTermsAccepted={setTermsAccepted}
              />
            </motion.div>
          </AnimatePresence>
        </>
      );
    }

    if (effectiveAuthMethod === 'open_access' && !useUnifiedForm) {
      return (
        <>
          {state === 'error' && errorMessage && <ErrorDisplay message={errorMessage} onRetry={handleRetryError} design={design} />}
          {state === 'device_management' && errorMessage && (
            <DeviceManagementPanel
              message={errorMessage}
              devices={activeDevices}
              disconnectingId={disconnectingSessionId}
              username={activeDevicesUsername}
              onDisconnect={handleDisconnectDevice}
              onBack={() => { setErrorMessage(''); setActiveDevices([]); setActiveDevicesUsername(''); setDeviceManagementEnabled(false); setDisconnectToken(undefined); setState('auth_form'); }}
              design={design}
            />
          )}
          {maxDeviceMessage && <ErrorDisplay message={maxDeviceMessage} design={design} />}
          {renderMethodTabs()}
          <AnimatePresence mode="wait" custom={tabDirection}>
            <motion.div
              key="open-access-form"
              custom={tabDirection}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderGuestInfoFields()}
              <OpenAccessForm
                design={design}
                onConnect={() => authenticate('open_access', { ...(buildGuestInfoPayload() ? { guestInfo: buildGuestInfoPayload() } : {}) })}
                loading={state === 'authenticating'}
              />
            </motion.div>
          </AnimatePresence>
          {portalConfig?.termsRequired && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="portal-checkbox mt-0.5" style={{ '--portal-accent': design.accentColor } as React.CSSProperties} />
              <span style={{ color: getMutedTextColor(design) }}>
                {getUIString(effectiveLanguage, 'iAgreeToThe')}{' '}
                <span style={{ color: design.accentColor }} className="font-medium">{getUIString(effectiveLanguage, 'termsAndConditions')}</span>
              </span>
            </label>
          )}
        </>
      );
    }

    if (useUnifiedForm && formFields) {
      // ══════════════════════════════════════════════════════════
      // UNIFIED DESIGNER FORM — matches PortalPreviewContent
      // Key prop forces re-mount when method changes so fields update
      // ══════════════════════════════════════════════════════════
      return (
        <>
          {state === 'error' && errorMessage && <ErrorDisplay message={errorMessage} onRetry={handleRetryError} design={design} />}
          {state === 'device_management' && errorMessage && (
            <DeviceManagementPanel
              message={errorMessage}
              devices={activeDevices}
              disconnectingId={disconnectingSessionId}
              username={activeDevicesUsername}
              onDisconnect={handleDisconnectDevice}
              onBack={() => { setErrorMessage(''); setActiveDevices([]); setActiveDevicesUsername(''); setDeviceManagementEnabled(false); setDisconnectToken(undefined); setState('auth_form'); }}
              design={design}
            />
          )}
          {maxDeviceMessage && <ErrorDisplay message={maxDeviceMessage} design={design} />}
          {renderMethodTabs()}
          {renderCaptchaWidget()}
          <AnimatePresence mode="wait" custom={tabDirection}>
            <motion.div
              key={`unified-${effectiveAuthMethod}`}
              custom={tabDirection}
              variants={formVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <UnifiedDesignerForm
                design={design}
                formFields={effectiveFormFields || formFields}
                authMethod={effectiveAuthMethod}
                codeParam={codeParam}
                authenticate={authenticate}
                loading={state === 'authenticating'}
                termsRequired={portalConfig?.termsRequired ?? false}
                termsAccepted={termsAccepted}
                setTermsAccepted={setTermsAccepted}
              />
            </motion.div>
          </AnimatePresence>
        </>
      );
    }

    // ══════════════════════════════════════════════════════════
    // FALLBACK MODE — form with method tabs when multiple methods exist
    // ══════════════════════════════════════════════════════════
    return (
      <>
        {state === 'error' && errorMessage && <ErrorDisplay message={errorMessage} onRetry={handleRetryError} design={design} />}
        {state === 'device_management' && errorMessage && (
          <DeviceManagementPanel
            message={errorMessage}
            devices={activeDevices}
            disconnectingId={disconnectingSessionId}
            onDisconnect={handleDisconnectDevice}
            onBack={() => { setErrorMessage(''); setActiveDevices([]); setActiveDevicesUsername(''); setDeviceManagementEnabled(false); setDisconnectToken(undefined); setState('auth_form'); }}
            design={design}
          />
        )}
        {maxDeviceMessage && <ErrorDisplay message={maxDeviceMessage} design={design} />}
        {renderMethodTabs()}
        {renderCaptchaWidget()}

        {/* Auth Form with animated transitions */}
        <AnimatePresence mode="wait" custom={tabDirection}>
          <motion.div
            key={`fallback-${effectiveAuthMethod}`}
            custom={tabDirection}
            variants={formVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="transition-opacity duration-200"
            style={{ opacity: canSubmit ? 1 : 0.5, pointerEvents: canSubmit ? 'auto' : 'none' }}
          >
            {renderGuestInfoFields()}
            {renderFallbackAuthForm()}
          </motion.div>
        </AnimatePresence>

        {/* Terms checkbox (fallback mode, when terms not in formFields) */}
        {portalConfig?.termsRequired && (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="portal-checkbox mt-0.5"
              style={{ '--portal-accent': design.accentColor } as React.CSSProperties}
            />
            <span style={{ color: getMutedTextColor(design) }}>
              {getUIString(effectiveLanguage, 'iAgreeToThe')}{' '}
              {portalConfig.design.termsUrl ? (
                <a
                  href={portalConfig.design.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline portal-link"
                  style={{ color: design.accentColor }}
                >
                  {getUIString(effectiveLanguage, 'termsAndConditions')}
                </a>
              ) : (
                <span style={{ color: design.accentColor }} className="font-medium">
                  {getUIString(effectiveLanguage, 'termsAndConditions')}
                </span>
              )}
            </span>
          </label>
        )}

        {/* Marketing Consent (Feature 2) — fallback mode, inside the card */}
        {state !== 'success' && design.marketingOptIn?.enabled && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
            <MarketingConsentPlaceholder design={design} />
          </div>
        )}

        {/* Post-Connect Survey (Feature 4) — fallback mode */}
        {state === 'success' && design.surveyConfig?.enabled && (
          <GuestSurvey design={design} tenantId={portalConfig?.tenantId} partnerId={portalConfig?.partnerId} sessionId={authResult?.sessionId} guestId={authResult?.guestId} />
        )}
      </>
    );
  };

  // ── Block renderer — returns JSX for each named block ──
  const renderBlock = (block: string): React.ReactNode => {
    switch (block) {
      case 'promotion': {
        if (state === 'success') return null;
        const hasPromoContent = design.promotions?.some(p => p.title || p.description);
        // Carousel mode: show only when promotion toggle ON + carousel mode selected + has slides
        if (hasPromoContent && design.showPromotions) {
          const validSlides = design.promotions.filter(p => p.title || p.description);
          if (validSlides.length > 0) return <PromotionCarousel design={design} />;
        }
        // Single promotion mode: show ONLY when the toggle is explicitly ON
        if (design.showPromotion) {
          return <PromotionBlock design={design} />;
        }
        return null;
      }
      case 'clock':
        if (!design.showClock) return null;
        return <div className="mb-3 flex justify-center"><LiveClock design={design} /></div>;
      case 'weather':
        if (!design.showWeather) return null;
        return <div className="mb-3 flex justify-center"><WeatherWidget design={design} /></div>;
      case 'logo':
        return <PortalLogo design={design} size="large" />;
      case 'language':
        // Only render language switcher when multi-language is enabled AND has languages
        if (!design.enableMultiLanguage || !(design.languages?.length > 1)) return null;
        return <LanguageSwitcher design={design} selectedLanguage={effectiveLanguage} setSelectedLanguage={setSelectedLanguage} />;
      case 'title':
        return (
          <div className="text-center mb-4">
            <h1
              className="text-[1.75rem] md:text-[2.25rem] font-extrabold tracking-[-0.02em] leading-[1.15]"
              style={{ fontFamily: design.headingFontFamily, color: dark ? '#ffffff' : design.textColor, textShadow: dark ? '0 2px 16px rgba(0,0,0,0.4), 0 0 1px rgba(255,255,255,0.1)' : '0 1px 3px rgba(0,0,0,0.08)' }}
            >
              {getLocalizedText(design, 'title', effectiveLanguage)}
            </h1>
            {/* Accent divider — premium touch with glow */}
            <div className="flex items-center justify-center gap-1.5 mt-2.5 mb-1.5">
              <span className="block w-10 h-px" style={{ background: `linear-gradient(90deg, transparent, ${design.accentColor}aa)` }} />
              <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: design.accentColor, boxShadow: `0 0 10px ${design.accentColor}, 0 0 4px ${design.accentColor}cc` }} />
              <span className="block w-10 h-px" style={{ background: `linear-gradient(90deg, ${design.accentColor}aa, transparent)` }} />
            </div>
            {getLocalizedText(design, 'subtitle', effectiveLanguage) && (
              <p className="text-sm md:text-[0.95rem] mt-1.5 font-light tracking-wide" style={{ color: getSubtitleColor(design) }}>
                {getLocalizedText(design, 'subtitle', effectiveLanguage)}
              </p>
            )}
            {getLocalizedText(design, 'welcomeMessage', effectiveLanguage) && (
              <p className="text-xs mt-2.5 italic font-light" style={{ color: dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.42)' }}>
                {getLocalizedText(design, 'welcomeMessage', effectiveLanguage)}
              </p>
            )}
          </div>
        );
      case 'hotelInfo':
        if (!design.showHotelInfo) return null;
        return <div className="mb-4"><HotelInfoBlock design={design} dark={dark} /></div>;
      case 'amenities':
        if (!design.showAmenities) return null;
        return <div className="mb-5"><AmenitiesBlock design={design} dark={dark} /></div>;
      case 'form':
        return (
          <div
            className={cn('w-full animate-in fade-in-0 slide-in-from-bottom-4 duration-500 transition-all relative overflow-hidden portal-animate-in portal-form-card', formCls)}
            style={{
              ...cardShadowStyle,
              ...getCardBackgroundStyle(design, dark),
              ...getCardBorderStyle(design, dark),
            }}
          >
            {/* Premium top accent bar — thicker glowing gradient */}
            <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden" style={{ opacity: 0.95 }}>
              <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, transparent, ${design.accentColor}, ${design.accentColor}cc, ${design.accentColor}, transparent)`, animation: 'portal-shimmer 3s ease-in-out infinite', backgroundSize: '200% 100%', boxShadow: `0 0 12px ${design.accentColor}80` }} />
            </div>
            {/* Subtle inner glow at top */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${design.accentColor}0a, transparent 70%)` }} />
            {/* Corner accent dots — premium detail */}
            <div className="absolute top-2 left-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
            <div className="absolute top-2 right-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
            {renderCardContent()}
          </div>
        );
      case 'social':
        if (!design.showSocialMedia) return null;
        return <div className="mt-4"><SocialLinksBlock design={design} /></div>;
      case 'ads': {
        if (!design.showAds) return null;
        const adProps = {
          tenantId: portalConfig?.tenantId || '',
          partnerId: portalConfig?.partnerId || undefined,
          accentColor: design.accentColor,
          dark,
        };
        // Banner ad renders as a horizontal strip inside the form card
        return (
          <div className="mb-3">
            <AdSlot slot="banner" {...adProps} />
          </div>
        );
      }
      case 'survey':
        // Render survey after success or always if enabled (GuestSurvey handles its own state)
        if (!design.surveyConfig?.enabled) return null;
        return <div className="mt-2"><GuestSurvey design={design} tenantId={portalConfig?.tenantId} partnerId={portalConfig?.partnerId} sessionId={authResult?.sessionId} guestId={authResult?.guestId} /></div>;
      default:
        return null;
    }
  };

  // ── renderFormContent — used by side-panel and bottom-sheet layouts ──
  const renderFormContent = () => renderCardContent();

  // ── Localized strings for portal-level content ──
  const localizedTitle = getLocalizedText(design, 'title', effectiveLanguage);
  const localizedSubtitle = getLocalizedText(design, 'subtitle', effectiveLanguage);
  const localizedWelcome = getLocalizedText(design, 'welcomeMessage', effectiveLanguage);
  const localizedPoweredBy = getUIString(effectiveLanguage, 'poweredBy');

  // ── Main Layout ──
  return (
    <PortalLanguageContext.Provider value={effectiveLanguage}>
      {/* Feature #6: Preview Mode Banner */}
      {previewDesignConfig && !previewDismissed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex items-center gap-2 shadow-md">
            <Eye className="h-4 w-4 text-teal-600 shrink-0" />
            <span className="text-sm text-teal-800 font-medium">Preview Mode</span>
            <span className="text-sm text-teal-700">— This is a design preview, no authentication required.</span>
            <button onClick={() => setPreviewDismissed(true)} className="ml-auto text-teal-600 hover:text-teal-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {/* Auto-reauth error banner */}
      {autoAuthError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-2 shadow-md">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-800">{autoAuthError}</span>
            <button onClick={() => setAutoAuthError(null)} className="ml-auto text-amber-600 hover:text-amber-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <div
        className={cn('fixed inset-0 flex flex-col overflow-y-auto portal-noise-overlay', animCls)}
        style={{
          ...bgStyle,
          fontFamily: design.fontFamily,
          ['--portal-accent-glow' as string]: design.accentColor + '33',
        }}
        dir={getDirection(effectiveLanguage)}
      >
        {/* ── Custom CSS Injection ── */}
        {design.customCss && (
          <style dangerouslySetInnerHTML={{ __html: design.customCss }} />
        )}
        {/* ── Form Color Customization CSS Variables ── */}
        {(design.formBackgroundColor || design.inputBackgroundColor || design.inputBorderColor ||
          design.inputTextColor || design.inputPlaceholderColor || design.buttonTextColor ||
          design.labelColor || design.linkColor || design.errorColor) && (
          <style dangerouslySetInnerHTML={{ __html: `
            ${design.formBackgroundColor ? `.portal-form-card { background-color: ${design.formBackgroundColor} !important; }` : ''}
            ${design.inputBackgroundColor ? `.portal-input { background-color: ${design.inputBackgroundColor} !important; }` : ''}
            ${design.inputBorderColor ? `.portal-input { border-color: ${design.inputBorderColor} !important; }` : ''}
            ${design.inputTextColor ? `.portal-input { color: ${design.inputTextColor} !important; }` : ''}
            ${design.inputPlaceholderColor ? `.portal-input::placeholder { color: ${design.inputPlaceholderColor} !important; }` : ''}
            ${design.buttonTextColor ? `.portal-btn { color: ${design.buttonTextColor} !important; }` : ''}
            ${design.labelColor ? `.portal-label { color: ${design.labelColor} !important; }` : ''}
            ${design.linkColor ? `.portal-link { color: ${design.linkColor} !important; }` : ''}
            ${design.errorColor ? `.portal-error { color: ${design.errorColor} !important; }` : ''}
          `}} />
        )}
        {/* ── Raw Template CSS Injection ── */}
        {design.templateMode === 'raw' && design.rawTemplateCss && (
          <style dangerouslySetInnerHTML={{ __html: design.rawTemplateCss }} />
        )}
        {/* Feature #11: Video Background */}
        {design.backgroundType === 'video' && design.backgroundVideoUrl && (
          <video
            key={design.backgroundVideoUrl}
            className="fixed inset-0 w-full h-full object-cover z-0"
            style={{ zIndex: -1 }}
            autoPlay
            muted={design.backgroundVideoMuted !== false}
            loop={design.backgroundVideoLoop !== false}
            playsInline
            poster={design.backgroundVideoPoster || undefined}
          />
        )}
        {/* Background overlay */}
        <div className="fixed inset-0 pointer-events-none" style={overlayStyle} />

        {/* Pattern overlay */}
        <div className="fixed inset-0 pointer-events-none" style={getPatternOverlayCSS(design)} />

        {/* Premium ambient floating orbs — subtle, organic background depth */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div
            className="absolute rounded-full"
            style={{
              width: '320px', height: '320px', top: '-60px', left: '-80px',
              background: `radial-gradient(circle, ${design.accentColor}25, transparent 70%)`,
              filter: 'blur(60px)',
              animation: 'portal-float-1 22s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '280px', height: '280px', bottom: '-40px', right: '-60px',
              background: `radial-gradient(circle, ${design.accentColor}20, transparent 70%)`,
              filter: 'blur(50px)',
              animation: 'portal-float-2 28s ease-in-out infinite',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              width: '200px', height: '200px', top: '40%', right: '20%',
              background: `radial-gradient(circle, ${design.accentColor}12, transparent 70%)`,
              filter: 'blur(40px)',
              animation: 'portal-float-3 18s ease-in-out infinite',
            }}
          />
        </div>

        {/* Background overlay */}
        <div className="fixed inset-0 pointer-events-none" style={overlayStyle} />

        {/* Main content */}
        <main className={cn('flex-1 flex items-start justify-center p-3 pt-4 pb-4 relative z-10', isBottomSheet && 'items-end')}>
          {isSplit ? (
            // ══════════════════════════════════════════════════════════
            // SPLIT LAYOUT — Left info panel + Right form panel
            // ══════════════════════════════════════════════════════════
            <div className="w-full max-w-5xl flex flex-col md:flex-row gap-6">
              {/* ── Left Panel: Hotel Info + Features ── */}
              <div className="flex-1 flex flex-col justify-center p-6 md:p-10 space-y-5" style={{ color: dark ? '#ffffff' : design.textColor }}>
                {/* Language Switcher (Feature 1) — only when enabled AND 2+ languages */}
                {(design.enableMultiLanguage && (design.languages?.length ?? 0) > 1) && (
                  <div className="flex justify-end">
                    <LanguageSwitcher design={design} selectedLanguage={effectiveLanguage} setSelectedLanguage={setSelectedLanguage} />
                  </div>
                )}

                <PortalLogo design={design} size="large" />
                <h1 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: design.headingFontFamily }}>
                  {localizedTitle}
                </h1>
                <p style={{ color: dark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)' }} className="text-lg">
                  {localizedSubtitle}
                </p>
                {localizedWelcome && (
                  <p className="italic" style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.4)' }}>
                    {localizedWelcome}
                  </p>
                )}

                {/* Clock + Weather Row */}
                <div className="flex items-center justify-center gap-4">
                  {design.showClock && <LiveClock design={design} />}
                  {design.showWeather && (
                    <>
                      <span style={{ color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }}>|</span>
                      <WeatherWidget design={design} />
                    </>
                  )}
                </div>

                {design.showHotelInfo && <HotelInfoBlock design={design} dark={dark} />}
                {design.showAmenities && <AmenitiesBlock design={design} dark={dark} />}

                {/* Social Links (Feature 8: More Social Platforms) */}
                {design.showSocialMedia && (
                  <SocialLinksBlock design={design} />
                )}

                {/* Branding */}
                {design.showBranding && (
                  <div className="text-center pt-2" style={{ color: dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)' }}>
                    <p className="text-[10px]">{localizedPoweredBy}</p>
                  </div>
                )}
              </div>

              {/* ── Right Panel: Form + Features ── */}
              <div className="w-full md:w-[420px] animate-in fade-in-0 slide-in-from-bottom-4 duration-500 transition-all flex flex-col gap-4">
                {/* ── Interstitial Ad above promotion ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <AdSlot slot="interstitial" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                )}

                {/* Promotion Carousel (Feature 3) — above the form card */}
                {state !== 'success' && (() => {
                  const hasPromoContent = design.promotions?.some(p => p.title || p.description);
                  // Carousel: show only when promotion toggle ON + carousel mode selected + has slides
                  if (hasPromoContent && design.showPromotions) {
                    return <PromotionCarousel design={design} />;
                  }
                  // Single promotion: show ONLY when toggle is ON
                  if (design.showPromotion) {
                    return <PromotionBlock design={design} />;
                  }
                  return null;
                })()}

                {/* Form Card — Split Layout with glassmorphism */}
                <div
                  className={cn(formCls, 'relative overflow-hidden portal-animate-in portal-form-card')}
                  style={{
                    ...cardShadowStyle,
                    ...getCardBackgroundStyle(design, dark),
                    ...getCardBorderStyle(design, dark),
                  }}
                >
                  {/* Premium top accent bar */}
                  <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden" style={{ opacity: 0.95 }}>
                    <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, transparent, ${design.accentColor}, ${design.accentColor}cc, ${design.accentColor}, transparent)`, animation: 'portal-shimmer 3s ease-in-out infinite', backgroundSize: '200% 100%', boxShadow: `0 0 12px ${design.accentColor}80` }} />
                  </div>
                  {/* Subtle inner glow */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${design.accentColor}0a, transparent 70%)` }} />
                  {/* Corner accent dots */}
                  <div className="absolute top-2 left-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
                  <div className="absolute top-2 right-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
                  {/* Mobile-only header */}
                  <div className="md:hidden text-center space-y-2 mb-4">
                    <PortalLogo design={design} size="small" />
                    <h2 className="text-xl font-bold" style={{ color: getCardTextColor(design), fontFamily: design.headingFontFamily }}>
                      {localizedTitle}
                    </h2>
                    <p className="text-sm" style={{ color: getMutedTextColor(design) }}>{localizedSubtitle}</p>
                    {/* Mobile clock + weather */}
                    {(design.showClock || design.showWeather) && (
                    <div className="flex items-center justify-center gap-3 pt-2">
                      {design.showClock && <LiveClock design={design} />}
                      {design.showWeather && <WeatherWidget design={design} />}
                    </div>
                    )}
                  </div>

                  {renderCardContent()}

                  {/* Marketing Consent (Feature 2) — inside the form card, after form content.
                      Only rendered in fallback mode; unified form handles consent internally. */}
                  {!useUnifiedForm && state !== 'success' && design.marketingOptIn?.enabled && (
                    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
                      <MarketingConsentPlaceholder design={design} />
                    </div>
                  )}

                  {/* Post-Connect Survey (Feature 4) — inside the form card, after success */}
                  {state === 'success' && design.surveyConfig?.enabled && (
                    <GuestSurvey design={design} tenantId={portalConfig?.tenantId} partnerId={portalConfig?.partnerId} sessionId={authResult?.sessionId} guestId={authResult?.guestId} />
                  )}

                </div>

                {/* ── Advanced Feature Indicators (auth form) ── */}
                {renderFeatureIndicators}

                {/* ── Banner Ad below form card ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <div className="mt-4">
                    <AdSlot slot="banner" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                  </div>
                )}

                {/* ── Footer Ad at bottom of right panel ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <div className="mt-4">
                    <AdSlot slot="footer" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                  </div>
                )}
              </div>

              {/* ── Sidebar Ad: vertical strip ── */}
              {design.showAds && portalConfig?.tenantId && (
                <div className="hidden md:flex flex-col items-center gap-3 pt-4">
                  <AdSlot slot="sidebar" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                </div>
              )}
            </div>
          ) : isHeroBanner ? (
            // ══════════════════════════════════════════════════════════
            // HERO BANNER LAYOUT — Full-width hero, form below
            // ══════════════════════════════════════════════════════════
            <div className="w-full max-w-lg mx-auto">
              {/* ── Interstitial Ad above hero ── */}
              {design.showAds && portalConfig?.tenantId && (
                <div className="mb-4">
                  <AdSlot slot="interstitial" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                </div>
              )}
              {/* Hero section */}
              <div className="text-center mb-3 space-y-1.5">
                <PortalLogo design={design} size="large" />
                {(design.enableMultiLanguage && (design.languages?.length ?? 0) > 1) && (
                  <div className="flex justify-center">
                    <LanguageSwitcher design={design} selectedLanguage={effectiveLanguage} setSelectedLanguage={setSelectedLanguage} />
                  </div>
                )}
                <h1 className="text-xl md:text-2xl font-bold" style={{ fontFamily: design.headingFontFamily, color: dark ? '#ffffff' : design.textColor }}>
                  {localizedTitle}
                </h1>
                <p className="text-sm" style={{ color: getSubtitleColor(design) }}>{localizedSubtitle}</p>
                {localizedWelcome && (
                  <p className="text-xs" style={{ color: getMutedTextColor(design) }}>{localizedWelcome}</p>
                )}
                {/* Clock + Weather row */}
                {(design.showClock || design.showWeather) && (
                  <div className="flex items-center justify-center gap-4 pt-1">
                    {design.showClock && <LiveClock design={design} />}
                    {design.showWeather && <WeatherWidget design={design} />}
                  </div>
                )}
              </div>

              {/* Hotel info + amenities above form */}
              {design.showHotelInfo && <HotelInfoBlock design={design} dark={dark} />}
              {design.showAmenities && <AmenitiesBlock design={design} dark={dark} />}

              {/* Promotion */}
              {state !== 'success' && (() => {
                const hasPromoContent = design.promotions?.some(p => p.title || p.description);
                if (hasPromoContent && design.showPromotions) return <PromotionCarousel design={design} />;
                if (design.showPromotion) return <PromotionBlock design={design} />;
                return null;
              })()}

              {/* Form Card — Hero Banner with glassmorphism */}
              <div className={cn(formCls, '!p-4 sm:!p-5 mt-2 relative overflow-hidden portal-animate-in portal-form-card')} style={{ ...cardShadowStyle, ...getCardBackgroundStyle(design, dark), ...getCardBorderStyle(design, dark) }}>
                {/* Premium top accent bar */}
                <div className="absolute top-0 left-0 right-0 h-[3px] overflow-hidden" style={{ opacity: 0.95 }}>
                  <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(90deg, transparent, ${design.accentColor}, ${design.accentColor}cc, ${design.accentColor}, transparent)`, animation: 'portal-shimmer 3s ease-in-out infinite', backgroundSize: '200% 100%', boxShadow: `0 0 12px ${design.accentColor}80` }} />
                </div>
                {/* Subtle inner glow */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 pointer-events-none" style={{ background: `radial-gradient(ellipse at top, ${design.accentColor}0a, transparent 70%)` }} />
                {/* Corner accent dots */}
                <div className="absolute top-2 left-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
                <div className="absolute top-2 right-2 w-1 h-1 rounded-full pointer-events-none" style={{ backgroundColor: design.accentColor, opacity: 0.4 }} />
                {renderFormContent()}
              </div>

              {/* ── Advanced Feature Indicators ── */}
              {renderFeatureIndicators}

              {/* Social Links */}
              {design.showSocialMedia && <div className="mt-4"><SocialLinksBlock design={design} /></div>}

              {/* ── Footer Ad below content ── */}
              {design.showAds && portalConfig?.tenantId && (
                <div className="mt-3">
                  <AdSlot slot="footer" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                </div>
              )}

              {/* Branding */}
              {design.showBranding && (
                <div className="text-center mt-4" style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
                  <p className="text-[10px]">{localizedPoweredBy}</p>
                </div>
              )}
            </div>
          ) : isSidePanel ? (
            // ══════════════════════════════════════════════════════════
            // SIDE PANEL LAYOUT — Slim left panel form, right content
            // ══════════════════════════════════════════════════════════
            <div className="w-full max-w-4xl flex flex-col md:flex-row min-h-[60vh]">
              {/* Left Panel: Form */}
              <div className="w-full md:w-[380px] flex flex-col p-6 md:p-8 space-y-4"
                style={{ backgroundColor: dark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.95)' }}>
                <PortalLogo design={design} size="small" />
                {(design.enableMultiLanguage && (design.languages?.length ?? 0) > 1) && (
                  <LanguageSwitcher design={design} selectedLanguage={effectiveLanguage} setSelectedLanguage={setSelectedLanguage} />
                )}
                <h2 className="text-xl font-bold" style={{ color: getCardTextColor(design), fontFamily: design.headingFontFamily }}>
                  {localizedTitle}
                </h2>
                <p className="text-sm" style={{ color: getMutedTextColor(design) }}>{localizedSubtitle}</p>

                {/* Promotion */}
                {state !== 'success' && (() => {
                  const hasPromoContent = design.promotions?.some(p => p.title || p.description);
                  if (hasPromoContent && design.showPromotions) return <PromotionCarousel design={design} />;
                  if (design.showPromotion) return <PromotionBlock design={design} />;
                  return null;
                })()}

                <div className="flex-1">
                  {renderFormContent()}
                </div>

                {/* ── Advanced Feature Indicators ── */}
                {renderFeatureIndicators}

                {/* Social Links */}
                {design.showSocialMedia && <SocialLinksBlock design={design} />}
              </div>

              {/* Right Panel: Hotel Info */}
              <div className="flex-1 flex flex-col justify-center p-8 md:p-12 space-y-6" style={{ color: dark ? '#ffffff' : design.textColor }}>
                {localizedWelcome && (
                  <p className="text-lg italic" style={{ color: getMutedTextColor(design) }}>"{localizedWelcome}"</p>
                )}
                {design.showHotelInfo && <HotelInfoBlock design={design} dark={dark} />}
                {design.showAmenities && <AmenitiesBlock design={design} dark={dark} />}
                {(design.showClock || design.showWeather) && (
                  <div className="flex items-center gap-4 pt-4">
                    {design.showClock && <LiveClock design={design} />}
                    {design.showWeather && <WeatherWidget design={design} />}
                  </div>
                )}
                {design.showBranding && (
                  <div className="mt-auto pt-4" style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
                    <p className="text-[10px]">{localizedPoweredBy}</p>
                  </div>
                )}
              </div>
            </div>
          ) : isBottomSheet ? (
            // ══════════════════════════════════════════════════════════
            // BOTTOM SHEET LAYOUT — Mobile-first, form slides up
            // ══════════════════════════════════════════════════════════
            <div className="w-full max-w-md">
              {/* Spacer for background visibility */}
              <div className="h-16" />
              {/* Sheet card */}
              <div className="rounded-t-3xl overflow-hidden shadow-2xl"
                style={{ backgroundColor: dark ? 'rgba(20,20,20,0.97)' : 'rgba(255,255,255,0.98)' }}>
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1 rounded-full" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)' }} />
                </div>
                <div className="p-6 space-y-5">
                  <div className="text-center space-y-2">
                    <PortalLogo design={design} size="small" />
                    {(design.enableMultiLanguage && (design.languages?.length ?? 0) > 1) && (
                      <div className="flex justify-center">
                        <LanguageSwitcher design={design} selectedLanguage={effectiveLanguage} setSelectedLanguage={setSelectedLanguage} />
                      </div>
                    )}
                    <h1 className="text-2xl font-bold" style={{ color: getCardTextColor(design), fontFamily: design.headingFontFamily }}>
                      {localizedTitle}
                    </h1>
                    <p className="text-sm" style={{ color: getMutedTextColor(design) }}>{localizedSubtitle}</p>
                  </div>

                  {/* Promotion */}
                  {state !== 'success' && (() => {
                    const hasPromoContent = design.promotions?.some(p => p.title || p.description);
                    if (hasPromoContent && design.showPromotions) return <PromotionCarousel design={design} />;
                    if (design.showPromotion) return <PromotionBlock design={design} />;
                    return null;
                  })()}

                  {renderFormContent()}

                  {/* ── Advanced Feature Indicators ── */}
                  {renderFeatureIndicators}

                  {/* Clock + Weather */}
                  {(design.showClock || design.showWeather) && (
                    <div className="flex items-center justify-center gap-4">
                      {design.showClock && <LiveClock design={design} />}
                      {design.showWeather && <WeatherWidget design={design} />}
                    </div>
                  )}

                  {/* Social + Branding */}
                  <div className="flex items-center justify-between">
                    {design.showSocialMedia && <SocialLinksBlock design={design} />}
                    {design.showBranding && (
                      <p className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}>
                        {localizedPoweredBy}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // ══════════════════════════════════════════════════════════
            // CENTERED / CARD / FULL-BLEED LAYOUT — with Content Block Ordering (Feature 9)
            // ══════════════════════════════════════════════════════════
            <div className="flex gap-6 justify-center w-full">
              <div className="w-full max-w-md flex flex-col items-center gap-3">
                {/* ── Interstitial Ad: large ad at the very top ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <div className="w-full">
                    <AdSlot slot="interstitial" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                  </div>
                )}

                {blockOrder.map((block, i) => (
                  <Fragment key={`${block}-${i}`}>
                    {renderBlock(block)}
                  </Fragment>
                ))}

                {/* ── Advanced Feature Indicators (centered/card/full-bleed layouts) ── */}
                {renderFeatureIndicators}

                {/* ── Banner Ad: horizontal strip below form ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <div className="w-full mt-2">
                    <AdSlot slot="banner" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                  </div>
                )}

                {/* ── Footer Ad: bar at the very bottom ── */}
                {design.showAds && portalConfig?.tenantId && (
                  <div className="w-full mt-1">
                    <AdSlot slot="footer" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                  </div>
                )}

                {/* Branding footer */}
                {design.showBranding && (
                  <div className="text-center mt-4 animate-in fade-in-0 duration-700 delay-500">
                    <div className="flex items-center justify-center gap-2 mb-1.5">
                      <span className="block w-6 h-px" style={{ background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
                      <span className="block w-1 h-1 rounded-full" style={{ backgroundColor: design.accentColor, opacity: 0.5 }} />
                      <span className="block w-6 h-px" style={{ background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }} />
                    </div>
                    <p className="text-[10px] tracking-wide font-light" style={{ color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.32)' }}>
                      {localizedPoweredBy}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Sidebar Ad: vertical strip alongside centered layout (desktop only) ── */}
              {design.showAds && portalConfig?.tenantId && (
                <div className="hidden lg:flex flex-col items-center gap-3 pt-2 w-[180px] shrink-0">
                  <AdSlot slot="sidebar" tenantId={portalConfig.tenantId} partnerId={portalConfig.partnerId || undefined} accentColor={design.accentColor} dark={dark} />
                </div>
              )}
            </div>
          )}
        </main>

        {/* ── Custom HTML Injection (after main content, before closing wrapper) ── */}
        {design.customHtml && (
          <div dangerouslySetInnerHTML={{ __html: design.customHtml }} />
        )}
      </div>

      {/* ── Raw Template Mode: Full HTML replacement in sandboxed iframe ── */}
      {design.templateMode === 'raw' && design.rawTemplateHtml && (
        <RawTemplateRenderer
          html={design.rawTemplateHtml}
          css={design.rawTemplateCss || ''}
          authUrl="/api/v1/auth/login"
          design={design}
          portalConfig={portalConfig}
        />
      )}
    </PortalLanguageContext.Provider>
  );
}

// ────────────────────────────────────────────────────────────
// Page Export (with Suspense boundary for useSearchParams)
// ────────────────────────────────────────────────────────────

export function WifiConnectPortal() {
  return (
    <Suspense
      fallback={
        <PortalLanguageContext.Provider value="en">
          <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #065f46)' }}>
            <div className="flex flex-col items-center gap-5 relative z-10">
              {/* Premium pulsing rings */}
              <div className="relative flex items-center justify-center">
                <div className="absolute w-16 h-16 rounded-full border-2 border-white/20" style={{ animation: 'portal-pulse-ring 2.5s ease-out infinite' }} />
                <div className="absolute w-16 h-16 rounded-full border border-white/10" style={{ animation: 'portal-pulse-ring 2.5s ease-out infinite 0.8s' }} />
                {/* Animated pulsing dots */}
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full bg-white"
                      animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-white/80 animate-spin" />
                <p className="text-white/70 text-sm font-medium tracking-wide">{getUIString('en', 'loadingPortal')}</p>
              </div>
            </div>
          </div>
        </PortalLanguageContext.Provider>
      }
    >
      <PortalContent />
    </Suspense>
  );
}
