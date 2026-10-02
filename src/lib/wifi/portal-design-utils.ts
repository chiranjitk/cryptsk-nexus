import React from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Portal Design Utilities — Shared CSS/Style helpers for portal rendering
//
// Used by both:
//   - Design Preview (admin panel designer tab)
//   - Live Captive Portal (/connect page)
//
// KEY PRINCIPLE: Card text/icon/input colors depend on the CARD background,
// NOT the page background. Non-glass/non-minimal form styles (rounded, square, pill)
// always render a white/light card background even on dark pages. So text inside
// those cards must always be dark for readability.
//
// Only glass and minimal form styles have transparent/dark card backgrounds,
// so they can use white text on dark pages.
// ═══════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// Design Settings Interface
// ────────────────────────────────────────────────────────────

export interface DesignSettings {
  layoutType: 'centered' | 'split_left' | 'split_right' | 'card' | 'full_bleed';
  backgroundType: 'solid' | 'gradient' | 'image';
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
  backgroundOverlay: number;
  fontFamily: string;
  headingFontFamily: string;
  formStyle: 'rounded' | 'square' | 'glass' | 'pill' | 'minimal';
  inputStyle: 'rounded' | 'square' | 'pill' | 'underline';
  buttonStyle: 'filled' | 'outlined' | 'gradient' | 'pill' | 'rounded';
  buttonSize: 'small' | 'medium' | 'large';
  cardShadow: 'none' | 'small' | 'medium' | 'large';
  animationType: 'none' | 'fade' | 'slide_up' | 'zoom';
  welcomeMessage: string;
  hotelName: string;
  hotelAddress: string;
  hotelPhone: string;
  hotelWebsite: string;
  showHotelInfo: boolean;
  amenities: string[];
  showAmenities: boolean;
  showSocialMedia: boolean;
  socialLinks: Array<{ platform: string; url: string }>;
  showClock: boolean;
  showWeather: boolean;
  promotionTitle: string;
  promotionDesc: string;
  showPromotion: boolean;

  // ── Feature 1: Multi-Language Portal ──
  languages: string[];
  defaultLanguage: string;
  /** Per-language translations for admin-defined content.
   *  Shape: { "es": { "title": "Bienvenido", "subtitle": "Conectarse al WiFi", ... }, ... }
   *  Supported keys: title, subtitle, welcomeMessage, termsText, promotionTitle,
   *  promotionDesc, hotelName, hotelAddress, marketingConsentText,
   *  surveyQuestion, surveyThankYou, hotelPhoneLabel, hotelWebsiteLabel */
  translations: Record<string, Record<string, string>>;

  // ── Feature 2: Guest Marketing Opt-In ──
  marketingOptIn: {
    enabled: boolean;
    emailConsent: boolean;
    phoneConsent: boolean;
    consentText: string;
  };

  // ── Feature 3: Multi-Slide Promotion Carousel ──
  promotions: Array<{
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    linkUrl: string;
    backgroundColor: string;
  }>;
  showPromotions: boolean;

  // ── Feature 4: Post-Connect Guest Survey ──
  surveyConfig: {
    enabled: boolean;
    question: string;
    options: string[];
    thankYouMessage: string;
  };

  // ── Feature 5: Weather Widget ──
  weatherLocation: string;

  // ── Feature 6: Terms & Conditions Editor ──
  termsText: string;
  termsUrl: string;

  // ── Feature 7: Custom Amenities ──
  customAmenities: Array<{
    name: string;
    icon: string;
  }>;

  // ── Feature 9: Content Block Reordering ──
  contentBlockOrder: string[];

  // ── Feature 14: Portal Scheduling ──
  scheduleConfig: {
    enabled: boolean;
    schedules: Array<{
      id: string;
      name: string;
      days: number[];
      startTime: string;
      endTime: string;
      designOverrides: Record<string, unknown>;
    }>;
  };

  // ── Feature 15: Portal Ad Campaigns ──
  showAds: boolean;
  adSlotType: string;
}

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  layoutType: 'centered',
  backgroundType: 'solid',
  gradientFrom: '#0f766e',
  gradientTo: '#134e4a',
  gradientAngle: 135,
  backgroundOverlay: 40,
  fontFamily: 'Inter, system-ui, sans-serif',
  headingFontFamily: 'Inter, system-ui, sans-serif',
  formStyle: 'rounded',
  inputStyle: 'rounded',
  buttonStyle: 'filled',
  buttonSize: 'medium',
  cardShadow: 'medium',
  animationType: 'fade',
  welcomeMessage: 'Enjoy your stay with us',
  hotelName: '',
  hotelAddress: '',
  hotelPhone: '',
  hotelWebsite: '',
  showHotelInfo: false,
  amenities: [],
  showAmenities: false,
  showSocialMedia: false,
  socialLinks: [],
  showClock: false,
  showWeather: false,
  promotionTitle: '',
  promotionDesc: '',
  showPromotion: false,

  // Multi-Language
  languages: [],
  defaultLanguage: 'en',

  // Marketing Opt-In
  marketingOptIn: {
    enabled: false,
    emailConsent: false,
    phoneConsent: false,
    consentText: '',
  },

  // Multi-Slide Carousel
  promotions: [],
  showPromotions: false,

  // Post-Connect Survey
  surveyConfig: {
    enabled: false,
    question: '',
    options: [],
    thankYouMessage: '',
  },

  // Weather Widget
  weatherLocation: '',

  // Terms & Conditions
  termsText: '',
  termsUrl: '',

  // Custom Amenities
  customAmenities: [],

  // Content Block Order
  contentBlockOrder: [],

  // Portal Scheduling
  scheduleConfig: {
    enabled: false,
    schedules: [],
  },

  // Portal Ad Campaigns
  showAds: false,
  adSlotType: 'banner',
};

// ────────────────────────────────────────────────────────────
// Full Design Config (what resolve-zone API returns inside `design`)
// ────────────────────────────────────────────────────────────

export interface PortalDesignConfig {
  layoutType: string;
  backgroundType: 'solid' | 'gradient' | 'image' | 'video' | string;
  gradientFrom: string;
  gradientTo: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  backgroundImage: string;
  backgroundOverlay: number;
  fontFamily: string;
  headingFontFamily: string;
  formStyle: string;
  inputStyle: string;
  buttonStyle: string;
  buttonSize: string;
  cardShadow: string;
  animationType: string;
  logoSize: string;
  welcomeMessage: string;
  hotelName: string;
  hotelAddress: string;
  hotelPhone: string;
  hotelWebsite: string;
  logoUrl: string;
  showHotelInfo: boolean;
  amenities: string[];
  showAmenities: boolean;
  showSocialMedia: boolean;
  socialLinks: Array<{ platform: string; url: string }>;
  showClock: boolean;
  showWeather: boolean;
  promotionTitle: string;
  promotionDesc: string;
  showPromotion: boolean;
  termsText: string;
  termsUrl: string;
  showBranding: boolean;
  title: string;
  subtitle: string;
  gradientAngle?: number;

  // ── Feature 1: Multi-Language Portal ──
  languages: string[];
  defaultLanguage: string;
  /** Per-language translations for admin-defined content.
   *  Shape: { "es": { "title": "Bienvenido", "subtitle": "Conectarse al WiFi", ... }, ... }
   *  Supported keys: title, subtitle, welcomeMessage, termsText, promotionTitle,
   *  promotionDesc, hotelName, hotelAddress, marketingConsentText,
   *  surveyQuestion, surveyThankYou */
  translations: Record<string, Record<string, string>>;

  // ── Feature 2: Guest Marketing Opt-In ──
  marketingOptIn: {
    enabled: boolean;
    emailConsent: boolean;
    phoneConsent: boolean;
    consentText: string;
  };

  // ── Feature 3: Multi-Slide Promotion Carousel ──
  promotions: Array<{
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    linkUrl: string;
    backgroundColor: string;
  }>;
  showPromotions: boolean;

  // ── Feature 4: Post-Connect Guest Survey ──
  surveyConfig: {
    enabled: boolean;
    question: string;
    options: string[];
    thankYouMessage: string;
  };

  // ── Feature 5: Weather Widget ──
  weatherLocation: string;

  // ── Feature 7: Custom Amenities ──
  customAmenities: Array<{
    name: string;
    icon: string;
  }>;

  // ── Feature 9: Content Block Reordering ──
  contentBlockOrder: string[];

  // ── Feature 14: Portal Scheduling ──
  scheduleConfig: {
    enabled: boolean;
    schedules: Array<{
      id: string;
      name: string;
      days: number[];
      startTime: string;
      endTime: string;
      designOverrides: Record<string, unknown>;
    }>;
  };

  // ── Feature 15: Portal Ad Campaigns ──
  showAds: boolean;
  adSlotType: 'banner' | 'interstitial' | 'footer' | 'sidebar';

  // ── CAPTCHA Protection (Cloudflare Turnstile) ──
  captchaEnabled?: boolean;
  captchaSiteKey?: string;

  // ── Advanced: Plan Selector / Upgrade ──
  enablePlanSelector?: boolean;
  planSelectorConfig?: { showPricing: boolean; showDataLimit: boolean; showSpeed: boolean; allowUpgrade: boolean };

  // ── Advanced: Marketing Data Capture (post auth) ──
  enableMarketingCapture?: boolean;
  marketingCaptureConfig?: { collectEmail: boolean; collectPhone: boolean; collectName: boolean; consentText: string; required: boolean };

