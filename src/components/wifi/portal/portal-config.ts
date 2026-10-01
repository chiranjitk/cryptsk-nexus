'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// Portal Config — Types, Constants, Templates, and Helpers
// Extracted from portal-page.tsx for H2 refactoring (Task 2-a)
// ═══════════════════════════════════════════════════════════════════════════════

import React from 'react';
import {
  Palette, Plus, Edit2, Trash2, Copy, Eye, Settings, Lock, Unlock,
  Smartphone, Ticket, Building, User, Zap, Monitor, CheckCircle2,
  XCircle, Save, RotateCcw, AlertTriangle, Printer, QrCode,
  UserRound, Wifi, Mail, Calendar, Clock, ScanLine, Layout, Type,
  Image, ImagePlus, Loader2, FormInput, Sparkles, Tablet, Star,
  MapPin, Phone, Globe, Instagram, Facebook, Twitter, Coffee,
  Waves, Dumbbell, UtensilsCrossed, Car, ArrowRight, ArrowRightLeft,
  Layers, Wand2, ShieldCheck, Download, Upload, ArrowDownToLine,
  ArrowUpFromLine, Router, RefreshCw, Undo2, Redo2, ChevronUp,
  ChevronDown, BarChart3, ExternalLink, PlusCircle, MinusCircle,
  Languages, Megaphone, MessageSquare, Thermometer, FileText,
  GripVertical, CalendarDays, Linkedin, Youtube, MessageCircle, Tv,
  Wine, Baby, Plane, Bath, Shirt, Music, Camera, Umbrella, Key,
  CreditCard, UserPlus, Gauge, KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ═══════════════════════════════════════════════════════════════════════════════
// Static Config — Credential Format Mapping
// ═══════════════════════════════════════════════════════════════════════════════

export type CredentialCategory = 'room' | 'name' | 'contact' | 'email' | 'document' | 'booking' | 'custom';

export const CREDENTIAL_FORMAT_MAP: Record<string, CredentialCategory> = {
  room_random: 'room', room_only: 'room', lastname_room: 'room',
  firstinitial_lastname_room: 'room', lastname_firstinitial_room: 'room',
  firstinitial_lastname: 'name', lastname_random: 'name',
  mobile: 'contact', last4_mobile: 'contact', mobile_random: 'contact',
  email_prefix: 'email', passport: 'document', booking_id: 'booking', custom_prefix: 'custom',
};

export interface AutoFields {
  firstName: boolean; lastName: boolean; roomNumber: boolean;
  phone: boolean; email: boolean; passport: boolean; bookingId: boolean;
  username: boolean; password: boolean; voucherCode: boolean; terms: boolean;
}

export function getAutoFields(category: CredentialCategory): AutoFields {
  const base: AutoFields = { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: true, password: true, voucherCode: false, terms: true };
  switch (category) {
    case 'room': return { ...base, roomNumber: true };
    case 'name': return { ...base, firstName: true, lastName: true };
    case 'contact': return { ...base, phone: true };
    case 'email': return { ...base, email: true };
    case 'document': return { ...base, passport: true };
    case 'booking': return { ...base, bookingId: true };
    default: return base;
  }
}

// Auth flow → default field configuration (auto-suggests when admin changes auth flow)
export const AUTH_FLOW_FIELD_DEFAULTS: Record<string, AutoFields> = {
  pms_credentials: { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: true,  password: true,  voucherCode: false, terms: true },
  room_number:     { firstName: false, lastName: true,  roomNumber: true,  phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  voucher:         { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: true, terms: true },
  sms_otp:         { firstName: false, lastName: false, roomNumber: false, phone: true,  email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  open_access:     { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  mac_auth:        { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: false },
  social:          { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  ldap:            { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: true, password: true, voucherCode: false, terms: true },
};

export const CREDENTIAL_CATEGORY_LABELS: Record<CredentialCategory, string> = {
  room: 'Room-Based', name: 'Name-Based', contact: 'Contact-Based',
  email: 'Email-Based', document: 'Document-Based', booking: 'Booking-Based', custom: 'Custom',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Template System — 8 Pre-Built Hotel Themes
// ═══════════════════════════════════════════════════════════════════════════════

export interface DesignSettings {
  layoutType: 'centered' | 'split_left' | 'split_right' | 'card' | 'full_bleed' | 'hero_banner' | 'side_panel' | 'bottom_sheet';
  backgroundType: 'solid' | 'gradient' | 'image' | 'video';
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
  logoSize: 'small' | 'medium' | 'large';
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
  // Feature 1: Multi-Language
  enableMultiLanguage: boolean;
  languages: string[];
  defaultLanguage: string;
  translations: Record<string, Record<string, string>>;
  // Feature 2: Marketing Opt-In
  marketingOptIn: { enabled: boolean; emailConsent: boolean; phoneConsent: boolean; consentText: string };
  // Feature 3: Carousel
  useCarouselMode: boolean;
  promotions: Array<{ title: string; description: string; imageUrl: string; linkUrl: string; bgColor: string }>;
  // Feature 4: Survey
  surveyConfig: { enabled: boolean; question: string; options: string[]; thankYouMessage: string };
  // Feature 5: Weather
  weatherLocation: string;
  // Feature 6: Terms
  termsText: string;
  termsUrl: string;
  // Feature 7: Custom Amenities
  customAmenities: Array<{ name: string; icon: string }>;
  // Feature 9: Content Block Order
  contentBlockOrder: string[];
  // Feature 14: Scheduling
  scheduleConfig: { enabled: boolean; schedules: Array<{ name: string; days: boolean[]; startTime: string; endTime: string }> };
  // Feature 15: Portal Ad Campaigns
  showAds: boolean;
  adSlotType: string;
  // Feature: Plan Selector
  enablePlanSelector: boolean;
  planSelectorConfig: {
    showPricing: boolean;
    showDataLimit: boolean;
    showSpeed: boolean;
    allowUpgrade: boolean;
  };
  // Feature: Marketing Data Capture (post social auth)
  enableMarketingCapture: boolean;
  marketingCaptureConfig: {
    collectEmail: boolean;
    collectPhone: boolean;
    collectName: boolean;
    consentText: string;
    required: boolean;
  };
  // Feature: QR Code on Success Screen
  enableQrCode: boolean;
  qrCodeConfig: {
    showOnSuccess: boolean;
    qrSize: 'small' | 'medium' | 'large';
    includeSSID: boolean;
  };
  // Feature: Auto-Renewal (Extended Stay)
  enableAutoRenewal: boolean;
  autoRenewalConfig: {
    renewBeforeExpiryHours: number;
    maxRenewalCycles: number;
    notifyGuest: boolean;
  };
  // Feature: Speed Test
  enableSpeedTest: boolean;
  speedTestConfig: {
    showOnSuccess: boolean;
    testDuration: number;
  };
  // ── Visual Enhancement Properties ──
  /** Background pattern overlay: 'none' | 'dots' | 'lines' | 'mesh' | 'circles' */
  patternOverlay: string;
  /** Pattern overlay opacity 0-15 (percentage) */
  patternOpacity: number;
  /** Pattern color (hex), defaults to accentColor */
  patternColor: string;
  /** Card background opacity 0-100. Only for glass/minimal forms. Default 6 */
  cardOpacity: number;
  /** Card border color (hex), empty = auto from accent */
  cardBorderColor: string;
  /** Card border width 0-4px. Default 1 */
  cardBorderWidth: number;
  /** Individual input border-radius override. Empty string = use formStyle. Values: '4px','8px','12px','9999px','0' */
  inputRadiusOverride: string;
  /** Individual button border-radius override. Empty string = use buttonStyle. Values: '4px','8px','12px','9999px','0' */
  buttonRadiusOverride: string;
  /** Content spacing scale 0.5-2.0. Default 1 */
  spacingScale: number;
  /** Heading font size multiplier 0.8-1.5. Default 1 */
  headingSize: number;
  /** Social login button style: 'brand' | 'outline' | 'glass' | 'minimal' */
  socialButtonStyle: string;
  /** Show confetti animation on success screen */
  showConfetti: boolean;
  /** Custom submit button label. Empty = auto from auth method */
  buttonLabel: string;
  // Feature 10: Splash/Welcome Screen
  enableSplashScreen: boolean;
  splashDuration: number;
  splashImageUrl: string;
  splashMessage: string;
  // Feature 11: Video Background
  backgroundVideoUrl: string;
  backgroundVideoPoster: string;
  backgroundVideoMuted: boolean;
  backgroundVideoLoop: boolean;
  // Feature 12: Per-Device Template Auto-Switch
  enablePerDevice: boolean;
  perDeviceOverrides: {
    phone?: Partial<DesignSettings>;
    tablet?: Partial<DesignSettings>;
    desktop?: Partial<DesignSettings>;
  };
}

export const DEFAULT_CONTENT_BLOCKS = ['ads', 'promotion', 'logo', 'title', 'hotelInfo', 'form', 'amenities', 'social', 'clock', 'weather'];

export const DEFAULT_SETTINGS: DesignSettings = {
  layoutType: 'centered', backgroundType: 'solid',
  gradientFrom: '#0f766e', gradientTo: '#134e4a', gradientAngle: 135,
  backgroundOverlay: 40, fontFamily: 'Inter', headingFontFamily: 'Inter',
  formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled',
  buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade', logoSize: 'large',
  welcomeMessage: 'Enjoy your stay with us',
  hotelName: 'StaySuite Hotel', hotelAddress: '123 Hospitality Ave', hotelPhone: '+1-555-0100', hotelWebsite: 'www.staysuite.com',
  showHotelInfo: false,
  amenities: ['Free WiFi', 'Swimming Pool', 'Spa & Wellness', 'Restaurant', 'Fitness Center', 'Room Service'],
  showAmenities: false, showSocialMedia: false,
  socialLinks: [{ platform: 'instagram', url: '' }, { platform: 'facebook', url: '' }, { platform: 'twitter', url: '' },
    { platform: 'linkedin', url: '' }, { platform: 'youtube', url: '' }, { platform: 'tripadvisor', url: '' }, { platform: 'whatsapp', url: '' }, { platform: 'tiktok', url: '' }],
  showClock: false, showWeather: false,
  promotionTitle: 'Special Offer', promotionDesc: 'Book 3 nights, get the 4th free!', showPromotion: false,
  // Feature 1: Multi-Language
  enableMultiLanguage: false, languages: ['en'], defaultLanguage: 'en', translations: {},
  // Feature 2: Marketing Opt-In
  marketingOptIn: { enabled: false, emailConsent: true, phoneConsent: false, consentText: 'I agree to receive promotional offers and updates from the hotel' },
  // Feature 3: Carousel
  useCarouselMode: false, promotions: [{ title: 'Special Offer', description: 'Book 3 nights, get the 4th free!', imageUrl: '', linkUrl: '', bgColor: '#f59e0b' }],
  // Feature 4: Survey
  surveyConfig: { enabled: false, question: 'How was your stay?', options: ['Excellent', 'Good', 'Average', 'Poor'], thankYouMessage: 'Thank you for your feedback!' },
  // Feature 5: Weather
  weatherLocation: '',
  // Feature 6: Terms
  termsText: '', termsUrl: '',
  // Feature 7: Custom Amenities
  customAmenities: [],
  // Feature 9: Content Block Order
  contentBlockOrder: [...DEFAULT_CONTENT_BLOCKS],
  // Feature 14: Scheduling
  scheduleConfig: { enabled: false, schedules: [] },
  // Feature 15: Portal Ad Campaigns
  showAds: false,
  adSlotType: 'banner',
  // Plan Selector
  enablePlanSelector: false,
  planSelectorConfig: { showPricing: true, showDataLimit: true, showSpeed: true, allowUpgrade: true },
  // Marketing Data Capture
  enableMarketingCapture: false,
  marketingCaptureConfig: { collectEmail: true, collectPhone: false, collectName: true, consentText: 'I agree to receive promotional offers and updates', required: false },
  // QR Code
  enableQrCode: false,
  qrCodeConfig: { showOnSuccess: true, qrSize: 'medium', includeSSID: true },
  // Auto-Renewal
  enableAutoRenewal: false,
  autoRenewalConfig: { renewBeforeExpiryHours: 2, maxRenewalCycles: 10, notifyGuest: true },
  // Speed Test
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
  // Feature 12: Per-Device Template Auto-Switch
  enablePerDevice: false,
  perDeviceOverrides: {},
};

export interface PortalTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  design: Partial<DesignSettings>;
  colors: { bg: string; text: string; accent: string; gradientFrom?: string; gradientTo?: string };
  preview: string; // CSS gradient for thumbnail
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREMIUM TEMPLATE COLLECTION — 20 Professional Themes
// Categories: Premium, Corporate, Lifestyle, Modern, Seasonal, Specialty
// ═══════════════════════════════════════════════════════════════════════════════

export const PORTAL_TEMPLATES: PortalTemplate[] = [
  // ── PREMIUM COLLECTION ──────────────────────────────────────────────────────
  {
    id: 'luxury', name: 'Royal Palace', category: 'Premium', description: 'Deep navy & gold opulence with serif elegance',
    design: { layoutType: 'split_left', backgroundType: 'solid', fontFamily: 'Inter', headingFontFamily: 'Playfair Display', formStyle: 'glass', inputStyle: 'underline', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#1a1a2e', text: '#f5f5f5', accent: '#d4af37', gradientFrom: '#1a1a2e', gradientTo: '#16213e' },
    preview: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  },
  {
    id: 'champagne', name: 'Champagne Gold', category: 'Premium', description: 'Warm ivory & rose-gold, sophisticated luxury',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#f5f0e8', gradientTo: '#e8ddd0', gradientAngle: 180, fontFamily: 'Playfair Display', headingFontFamily: 'Playfair Display', formStyle: 'glass', inputStyle: 'underline', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#f5f0e8', text: '#3d2c1e', accent: '#b76e79', gradientFrom: '#f5f0e8', gradientTo: '#e8ddd0' },
    preview: 'linear-gradient(180deg, #f5f0e8 0%, #e8ddd0 100%)',
  },
  {
    id: 'noir', name: 'Midnight Noir', category: 'Premium', description: 'Ultra-dark with emerald accents, exclusive & mysterious',
    design: { layoutType: 'split_right', backgroundType: 'solid', fontFamily: 'Montserrat', headingFontFamily: 'Playfair Display', formStyle: 'glass', inputStyle: 'underline', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'zoom' },
    colors: { bg: '#0a0a0a', text: '#e8e8e8', accent: '#059669', gradientFrom: '#0a0a0a', gradientTo: '#1a1a1a' },
    preview: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
  },
  {
    id: 'resort', name: 'Tropical Paradise', category: 'Premium', description: 'Vibrant tropical gradients with rounded playful elements',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#0ea5e9', gradientTo: '#8b5cf6', gradientAngle: 135, fontFamily: 'Poppins', headingFontFamily: 'Poppins', formStyle: 'pill', inputStyle: 'pill', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'zoom' },
    colors: { bg: '#0ea5e9', text: '#ffffff', accent: '#8b5cf6', gradientFrom: '#0ea5e9', gradientTo: '#8b5cf6' },
    preview: 'linear-gradient(135deg, #0ea5e9 0%, #8b5cf6 100%)',
  },
  {
    id: 'skyline', name: 'Skyline Penthouse', category: 'Premium', description: 'Dramatic city skyline with copper & amber tones',
    design: { layoutType: 'full_bleed', backgroundType: 'gradient', gradientFrom: '#1e1b4b', gradientTo: '#4c1d95', gradientAngle: 200, fontFamily: 'Montserrat', headingFontFamily: 'Montserrat', formStyle: 'glass', inputStyle: 'pill', buttonStyle: 'gradient', buttonSize: 'large', cardShadow: 'large', animationType: 'slide_up' },
    colors: { bg: '#1e1b4b', text: '#f5f3ff', accent: '#f59e0b', gradientFrom: '#1e1b4b', gradientTo: '#4c1d95' },
    preview: 'linear-gradient(200deg, #1e1b4b 0%, #4c1d95 100%)',
  },

  // ── CORPORATE COLLECTION ────────────────────────────────────────────────────
  {
    id: 'business', name: 'Executive Suite', category: 'Corporate', description: 'Clean, professional look with sharp lines',
    design: { layoutType: 'card', backgroundType: 'solid', fontFamily: 'Inter', headingFontFamily: 'Inter', formStyle: 'square', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade' },
    colors: { bg: '#f8fafc', text: '#1e293b', accent: '#2563eb', gradientFrom: '#f8fafc', gradientTo: '#e2e8f0' },
    preview: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
  },
  {
    id: 'airport', name: 'Airport Lounge', category: 'Corporate', description: 'Sleek silver & navy, premium travel feel',
    design: { layoutType: 'split_left', backgroundType: 'gradient', gradientFrom: '#1e3a5f', gradientTo: '#0f172a', gradientAngle: 180, fontFamily: 'Inter', headingFontFamily: 'Montserrat', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade' },
    colors: { bg: '#1e3a5f', text: '#e2e8f0', accent: '#60a5fa', gradientFrom: '#1e3a5f', gradientTo: '#0f172a' },
    preview: 'linear-gradient(180deg, #1e3a5f 0%, #0f172a 100%)',
  },
  {
    id: 'cowork', name: 'Co-Working Space', category: 'Corporate', description: 'Bold coral & slate, energetic modern workspace',
    design: { layoutType: 'centered', backgroundType: 'solid', fontFamily: 'Poppins', headingFontFamily: 'Poppins', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'medium', animationType: 'slide_up' },
    colors: { bg: '#1e293b', text: '#f1f5f9', accent: '#f97316', gradientFrom: '#1e293b', gradientTo: '#334155' },
    preview: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
  },
  {
    id: 'conference', name: 'Conference Center', category: 'Corporate', description: 'Neutral tones with authoritative teal, event-ready',
    design: { layoutType: 'card', backgroundType: 'gradient', gradientFrom: '#f1f5f9', gradientTo: '#e2e8f0', gradientAngle: 180, fontFamily: 'Roboto', headingFontFamily: 'Montserrat', formStyle: 'square', inputStyle: 'square', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#f1f5f9', text: '#0f172a', accent: '#0d9488', gradientFrom: '#f1f5f9', gradientTo: '#e2e8f0' },
    preview: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
  },

  // ── LIFESTYLE COLLECTION ────────────────────────────────────────────────────
  {
    id: 'boutique', name: 'Boutique Hotel', category: 'Lifestyle', description: 'Warm earth tones with artistic, unique personality',
    design: { layoutType: 'split_right', backgroundType: 'gradient', gradientFrom: '#92400e', gradientTo: '#78350f', gradientAngle: 160, fontFamily: 'Lato', headingFontFamily: 'Merriweather', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'large', animationType: 'slide_up' },
    colors: { bg: '#92400e', text: '#fef3c7', accent: '#f59e0b', gradientFrom: '#92400e', gradientTo: '#78350f' },
    preview: 'linear-gradient(135deg, #92400e 0%, #78350f 100%)',
  },
  {
    id: 'beach', name: 'Ocean Breeze', category: 'Lifestyle', description: 'Ocean-inspired blues with sandy warm accents',
    design: { layoutType: 'full_bleed', backgroundType: 'gradient', gradientFrom: '#0369a1', gradientTo: '#065f46', gradientAngle: 180, fontFamily: 'Open Sans', headingFontFamily: 'Montserrat', formStyle: 'glass', inputStyle: 'rounded', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'none', animationType: 'fade' },
    colors: { bg: '#0369a1', text: '#ffffff', accent: '#22d3ee', gradientFrom: '#0369a1', gradientTo: '#065f46' },
    preview: 'linear-gradient(180deg, #0369a1 0%, #065f46 100%)',
  },
  {
    id: 'mountain', name: 'Alpine Retreat', category: 'Lifestyle', description: 'Forest greens with cozy warm wood tones',
    design: { layoutType: 'card', backgroundType: 'gradient', gradientFrom: '#14532d', gradientTo: '#1c1917', gradientAngle: 150, fontFamily: 'Lato', headingFontFamily: 'Merriweather', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#14532d', text: '#fefce8', accent: '#a3e635', gradientFrom: '#14532d', gradientTo: '#1c1917' },
    preview: 'linear-gradient(150deg, #14532d 0%, #1c1917 100%)',
  },
  {
    id: 'mediterranean', name: 'Mediterranean Villa', category: 'Lifestyle', description: 'Terracotta & azure, sun-drenched coastal charm',
    design: { layoutType: 'split_right', backgroundType: 'gradient', gradientFrom: '#c2410c', gradientTo: '#9a3412', gradientAngle: 170, fontFamily: 'Lato', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'medium', animationType: 'slide_up' },
    colors: { bg: '#c2410c', text: '#fff7ed', accent: '#fbbf24', gradientFrom: '#c2410c', gradientTo: '#9a3412' },
    preview: 'linear-gradient(170deg, #c2410c 0%, #9a3412 100%)',
  },
  {
    id: 'spa', name: 'Spa & Wellness', category: 'Lifestyle', description: 'Sage & lavender, calming zen-like serenity',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#e8e0d4', gradientTo: '#d4c5b2', gradientAngle: 180, fontFamily: 'Lato', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade' },
    colors: { bg: '#e8e0d4', text: '#3d3226', accent: '#7c9a82', gradientFrom: '#e8e0d4', gradientTo: '#d4c5b2' },
    preview: 'linear-gradient(180deg, #e8e0d4 0%, #d4c5b2 100%)',
  },
  {
    id: 'golf', name: 'Golf & Country Club', category: 'Lifestyle', description: 'Classic green & cream, prestigious country club',
    design: { layoutType: 'split_left', backgroundType: 'gradient', gradientFrom: '#14532d', gradientTo: '#365314', gradientAngle: 160, fontFamily: 'Merriweather', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#14532d', text: '#fefce8', accent: '#fbbf24', gradientFrom: '#14532d', gradientTo: '#365314' },
    preview: 'linear-gradient(160deg, #14532d 0%, #365314 100%)',
  },

  // ── MODERN COLLECTION ───────────────────────────────────────────────────────
  {
    id: 'urban', name: 'City Hotel', category: 'Modern', description: 'Sleek dark theme with neon accent highlights',
    design: { layoutType: 'centered', backgroundType: 'solid', fontFamily: 'Inter', headingFontFamily: 'Inter', formStyle: 'minimal', inputStyle: 'underline', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'none', animationType: 'slide_up' },
    colors: { bg: '#09090b', text: '#fafafa', accent: '#06b6d4', gradientFrom: '#09090b', gradientTo: '#18181b' },
    preview: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
  },
  {
    id: 'minimal', name: 'Clean Minimal', category: 'Modern', description: 'Ultra-clean white design with subtle teal accents',
    design: { layoutType: 'centered', backgroundType: 'solid', fontFamily: 'Inter', headingFontFamily: 'Inter', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'small', animationType: 'none' },
    colors: { bg: '#ffffff', text: '#18181b', accent: '#0d9488', gradientFrom: '#ffffff', gradientTo: '#f0fdfa' },
    preview: 'linear-gradient(135deg, #ffffff 0%, #f0fdfa 100%)',
  },
  {
    id: 'neon', name: 'Neon Nights', category: 'Modern', description: 'Dark base with vivid electric gradients, cyber-modern',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#0c0c1d', gradientTo: '#1a0a2e', gradientAngle: 135, fontFamily: 'Montserrat', headingFontFamily: 'Montserrat', formStyle: 'glass', inputStyle: 'pill', buttonStyle: 'gradient', buttonSize: 'large', cardShadow: 'large', animationType: 'zoom' },
    colors: { bg: '#0c0c1d', text: '#f0f0ff', accent: '#a855f7', gradientFrom: '#0c0c1d', gradientTo: '#1a0a2e' },
    preview: 'linear-gradient(135deg, #0c0c1d 0%, #1a0a2e 100%)',
  },
  {
    id: 'glassmorphism', name: 'Frosted Glass', category: 'Modern', description: 'Translucent glass panels on vivid gradient, trendy',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#6366f1', gradientTo: '#ec4899', gradientAngle: 135, fontFamily: 'Inter', headingFontFamily: 'Inter', formStyle: 'glass', inputStyle: 'pill', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#6366f1', text: '#ffffff', accent: '#fbbf24', gradientFrom: '#6366f1', gradientTo: '#ec4899' },
    preview: 'linear-gradient(135deg, #6366f1 0%, #ec4899 100%)',
  },
  {
    id: 'eco', name: 'Eco Green', category: 'Modern', description: 'Sustainable green palette with organic earthy feel',
    design: { layoutType: 'card', backgroundType: 'gradient', gradientFrom: '#d1fae5', gradientTo: '#a7f3d0', gradientAngle: 180, fontFamily: 'Open Sans', headingFontFamily: 'Montserrat', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade' },
    colors: { bg: '#d1fae5', text: '#064e3b', accent: '#059669', gradientFrom: '#d1fae5', gradientTo: '#a7f3d0' },
    preview: 'linear-gradient(180deg, #d1fae5 0%, #a7f3d0 100%)',
  },

  // ── SEASONAL / SPECIALTY COLLECTION ─────────────────────────────────────────
  {
    id: 'winter', name: 'Winter Wonderland', category: 'Seasonal', description: 'Icy blue & silver, magical snowy ambiance',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#1e3a5f', gradientTo: '#0c4a6e', gradientAngle: 180, fontFamily: 'Montserrat', headingFontFamily: 'Playfair Display', formStyle: 'glass', inputStyle: 'rounded', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#1e3a5f', text: '#e0f2fe', accent: '#93c5fd', gradientFrom: '#1e3a5f', gradientTo: '#0c4a6e' },
    preview: 'linear-gradient(180deg, #1e3a5f 0%, #0c4a6e 100%)',
  },
  {
    id: 'sakura', name: 'Cherry Blossom', category: 'Seasonal', description: 'Soft pink & cream, delicate Japanese-inspired spring',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#fce7f3', gradientTo: '#fbcfe8', gradientAngle: 180, fontFamily: 'Lato', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'rounded', buttonSize: 'medium', cardShadow: 'medium', animationType: 'fade' },
    colors: { bg: '#fce7f3', text: '#831843', accent: '#ec4899', gradientFrom: '#fce7f3', gradientTo: '#fbcfe8' },
    preview: 'linear-gradient(180deg, #fce7f3 0%, #fbcfe8 100%)',
  },
  {
    id: 'wedding', name: 'Wedding Venue', category: 'Specialty', description: 'Romantic blush & ivory, elegant celebration',
    design: { layoutType: 'split_right', backgroundType: 'gradient', gradientFrom: '#fdf2f8', gradientTo: '#fce7f3', gradientAngle: 180, fontFamily: 'Playfair Display', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'pill', buttonSize: 'medium', cardShadow: 'large', animationType: 'fade' },
    colors: { bg: '#fdf2f8', text: '#4a1942', accent: '#be185d', gradientFrom: '#fdf2f8', gradientTo: '#fce7f3' },
    preview: 'linear-gradient(180deg, #fdf2f8 0%, #fce7f3 100%)',
  },
  {
    id: 'casino', name: 'Casino Royale', category: 'Specialty', description: 'Rich purple & gold, glamorous high-roller vibe',
    design: { layoutType: 'split_left', backgroundType: 'gradient', gradientFrom: '#2e1065', gradientTo: '#4c1d95', gradientAngle: 150, fontFamily: 'Montserrat', headingFontFamily: 'Playfair Display', formStyle: 'glass', inputStyle: 'pill', buttonStyle: 'gradient', buttonSize: 'large', cardShadow: 'large', animationType: 'zoom' },
    colors: { bg: '#2e1065', text: '#f5f3ff', accent: '#eab308', gradientFrom: '#2e1065', gradientTo: '#4c1d95' },
    preview: 'linear-gradient(150deg, #2e1065 0%, #4c1d95 100%)',
  },
  {
    id: 'safari', name: 'Safari Lodge', category: 'Specialty', description: 'Warm amber & burnt sienna, African adventure',
    design: { layoutType: 'full_bleed', backgroundType: 'gradient', gradientFrom: '#78350f', gradientTo: '#451a03', gradientAngle: 180, fontFamily: 'Merriweather', headingFontFamily: 'Playfair Display', formStyle: 'rounded', inputStyle: 'rounded', buttonStyle: 'filled', buttonSize: 'medium', cardShadow: 'large', animationType: 'slide_up' },
    colors: { bg: '#78350f', text: '#fef3c7', accent: '#f97316', gradientFrom: '#78350f', gradientTo: '#451a03' },
    preview: 'linear-gradient(180deg, #78350f 0%, #451a03 100%)',
  },
  {
    id: 'hostel', name: 'Urban Hostel', category: 'Specialty', description: 'Colorful & youthful, backpacker-friendly energy',
    design: { layoutType: 'centered', backgroundType: 'gradient', gradientFrom: '#f97316', gradientTo: '#ef4444', gradientAngle: 135, fontFamily: 'Poppins', headingFontFamily: 'Poppins', formStyle: 'pill', inputStyle: 'pill', buttonStyle: 'pill', buttonSize: 'large', cardShadow: 'medium', animationType: 'zoom' },
    colors: { bg: '#f97316', text: '#ffffff', accent: '#fbbf24', gradientFrom: '#f97316', gradientTo: '#ef4444' },
    preview: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)',
  },
];

// ── Layout Options ────────────────────────────────────────────────────────────

export const LAYOUT_OPTIONS = [
  { value: 'centered' as const, label: 'Centered', desc: 'Form centered on background' },
  { value: 'split_left' as const, label: 'Split Left', desc: 'Image left, form right' },
  { value: 'split_right' as const, label: 'Split Right', desc: 'Form left, image right' },
  { value: 'card' as const, label: 'Floating Card', desc: 'Card floating over background' },
  { value: 'full_bleed' as const, label: 'Full Bleed', desc: 'Full-screen image with overlay' },
  { value: 'hero_banner' as const, label: 'Hero Banner', desc: 'Full-width hero with form below' },
  { value: 'side_panel' as const, label: 'Side Panel', desc: 'Slim left panel with form, right content area' },
  { value: 'bottom_sheet' as const, label: 'Bottom Sheet', desc: 'Form slides up from bottom on mobile-friendly layout' },
];

export const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter', style: 'font-sans' },
  { value: 'Poppins', label: 'Poppins', style: 'font-sans' },
  { value: 'Montserrat', label: 'Montserrat', style: 'font-sans' },
  { value: 'Open Sans', label: 'Open Sans', style: 'font-sans' },
  { value: 'Lato', label: 'Lato', style: 'font-sans' },
  { value: 'Roboto', label: 'Roboto', style: 'font-sans' },
  { value: 'Playfair Display', label: 'Playfair Display', style: 'font-serif' },
  { value: 'Merriweather', label: 'Merriweather', style: 'font-serif' },
];

export const FORM_STYLES = [
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'square' as const, label: 'Square' },
  { value: 'glass' as const, label: 'Glass' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'minimal' as const, label: 'Minimal' },
];

export const INPUT_STYLES = [
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'square' as const, label: 'Square' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'underline' as const, label: 'Underline' },
];

export const BUTTON_STYLES = [
  { value: 'filled' as const, label: 'Filled' },
  { value: 'outlined' as const, label: 'Outlined' },
  { value: 'gradient' as const, label: 'Gradient' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'rounded' as const, label: 'Rounded' },
];

export const AMENITY_ICONS: Record<string, typeof Wifi> = {
  'Free WiFi': Wifi, 'Swimming Pool': Waves, 'Spa & Wellness': Sparkles,
  'Restaurant': UtensilsCrossed, 'Fitness Center': Dumbbell, 'Room Service': Coffee,
  'Parking': Car, 'Concierge': Star,
};

// ── New Feature Constants ──────────────────────────────────────────────────

export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'zh', label: '中文', flag: '🇨🇳' },
  { value: 'ja', label: '日本語', flag: '🇯🇵' },
  { value: 'ko', label: '한국어', flag: '🇰🇷' },
  { value: 'ar', label: 'العربية', flag: '🇸🇦' },
  { value: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { value: 'pt', label: 'Português', flag: '🇧🇷' },
  { value: 'ru', label: 'Русский', flag: '🇷🇺' },
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
  { value: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { value: 'th', label: 'ไทย', flag: '🇹🇭' },
  { value: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { value: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];

export const CUSTOM_AMENITY_ICONS: Record<string, typeof Wifi> = {
  Wifi, Waves, Sparkles, UtensilsCrossed, Dumbbell, Coffee, Car, Star,
  Tv, Wine, Baby, Plane, Bath, Shirt, Music, Camera, Umbrella,
};

export const CUSTOM_AMENITY_ICON_OPTIONS = [
  { value: 'Wifi', label: 'WiFi' },
  { value: 'Waves', label: 'Pool' },
  { value: 'Sparkles', label: 'Spa' },
  { value: 'UtensilsCrossed', label: 'Restaurant' },
  { value: 'Dumbbell', label: 'Gym' },
  { value: 'Coffee', label: 'Room Service' },
  { value: 'Car', label: 'Parking' },
  { value: 'Star', label: 'Concierge' },
  { value: 'Tv', label: 'TV' },
  { value: 'Wine', label: 'Wine Bar' },
  { value: 'Baby', label: 'Kids Club' },
  { value: 'Plane', label: 'Airport Shuttle' },
  { value: 'Bath', label: 'Bathtub' },
  { value: 'Shirt', label: 'Laundry' },
  { value: 'Music', label: 'Music' },
  { value: 'Camera', label: 'Photo' },
  { value: 'Umbrella', label: 'Beach' },
];

export const SOCIAL_PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500 dark:text-pink-400' },
  { value: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600 dark:text-blue-400' },
  { value: 'twitter', label: 'Twitter / X', icon: Twitter, color: 'text-sky-500 dark:text-sky-400' },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-700 dark:text-blue-300' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500 dark:text-red-400' },
  { value: 'tripadvisor', label: 'TripAdvisor', icon: MessageCircle, color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'whatsapp', label: 'WhatsApp', icon: Smartphone, color: 'text-green-500 dark:text-green-400' },
  { value: 'tiktok', label: 'TikTok', icon: Tv, color: 'text-gray-800 dark:text-gray-200' },
];

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const CONTENT_BLOCK_LABELS: Record<string, string> = {
  ads: 'Ad Campaign', promotion: 'Promotion', logo: 'Logo', title: 'Title', hotelInfo: 'Hotel Info',
  form: 'Login Form', amenities: 'Amenities', social: 'Social Media',
  clock: 'Clock', weather: 'Weather',
};

// ── Tab Definitions ───────────────────────────────────────────────────────────

export const TABS = [
  { id: 'portals', label: 'Portal Instances', icon: Monitor },
  { id: 'auth-methods', label: 'Auth Methods', icon: Key },
  { id: 'mappings', label: 'Pool Mappings', icon: ArrowRightLeft },
  { id: 'designer', label: 'Portal Designer', icon: Palette },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'vouchers', label: 'Voucher Designer', icon: Ticket },
  { id: 'print-cards', label: 'Print Cards', icon: Printer },
  { id: 'whitelist', label: 'Walled Garden', icon: ShieldCheck },
] as const;

export type TabId = (typeof TABS)[number]['id'];

// ── Designer Sub-Tab Definitions ──────────────────────────────────────────────

export const DESIGNER_SUBTABS = [
  { id: 'templates', label: 'Templates', icon: Sparkles },
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'background', label: 'Background', icon: Image },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'formstyle', label: 'Form & Button', icon: FormInput },
  { id: 'content', label: 'Content', icon: Layers },
  { id: 'fields', label: 'Fields', icon: Settings },
  { id: 'advanced', label: 'Advanced', icon: Wand2 },
] as const;

export type DesignerSubTab = (typeof DESIGNER_SUBTABS)[number]['id'];

// ── Auth Flow Options ─────────────────────────────────────────────────────────

export const AUTH_FLOW_OPTIONS = [
  { value: 'pms_credentials', label: 'PMS Credentials', icon: User, color: 'text-primary', desc: 'Username & password from PMS/WiFi user database' },
  { value: 'room_number', label: 'Room Number', icon: Building, color: 'text-emerald-500 dark:text-emerald-400', desc: 'Guest enters room number + last name' },
  { value: 'voucher', label: 'Voucher Code', icon: Ticket, color: 'text-amber-500 dark:text-amber-400', desc: 'Pre-generated voucher code (print or QR)' },
  { value: 'sms_otp', label: 'SMS OTP', icon: Smartphone, color: 'text-rose-500 dark:text-rose-400', desc: 'One-time password sent via SMS' },
  { value: 'open_access', label: 'Open Access', icon: Unlock, color: 'text-gray-500', desc: 'No credentials required — just accept terms' },
  { value: 'mac_auth', label: 'MAC Authentication', icon: ShieldCheck, color: 'text-violet-500 dark:text-violet-400', desc: 'Auto-authenticate based on registered MAC address' },
  { value: 'social', label: 'Social Login', icon: Globe, color: 'text-sky-500 dark:text-sky-400', desc: 'Login via Google, Facebook, Apple etc.' },
  { value: 'ldap', label: 'LDAP / Corporate', icon: Lock, color: 'text-orange-500 dark:text-orange-400', desc: 'Corporate LDAP directory authentication' },
] as const;

export const VOUCHER_TEMPLATES = [
  { value: 'default', label: 'Default', desc: 'Clean white card with teal accent' },
  { value: 'elegant', label: 'Elegant', desc: 'Subtle gradients with refined borders' },
  { value: 'minimal', label: 'Minimal', desc: 'Ultra-clean with minimal elements' },
  { value: 'luxury', label: 'Luxury', desc: 'Dark background with gold accents' },
] as const;

export const FIELD_DEFINITIONS: Array<{ key: keyof AutoFields; label: string; icon: typeof User; group: string }> = [
  { key: 'firstName', label: 'First Name', icon: User, group: 'Guest Identity' },
  { key: 'lastName', label: 'Last Name', icon: User, group: 'Guest Identity' },
  { key: 'roomNumber', label: 'Room Number', icon: Building, group: 'Guest Identity' },
  { key: 'phone', label: 'Phone Number', icon: Smartphone, group: 'Guest Identity' },
  { key: 'email', label: 'Email Address', icon: Mail, group: 'Guest Identity' },
  { key: 'passport', label: 'Passport / ID', icon: ScanLine, group: 'Guest Identity' },
  { key: 'bookingId', label: 'Booking ID', icon: Calendar, group: 'Guest Identity' },
  { key: 'username', label: 'Username', icon: User, group: 'Credentials' },
  { key: 'password', label: 'Password', icon: Lock, group: 'Credentials' },
  { key: 'voucherCode', label: 'Voucher Code', icon: Ticket, group: 'Credentials' },
  { key: 'terms', label: 'Terms & Conditions', icon: Settings, group: 'Legal' },
];
export interface PortalPageDesign {
  authFlow: string;
  title: string; subtitle: string; logoUrl: string;
  backgroundType: 'solid' | 'gradient' | 'image';
  backgroundColor: string; backgroundImageUrl: string;
  brandColor: string; textColor: string;
  fields: AutoFields;
  socialLogin: { google: boolean; facebook: boolean; apple: boolean };
  customCSS: string; customHTML: string;
  settings: DesignSettings;
}

export interface AaaConfig { usernameFormat: string; passwordFormat: string; credentialPrintOnVoucher?: boolean; credentialShowInPortal?: boolean; }

export const DEFAULT_DESIGN: PortalPageDesign = {
  authFlow: 'pms_credentials',
  title: 'Welcome to StaySuite', subtitle: 'Connect to our high-speed WiFi network',
  logoUrl: '', backgroundType: 'solid', backgroundColor: '#0f766e', backgroundImageUrl: '',
  brandColor: '#14b8a6', textColor: '#ffffff',
  fields: getAutoFields('custom'), socialLogin: { google: false, facebook: false, apple: false },
  customCSS: '/* Custom CSS */', customHTML: '<div class="legal-footer"><p>&copy; 2025 StaySuite Hospitality</p></div>',
  settings: { ...DEFAULT_SETTINGS },
};

export function fieldsAreEqual(a: AutoFields, b: AutoFields): boolean {
  return Object.keys(a).every((k) => a[k as keyof AutoFields] === b[k as keyof AutoFields]);
}

export function getBackgroundCSS(design: PortalPageDesign): string {
  const s = design.settings;
  if (s.backgroundType === 'gradient') {
    return `linear-gradient(${s.gradientAngle}deg, ${s.gradientFrom}, ${s.gradientTo})`;
  }
  if (s.backgroundType === 'image' && design.backgroundImageUrl) {
    return `url(${design.backgroundImageUrl}) center/cover`;
  }
  return design.backgroundColor;
}

export function getFormClasses(s: DesignSettings): string {
  let cls = '';
  if (s.formStyle === 'glass') cls += 'bg-white/10 backdrop-blur-xl border border-white/20 ';
  else if (s.formStyle === 'card') cls += 'bg-white shadow-xl ';
  else if (s.formStyle === 'minimal') cls += 'bg-transparent ';
  else cls += 'bg-white/10 backdrop-blur-md ';
  if (s.cardShadow === 'large') cls += 'shadow-2xl ';
  else if (s.cardShadow === 'medium') cls += 'shadow-xl ';
  else if (s.cardShadow === 'small') cls += 'shadow-lg ';
  else cls += '';
  if (s.formStyle === 'pill') cls += 'rounded-3xl ';
  else if (s.formStyle === 'rounded') cls += 'rounded-2xl ';
  else if (s.formStyle === 'square') cls += 'rounded-none ';
  else cls += 'rounded-2xl ';
  return cls;
}

export function getInputClasses(s: DesignSettings): string {
  const bg = s.formStyle === 'glass' || s.formStyle === 'minimal' ? 'bg-white/10 border-white/20' : 'bg-white/90 border-gray-200';
  if (s.inputStyle === 'pill') return `${bg} rounded-full px-4 py-2.5 text-xs`;
  if (s.inputStyle === 'square') return `${bg} rounded-none px-3 py-2.5 text-xs`;
  if (s.inputStyle === 'underline') return `${bg} border-0 border-b-2 px-1 py-2 text-xs bg-transparent border-white/30`;
  return `${bg} rounded-lg px-3 py-2.5 text-xs`;
}

export function getButtonClasses(s: DesignSettings): string {
  const isGlass = s.formStyle === 'glass' || s.formStyle === 'minimal';
  let cls = 'font-semibold transition-all ';
  if (s.buttonSize === 'large') cls += 'px-6 py-3 text-sm ';
  else if (s.buttonSize === 'small') cls += 'px-4 py-2 text-xs ';
  else cls += 'px-5 py-2.5 text-sm ';

  if (s.buttonStyle === 'pill') cls += 'rounded-full ';
  else if (s.buttonStyle === 'rounded') cls += 'rounded-lg ';
  else cls += 'rounded-lg ';

  if (s.buttonStyle === 'gradient') cls += `bg-gradient-to-r from-[${s.gradientFrom}] to-[${s.gradientTo}] text-white `;
  else if (s.buttonStyle === 'outlined') cls += isGlass ? 'border-2 border-white/40 text-white hover:bg-white/10 ' : 'border-2 border-teal-500 text-teal-500 dark:text-teal-400 hover:bg-teal-50 ';
  else cls += 'text-white hover:opacity-90 ';
  return cls;
}