  // ── Advanced: WiFi Credential QR Code ──
  enableQrCode?: boolean;
  qrCodeConfig?: { showOnSuccess: boolean; qrSize: 'small' | 'medium' | 'large'; includeSSID: boolean };

  // ── Advanced: Auto-Renewal (Extended Stay) ──
  enableAutoRenewal?: boolean;
  autoRenewalConfig?: { renewBeforeExpiryHours: number; maxRenewalCycles: number; notifyGuest: boolean };

  // ── Advanced: Speed Test Widget ──
  enableSpeedTest?: boolean;
  speedTestConfig?: { showOnSuccess: boolean; testDuration: number };
  // ── Visual Enhancement Properties ──
  patternOverlay?: string;
  patternOpacity?: number;
  patternColor?: string;
  cardOpacity?: number;
  cardBorderColor?: string;
  cardBorderWidth?: number;
  inputRadiusOverride?: string;
  buttonRadiusOverride?: string;
  spacingScale?: number;
  headingSize?: number;
  socialButtonStyle?: string;
  showConfetti?: boolean;
  buttonLabel?: string;
  // ── Custom CSS/HTML Injection ──
  customCss?: string;
  customHtml?: string;
  // ── Raw Template Mode ──
  templateMode?: 'structured' | 'raw';
  rawTemplateHtml?: string;
  rawTemplateCss?: string;
  // ── Form Color Customization ──
  formBackgroundColor?: string;
  inputBackgroundColor?: string;
  inputBorderColor?: string;
  inputTextColor?: string;
  inputPlaceholderColor?: string;
  buttonTextColor?: string;
  labelColor?: string;
  linkColor?: string;
  errorColor?: string;
  // Feature 10: Splash/Welcome Screen
  enableSplashScreen?: boolean;
  splashDuration?: number;
  splashImageUrl?: string;
  splashMessage?: string;
  // Feature 11: Video Background
  backgroundVideoUrl?: string;
  backgroundVideoPoster?: string;
  backgroundVideoMuted?: boolean;
  backgroundVideoLoop?: boolean;
}

export const DEFAULT_PORTAL_DESIGN: PortalDesignConfig = {
  layoutType: 'centered',
  backgroundType: 'gradient',
  gradientFrom: '#0ea5e9',
  gradientTo: '#065f46',
  backgroundColor: '#0f766e',
  textColor: '#fafafa',
  accentColor: '#14b8a6',
  backgroundImage: '',
  backgroundOverlay: 40,
  fontFamily: 'Inter, system-ui, sans-serif',
  headingFontFamily: 'Inter, system-ui, sans-serif',
  formStyle: 'rounded',
  inputStyle: 'rounded',
  buttonStyle: 'filled',
  buttonSize: 'medium',
  cardShadow: 'medium',
  animationType: 'fade',
  logoSize: 'large',
  welcomeMessage: 'Enjoy your stay',
  hotelName: '',
  hotelAddress: '',
  hotelPhone: '',
  hotelWebsite: '',
  logoUrl: '',
  showHotelInfo: false,
  amenities: [],
  showAmenities: false,
  showSocialMedia: false,
  socialLinks: [],
  showClock: false,
  showWeather: false,
  promotionTitle: '',
  promotionDesc: '',
  showPromotion: false,
  termsText: '',
  termsUrl: '',
  showBranding: false,
  title: 'Welcome',
  subtitle: 'Connect to WiFi',
  gradientAngle: 135,

  // Multi-Language
  languages: [],
  defaultLanguage: 'en',
  translations: {},

  // Marketing Opt-In
  marketingOptIn: {
    enabled: false,
    emailConsent: false,
    phoneConsent: false,
    consentText: '',
  },

  // Multi-Slide Carousel
  promotions: [],
  showPromotions: false,
  useCarouselMode: false,

  // Post-Connect Survey
  surveyConfig: {
    enabled: false,
    question: '',
    options: [],
    thankYouMessage: '',
  },

  // Weather Widget
  weatherLocation: '',

  // Custom Amenities
  customAmenities: [],

  // Content Block Order
  contentBlockOrder: [],

  // Portal Scheduling
  scheduleConfig: {
    enabled: false,
    schedules: [],
  },

  // Portal Ad Campaigns
  showAds: false,
  adSlotType: 'banner' as const,

  // CAPTCHA Protection
  captchaEnabled: false,
  captchaSiteKey: '',

  // Advanced: Plan Selector
  enablePlanSelector: false,
  planSelectorConfig: { showPricing: false, showDataLimit: false, showSpeed: false, allowUpgrade: false },

  // Advanced: Marketing Data Capture
  enableMarketingCapture: false,
  marketingCaptureConfig: { collectEmail: true, collectPhone: false, collectName: false, consentText: '', required: false },

  // Advanced: WiFi Credential QR Code
  enableQrCode: false,
  qrCodeConfig: { showOnSuccess: true, qrSize: 'medium', includeSSID: true },

  // Advanced: Auto-Renewal
  enableAutoRenewal: false,
  autoRenewalConfig: { renewBeforeExpiryHours: 2, maxRenewalCycles: 10, notifyGuest: true },

  // Advanced: Speed Test
  enableSpeedTest: false,
  speedTestConfig: { showOnSuccess: true, testDuration: 10 },
  // Visual Enhancement defaults
  patternOverlay: 'none',
  patternOpacity: 5,
  patternColor: '',
  cardOpacity: 6,
  cardBorderColor: '',
  cardBorderWidth: 1,
  inputRadiusOverride: '',
  buttonRadiusOverride: '',
  spacingScale: 1,
  headingSize: 1,
  socialButtonStyle: 'brand',
  showConfetti: true,
  buttonLabel: '',
  // Feature 10: Splash/Welcome Screen
  enableSplashScreen: false,
  splashDuration: 5,
  splashImageUrl: '',
  splashMessage: 'Welcome to our hotel',
  // Feature 11: Video Background
  backgroundVideoUrl: '',
  backgroundVideoPoster: '',
  backgroundVideoMuted: true,
  backgroundVideoLoop: true,
};

// ────────────────────────────────────────────────────────────
// Background & Card Detection Helpers
// ────────────────────────────────────────────────────────────

/** Determine effective background type (accounts for video URL) */
export function getBackgroundType(settings: { backgroundType?: string; backgroundVideoUrl?: string }): string {
  if (settings.backgroundType === 'video' && settings.backgroundVideoUrl) return 'video';
  return settings.backgroundType || 'solid';
}

/** Is the PAGE background dark? (gradient, image, video, or dark solid) */
export function isDarkBackground(design: PortalDesignConfig): boolean {
  if (design.backgroundType === 'gradient') return true;
  if (design.backgroundType === 'image') return true;
  if (design.backgroundType === 'video') return true;
  const bg = design.backgroundColor || '#0f766e';
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/**
 * Is the FORM CARD background transparent/dark?
 * Only glass and minimal styles have transparent card backgrounds.
 * All other styles (rounded, square, pill) render white/light card backgrounds
 * even when the page background is dark.
 */
export function isCardTransparent(design: PortalDesignConfig): boolean {
  return design.formStyle === 'glass' || design.formStyle === 'minimal';
}

// ────────────────────────────────────────────────────────────
// Background CSS Generation
// ────────────────────────────────────────────────────────────

export function getBackgroundStyle(design: PortalDesignConfig): React.CSSProperties {
  if (design.backgroundType === 'gradient') {
    const angle = design.gradientAngle || 135;
    return {
      background: `linear-gradient(${angle}deg, ${design.gradientFrom}, ${design.gradientTo})`,
    };
  }
  if (design.backgroundType === 'image' && design.backgroundImage) {
    return {
      backgroundImage: `url(${design.backgroundImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundColor: design.backgroundColor || design.gradientFrom || '#0f766e',
  };
}

export function getBackgroundCSSValue(design: PortalDesignConfig): string {
  if (design.backgroundType === 'gradient') {
    const angle = design.gradientAngle || 135;
    return `linear-gradient(${angle}deg, ${design.gradientFrom}, ${design.gradientTo})`;
  }
  if (design.backgroundType === 'image' && design.backgroundImage) {
    return `url(${design.backgroundImage}) center/cover`;
  }
  return design.backgroundColor || design.gradientFrom || '#0f766e';
}

// ────────────────────────────────────────────────────────────
// Overlay Style (for image backgrounds)
// ────────────────────────────────────────────────────────────

export function getOverlayStyle(design: PortalDesignConfig): React.CSSProperties {
  if (design.backgroundType === 'image' && design.backgroundOverlay > 0) {
    return { backgroundColor: `rgba(0,0,0,${design.backgroundOverlay / 100})` };
  }
  return {};
}

// ────────────────────────────────────────────────────────────
// Form Container Classes (based on formStyle)
// ────────────────────────────────────────────────────────────

export function getFormContainerClasses(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  const scale = design.spacingScale ?? 1;
  const pad = scale === 1 ? '' : ` p-${Math.round(6 * scale)} sm:p-${Math.round(8 * scale)}`;
  let cls = `${pad || 'p-6 sm:p-8'} space-y-${Math.round(5 * scale)}`;

  const borderW = design.cardBorderWidth ?? 1;
  const borderC = design.cardBorderColor;

  // Clean professional styling — hotel/resort/enterprise
  if (design.formStyle === 'glass') {
    const opacity = (design.cardOpacity ?? 6) / 100;
    cls += dark
      ? ` bg-white/[${opacity}] ${borderW > 0 ? `border border-white/10` : ''}`
      : ` bg-white/95 ${borderW > 0 ? 'border border-gray-200' : ''}`;
  } else if (design.formStyle === 'minimal') {
    cls += ' bg-transparent';
  } else {
    // rounded, square, pill — clean solid styling
    cls += dark
      ? ` bg-white/[0.06] ${borderW > 0 ? 'border border-white/10' : ''}`
      : ` bg-white ${borderW > 0 ? 'border border-gray-100' : ''}`;
  }

  // Custom border color override
  if (borderC && borderW > 0) {
    // Remove default border classes — inline style handles it
    cls = cls.replace(/border-\S+/g, '');
  }

  // Border radius
  if (design.formStyle === 'pill') {
    cls += ' rounded-3xl';
  } else if (design.formStyle === 'square') {
    cls += ' rounded-none';
  } else {
    cls += ' rounded-2xl';
  }

  return cls;
}

// ────────────────────────────────────────────────────────────
// Card Shadow CSS
// ────────────────────────────────────────────────────────────

export function getCardShadowCSS(design: PortalDesignConfig): React.CSSProperties {
  const dark = isDarkBackground(design);
  const accent = design.accentColor || '#14b8a6';
  // Premium layered shadow: ambient glow + depth drop + ring
  const accentGlow = `0 0 40px -8px ${accent}1a`;
  switch (design.cardShadow) {
    case 'large':
      return dark
        ? { boxShadow: `${accentGlow}, 0 25px 50px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)` }
        : { boxShadow: `${accentGlow}, 0 25px 50px -12px rgba(0,0,0,0.18), 0 8px 16px -8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03)` };
    case 'medium':
      return dark
        ? { boxShadow: `${accentGlow}, 0 20px 40px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)` }
        : { boxShadow: `${accentGlow}, 0 12px 28px -8px rgba(0,0,0,0.12), 0 4px 8px -4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)` };
    case 'small':
      return dark
        ? { boxShadow: `${accentGlow}, 0 8px 16px -4px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.03)` }
        : { boxShadow: `${accentGlow}, 0 4px 12px -4px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)` };
    case 'none':
      return { boxShadow: 'none' };
    default:
      return dark
        ? { boxShadow: `${accentGlow}, 0 20px 40px -12px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)` }
        : { boxShadow: `${accentGlow}, 0 12px 28px -8px rgba(0,0,0,0.12), 0 4px 8px -4px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03)` };
  }
}

// ────────────────────────────────────────────────────────────
// Text Color — depends on CARD background, NOT page background
// ────────────────────────────────────────────────────────────

/**
 * Card text color for labels, headings inside the form card.
 * - Dark page background → white text (all form styles are semi-transparent on dark)
 * - Light page background + glass/minimal → dark text
 * - Light page background + others → dark text (card has white background)
 */
export function getCardTextColor(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  if (dark) return '#ffffff';
  // Light page backgrounds — all cards are white-ish → dark text
  return '#1f2937';
}

/** Subtitle color — this is OUTSIDE the card, on the page background */
export function getSubtitleColor(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  if (dark) return 'rgba(255,255,255,0.8)';
  return 'rgba(0,0,0,0.6)';
}

/**
 * Muted text color inside the form card.
 * - Dark page background → light muted (all form styles are semi-transparent)
 * - Light page background → dark muted (card is white)
 */
export function getMutedTextColor(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  if (dark) return 'rgba(255,255,255,0.7)';
  return 'rgba(0,0,0,0.5)';
}

// ────────────────────────────────────────────────────────────
// Input Field Classes (based on inputStyle + formStyle)
// ────────────────────────────────────────────────────────────

/**
 * Input classes. Text and border colors depend on PAGE background.
 * - Dark page → white text, white/20 borders (all form styles are semi-transparent)
 * - Light page → dark text, gray borders (card is white)
 */
export function getInputClasses(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  const accent = design.accentColor || '#14b8a6';
  // On dark backgrounds, ALL form styles are semi-transparent → use light colors
  const useLight = dark;

  let cls = 'w-full h-12 text-base focus:outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  // Border styling — premium glass inputs on dark backgrounds
  if (design.inputStyle === 'underline') {
    if (useLight) {
      cls += ' border-0 border-b-2 px-1 py-3 bg-transparent border-white/30 text-white placeholder:text-white/40';
    } else {
      cls += ' border-0 border-b-2 px-1 py-3 bg-transparent border-gray-300 placeholder:text-gray-400';
    }
  } else if (design.inputStyle === 'pill') {
    if (useLight) {
      cls += ' bg-white/[0.08] border border-white/[0.15] rounded-full px-4 py-3 focus-visible:border-white/25 text-white placeholder:text-white/40';
    } else {
      cls += ' bg-white/90 border-2 border-gray-200 rounded-full px-4 py-3 placeholder:text-gray-400';
    }
  } else if (design.inputStyle === 'square') {
    if (useLight) {
      cls += ' bg-white/[0.08] border border-white/[0.15] rounded-none px-3 py-3 focus-visible:border-white/25 text-white placeholder:text-white/40';
    } else {
      cls += ' bg-white/90 border-2 border-gray-200 rounded-none px-3 py-3 placeholder:text-gray-400';
    }
  } else {
    // rounded (default) — premium glass matching /portal/captive
    if (useLight) {
      cls += ' bg-white/[0.08] border border-white/[0.15] rounded-xl px-4 py-3 focus-visible:border-white/25 text-white placeholder:text-white/40';
    } else {
      cls += ' bg-white/95 border-2 border-gray-200 rounded-xl px-4 py-3 placeholder:text-gray-400';
    }
  }

  // Text color
  if (useLight) {
    cls += ' text-white placeholder:text-white/40';
  } else {
    cls += ' text-gray-800 placeholder:text-gray-400';
  }

  // Focus ring — use standard Tailwind ring classes (dynamic values don't work in Tailwind)
  // The accent glow is applied via getInputFocusStyle() inline styles
  if (useLight) {
    cls += ' focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-white/10';
  } else {
    cls += ' focus-visible:ring-2 focus-visible:ring-offset-1';
  }

  return cls;
}

/** Input classes with left icon padding */
export function getInputWithIconClasses(design: PortalDesignConfig): string {
  const base = getInputClasses(design);

  if (design.inputStyle === 'underline') {
    return base; // underline already has px-1
  }

  if (design.inputStyle === 'pill') {
    return base.replace('px-4', 'pl-10 pr-4');
  } else if (design.inputStyle === 'square') {
    return base.replace('px-3', 'pl-10 pr-3');
  } else {
    return base.replace('px-4', 'pl-10 pr-4');
  }
}

// ────────────────────────────────────────────────────────────
// Button Classes (based on buttonStyle + buttonSize)
// ────────────────────────────────────────────────────────────

export interface ButtonStyleResult {
  className: string;
  style: React.CSSProperties;
}

export function getButtonClasses(
  design: PortalDesignConfig,
  accentColor?: string
): ButtonStyleResult {
  const color = accentColor || design.accentColor || '#14b8a6';
  const glass = isCardTransparent(design);
  const dark = isDarkBackground(design);

  let className = 'w-full font-semibold transition-all duration-200 disabled:opacity-75 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98] h-12';
  let style: React.CSSProperties = {};

  // Size (height override)
  switch (design.buttonSize) {
    case 'large':
      className += ' px-6 text-base !h-14';
      break;
    case 'small':
      className += ' px-4 text-sm !h-10';
      break;
    default:
      className += ' px-5 text-sm';
      break;
  }

  // Style type — premium styling with gradient, shadow, and hover scale
  switch (design.buttonStyle) {
    case 'gradient': {
      className += ' text-white hover:opacity-95 hover:scale-[1.02]';
      const gf = design.gradientFrom || color;
      const gt = design.gradientTo || color;
      style = {
        background: `linear-gradient(135deg, ${gf} 0%, ${gt} 50%, ${gf} 100%)`,
        backgroundSize: '200% 100%',
        boxShadow: dark
          ? `0 6px 20px ${color}50, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)`
          : `0 6px 20px ${color}40, 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)`,
      };
      break;
    }
    case 'outlined': {
      // Outlined button: always use accent color, text adapts to card bg
      if (glass && dark) {
        className += ' border-2 border-white/40 text-white hover:bg-white/10 bg-transparent';
        style = {};
      } else {
        className += ' border-2 bg-transparent hover:opacity-90';
        style = { borderColor: color, color };
      }
      break;
    }
    case 'pill': {
      className += ' text-white hover:opacity-95 hover:scale-[1.02]';
      style = { backgroundColor: color, borderRadius: '9999px', boxShadow: dark ? `0 6px 20px ${color}45, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)` : `0 6px 20px ${color}35, 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)` };
      break;
    }
    case 'rounded': {
      className += ' text-white hover:opacity-95 hover:scale-[1.02]';
      style = { backgroundColor: color, borderRadius: '0.5rem', boxShadow: dark ? `0 6px 20px ${color}45, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)` : `0 6px 20px ${color}35, 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)` };
      break;
    }
    default: {
      // filled — clean professional button
      className += ' text-white hover:opacity-95 hover:scale-[1.02]';
      style = { backgroundColor: color, boxShadow: dark ? `0 6px 20px ${color}45, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)` : `0 6px 20px ${color}35, 0 2px 8px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.2)` };
      break;
    }
  }

  // Border radius from form style (except pill/rounded which are already set)
  if (design.buttonStyle !== 'pill' && design.buttonStyle !== 'rounded') {
    if (design.formStyle === 'pill') {
      style.borderRadius = '9999px';
    } else if (design.formStyle === 'square') {
      style.borderRadius = '0';
    } else if (glass) {
      // Keep default from buttonStyle
    } else {
      style.borderRadius = '0.75rem';
    }
  }

  return { className, style };
}

// ────────────────────────────────────────────────────────────
// Icon color inside inputs
// ────────────────────────────────────────────────────────────

/**
 * Icon color for input icons.
 * - Dark page background → white/low-opacity icons (all styles semi-transparent)
 * - Light page background → gray icons (card is white)
 */
export function getIconColor(design: PortalDesignConfig): string {
  const dark = isDarkBackground(design);
  if (dark) return 'rgba(255,255,255,0.35)'; // subtler — matches /portal/captive muted feel
  return '#9ca3af'; // gray-400
}

// ────────────────────────────────────────────────────────────
// Input focus border color
// ────────────────────────────────────────────────────────────

export function getInputFocusStyle(design: PortalDesignConfig): React.CSSProperties {
  const accent = design.accentColor || '#14b8a6';
  const dark = isDarkBackground(design);
  return {
    borderColor: accent,
    boxShadow: dark
      ? `0 0 0 1px ${accent}60, 0 0 24px -4px ${accent}40, inset 0 1px 0 rgba(255,255,255,0.05)`
      : `0 0 0 1px ${accent}50, 0 0 20px -4px ${accent}30, inset 0 1px 2px rgba(0,0,0,0.04)`,
  };
};

// ────────────────────────────────────────────────────────────
// Animation classes (based on animationType)
// ────────────────────────────────────────────────────────────

export function getAnimationClasses(design: PortalDesignConfig): string {
  switch (design.animationType) {
    case 'fade':
      return 'animate-in fade-in duration-500';
    case 'slide_up':
      return 'animate-in slide-in-from-bottom-4 duration-500';
    case 'zoom':
      return 'animate-in zoom-in-95 duration-500';
    case 'none':
    default:
      return '';
  }
}

// ─�───────────────────────────────────────────────────────────
// Social media icon helper
// ────────────────────────────────────────────────────────────

export function getSocialIconLabel(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'facebook': return 'f';
    case 'instagram': return 'IG';
    case 'twitter': return 'X';
    case 'linkedin': return 'in';
    case 'youtube': return '\u25B6';
    case 'tripadvisor': return 'TA';
    default: return platform.charAt(0).toUpperCase();
  }
}

// ────────────────────────────────────────────────────────────
// Merge design config with defaults
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// Visual Enhancement CSS Generators
// ────────────────────────────────────────────────────────────

/** Generate SVG-based background pattern overlay CSS */
export function getPatternOverlayCSS(design: PortalDesignConfig): React.CSSProperties {
  const pattern = design.patternOverlay || 'none';
  if (pattern === 'none') return {};
  
  const color = design.patternColor || design.accentColor || '#ffffff';
  const opacity = ((design.patternOpacity ?? 5) / 100).toFixed(2);
  const svgColor = color + Math.round((design.patternOpacity ?? 5) / 100 * 255).toString(16).padStart(2, '0');
  
  let svg = '';
  const size = 24;
  
  switch (pattern) {
    case 'dots':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="2" cy="2" r="1" fill="${svgColor}"/></svg>`;
      break;
    case 'lines':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 ${size/2}h${size}" stroke="${svgColor}" stroke-width="0.5" fill="none"/></svg>`;
      break;
    case 'mesh':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${size/2} 0v${size}M0 ${size/2}h${size}" stroke="${svgColor}" stroke-width="0.3" fill="none"/></svg>`;
      break;
    case 'circles':
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/3}" stroke="${svgColor}" stroke-width="0.5" fill="none"/></svg>`;
      break;
    default:
      return {};
  }
  
  const encoded = encodeURIComponent(svg);
  return {
    backgroundImage: `url("data:image/svg+xml,${encoded}")`,
    backgroundRepeat: 'repeat',
    backgroundSize: `${size}px ${size}px`,
  };
}

/** Get card border styles */
export function getCardBorderCSS(design: PortalDesignConfig): React.CSSProperties {
  const borderColor = design.cardBorderColor || (design.accentColor || '#ffffff') + '20';
  const borderWidth = design.cardBorderWidth ?? 1;
  if (borderWidth === 0) return { border: 'none' };
  return {
    border: `${borderWidth}px solid ${borderColor}`,
  };
}

/** Get card background opacity (for glass/minimal styles) */
export function getCardBgOpacity(design: PortalDesignConfig, dark: boolean): string {
  const opacity = (design.cardOpacity ?? 6) / 100;
  if (dark) return `rgba(0,0,0,${opacity})`;
  return `rgba(255,255,255,${Math.min(opacity + 0.86, 0.98).toFixed(2)})`;
}

/**
 * Get the form card's inline background style based on formStyle.
 * - glass: semi-transparent + backdrop blur
 * - minimal: transparent (no bg)
 * - rounded/square/pill: solid white (light) or dark slate (dark)
 *
 * This replaces the old hardcoded `rgba(255,255,255,0.06)` / `rgba(255,255,255,0.92)`
 * that always produced a glass-like card regardless of the formStyle setting.
 */
export function getCardBackgroundStyle(design: PortalDesignConfig, dark: boolean): React.CSSProperties {
  const formStyle = design.formStyle || 'rounded';

  if (formStyle === 'minimal') {
    return { backgroundColor: 'transparent' };
  }

  if (formStyle === 'glass') {
    const opacity = (design.cardOpacity ?? 6) / 100;
    return {
      backgroundColor: dark
        ? `rgba(255,255,255,${Math.max(opacity, 0.04).toFixed(2)})`
        : `rgba(255,255,255,${Math.max(opacity + 0.7, 0.75).toFixed(2)})`,
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    };
  }

  // rounded, square, pill — solid card
  return {
    backgroundColor: dark ? 'rgba(17,24,39,0.96)' : 'rgba(255,255,255,0.98)',
  };
}

/**
 * Get the form card's border style based on formStyle and cardBorderColor.
 */
export function getCardBorderStyle(design: PortalDesignConfig, dark: boolean): React.CSSProperties {
  const borderWidth = design.cardBorderWidth ?? 1;
  if (borderWidth === 0) return { border: 'none' };

  const borderColor = design.cardBorderColor ||
    (design.formStyle === 'glass'
      ? (dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)')
      : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'));

  return { border: `${borderWidth}px solid ${borderColor}` };
}

/** Get spacing value scaled by spacingScale */
export function getSpacing(design: PortalDesignConfig, basePx: number): number {
  return Math.round(basePx * (design.spacingScale ?? 1));
}

/** Get heading font size scaled by headingSize multiplier */
export function getHeadingFontSize(design: PortalDesignConfig, baseRem: number): string {
  return `${(baseRem * (design.headingSize ?? 1)).toFixed(2)}rem`;
}

/** Get input border-radius, respecting override */
export function getInputBorderRadius(design: PortalDesignConfig): string {
  if (design.inputRadiusOverride) return design.inputRadiusOverride;
  switch (design.inputStyle) {
    case 'pill': return '9999px';
    case 'square': return '0';
    case 'underline': return '0';
    default: return '0.5rem';
  }
}

/** Get button border-radius, respecting override */
export function getButtonBorderRadius(design: PortalDesignConfig): string {
  if (design.buttonRadiusOverride) return design.buttonRadiusOverride;
  switch (design.buttonStyle) {
    case 'pill': return '9999px';
    case 'outlined': return '0.5rem';
    case 'gradient': return '0.75rem';
    default: return '0.5rem';
  }
}

/** Get social login button classes based on style setting */
export function getSocialButtonStyle(design: PortalDesignConfig, platform: string): React.CSSProperties {
  const style = design.socialButtonStyle || 'brand';
  const dark = isDarkBackground(design);
  const accent = design.accentColor || '#14b8a6';
  
  const brandColors: Record<string, string> = {
    google: '#4285f4',
    facebook: '#1877f2',
    apple: '#000000',
    microsoft: '#00a4ef',
  };
  const brandColor = brandColors[platform] || accent;
  
  switch (style) {
    case 'brand':
      return {
        backgroundColor: brandColor,
        color: platform === 'google' ? '#ffffff' : '#ffffff',
        border: 'none',
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        color: dark ? '#ffffff' : '#1f2937',
        border: `1.5px solid ${dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)'}`,
      };
    case 'glass':
      return {
        backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
        color: dark ? '#ffffff' : '#1f2937',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
        backdropFilter: 'blur(8px)',
      };
    case 'minimal':
    default:
      return {
        backgroundColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
        border: 'none',
      };
  }
}

/** Weather condition → SVG icon path data */
export const WEATHER_ICONS: Record<string, { path: string; viewBox: string }> = {
  clear: { path: 'M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41M12 6a6 6 0 100 12 6 6 0 000-12z', viewBox: '0 0 24 24' },
  sunny: { path: 'M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41M12 6a6 6 0 100 12 6 6 0 000-12z', viewBox: '0 0 24 24' },
  'partly-cloudy': { path: 'M17.5 19H9a7 7 0 110-14 5.5 5.5 0 0111 3.5A4.5 4.5 0 0117.5 19z', viewBox: '0 0 24 24' },
  cloudy: { path: 'M17.5 19H9a7 7 0 110-14 5.5 5.5 0 0111 3.5A4.5 4.5 0 0117.5 19z', viewBox: '0 0 24 24' },
  rain: { path: 'M16 13v6m-4-4v6m-4-2v4M17.5 19H6.5a5.5 5.5 0 01-.3-11 6.5 6.5 0 0112.8.8A4.5 4.5 0 0117.5 19z', viewBox: '0 0 24 24' },
  snow: { path: 'M8 16h.01M12 12h.01M16 16h.01M12 20h.01M4.93 4.93l2.83 2.83m4.24-4.24l.71.71M16.24 3.52l.71.71M19.07 4.93l-2.83 2.83M12 8a4 4 0 100 8 4 4 0 000-8z', viewBox: '0 0 24 24' },
  storm: { path: 'M19 16.9A5 5 0 0018 7h-1.26A8 8 0 104 15.25M13 11l-4 6h6l-4 6', viewBox: '0 0 24 24' },
  fog: { path: 'M3 15h14M3 19h18M3 11h10M3 7h6', viewBox: '0 0 24 24' },
  wind: { path: 'M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2', viewBox: '0 0 24 24' },
};

/** Map weather condition text to icon key */
export function getWeatherIconKey(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes('clear') || c.includes('sunny')) return 'clear';
  if (c.includes('cloud') && (c.includes('partly') || c.includes('few'))) return 'partly-cloudy';
  if (c.includes('cloud') || c.includes('overcast')) return 'cloudy';
  if (c.includes('rain') || c.includes('drizzle') || c.includes('shower')) return 'rain';
  if (c.includes('snow') || c.includes('sleet') || c.includes('blizzard')) return 'snow';
  if (c.includes('thunder') || c.includes('storm') || c.includes('lightning')) return 'storm';
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 'fog';
  if (c.includes('wind') || c.includes('gust')) return 'wind';
  return 'clear';
}

export function mergeDesignConfig(partial: Partial<PortalDesignConfig>): PortalDesignConfig {
  return { ...DEFAULT_PORTAL_DESIGN, ...partial };
}

// ────────────────────────────────────────────────────────────
// Logo size helper (Feature 10: Card Shadow Control)
// ────────────────────────────────────────────────────────────

/** Convert logo size label to pixel value */
export function getLogoSizePx(logoSize: string): number {
  switch (logoSize) {
    case 'small': return 40;
    case 'medium': return 56;
    case 'large': return 72;
    case 'xlarge': return 96;
    default: return 72;
  }
}

// ────────────────────────────────────────────────────────────
// Language label helper (Feature 1: Multi-Language)
// ────────────────────────────────────────────────────────────

/** Get a human-readable label for a language code */
export function getLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    es: 'Español',
    fr: 'Français',
    de: 'Deutsch',
    zh: '中文',
    ja: '日本語',
    ko: '한국어',
    ar: 'العربية',
    hi: 'हिन्दी',
    pt: 'Português',
    ru: 'Русский',
    it: 'Italiano',
    nl: 'Nederlands',
    th: 'ไทย',
    vi: 'Tiếng Việt',
    tr: 'Türkçe',
  };
  return labels[code] || code.toUpperCase();
}

// ────────────────────────────────────────────────────────────
// Social platform brand color (Feature 8: More Social Platforms)
// ────────────────────────────────────────────────────────────

/** Get the official brand color for a social media platform */
export function getSocialPlatformColor(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'instagram': return '#E4405F';
    case 'facebook': return '#1877F2';
    case 'twitter': return '#1DA1F2';
    case 'linkedin': return '#0A66C2';
    case 'youtube': return '#FF0000';
    case 'tripadvisor': return '#34E0A1';
    case 'whatsapp': return '#25D366';
    case 'tiktok': return '#000000';
    default: return '#6B7280';
  }
}

// ────────────────────────────────────────────────────────────
// Multi-Language Translation Helpers (Feature 1)
// ────────────────────────────────────────────────────────────

/**
 * Built-in translations for portal UI chrome strings (buttons, labels, etc.)
 * These cover the fixed strings that aren't admin-editable.
 * Admin-editable content (title, subtitle, etc.) uses `getLocalizedText()` with
 * the `translations` map stored in the design config.
 */
export const PORTAL_UI_STRINGS: Record<string, Record<string, string>> = {
  en: {
    connect: 'Connect',
    connectNow: 'Connect Now',
    connectToWiFi: 'Connect to WiFi',
    signIn: 'Sign In',
    signInWithRoom: 'Sign In with Room',
    voucherCode: 'Voucher Code',
    roomNumber: 'Room Number',
    lastName: 'Last Name',
    firstName: 'First Name',
    username: 'Username',
    password: 'Password',
    phoneNumber: 'Phone Number',
    emailAddress: 'Email Address',
    passport: 'Passport / ID',
    bookingId: 'Booking ID',
    verificationCode: 'Verification Code',
    verifyAndConnect: 'Verify & Connect',
    sendVerificationCode: 'Send Verification Code',
    changeNumber: 'Change number',
    resendCode: 'Resend code',
    resendIn: 'Resend in {0}s',
    termsAndConditions: 'Terms & Conditions',
    iAgreeToThe: 'I agree to the',
    emailMarketing: 'I agree to receive email marketing',
    smsMarketing: 'I agree to receive SMS marketing',
    loadingPortal: 'Loading portal...',
    connected: 'Connected!',
    sessionDetails: 'Session Details',
    duration: 'Duration',
    download: 'Download',
    upload: 'Upload',
    method: 'Method',
    connectAnotherDevice: 'Connect another device',
    disconnectLogout: 'Disconnect & Logout',
    continueBrowsing: 'Continue Browsing',
    enterRoom: 'Enter Room',
    enterVoucher: 'Enter Voucher',
    otpLogin: 'OTP Login',
    freeAccess: 'Free Access',
    freeWiFi: 'Free WiFi',
    swimmingPool: 'Swimming Pool',
    spaWellness: 'Spa & Wellness',
    restaurant: 'Restaurant',
    fitnessCenter: 'Fitness Center',
    roomService: 'Room Service',
    parking: 'Parking',
    concierge: 'Concierge',
    qrCodeScanned: 'QR Code scanned',
    qrCodePrefilled: 'your voucher code has been pre-filled',
    clickToConnect: 'Click below to connect to the WiFi network',
    weWillSendCode: "We'll send a verification code to your phone",
    enterCodeSentTo: 'Enter the 6-digit code sent to',
    pleaseEnter: 'Please enter',
    sessionTimeout: 'session timeout',
    openAccessDesc: 'Click below to connect to the WiFi network',
    specialOffer: 'Special Offer',
    weatherSetLocation: 'Weather — set location in designer',
    poweredBy: 'Powered by StaySuite Hospitality OS',
    thankYouForFeedback: 'Thank you for your feedback!',
    timeRemaining: 'Time Remaining',
    dataUsage: 'Data Usage',
    usedOf: '{0} of {1}',
    noDataLimit: 'Unlimited',
    roomInfo: 'Room {0}',
    // Error messages (auth failure)
    authFailed: 'Authentication failed, please try again',
    voucherExpired: 'This voucher has expired. Please contact front desk for a new one.',
    voucherUsed: 'This voucher has already been used.',
    voucherInvalid: 'Invalid voucher code. Please check and try again.',
    voucherNotYetValid: 'This voucher is not yet active. Please try again later or contact front desk.',
    invalidCredentials: 'Invalid credentials, please try again',
    accountDisabled: 'This account has been disabled',
    rateLimited: 'Too many attempts, please wait',
    networkError: 'Network error, please check your connection',
    retry: 'Retry',
    // FUP (Fair Usage Policy) data cap warnings
    dataCapWarning80: 'You\'ve used 80% of your data allowance.',
    dataCapWarning95: 'You\'ve almost reached your data limit. Purchase more data to continue.',
    dataCapReached: 'Data limit reached. Your connection has been throttled.',
    // Feature: Plan Selector
    planSelector: 'Choose Your Plan',
    upgradePlan: 'Upgrade',
    currentPlan: 'Current',
    freeTag: 'FREE',
    perDay: '/day',
    dataLimitLabel: 'Data',
    noDataLimit: 'Unlimited',
    speedLabel: 'Speed',
    // Feature: Marketing Data Capture
    marketingTitle: 'Stay Connected',
    marketingDefault: 'I agree to receive promotional offers and updates',
    emailAddress: 'Email Address',
    phoneNumber: 'Phone Number',
    fullName: 'Full Name',
    subscribeBtn: 'Subscribe',
    skipBtn: 'Skip',
    // Feature: QR Code
    qrCodeTitle: 'WiFi Credentials',
    qrCodeScan: 'Scan to connect another device',
    ssidLabel: 'SSID',
    // Feature: Auto-Renewal
    autoRenewalMsg: 'Your WiFi plan will automatically renew during your stay.',
    // Feature: Speed Test
    speedTestTitle: 'Speed Test',
    startTestBtn: 'Start Speed Test',
    testingLabel: 'Testing...',
    downloadLabel: 'Download',
    uploadLabel: 'Upload',
    mbpsLabel: 'Mbps',
    speedTestSimulated: 'Simulated',
    speedRatingExcellent: 'Excellent',
    speedRatingGood: 'Good',
    speedRatingFair: 'Fair',
    runAgainBtn: 'Test Again',
    plansUnavailable: 'Plans unavailable',
  },
  es: {
    connect: 'Conectar', connectNow: 'Conectar Ahora', connectToWiFi: 'Conectar al WiFi',
    signIn: 'Iniciar Sesión', signInWithRoom: 'Iniciar con Habitación',
    voucherCode: 'Código de Voucher', roomNumber: 'Número de Habitación', lastName: 'Apellido',
    firstName: 'Nombre', username: 'Usuario', password: 'Contraseña', phoneNumber: 'Teléfono',
    emailAddress: 'Correo Electrónico', passport: 'Pasaporte / ID', bookingId: 'ID de Reserva',
    verificationCode: 'Código de Verificación', verifyAndConnect: 'Verificar y Conectar',
    sendVerificationCode: 'Enviar Código de Verificación', changeNumber: 'Cambiar número',
    resendCode: 'Reenviar código', resendIn: 'Reenviar en {0}s',
    termsAndConditions: 'Términos y Condiciones', iAgreeToThe: 'Acepto los',
    emailMarketing: 'Acepto recibir marketing por correo electrónico',
    smsMarketing: 'Acepto recibir marketing por SMS',
    loadingPortal: 'Cargando portal...', connected: '¡Conectado!', sessionDetails: 'Detalles de Sesión',
    duration: 'Duración', download: 'Descarga', upload: 'Subida', method: 'Método',
    connectAnotherDevice: 'Conectar otro dispositivo',
    disconnectLogout: 'Desconectar y Cerrar Sesión',
    continueBrowsing: 'Continuar Navegando',
    enterRoom: 'Habitación', enterVoucher: 'Voucher', otpLogin: 'OTP', freeAccess: 'Acceso Libre',
    freeWiFi: 'WiFi Gratis', swimmingPool: 'Piscina', spaWellness: 'Spa y Bienestar',
    restaurant: 'Restaurante', fitnessCenter: 'Gimnasio', roomService: 'Servicio a Habitación',
    parking: 'Estacionamiento', concierge: 'Conserjería',
    qrCodeScanned: 'Código QR escaneado', qrCodePrefilled: 'tu código de voucher se ha rellenado',
    clickToConnect: 'Haz clic abajo para conectarte a la red WiFi',
    weWillSendCode: 'Enviaremos un código de verificación a tu teléfono',
    enterCodeSentTo: 'Ingresa el código de 6 dígitos enviado a',
    pleaseEnter: 'Por favor ingresa', sessionTimeout: 'tiempo de sesión',
    openAccessDesc: 'Haz clic abajo para conectarte a la red WiFi',
    specialOffer: 'Oferta Especial', weatherSetLocation: 'Clima — configure ubicación en el diseñador',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: '¡Gracias por tu opinión!',
    timeRemaining: 'Tiempo Restante', dataUsage: 'Uso de Datos',
    usedOf: '{0} de {1}', noDataLimit: 'Ilimitado', roomInfo: 'Habitación {0}',
  },
  fr: {
    connect: 'Connexion', connectNow: 'Se Connecter Maintenant', connectToWiFi: 'Se Connecter au WiFi',
    signIn: 'Se Connecter', signInWithRoom: "Se Connecter avec la Chambre",
    voucherCode: "Code d'Accès", roomNumber: 'Numéro de Chambre', lastName: 'Nom',
    firstName: 'Prénom', username: 'Identifiant', password: 'Mot de Passe', phoneNumber: 'Téléphone',
    emailAddress: 'E-mail', passport: 'Passeport / ID', bookingId: 'ID de Réservation',
    verificationCode: 'Code de Vérification', verifyAndConnect: 'Vérifier et Se Connecter',
    sendVerificationCode: 'Envoyer le Code', changeNumber: 'Changer de numéro',
    resendCode: 'Renvoyer le code', resendIn: 'Renvoyer dans {0}s',
    termsAndConditions: "Conditions Générales", iAgreeToThe: "J'accepte les",
    emailMarketing: "J'accepte de recevoir des e-mails marketing",
    smsMarketing: "J'accepte de recevoir des SMS marketing",
    loadingPortal: 'Chargement du portail...', connected: 'Connecté !', sessionDetails: 'Détails de la Session',
    duration: 'Durée', download: 'Téléchargement', upload: 'Envoi', method: 'Méthode',
    connectAnotherDevice: 'Connecter un autre appareil',
    disconnectLogout: 'Déconnexion',
    continueBrowsing: 'Continuer la Navigation',
    enterRoom: 'Chambre', enterVoucher: "Code d'Accès", otpLogin: 'OTP', freeAccess: 'Accès Libre',
    freeWiFi: 'WiFi Gratuit', swimmingPool: 'Piscine', spaWellness: 'Spa & Bien-être',
    restaurant: 'Restaurant', fitnessCenter: 'Salle de Sport', roomService: 'Service en Chambre',
    parking: 'Parking', concierge: 'Conciergerie',
    qrCodeScanned: 'Code QR scanné', qrCodePrefilled: "votre code d'accès a été pré-rempli",
    clickToConnect: 'Cliquez ci-dessous pour vous connecter au WiFi',
    weWillSendCode: 'Nous enverrons un code de vérification à votre téléphone',
    enterCodeSentTo: 'Entrez le code à 6 chiffres envoyé à',
    pleaseEnter: 'Veuillez entrer', sessionTimeout: 'durée de session',
    openAccessDesc: 'Cliquez ci-dessous pour vous connecter au WiFi',
    specialOffer: 'Offre Spéciale', weatherSetLocation: 'Météo — configurez la localisation',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'Merci pour votre avis !',
    timeRemaining: 'Temps Restant', dataUsage: 'Utilisation des Données',
    usedOf: '{0} sur {1}', noDataLimit: 'Illimité', roomInfo: 'Chambre {0}',
  },
  de: {
    connect: 'Verbinden', connectNow: 'Jetzt Verbinden', connectToWiFi: 'Mit WiFi Verbinden',
    signIn: 'Anmelden', signInWithRoom: 'Mit Zimmer Anmelden',
    voucherCode: 'Gutscheincode', roomNumber: 'Zimmernummer', lastName: 'Nachname',
    firstName: 'Vorname', username: 'Benutzername', password: 'Passwort', phoneNumber: 'Telefonnummer',
    emailAddress: 'E-Mail-Adresse', passport: 'Reisepass / ID', bookingId: 'Buchungs-ID',
    verificationCode: 'Verifizierungscode', verifyAndConnect: 'Verifizieren & Verbinden',
    sendVerificationCode: 'Code Senden', changeNumber: 'Nummer ändern',
    resendCode: 'Code erneut senden', resendIn: 'Erneut senden in {0}s',
    termsAndConditions: 'AGB', iAgreeToThe: 'Ich akzeptiere die',
    emailMarketing: 'Ich stimme E-Mail-Marketing zu',
    smsMarketing: 'Ich stimme SMS-Marketing zu',
    loadingPortal: 'Portal wird geladen...', connected: 'Verbunden!', sessionDetails: 'Sitzungsdetails',
    duration: 'Dauer', download: 'Download', upload: 'Upload', method: 'Methode',
    connectAnotherDevice: 'Anderes Gerät verbinden',
    disconnectLogout: 'Trennen & Abmelden',
    continueBrowsing: 'Weiter Surfen',
    enterRoom: 'Zimmer', enterVoucher: 'Gutschein', otpLogin: 'OTP', freeAccess: 'Freier Zugang',
    freeWiFi: 'Kostenloses WiFi', swimmingPool: 'Swimmingpool', spaWellness: 'Spa & Wellness',
    restaurant: 'Restaurant', fitnessCenter: 'Fitnesscenter', roomService: 'Zimmerservice',
    parking: 'Parkplatz', concierge: 'Concierge',
    qrCodeScanned: 'QR-Code gescannt', qrCodePrefilled: 'Ihr Gutscheincode wurde ausgefüllt',
    clickToConnect: 'Klicken Sie unten, um sich mit dem WiFi zu verbinden',
    weWillSendCode: 'Wir senden einen Verifizierungscode an Ihr Telefon',
    enterCodeSentTo: 'Geben Sie den 6-stelligen Code ein, gesendet an',
    pleaseEnter: 'Bitte geben Sie', sessionTimeout: 'Sitzungsdauer',
    openAccessDesc: 'Klicken Sie unten, um sich mit dem WiFi zu verbinden',
    specialOffer: 'Sonderangebot', weatherSetLocation: 'Wetter — Standort im Designer einstellen',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'Vielen Dank für Ihr Feedback!',
    timeRemaining: 'Verbleibende Zeit', dataUsage: 'Datenverbrauch',
    usedOf: '{0} von {1}', noDataLimit: 'Unbegrenzt', roomInfo: 'Zimmer {0}',
  },
  hi: {
    connect: 'कनेक्ट करें', connectNow: 'अभी कनेक्ट करें', connectToWiFi: 'WiFi से कनेक्ट करें',
    signIn: 'साइन इन', signInWithRoom: 'कमरे से साइन इन',
    voucherCode: 'वाउचर कोड', roomNumber: 'कमरा नंबर', lastName: 'अंतिम नाम',
    firstName: 'पहला नाम', username: 'उपयोगकर्ता नाम', password: 'पासवर्ड', phoneNumber: 'फ़ोन नंबर',
    emailAddress: 'ईमेल पता', passport: 'पासपोर्ट / ID', bookingId: 'बुकिंग ID',
    verificationCode: 'सत्यापन कोड', verifyAndConnect: 'सत्यापित करें और कनेक्ट करें',
    sendVerificationCode: 'सत्यापन कोड भेजें', changeNumber: 'नंबर बदलें',
    resendCode: 'कोड दोबारा भेजें', resendIn: '{0}s में दोबारा भेजें',
    termsAndConditions: 'नियम और शर्तें', iAgreeToThe: 'मैं स्वीकार करता हूं',
    emailMarketing: 'मैं ईमेल मार्केटिंग प्राप्त करने के लिए सहमत हूं',
    smsMarketing: 'मैं SMS मार्केटिंग प्राप्त करने के लिए सहमत हूं',
    loadingPortal: 'पोर्टल लोड हो रहा है...', connected: 'कनेक्ट हो गया!', sessionDetails: 'सत्र विवरण',
    duration: 'अवधि', download: 'डाउनलोड', upload: 'अपलोड', method: 'विधि',
    connectAnotherDevice: 'अन्य डिवाइस कनेक्ट करें',
    disconnectLogout: 'डिस्कनेक्ट और लॉगआउट',
    continueBrowsing: 'ब्राउज़िंग जारी रखें',
    enterRoom: 'कमरा दर्ज करें', enterVoucher: 'वाउचर', otpLogin: 'OTP', freeAccess: 'मुफ्त एक्सेस',
    freeWiFi: 'मुफ्त WiFi', swimmingPool: 'स्विमिंग पूल', spaWellness: 'स्पा और वेलनेस',
    restaurant: 'रेस्टोरेंट', fitnessCenter: 'फिटनेस सेंटर', roomService: 'रूम सर्विस',
    parking: 'पार्किंग', concierge: 'कॉन्सियर्ज',
    qrCodeScanned: 'QR कोड स्कैन किया गया', qrCodePrefilled: 'आपका वाउचर कोड भर दिया गया है',
    clickToConnect: 'WiFi से कनेक्ट करने के लिए नीचे क्लिक करें',
    weWillSendCode: 'हम आपके फ़ोन पर एक सत्यापन कोड भेजेंगे',
    enterCodeSentTo: 'भेजा गया 6 अंकों का कोड दर्ज करें',
    pleaseEnter: 'कृपया दर्ज करें', sessionTimeout: 'सत्र अवधि',
    openAccessDesc: 'WiFi से कनेक्ट करने के लिए नीचे क्लिक करें',
    specialOffer: 'विशेष ऑफर', weatherSetLocation: 'मौसम — डिज़ाइनर में स्थान सेट करें',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'आपके फ़ीडबैक के लिए धन्यवाद!',
    timeRemaining: 'शेष समय', dataUsage: 'डेटा उपयोग',
    usedOf: '{0} / {1}', noDataLimit: 'असीमित', roomInfo: 'कमरा {0}',
  },
  zh: {
    connect: '连接', connectNow: '立即连接', connectToWiFi: '连接WiFi',
    signIn: '登录', signInWithRoom: '房间登录',
    voucherCode: '凭证码', roomNumber: '房间号', lastName: '姓',
    firstName: '名', username: '用户名', password: '密码', phoneNumber: '电话号码',
    emailAddress: '电子邮箱', passport: '护照/身份证', bookingId: '预订号',
    verificationCode: '验证码', verifyAndConnect: '验证并连接',
    sendVerificationCode: '发送验证码', changeNumber: '更换号码',
    resendCode: '重新发送', resendIn: '{0}秒后重发',
    termsAndConditions: '条款与条件', iAgreeToThe: '我同意',
    emailMarketing: '我同意接收邮件营销',
    smsMarketing: '我同意接收短信营销',
    loadingPortal: '正在加载门户...', connected: '已连接！', sessionDetails: '会话详情',
    duration: '时长', download: '下载', upload: '上传', method: '方式',
    connectAnotherDevice: '连接其他设备',
    disconnectLogout: '断开并退出',
    continueBrowsing: '继续浏览',
    enterRoom: '房间', enterVoucher: '凭证', otpLogin: 'OTP', freeAccess: '免费接入',
    freeWiFi: '免费WiFi', swimmingPool: '游泳池', spaWellness: '水疗中心',
    restaurant: '餐厅', fitnessCenter: '健身中心', roomService: '客房服务',
    parking: '停车场', concierge: '礼宾部',
    qrCodeScanned: '二维码已扫描', qrCodePrefilled: '您的凭证码已自动填入',
    clickToConnect: '点击下方连接WiFi',
    weWillSendCode: '我们将向您手机发送验证码',
    enterCodeSentTo: '输入发送至以下号码的6位验证码',
    pleaseEnter: '请输入', sessionTimeout: '会话时长',
    openAccessDesc: '点击下方连接WiFi',
    specialOffer: '特别优惠', weatherSetLocation: '天气 — 在设计器中设置位置',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: '感谢您的反馈！',
    timeRemaining: '剩余时间', dataUsage: '数据用量',
    usedOf: '{0} / {1}', noDataLimit: '不限', roomInfo: '房间 {0}',
  },
  ja: {
    connect: '接続', connectNow: '今すぐ接続', connectToWiFi: 'WiFiに接続',
    signIn: 'サインイン', signInWithRoom: '部屋番号でサインイン',
    voucherCode: 'バウチャーコード', roomNumber: '部屋番号', lastName: '姓',
    firstName: '名', username: 'ユーザー名', password: 'パスワード', phoneNumber: '電話番号',
    emailAddress: 'メールアドレス', passport: 'パスポート/ID', bookingId: '予約ID',
    verificationCode: '認証コード', verifyAndConnect: '認証して接続',
    sendVerificationCode: '認証コードを送信', changeNumber: '番号を変更',
    resendCode: '再送信', resendIn: '{0}秒後に再送信',
    termsAndConditions: '利用規約', iAgreeToThe: '同意します',
    emailMarketing: 'メールマーケティングを受け取ることに同意します',
    smsMarketing: 'SMSマーケティングを受け取ることに同意します',
    loadingPortal: 'ポータルを読み込み中...', connected: '接続完了！', sessionDetails: 'セッション詳細',
    duration: '時間', download: 'ダウンロード', upload: 'アップロード', method: '方法',
    connectAnotherDevice: '別のデバイスを接続',
    disconnectLogout: '切断＆ログアウト',
    continueBrowsing: 'ブラウジングを続ける',
    enterRoom: '部屋番号', enterVoucher: 'バウチャー', otpLogin: 'OTP', freeAccess: '無料アクセス',
    freeWiFi: '無料WiFi', swimmingPool: 'プール', spaWellness: 'スパ',
    restaurant: 'レストラン', fitnessCenter: 'フィットネス', roomService: 'ルームサービス',
    parking: '駐車場', concierge: 'コンシェルジュ',
    qrCodeScanned: 'QRコード読取完了', qrCodePrefilled: 'バウチャーコードが入力されました',
    clickToConnect: 'WiFiに接続するには下のボタンをクリック',
    weWillSendCode: '認証コードをお電話番号に送信します',
    enterCodeSentTo: '送信された6桁のコードを入力してください',
    pleaseEnter: '入力してください', sessionTimeout: 'セッション時間',
    openAccessDesc: 'WiFiに接続するには下のボタンをクリック',
    specialOffer: '特別オファー', weatherSetLocation: '天気 — デザイナーで位置を設定',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'フィードバックありがとうございます！',
    timeRemaining: '残り時間', dataUsage: 'データ使用量',
    usedOf: '{0} / {1}', noDataLimit: '無制限', roomInfo: '部屋 {0}',
  },
  ar: {
    connect: 'اتصال', connectNow: 'اتصل الآن', connectToWiFi: 'اتصل بالواي فاي',
    signIn: 'تسجيل الدخول', signInWithRoom: 'تسجيل الدخول بالغرفة',
    voucherCode: 'كود القسيمة', roomNumber: 'رقم الغرفة', lastName: 'اسم العائلة',
    firstName: 'الاسم الأول', username: 'اسم المستخدم', password: 'كلمة المرور', phoneNumber: 'رقم الهاتف',
    emailAddress: 'البريد الإلكتروني', passport: 'جواز السفر / الهوية', bookingId: 'رقم الحجز',
    verificationCode: 'رمز التحقق', verifyAndConnect: 'تحقق واتصل',
    sendVerificationCode: 'إرسال رمز التحقق', changeNumber: 'تغيير الرقم',
    resendCode: 'إعادة الإرسال', resendIn: 'إعادة الإرسال خلال {0} ثانية',
    termsAndConditions: 'الشروط والأحكام', iAgreeToThe: 'أوافق على',
    emailMarketing: 'أوافق على تلقي التسويق عبر البريد الإلكتروني',
    smsMarketing: 'أوافق على تلقي التسويق عبر الرسائل القصيرة',
    loadingPortal: 'جاري تحميل البوابة...', connected: 'متصل!', sessionDetails: 'تفاصيل الجلسة',
    duration: 'المدة', download: 'التنزيل', upload: 'الرفع', method: 'الطريقة',
    connectAnotherDevice: 'الاتصال بجهاز آخر',
    disconnectLogout: 'قطع الاتصال وتسجيل الخروج',
    continueBrowsing: 'متابعة التصفح',
    enterRoom: 'الغرفة', enterVoucher: 'القسيمة', otpLogin: 'OTP', freeAccess: 'وصول مجاني',
    freeWiFi: 'واي فاي مجاني', swimmingPool: 'حمام السباحة', spaWellness: 'السبا',
    restaurant: 'المطعم', fitnessCenter: 'صالة الألعاب الرياضية', roomService: 'خدمة الغرف',
    parking: 'موقف السيارات', concierge: 'الكونسيرج',
    qrCodeScanned: 'تم مسح رمز QR', qrCodePrefilled: 'تم ملء كود القسيمة',
    clickToConnect: 'انقر أدناه للاتصال بشبكة الواي فاي',
    weWillSendCode: 'سنرسل رمز التحقق إلى هاتفك',
    enterCodeSentTo: 'أدخل الرمز المكون من 6 أرقام المرسل إلى',
    pleaseEnter: 'الرجاء إدخال', sessionTimeout: 'مدة الجلسة',
    openAccessDesc: 'انقر أدناه للاتصال بشبكة الواي فاي',
    specialOffer: 'عرض خاص', weatherSetLocation: 'الطقس — ضبط الموقع في المصمم',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'شكرا لملاحظاتك!',
    timeRemaining: 'الوقت المتبقي', dataUsage: 'استخدام البيانات',
    usedOf: '{0} من {1}', noDataLimit: 'غير محدود', roomInfo: 'غرفة {0}',
  },
  pt: {
    connect: 'Conectar', connectNow: 'Conectar Agora', connectToWiFi: 'Conectar ao WiFi',
    signIn: 'Entrar', signInWithRoom: 'Entrar com Quarto',
    voucherCode: 'Código do Voucher', roomNumber: 'Número do Quarto', lastName: 'Sobrenome',
    firstName: 'Nome', username: 'Usuário', password: 'Senha', phoneNumber: 'Telefone',
    emailAddress: 'E-mail', passport: 'Passaporte / ID', bookingId: 'ID da Reserva',
    verificationCode: 'Código de Verificação', verifyAndConnect: 'Verificar e Conectar',
    sendVerificationCode: 'Enviar Código', changeNumber: 'Alterar número',
    resendCode: 'Reenviar código', resendIn: 'Reenviar em {0}s',
    termsAndConditions: 'Termos e Condições', iAgreeToThe: 'Eu concordo com os',
    emailMarketing: 'Concordo em receber marketing por e-mail',
    smsMarketing: 'Concordo em receber marketing por SMS',
    loadingPortal: 'Carregando portal...', connected: 'Conectado!', sessionDetails: 'Detalhes da Sessão',
    duration: 'Duração', download: 'Download', upload: 'Upload', method: 'Método',
    connectAnotherDevice: 'Conectar outro dispositivo',
    disconnectLogout: 'Desconectar e Sair',
    continueBrowsing: 'Continuar Navegando',
    enterRoom: 'Quarto', enterVoucher: 'Voucher', otpLogin: 'OTP', freeAccess: 'Acesso Livre',
    freeWiFi: 'WiFi Grátis', swimmingPool: 'Piscina', spaWellness: 'Spa & Bem-estar',
    restaurant: 'Restaurante', fitnessCenter: 'Academia', roomService: 'Serviço de Quarto',
    parking: 'Estacionamento', concierge: 'Concierge',
    qrCodeScanned: 'Código QR escaneado', qrCodePrefilled: 'seu código de voucher foi preenchido',
    clickToConnect: 'Clique abaixo para conectar à rede WiFi',
    weWillSendCode: 'Enviaremos um código de verificação para seu telefone',
    enterCodeSentTo: 'Digite o código de 6 dígitos enviado para',
    pleaseEnter: 'Por favor insira', sessionTimeout: 'duração da sessão',
    openAccessDesc: 'Clique abaixo para conectar à rede WiFi',
    specialOffer: 'Oferta Especial', weatherSetLocation: 'Clima — configure localização no designer',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: 'Obrigado pelo seu feedback!',
    timeRemaining: 'Tempo Restante', dataUsage: 'Uso de Dados',
    usedOf: '{0} de {1}', noDataLimit: 'Ilimitado', roomInfo: 'Quarto {0}',
  },
  ko: {
    connect: '연결', connectNow: '지금 연결', connectToWiFi: 'WiFi 연결',
    signIn: '로그인', signInWithRoom: '객실로 로그인',
    voucherCode: '바우처 코드', roomNumber: '객실 번호', lastName: '성',
    firstName: '이름', username: '사용자 이름', password: '비밀번호', phoneNumber: '전화번호',
    emailAddress: '이메일 주소', passport: '여권/신분증', bookingId: '예약 번호',
    verificationCode: '인증 코드', verifyAndConnect: '인증 및 연결',
    sendVerificationCode: '인증 코드 보내기', changeNumber: '번호 변경',
    resendCode: '재전송', resendIn: '{0}초 후 재전송',
    termsAndConditions: '이용약관', iAgreeToThe: '동의합니다',
    emailMarketing: '이메일 마케팅 수신에 동의합니다',
    smsMarketing: 'SMS 마케팅 수신에 동의합니다',
    loadingPortal: '포털 로딩 중...', connected: '연결 완료!', sessionDetails: '세션 상세',
    duration: '시간', download: '다운로드', upload: '업로드', method: '방식',
    connectAnotherDevice: '다른 기기 연결',
    disconnectLogout: '연결 해제 및 로그아웃',
    continueBrowsing: '계속 둘러보기',
    enterRoom: '객실', enterVoucher: '바우처', otpLogin: 'OTP', freeAccess: '무료 접속',
    freeWiFi: '무료 WiFi', swimmingPool: '수영장', spaWellness: '스파',
    restaurant: '레스토랑', fitnessCenter: '피트니스 센터', roomService: '룸서비스',
    parking: '주차장', concierge: '콘시어지',
    qrCodeScanned: 'QR 코드 스캔 완료', qrCodePrefilled: '바우처 코드가 입력되었습니다',
    clickToConnect: 'WiFi에 연결하려면 아래를 클릭하세요',
    weWillSendCode: '휴대전화로 인증 코드를 보내드립니다',
    enterCodeSentTo: '전송된 6자리 코드를 입력하세요',
    pleaseEnter: '입력해 주세요', sessionTimeout: '세션 시간',
    openAccessDesc: 'WiFi에 연결하려면 아래를 클릭하세요',
    specialOffer: '특별 오퍼', weatherSetLocation: '날씨 — 디자이너에서 위치 설정',
    poweredBy: 'Powered by StaySuite Hospitality OS', thankYouForFeedback: '피드백 감사합니다!',
    timeRemaining: '남은 시간', dataUsage: '데이터 사용량',
    usedOf: '{0} / {1}', noDataLimit: '무제한', roomInfo: '객실 {0}',
  },
};

/**
 * Get a localized UI string (for portal chrome/buttons/labels).
 * Falls back to English if the language or key is missing.
 */
export function getUIString(lang: string, key: string, fallback = ''): string {
  const langStrings = PORTAL_UI_STRINGS[lang] || PORTAL_UI_STRINGS.en;
  return langStrings[key] || fallback || PORTAL_UI_STRINGS.en[key] || key;
}

/**
 * Get localized admin-defined content (title, subtitle, etc.)
 * Checks design.translations[lang][fieldKey] first, then falls back to design[fieldKey].
 */
export function getLocalizedText(
  design: { translations?: Record<string, Record<string, string>>; [key: string]: unknown },
  fieldKey: string,
  language: string,
): string {
  // Map of PortalDesignConfig field names to translation keys
  const fieldToTranslationKey: Record<string, string> = {
    title: 'title',
    subtitle: 'subtitle',
    welcomeMessage: 'welcomeMessage',
    termsText: 'termsText',
    promotionTitle: 'promotionTitle',
    promotionDesc: 'promotionDesc',
    hotelName: 'hotelName',
    hotelAddress: 'hotelAddress',
  };

  const tKey = fieldToTranslationKey[fieldKey] || fieldKey;
  const langTranslations = design.translations?.[language];
  if (langTranslations && langTranslations[tKey]) {
    return langTranslations[tKey];
  }
  // Fallback to the default language translations
  const defaultLang = (design.defaultLanguage as string) || 'en';
  if (defaultLang !== language) {
    const defaultTranslations = design.translations?.[defaultLang];
    if (defaultTranslations && defaultTranslations[tKey]) {
      return defaultTranslations[tKey];
    }
  }
  // Final fallback to the raw design field
  return (design[fieldKey] as string) || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Google Font Detection
// ═══════════════════════════════════════════════════════════════════════════════

/** System/stack fonts that do NOT need Google Fonts loading */
const SYSTEM_FONT_KEYWORDS = [
  'system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
  'ui-sans-serif', 'ui-serif', 'ui-monospace',
  '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue',
  'Helvetica', 'Arial', 'Times New Roman', 'Times', 'Georgia', 'Cambria',
  'Courier New', 'Verdana', 'Trebuchet MS', 'Tahoma', 'Lucida',
  'Geneva', 'Palatino', 'Garamond',
];

/**
 * Given a CSS font-family value (e.g. "Poppins, sans-serif"),
 * returns the primary font name if it is NOT a known system font
 * (and thus likely needs a Google Fonts <link>), or null otherwise.
 */
export function needsGoogleFont(fontFamily: string): string | null {
  if (!fontFamily || typeof fontFamily !== 'string') return null;
  const primary = fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
  if (!primary) return null;
  // Skip if it matches a system font keyword (case-insensitive)
  const lower = primary.toLowerCase();
  if (SYSTEM_FONT_KEYWORDS.some(sf => lower === sf.toLowerCase())) return null;
  return primary;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RTL (Right-to-Left) Language Support
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set of RTL language codes supported by the portal.
 * Arabic (ar), Hebrew (he), Farsi/Persian (fa), Urdu (ur).
 */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * Returns true if the given language code is an RTL (right-to-left) language.
 */
export function isRTL(language: string): boolean {
  return RTL_LANGUAGES.has((language || '').toLowerCase().split('-')[0]);
}

/**
 * Returns the text direction for a given language code: 'rtl' or 'ltr'.
 */
export function getDirection(language: string): 'ltr' | 'rtl' {
  return isRTL(language) ? 'rtl' : 'ltr';
}
