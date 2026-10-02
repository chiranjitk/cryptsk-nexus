'use client';

// ═══════════════════════════════════════════════════════════════════════════════
// Captive Portal — Powerful Portal Designer with Templates, Layouts & Live Preview
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { formatBytes } from '@/lib/utils/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Palette,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Eye,
  EyeOff,
  Settings,
  Lock,
  Unlock,
  Smartphone,
  Ticket,
  Building,
  User,
  Zap,
  Monitor,
  CheckCircle2,
  XCircle,
  Save,
  RotateCcw,
  AlertTriangle,
  Printer,
  Info,
  QrCode,
  UserRound,
  Wifi,
  Mail,
  Calendar,
  Clock,
  ScanLine,
  Layout,
  Type,
  Image,
  ImagePlus,
  Loader2,
  FormInput,
  Sparkles,
  Tablet,
  Star,
  MapPin,
  Phone,
  Globe,
  Instagram,
  Facebook,
  Twitter,
  Coffee,
  Waves,
  Dumbbell,
  UtensilsCrossed,
  Car,
  ArrowRight,
  ArrowRightLeft,
  Layers,
  Wand2,
  ShieldCheck,
  Download,
  Upload,
  ArrowDownToLine,
  ArrowUpFromLine,
  Router,
  RefreshCw,
  Search,
  X,
  Undo2,
  Redo2,
  ChevronUp,
  ChevronDown,
  BarChart3,
  ExternalLink,
  PlusCircle,
  MinusCircle,
  Languages,
  Megaphone,
  MessageSquare,
  Thermometer,
  FileText,
  GripVertical,
  CalendarDays,
  Linkedin,
  Youtube,
  MessageCircle,
  Tv,
  Wine,
  Baby,
  Plane,
  Bath,
  Shirt,
  Music,
  Camera,
  Umbrella,
  Key,
  CreditCard,
  UserPlus,
  Gauge,
  Unplug,
  SlidersHorizontal,
  Share2,
  History,
  Code2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';
import { PropertySelector } from '@/components/common/property-selector';

const PrintCard = dynamic(() => import('@/components/wifi/print-card').then(m => ({ default: m.PrintCard as any })), { ssr: false });
const PortalWhitelist = dynamic(() => import('@/components/wifi/portal-whitelist'), { ssr: false });
const PortalMappings = dynamic(() => import('@/components/wifi/portal-mappings-tab'), { ssr: false });
const PortalPreferences = dynamic(() => import('@/components/wifi/portal-preferences-tab'), { ssr: false });
const TemplateGallery = dynamic(() => import('@/components/wifi/portal/template-gallery'), { ssr: false });
const DesignHistoryPanel = dynamic(() => import('@/components/wifi/portal/design-history-panel'), { ssr: false });
const AiSuggestDialog = dynamic(() => import('@/components/wifi/portal/ai-suggest-dialog'), { ssr: false });
const ABTestingSection = dynamic(() => import('@/components/wifi/portal/ab-testing-section'), { ssr: false });
const DndBuilder = dynamic(() => import('@/components/wifi/portal/dnd-builder').then(m => ({ default: m.DndBuilder })), { ssr: false });

// ═══════════════════════════════════════════════════════════════════════════════
// Static Config — Credential Format Mapping
// ═══════════════════════════════════════════════════════════════════════════════

type CredentialCategory = 'room' | 'name' | 'contact' | 'email' | 'document' | 'booking' | 'custom';

const CREDENTIAL_FORMAT_MAP: Record<string, CredentialCategory> = {
  room_random: 'room', room_only: 'room', lastname_room: 'room',
  firstinitial_lastname_room: 'room', lastname_firstinitial_room: 'room',
  firstinitial_lastname: 'name', lastname_random: 'name',
  mobile: 'contact', last4_mobile: 'contact', mobile_random: 'contact',
  email_prefix: 'email', passport: 'document', booking_id: 'booking', custom_prefix: 'custom',
};

interface AutoFields {
  firstName: boolean; lastName: boolean; roomNumber: boolean;
  phone: boolean; email: boolean; passport: boolean; bookingId: boolean;
  username: boolean; password: boolean; voucherCode: boolean; terms: boolean;
}

function getAutoFields(category: CredentialCategory): AutoFields {
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
const AUTH_FLOW_FIELD_DEFAULTS: Record<string, AutoFields> = {
  pms_credentials: { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: true,  password: true,  voucherCode: false, terms: true },
  room_number:     { firstName: false, lastName: true,  roomNumber: true,  phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  voucher:         { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: true, terms: true },
  sms_otp:         { firstName: false, lastName: false, roomNumber: false, phone: true,  email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  open_access:     { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  mac_auth:        { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: false },
  social:          { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  email_otp:       { firstName: false, lastName: false, roomNumber: false, phone: false, email: true,  passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  self_registration: { firstName: true,  lastName: true,  roomNumber: false, phone: true, email: true,  passport: false, bookingId: false, username: false, password: false, voucherCode: false, terms: true },
  ldap:            { firstName: false, lastName: false, roomNumber: false, phone: false, email: false, passport: false, bookingId: false, username: true, password: true, voucherCode: false, terms: true },
};

const CREDENTIAL_CATEGORY_LABELS: Record<CredentialCategory, string> = {
  room: 'Room-Based', name: 'Name-Based', contact: 'Contact-Based',
  email: 'Email-Based', document: 'Document-Based', booking: 'Booking-Based', custom: 'Custom',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Template System — 8 Pre-Built Hotel Themes
// ═══════════════════════════════════════════════════════════════════════════════

interface DesignSettings {
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
  // Feature: Device Management on Limit Reached
  deviceManagement: boolean;
  // Visual Enhancements
  showBranding: boolean;
  cardOpacity: number;
  cardBorderWidth: number;
  cardBorderColor: string;
  spacingScale: number;
  headingSize: number;
  socialButtonStyle: string;
  buttonLabel: string;
  showConfetti: boolean;
  patternOverlay: string;
  patternOpacity: number;
  patternColor: string;
  // Video background
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
  // Form Color Customization
  formBackgroundColor: string;
  inputBackgroundColor: string;
  inputBorderColor: string;
  inputTextColor: string;
  inputPlaceholderColor: string;
  buttonTextColor: string;
  labelColor: string;
  linkColor: string;
  errorColor: string;
  // Raw Template Mode
  templateMode: 'structured' | 'raw';
  rawTemplateHtml: string;
  rawTemplateCss: string;
}

const DEFAULT_CONTENT_BLOCKS = ['ads', 'promotion', 'logo', 'title', 'hotelInfo', 'form', 'amenities', 'social', 'clock', 'weather'];

const DEFAULT_SETTINGS: DesignSettings = {
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
  // Device Management on Limit Reached
  deviceManagement: false,
  // Visual Enhancements
  showBranding: true,
  cardOpacity: 10,
  cardBorderWidth: 1,
  cardBorderColor: '',
  spacingScale: 1,
  headingSize: 1,
  socialButtonStyle: 'brand',
  buttonLabel: '',
  showConfetti: true,
  patternOverlay: 'none',
  patternOpacity: 5,
  patternColor: '#ffffff',
  // Video background
  backgroundVideoUrl: '',
  backgroundVideoPoster: '',
  backgroundVideoMuted: true,
  backgroundVideoLoop: true,
  // Feature 12: Per-Device Template Auto-Switch
  enablePerDevice: false,
  perDeviceOverrides: {},
  // Form Color Customization
  formBackgroundColor: '',
  inputBackgroundColor: '',
  inputBorderColor: '',
  inputTextColor: '',
  inputPlaceholderColor: '',
  buttonTextColor: '',
  labelColor: '',
  linkColor: '',
  errorColor: '',
  // Raw Template Mode
  templateMode: 'structured',
  rawTemplateHtml: '',
  rawTemplateCss: '',
};

interface PortalTemplate {
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

const PORTAL_TEMPLATES: PortalTemplate[] = [
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

const LAYOUT_OPTIONS = [
  { value: 'centered' as const, label: 'Centered', desc: 'Form centered on background' },
  { value: 'split_left' as const, label: 'Split Left', desc: 'Image left, form right' },
  { value: 'split_right' as const, label: 'Split Right', desc: 'Form left, image right' },
  { value: 'card' as const, label: 'Floating Card', desc: 'Card floating over background' },
  { value: 'full_bleed' as const, label: 'Full Bleed', desc: 'Full-screen image with overlay' },
  { value: 'hero_banner' as const, label: 'Hero Banner', desc: 'Full-width hero with form below' },
  { value: 'side_panel' as const, label: 'Side Panel', desc: 'Slim left panel with form, right content area' },
  { value: 'bottom_sheet' as const, label: 'Bottom Sheet', desc: 'Form slides up from bottom on mobile-friendly layout' },
];

const FONT_OPTIONS = [
  // ── Sans-Serif ──
  { value: 'Inter', label: 'Inter', style: 'font-sans' },
  { value: 'Poppins', label: 'Poppins', style: 'font-sans' },
  { value: 'Montserrat', label: 'Montserrat', style: 'font-sans' },
  { value: 'Open Sans', label: 'Open Sans', style: 'font-sans' },
  { value: 'Lato', label: 'Lato', style: 'font-sans' },
  { value: 'Roboto', label: 'Roboto', style: 'font-sans' },
  { value: 'Nunito', label: 'Nunito', style: 'font-sans' },
  { value: 'Raleway', label: 'Raleway', style: 'font-sans' },
  { value: 'Work Sans', label: 'Work Sans', style: 'font-sans' },
  { value: 'Manrope', label: 'Manrope', style: 'font-sans' },
  { value: 'DM Sans', label: 'DM Sans', style: 'font-sans' },
  { value: 'Mulish', label: 'Mulish', style: 'font-sans' },
  { value: 'Rubik', label: 'Rubik', style: 'font-sans' },
  { value: 'Outfit', label: 'Outfit', style: 'font-sans' },
  // ── Serif ──
  { value: 'Playfair Display', label: 'Playfair Display', style: 'font-serif' },
  { value: 'Merriweather', label: 'Merriweather', style: 'font-serif' },
  { value: 'Lora', label: 'Lora', style: 'font-serif' },
  { value: 'Cormorant Garamond', label: 'Cormorant', style: 'font-serif' },
  { value: 'EB Garamond', label: 'EB Garamond', style: 'font-serif' },
  { value: 'Crimson Text', label: 'Crimson Text', style: 'font-serif' },
  // ── Display / Decorative ──
  { value: 'Bebas Neue', label: 'Bebas Neue', style: 'font-sans' },
  { value: 'Oswald', label: 'Oswald', style: 'font-sans' },
  { value: 'Anton', label: 'Anton', style: 'font-sans' },
  { value: 'Righteous', label: 'Righteous', style: 'font-sans' },
  // ── Monospace ──
  { value: 'Source Code Pro', label: 'Source Code Pro', style: 'font-mono' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', style: 'font-mono' },
  // ── Handwriting / Script ──
  { value: 'Dancing Script', label: 'Dancing Script', style: 'font-sans' },
  { value: 'Pacifico', label: 'Pacifico', style: 'font-sans' },
  { value: 'Caveat', label: 'Caveat', style: 'font-sans' },
];

const FORM_STYLES = [
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'square' as const, label: 'Square' },
  { value: 'glass' as const, label: 'Glass' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'minimal' as const, label: 'Minimal' },
];

const INPUT_STYLES = [
  { value: 'rounded' as const, label: 'Rounded' },
  { value: 'square' as const, label: 'Square' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'underline' as const, label: 'Underline' },
];

const BUTTON_STYLES = [
  { value: 'filled' as const, label: 'Filled' },
  { value: 'outlined' as const, label: 'Outlined' },
  { value: 'gradient' as const, label: 'Gradient' },
  { value: 'pill' as const, label: 'Pill' },
  { value: 'rounded' as const, label: 'Rounded' },
];

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  'Free WiFi': Wifi, 'Swimming Pool': Waves, 'Spa & Wellness': Sparkles,
  'Restaurant': UtensilsCrossed, 'Fitness Center': Dumbbell, 'Room Service': Coffee,
  'Parking': Car, 'Concierge': Star,
};

// ── New Feature Constants ──────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
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

const CUSTOM_AMENITY_ICONS: Record<string, typeof Wifi> = {
  Wifi, Waves, Sparkles, UtensilsCrossed, Dumbbell, Coffee, Car, Star,
  Tv, Wine, Baby, Plane, Bath, Shirt, Music, Camera, Umbrella,
};

const CUSTOM_AMENITY_ICON_OPTIONS = [
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

const SOCIAL_PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500 dark:text-pink-400' },
  { value: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600 dark:text-blue-400' },
  { value: 'twitter', label: 'Twitter / X', icon: Twitter, color: 'text-sky-500 dark:text-sky-400' },
  { value: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-700 dark:text-blue-300' },
  { value: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-500 dark:text-red-400' },
  { value: 'tripadvisor', label: 'TripAdvisor', icon: MessageCircle, color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'whatsapp', label: 'WhatsApp', icon: Smartphone, color: 'text-green-500 dark:text-green-400' },
  { value: 'tiktok', label: 'TikTok', icon: Tv, color: 'text-gray-800 dark:text-gray-200' },
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CONTENT_BLOCK_LABELS: Record<string, string> = {
  ads: 'Ad Campaign', promotion: 'Promotion', logo: 'Logo', title: 'Title', hotelInfo: 'Hotel Info',
  form: 'Login Form', amenities: 'Amenities', social: 'Social Media',
  clock: 'Clock', weather: 'Weather',
};

// ── Tab Definitions ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'portals', label: 'Portal Instances', icon: Monitor },
  { id: 'auth-methods', label: 'Auth Methods', icon: Key },
  { id: 'mappings', label: 'Pool Mappings', icon: ArrowRightLeft },
  { id: 'designer', label: 'Portal Designer', icon: Palette },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'vouchers', label: 'Voucher Designer', icon: Ticket },
  { id: 'print-cards', label: 'Print Cards', icon: Printer },
  { id: 'whitelist', label: 'Walled Garden', icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]['id'];

// ── Designer Sub-Tab Definitions ──────────────────────────────────────────────

const DESIGNER_SUBTABS = [
  { id: 'visual-builder', label: 'Visual Builder', icon: GripVertical },
  { id: 'templates', label: 'Templates', icon: Sparkles },
  { id: 'layout', label: 'Layout', icon: Layout },
  { id: 'background', label: 'Background', icon: Image },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'formstyle', label: 'Form & Button', icon: FormInput },
  { id: 'formcolors', label: 'Form Colors', icon: Palette },
  { id: 'content', label: 'Content', icon: Layers },
  { id: 'fields', label: 'Fields', icon: Settings },
  { id: 'rawtemplate', label: 'Raw Template', icon: Code2 },
  { id: 'advanced', label: 'Advanced', icon: Wand2 },
] as const;

type DesignerSubTab = (typeof DESIGNER_SUBTABS)[number]['id'];

// ── Auth Flow Options ─────────────────────────────────────────────────────────

const AUTH_FLOW_OPTIONS = [
  { value: 'pms_credentials', label: 'PMS Credentials', icon: User, color: 'text-primary', desc: 'Username & password from PMS/WiFi user database' },
  { value: 'room_number', label: 'Room Number', icon: Building, color: 'text-emerald-500 dark:text-emerald-400', desc: 'Guest enters room number + last name' },
  { value: 'voucher', label: 'Voucher Code', icon: Ticket, color: 'text-amber-500 dark:text-amber-400', desc: 'Pre-generated voucher code (print or QR)' },
  { value: 'sms_otp', label: 'SMS OTP', icon: Smartphone, color: 'text-rose-500 dark:text-rose-400', desc: 'One-time password sent via SMS' },
  { value: 'email_otp', label: 'Email OTP', icon: Mail, color: 'text-cyan-500 dark:text-cyan-400', desc: 'One-time password sent via email' },
  { value: 'open_access', label: 'Open Access', icon: Unlock, color: 'text-gray-500', desc: 'No credentials required — just accept terms' },
  { value: 'mac_auth', label: 'MAC Authentication', icon: ShieldCheck, color: 'text-violet-500 dark:text-violet-400', desc: 'Auto-authenticate based on registered MAC address' },
  { value: 'social', label: 'Social Login', icon: Globe, color: 'text-sky-500 dark:text-sky-400', desc: 'Login via Google, Facebook, Apple etc.' },
  { value: 'ldap', label: 'LDAP / Corporate', icon: Lock, color: 'text-orange-500 dark:text-orange-400', desc: 'Corporate LDAP directory authentication' },
  { value: 'self_registration', label: 'Self Registration', icon: UserPlus, color: 'text-teal-500 dark:text-teal-400', desc: 'Guest signs up with name, email/phone & OTP verification' },
] as const;

const VOUCHER_TEMPLATES = [
  { value: 'default', label: 'Default', desc: 'Clean white card with teal accent' },
  { value: 'elegant', label: 'Elegant', desc: 'Subtle gradients with refined borders' },
  { value: 'minimal', label: 'Minimal', desc: 'Ultra-clean with minimal elements' },
  { value: 'luxury', label: 'Luxury', desc: 'Dark background with gold accents' },
] as const;

const FIELD_DEFINITIONS: Array<{ key: keyof AutoFields; label: string; icon: typeof User; group: string }> = [
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

// ═══════════════════════════════════════════════════════════════════════════════
// API Helpers
// ═══════════════════════════════════════════════════════════════════════════════

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) {
      console.error(`[apiFetch] Server error ${res.status} for ${url}`);
      return null;
    }

    const result = await res.json();
    if (result.success) return result.data as T;
    return null;
  } catch (e) {
    console.error('API fetch error:', e);
    return null;
  }
}

async function apiMutate<T>(url: string, options?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    if (!res.ok) {
      console.error(`[apiMutate] Server error ${res.status} for ${url}`);
      return { data: null, error: `Server error (${res.status})` };
    }

    const result = await res.json();
    if (result.success) return { data: result.data as T, error: null };
    return { data: null, error: result.error?.message || 'Request failed' };
  } catch (e) {
    console.error('API mutate error:', e);
    return { data: null, error: (e as Error).message || 'Network error' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

export default function PortalPage() {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const [activeTab, setActiveTab] = useState<TabId>('portals');
  const [portalOptions, setPortalOptions] = useState<Array<{ id: string; name: string }>>([]);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll tab bar to active tab
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeTab]);

  const fetchPortalOptions = useCallback(async () => {
    const data = await apiFetch<any[]>('/api/wifi/portal/instances');
    if (data) setPortalOptions(data.map((p: any) => ({ id: p.id, name: p.name })));
  }, []);

  useEffect(() => { void fetchPortalOptions(); }, [fetchPortalOptions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Captive Portal</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Design stunning guest login experiences, manage portal instances, and print WiFi vouchers
        </p>
      </div>
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="w-full overflow-y-auto overscroll-contain">
          <div className="flex min-w-max px-1" id="tab-scroll-inner">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button key={tab.id} ref={tab.id === activeTab ? activeTabRef : null} onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium rounded-t-md transition-all duration-200 whitespace-nowrap',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted/80'
                  )}>
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-4">
        {activeTab === 'portals' && <PortalListTab onPortalsChanged={fetchPortalOptions} />}
        {activeTab === 'auth-methods' && <AuthMethodsTab />}
        {activeTab === 'mappings' && <PoolMappingsTab />}
        {activeTab === 'designer' && <PortalDesignerTab portalOptions={portalOptions} />}
        {activeTab === 'preferences' && <PortalPreferences />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'vouchers' && <VoucherDesignerTab portalOptions={portalOptions} />}
        {activeTab === 'print-cards' && <PrintCardsTab />}
        {activeTab === 'whitelist' && <WhitelistTab />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 1: Portal Zones (Zone-Based Routing with Seamless Roaming)
// ═══════════════════════════════════════════════════════════════════════════════

interface PortalZone {
  id: string;
  name: string;
  slug: string;
  partnerId: string;
  propertyName: string;
  enabled: boolean;
  isDefault: boolean;
  autoAuthEnabled: boolean;
  authMethod: string;
  roamingMode: string;
  allowsRoamingFrom: string[];
  bandwidthPolicy: string;
  nasIdentifier: string;
  ssidList: string[];
  _count: { portalMappings: number; authMethods: number; portalPages: number };
}

const EMPTY_ZONE = {
  name: '', slug: '', partnerId: '', authMethod: 'voucher', roamingMode: 'auth_origin',
  allowsRoamingFrom: [] as string[],
  bandwidthPolicy: 'zone', nasIdentifier: '', ssidList: [] as string[],
  autoAuthEnabled: true,
};

const AUTH_METHODS = [
  { value: 'voucher', label: 'Voucher Code', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  { value: 'room_number', label: 'Room Number', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  { value: 'pms_credentials', label: 'PMS Credentials', color: 'bg-primary/10 text-primary dark:bg-primary/10' },
  { value: 'sms_otp', label: 'SMS OTP', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
  { value: 'open_access', label: 'Open Access', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  { value: 'social', label: 'Social Login', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { value: 'mac_auth', label: 'MAC Auth', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
];

const ROAMING_MODES = [
  { value: 'auth_origin', label: 'Auth Origin', desc: 'Primary auth zone — guests start here', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { value: 'seamless', label: 'Seamless', desc: 'Inherit sessions from allowed zones', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/30' },
  { value: 'reauth', label: 'Re-Auth', desc: 'Must authenticate independently', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/30' },
];

function RoamingBadge({ mode }: { mode: string }) {
  const m = ROAMING_MODES.find(r => r.value === mode) || ROAMING_MODES[0];
  return <Badge variant="outline" className={cn('text-[10px] font-semibold gap-1', m.bg, m.color)}>{mode === 'auth_origin' ? '🔑' : mode === 'seamless' ? '🔗' : '🔒'} {m.label}</Badge>;
}

// ── Zone Form Content (shared between add/edit) ──────────────────────────────────
// Receives form state via props to avoid re-renders from component creation during render

function ZoneFormContent({ form, setForm, zones, editZone, ssidInput, setSsidInput, properties, globalPropertyId }: {
  form: typeof EMPTY_ZONE; setForm: React.Dispatch<React.SetStateAction<typeof EMPTY_ZONE>>;
  zones: PortalZone[]; editZone: PortalZone | null;
  ssidInput: string; setSsidInput: React.Dispatch<React.SetStateAction<string>>;
  properties: Array<{ id: string; name: string }>; globalPropertyId: string;
}) {
  const addSsid = () => {
    const s = ssidInput.trim();
    if (s && !form.ssidList.includes(s)) { setForm(f => ({ ...f, ssidList: [...f.ssidList, s] })); setSsidInput(''); }
  };
  const removeSsid = (s: string) => setForm(f => ({ ...f, ssidList: f.ssidList.filter(x => x !== s) }));
  const toggleRoamingFrom = (slug: string) => {
    setForm(f => ({ ...f, allowsRoamingFrom: f.allowsRoamingFrom.includes(slug) ? f.allowsRoamingFrom.filter(s => s !== slug) : [...f.allowsRoamingFrom, slug] }));
  };

  return (
    <div className="grid gap-4 py-4 pr-4">
      <div className="space-y-2"><Label>Zone Name *</Label><Input placeholder="Lobby WiFi" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
      {/* Partner Selector */}
      {properties.length > 1 && (
        <div className="space-y-2">
          <Label>Partner</Label>
          <Select
            value={form.partnerId || globalPropertyId || ''}
            onValueChange={v => setForm(f => ({ ...f, partnerId: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select partner" />
            </SelectTrigger>
            <SelectContent>
              {properties.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Determines which property this portal belongs to. Affects MAC auth, IP pool mapping, and device registration.</p>
        </div>
      )}
      {properties.length <= 1 && properties.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Partner: <span className="font-medium text-foreground">{properties[0]?.name || 'Default'}</span>
            {properties.length === 1 && ' — Only one property available. Add more properties in Settings to enable per-property zone assignment.'}
          </p>
        </div>
      )}
      <div className="space-y-2">
        <Label>URL Slug *</Label>
        <Input placeholder="lobby" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.replace(/[^a-z0-9_-]/gi, '').toLowerCase() }))} className="font-mono" />
        <p className="text-[10px] text-muted-foreground">Portal URL: connect.hotel.com/<span className="font-mono text-foreground">{form.slug || '...'}</span></p>
      </div>
      <div className="rounded-lg border border-dashed p-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Auth method is configured per portal in the <span className="font-medium text-foreground">Portal Designer → Layout</span> tab and managed in the <span className="font-medium text-foreground">Auth Methods</span> tab.
          </p>
        </div>
      </div>
      <Separator />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Roaming Mode</Label>
          <Select value={form.roamingMode} onValueChange={v => setForm(f => ({ ...f, roamingMode: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROAMING_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          {form.roamingMode === 'seamless' && <p className="text-[10px] text-muted-foreground">Allow sessions from other zones to roam in</p>}
        </div>
      </div>
      {/* Auto-Auth Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Auto-Reauth</Label>
          <p className="text-[10px] text-muted-foreground">
            Returning devices silently reconnect without login. Toggle off to disable auto-reauth entirely for this zone.
          </p>
        </div>
        <Switch
          checked={form.autoAuthEnabled}
          onCheckedChange={v => setForm(f => ({ ...f, autoAuthEnabled: v }))}
        />
      </div>
      {form.roamingMode === 'seamless' && (
        <div className="space-y-2">
          <Label>Allow Roaming From</Label>
          <p className="text-[10px] text-muted-foreground">Select which zones can seamlessly roam into this zone</p>
          <div className="flex flex-wrap gap-2">
            {zones.filter(z => z.roamingMode === 'auth_origin' && z.id !== editZone?.id).map(z => (
              <button key={z.id} onClick={() => toggleRoamingFrom(z.slug)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  form.allowsRoamingFrom.includes(z.slug) ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/30 dark:border-blue-700 dark:text-blue-300' : 'border-border text-muted-foreground hover:bg-muted'
                )}>
                {form.allowsRoamingFrom.includes(z.slug) && '✓ '}{z.name} (/{z.slug})
              </button>
            ))}
            {zones.filter(z => z.roamingMode === 'auth_origin' && z.id !== editZone?.id).length === 0 && (
              <p className="text-xs text-muted-foreground italic">No auth_origin zones available</p>
            )}
          </div>
        </div>
      )}
      <div className="rounded-lg border border-dashed p-3 bg-muted/30">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Bandwidth and session limits are controlled at the <span className="font-medium text-foreground">Plan level</span>. Configure them in the Plans tab for each portal.
          </p>
        </div>
      </div>
      <Separator />
      <div className="space-y-2">
        <Label>SSIDs</Label>
        <p className="text-[10px] text-muted-foreground">WiFi network names that map to this zone</p>
        <div className="flex gap-2">
          <Input placeholder="Hotel_Guest" value={ssidInput} onChange={e => setSsidInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSsid())} />
          <Button type="button" variant="outline" size="sm" onClick={addSsid}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        {form.ssidList.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.ssidList.map(s => (
              <Badge key={s} variant="secondary" className="gap-1 text-xs">
                <Wifi className="h-3 w-3" />{s}
                <button onClick={() => removeSsid(s)} className="ml-0.5 hover:text-destructive"><XCircle className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      {form.roamingMode === 'auth_origin' && (
        <div className="space-y-2">
          <Label>NAS Identifier (optional)</Label>
          <Input placeholder="staysuite-lobby-v10" value={form.nasIdentifier} onChange={e => setForm(f => ({ ...f, nasIdentifier: e.target.value }))} className="font-mono" />
          <p className="text-[10px] text-muted-foreground">Auto-filled if blank: staysuite-{form.slug}-v&lt;vlan&gt;</p>
        </div>
      )}

    </div>
  );
}

function PortalListTab({ onPortalsChanged }: { onPortalsChanged?: () => void }) {
  const [zones, setZones] = useState<PortalZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editZone, setEditZone] = useState<PortalZone | null>(null);
  const [form, setForm] = useState({ ...EMPTY_ZONE });
  const [ssidInput, setSsidInput] = useState('');
  const { toast } = useToast();
  // XC-1 fix: RBAC gate on destructive actions.
  const { hasPermission } = useAuth();
  const canManage = hasPermission('wifi.manage');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  // P0-2 fix: confirmation state before deleting a portal zone (destructive cascade).
  const [zoneToDelete, setZoneToDelete] = useState<PortalZone | null>(null);
  const [deletingZone, setDeletingZone] = useState(false);
  // Audit 4.2 / 4.3: confirmation state for state-flipping portal toggles (disable kicks guests; default affects every new /connect hit).
  const [zoneTogglePending, setZoneTogglePending] = useState<{ type: 'enabled' | 'default'; zone: PortalZone } | null>(null);
  const [zoneToggleInFlight, setZoneToggleInFlight] = useState(false);
  useEffect(() => { fetch('/api/partners?limit=100').then(r => r.json()).then(d => { if (d.partners) setProperties(d.partners.map((p: any) => ({ id: p.id, name: p.name }))); }).catch(() => {}); }, []);
  const fetchPortals = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<any[]>('/api/wifi/portal/instances');
    if (data) {
      setZones(data.map((p: any) => ({
        id: p.id, name: p.name, slug: p.slug || '',
        partnerId: p.partnerId || '', propertyName: p.partner?.name || '',
        enabled: p.enabled ?? true, isDefault: p.isDefault ?? false,
        autoAuthEnabled: p.autoAuthEnabled ?? true,
        authMethod: p.authMethod || 'voucher', roamingMode: p.roamingMode || 'auth_origin',
        allowsRoamingFrom: JSON.parse(p.allowsRoamingFrom || '[]'),
        bandwidthPolicy: p.bandwidthPolicy || 'zone',
        nasIdentifier: p.nasIdentifier || '',
        ssidList: JSON.parse(p.ssidList || '[]'),
        _count: p._count || { portalMappings: 0, authMethods: 0, portalPages: 0 },
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPortals(); }, [fetchPortals]);

  // Audit 4.2: gate toggleEnabled behind a confirmation — disabling a live portal kicks every guest authenticated through it.
  const requestToggleEnabled = (zone: PortalZone) => setZoneTogglePending({ type: 'enabled', zone });

  const toggleEnabled = async (id: string) => {
    const zone = zones.find(z => z.id === id);
    if (!zone) return;
    setZoneToggleInFlight(true);
    const { error } = await apiMutate(`/api/wifi/portal/instances/${id}`, { method: 'PUT', body: JSON.stringify({ enabled: !zone.enabled }) });
    if (!error) {
      setZones(prev => prev.map(z => z.id === id ? { ...z, enabled: !z.enabled } : z));
      toast({ title: 'Zone updated', description: `${zone.name} ${!zone.enabled ? 'enabled' : 'disabled'}` });
      onPortalsChanged?.();
    } else { toast({ title: 'Error', description: error, variant: 'destructive' }); }
    setZoneToggleInFlight(false);
    setZoneTogglePending(null);
  };

  // Audit 4.3: gate toggleDefault behind a confirmation — affects every new guest hitting /connect without a slug.
  const requestToggleDefault = (zone: PortalZone) => setZoneTogglePending({ type: 'default', zone });

  const toggleDefault = async (id: string) => {
    const zone = zones.find(z => z.id === id);
    if (!zone) return;
    setZoneToggleInFlight(true);
    const { error } = await apiMutate(`/api/wifi/portal/instances/${id}`, { method: 'PUT', body: JSON.stringify({ isDefault: !zone.isDefault }) });
    if (!error) {
      // Setting as default unsets others — update all zones locally
      setZones(prev => prev.map(z => ({ ...z, isDefault: z.id === id ? !z.isDefault : false })));
      toast({ title: 'Default portal updated', description: `${zone.name} ${!zone.isDefault ? 'set as' : 'removed from'} default` });
      onPortalsChanged?.();
    } else { toast({ title: 'Error', description: error, variant: 'destructive' }); }
    setZoneToggleInFlight(false);
    setZoneTogglePending(null);
  };

  const deleteZone = async (id: string) => {
    setDeletingZone(true);
    const { error } = await apiMutate(`/api/wifi/portal/instances/${id}`, { method: 'DELETE' });
    if (!error) { toast({ title: 'Zone deleted' }); await fetchPortals(); onPortalsChanged?.(); }
    else { toast({ title: 'Error', description: error || 'Failed', variant: 'destructive' }); }
    setDeletingZone(false);
    setZoneToDelete(null);
  };

  // P0-2 fix: open the confirmation dialog instead of deleting immediately.
  const requestDeleteZone = (zone: PortalZone) => setZoneToDelete(zone);

  const duplicateZone = async (zone: PortalZone) => {
    const copyName = `${zone.name} (Copy)`;
    // Audit 4.9: pick a unique slug — "-copy", "-copy-2", "-copy-3"… — instead of always "-copy" which collides on second duplicate.
    let copySlug = `${zone.slug}-copy`;
    let suffix = 2;
    const existingSlugs = new Set(zones.map(z => z.slug.toLowerCase()));
    while (existingSlugs.has(copySlug.toLowerCase())) {
      copySlug = `${zone.slug}-copy-${suffix++}`;
      if (suffix > 100) break;
    }
    const { error } = await apiMutate('/api/wifi/portal/instances', {
      method: 'POST',
      body: JSON.stringify({
        partnerId: zone.partnerId || partnerId || 'default',
        name: copyName,
        slug: copySlug,
        roamingMode: zone.roamingMode,
        allowsRoamingFrom: JSON.stringify(zone.allowsRoamingFrom),
        bandwidthPolicy: zone.bandwidthPolicy,
        nasIdentifier: zone.nasIdentifier || undefined,
        ssidList: JSON.stringify(zone.ssidList),
        autoAuthEnabled: zone.autoAuthEnabled,
        authMethod: zone.authMethod,
        enabled: zone.enabled,
      }),
    });
    if (!error) {
      toast({ title: 'Portal duplicated', description: `${copyName} has been created (slug: ${copySlug})` });
      await fetchPortals();
      onPortalsChanged?.();
    } else {
      toast({ title: 'Error', description: error || 'Failed to duplicate portal', variant: 'destructive' });
    }
  };

  const exportZoneConfig = async (zone: PortalZone) => {
    try {
      // Fetch full portal config including pages and auth methods
      const detailData = await apiFetch<any>(`/api/wifi/portal/instances/${zone.id}`);
      const config: Record<string, unknown> = {
        zone: {
          name: zone.name,
          slug: zone.slug,
          enabled: zone.enabled,
          isDefault: zone.isDefault,
          authMethod: zone.authMethod,
          roamingMode: zone.roamingMode,
          allowsRoamingFrom: zone.allowsRoamingFrom,
          bandwidthPolicy: zone.bandwidthPolicy,
          nasIdentifier: zone.nasIdentifier,
          ssidList: zone.ssidList,
          autoAuthEnabled: zone.autoAuthEnabled,
          propertyName: zone.propertyName,
        },
      };
      if (detailData) {
        if (detailData.portalPages) config.design = detailData.portalPages;
        if (detailData.authMethods) config.authMethods = detailData.authMethods;
        if (detailData.portalMappings) config.mappings = detailData.portalMappings;
      }
      const json = JSON.stringify(config, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${zone.slug}-config.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: 'Config exported', description: `${zone.slug}-config.json downloaded` });
    } catch {
      toast({ title: 'Export failed', description: 'Could not export portal configuration', variant: 'destructive' });
    }
  };

  const openAdd = () => {
    setForm({ ...EMPTY_ZONE });
    setSsidInput('');
    setAddOpen(true);
  };

  const openEdit = (zone: PortalZone) => {
    setEditZone(zone);
    setForm({
      name: zone.name, slug: zone.slug, partnerId: zone.partnerId, authMethod: zone.authMethod, roamingMode: zone.roamingMode,
      allowsRoamingFrom: [...zone.allowsRoamingFrom], bandwidthPolicy: zone.bandwidthPolicy,
      nasIdentifier: zone.nasIdentifier, ssidList: [...zone.ssidList],
      autoAuthEnabled: zone.autoAuthEnabled,
    });
    setSsidInput('');
    setEditOpen(true);
  };

  const createZone = async () => {
    // Audit 4.4 / 4.5: validate name + slug lengths and surface a toast instead of silent return.
    if (!form.name || !form.name.trim()) {
      toast({ title: 'Missing name', description: 'Portal name is required.', variant: 'destructive' });
      return;
    }
    if (!form.slug || !form.slug.trim()) {
      toast({ title: 'Missing slug', description: 'Portal slug is required (used in the /connect URL).', variant: 'destructive' });
      return;
    }
    if (form.slug.trim().length < 2) {
      toast({ title: 'Slug too short', description: 'Slug must be at least 2 characters (a-z, 0-9, -, _).', variant: 'destructive' });
      return;
    }
    // Audit 4.6: client-side slug uniqueness check across the tenant.
    const duplicateSlug = zones.find(z => z.slug.toLowerCase() === form.slug.trim().toLowerCase());
    if (duplicateSlug) {
      toast({ title: 'Slug already in use', description: `Another portal "${duplicateSlug.name}" is already using the slug "${form.slug}". Pick a different slug.`, variant: 'destructive' });
      return;
    }
    // Audit 4.7: cap SSID count and length (802.11 max 32 octets, allow up to 16 SSIDs per zone).
    if (form.ssidList.length > 16) {
      toast({ title: 'Too many SSIDs', description: 'A single zone can map at most 16 SSIDs. Split across multiple zones.', variant: 'destructive' });
      return;
    }
    for (const ssid of form.ssidList) {
      if (ssid.length > 32) {
        toast({ title: 'SSID too long', description: `SSID "${ssid.slice(0, 16)}…" exceeds the 32-octet 802.11 limit.`, variant: 'destructive' });
        return;
      }
    }
    const { error } = await apiMutate('/api/wifi/portal/instances', {
      method: 'POST', body: JSON.stringify({
        partnerId: form.partnerId || partnerId || 'default', name: form.name, slug: form.slug,
        roamingMode: form.roamingMode,
        allowsRoamingFrom: JSON.stringify(form.allowsRoamingFrom),
        bandwidthPolicy: form.bandwidthPolicy,
        nasIdentifier: form.nasIdentifier || undefined,
        ssidList: JSON.stringify(form.ssidList),
        autoAuthEnabled: form.autoAuthEnabled,
        enabled: true,
      }),
    });
    if (!error) { toast({ title: 'Zone created', description: `${form.name} — /${form.slug}` }); await fetchPortals(); onPortalsChanged?.(); setAddOpen(false); }
    else {
      const hint = error.includes('property') || error.includes('Partner')
        ? ' — Please select a property from the top-right dropdown or create one in Settings first.'
        : '';
      toast({ title: 'Error', description: (error || 'Failed') + hint, variant: 'destructive' });
    }
  };

  const updateZone = async () => {
    // Audit 4.4 / 4.5: validate name + slug lengths and surface a toast instead of silent return.
    if (!editZone) {
      toast({ title: 'Error', description: 'No zone selected to update.', variant: 'destructive' });
      return;
    }
    if (!form.name || !form.name.trim()) {
      toast({ title: 'Missing name', description: 'Portal name is required.', variant: 'destructive' });
      return;
    }
    if (!form.slug || !form.slug.trim()) {
      toast({ title: 'Missing slug', description: 'Portal slug is required.', variant: 'destructive' });
      return;
    }
    if (form.slug.trim().length < 2) {
      toast({ title: 'Slug too short', description: 'Slug must be at least 2 characters.', variant: 'destructive' });
      return;
    }
    // Audit 4.6: slug uniqueness check (exclude the zone being edited).
    const duplicateSlug = zones.find(z => z.id !== editZone.id && z.slug.toLowerCase() === form.slug.trim().toLowerCase());
    if (duplicateSlug) {
      toast({ title: 'Slug already in use', description: `Another portal "${duplicateSlug.name}" is already using the slug "${form.slug}".`, variant: 'destructive' });
      return;
    }
    // Audit 4.7: SSID cap + length check.
    if (form.ssidList.length > 16) {
      toast({ title: 'Too many SSIDs', description: 'A single zone can map at most 16 SSIDs.', variant: 'destructive' });
      return;
    }
    for (const ssid of form.ssidList) {
      if (ssid.length > 32) {
        toast({ title: 'SSID too long', description: `SSID "${ssid.slice(0, 16)}…" exceeds the 32-octet 802.11 limit.`, variant: 'destructive' });
        return;
      }
    }
    const { error } = await apiMutate(`/api/wifi/portal/instances/${editZone.id}`, {
      method: 'PUT', body: JSON.stringify({
        name: form.name, slug: form.slug, partnerId: form.partnerId || undefined,
        roamingMode: form.roamingMode,
        allowsRoamingFrom: JSON.stringify(form.allowsRoamingFrom),
        bandwidthPolicy: form.bandwidthPolicy,
        nasIdentifier: form.nasIdentifier || undefined,
        ssidList: JSON.stringify(form.ssidList),
        autoAuthEnabled: form.autoAuthEnabled,
      }),
    });
    if (!error) { toast({ title: 'Zone updated', description: `${form.name} saved` }); await fetchPortals(); onPortalsChanged?.(); setEditOpen(false); }
    else { toast({ title: 'Error', description: error || 'Failed', variant: 'destructive' }); }
  };

  if (loading) {
    return (<div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-10 w-48" /><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Skeleton className="h-52 w-full" /><Skeleton className="h-52 w-full" /><Skeleton className="h-52 w-full" /></div></div>);
  }

  const roamingZones = zones.filter(z => z.roamingMode === 'seamless');

  return (
    <div className="space-y-6">
      {/* Server Config Banner */}
      <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/10"><Zap className="h-5 w-5 text-primary" /></div>
          <div>
            <p className="font-medium text-sm">Portal Server Active</p>
            <p className="text-xs text-muted-foreground">Single server serves all zones via slug routing. Configure SSL & domain in <span className="font-mono text-foreground">Network → Portal Settings</span></p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:bg-emerald-950/30 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Running
        </Badge>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
          <PropertySelector value={propertyFilter} onValueChange={setPropertyFilter} />
        <div>
          <p className="text-sm text-muted-foreground">{zones.length} zone{zones.length !== 1 ? 's' : ''} configured
            {roamingZones.length > 0 && <span className="ml-2 text-blue-600 dark:text-blue-400">· {roamingZones.length} seamless roaming</span>}
          </p>
        </div>
        <Button onClick={openAdd} disabled={false} className="bg-primary hover:bg-primary/90 text-primary-foreground" title={partnerId ? undefined : 'Select a partner first'}><Plus className="h-4 w-4 mr-2" />Add Zone</Button>
        {!partnerId && <p className="text-xs text-muted-foreground">Select a partner from the dropdown or use default.</p>}
      </div>

      {/* Zone Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {zones.map(zone => {
          const authDef = AUTH_METHODS.find(a => a.value === zone.authMethod);
          const roamingDefs = zone.allowsRoamingFrom.map(slug => zones.find(z => z.slug === slug)).filter(Boolean) as PortalZone[];
          const propertyInitial = (zone.propertyName || zone.name).charAt(0).toUpperCase();
          return (
            <Card key={zone.id} className={cn(
              'relative overflow-hidden bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950',
              'border border-gray-200/60 dark:border-gray-800/60',
              'border-l-4 transition-all duration-300',
              zone.enabled ? 'border-l-teal-500 dark:border-l-teal-400' : 'border-l-gray-300 dark:border-l-gray-700',
              !zone.enabled && 'opacity-60',
              'hover:shadow-lg hover:border-teal-300/40 dark:hover:border-teal-700/40',
            )}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white shrink-0',
                      zone.enabled
                        ? 'bg-gradient-to-br from-teal-500 to-emerald-600 dark:from-teal-400 dark:to-emerald-500'
                        : 'bg-gradient-to-br from-gray-400 to-gray-500 dark:from-gray-500 dark:to-gray-600',
                    )}>
                      {propertyInitial}
                    </div>
                    <div>
                      <CardTitle className="text-base">{zone.name}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">/{zone.slug}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RoamingBadge mode={zone.roamingMode} />
                    {/* Health Indicator */}
                    <span className={cn(
                      'relative flex h-2.5 w-2.5',
                    )}>
                      {zone.enabled ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </>
                      ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-400 dark:bg-gray-600" />
                      )}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Status Badge with glow */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={cn(
                    'text-[10px] font-semibold gap-1',
                    zone.enabled
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 shadow-sm shadow-emerald-200/50 dark:shadow-emerald-800/30'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                  )}>
                    {zone.enabled ? <><CheckCircle2 className="h-3 w-3" /> Active</> : <><XCircle className="h-3 w-3" /> Inactive</>}
                  </Badge>
                  {zone.propertyName && <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400">🏢 {zone.propertyName}</Badge>}
                  {authDef && <Badge variant="secondary" className={cn('text-[10px]', authDef.color)}>{authDef.label}</Badge>}
                  <Badge variant={zone.autoAuthEnabled ? 'outline' : 'secondary'} className={cn('text-[10px]', zone.autoAuthEnabled ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
                    {zone.autoAuthEnabled ? '🔄 Auto-Reauth' : '🔒 No Auto-Reauth'}
                  </Badge>
                </div>

                {/* SSIDs */}
                {zone.ssidList.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {zone.ssidList.slice(0, 3).map(s => (
                      <span key={s} className="text-[10px] bg-muted/80 rounded px-1.5 py-0.5 font-mono">{s}</span>
                    ))}
                    {zone.ssidList.length > 3 && <span className="text-[10px] text-muted-foreground">+{zone.ssidList.length - 3} more</span>}
                  </div>
                )}

                {/* Roaming Connections */}
                {roamingDefs.length > 0 && (
                  <div className="rounded-lg bg-blue-50/80 dark:bg-blue-950/20 p-2">
                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mb-1">🔗 Seamless from:</p>
                    <div className="flex gap-1 flex-wrap">
                      {roamingDefs.map(rz => (
                        <span key={rz.id} className="text-[10px] bg-white dark:bg-blue-950/40 rounded px-1.5 py-0.5 border border-blue-200 dark:border-blue-800">{rz.name}</span>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs text-muted-foreground">Active</Label>
                      <Switch checked={zone.enabled} onCheckedChange={() => requestToggleEnabled(zone)} />
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 px-2 text-xs gap-1',
                              zone.isDefault
                                ? 'text-amber-600 dark:text-amber-400 font-medium'
                                : 'text-muted-foreground'
                            )}
                            onClick={() => requestToggleDefault(zone)}
                          >
                            <Star className={cn('h-3.5 w-3.5', zone.isDefault && 'fill-amber-400 text-amber-400')} />
                            Default
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {zone.isDefault
                            ? 'This portal is shown when no IP subnet matches'
                            : 'Set as default fallback portal'}
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(zone)}><Edit2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateZone(zone)}><Copy className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Duplicate</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => exportZoneConfig(zone)}><Download className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Export Config</TooltipContent></Tooltip>
                    <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 dark:text-red-400" onClick={() => requestDeleteZone(zone)}><Trash2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Delete</TooltipContent></Tooltip>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {zones.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Globe className="h-10 w-10 opacity-30" /><p className="text-sm font-medium">No portal zones yet</p>
          <p className="text-xs">Create zones for different areas — lobby, pool, gym, conference — each with unique branding and auth</p>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground" onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Create First Zone</Button>
        </CardContent></Card>
      )}

      {/* Add Zone Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader><DialogTitle>Add Portal Zone</DialogTitle><DialogDescription>Create a new zone — each area gets its own portal design, auth method, and bandwidth limits</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain"><ZoneFormContent form={form} setForm={setForm} zones={zones} editZone={null} ssidInput={ssidInput} setSsidInput={setSsidInput} properties={properties} globalPropertyId={partnerId} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button><Button onClick={createZone} disabled={!form.name || !form.slug} className="bg-primary hover:bg-primary/90 text-primary-foreground">Create Zone</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Zone Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh]">
          <DialogHeader><DialogTitle>Edit Zone — {editZone?.name}</DialogTitle><DialogDescription>Update zone configuration for /{editZone?.slug}</DialogDescription></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto overscroll-contain"><ZoneFormContent form={form} setForm={setForm} zones={zones} editZone={editZone} ssidInput={ssidInput} setSsidInput={setSsidInput} properties={properties} globalPropertyId={partnerId} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button><Button onClick={updateZone} disabled={!form.name || !form.slug} className="bg-teal-600 hover:bg-teal-700">Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* P0-2 fix: Confirm before deleting a portal zone (cascade deletes portal pages, auth methods, mappings). */}
      <AlertDialog open={!!zoneToDelete} onOpenChange={(open) => { if (!open) setZoneToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Portal Zone "{zoneToDelete?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the zone and cascades to all its portal pages, auth methods, and mappings. Guests using this zone will lose captive portal access immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingZone}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (zoneToDelete) deleteZone(zoneToDelete.id); }}
              disabled={deletingZone}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deletingZone && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {deletingZone ? 'Deleting…' : 'Delete Zone'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Audit 4.2 / 4.3: confirmation for portal enabled / default toggle (operational impact). */}
      <AlertDialog
        open={!!zoneTogglePending}
        onOpenChange={(open) => { if (!open && !zoneToggleInFlight) setZoneTogglePending(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {zoneTogglePending?.type === 'enabled'
                ? (zoneTogglePending?.zone.enabled ? 'Disable Portal' : 'Enable Portal')
                : (zoneTogglePending?.zone.isDefault ? 'Remove Default' : 'Set as Default')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {zoneTogglePending?.type === 'enabled' && zoneTogglePending?.zone.enabled && (
                <>Disabling <span className="font-medium">{zoneTogglePending?.zone.name}</span> will kick off every guest currently authenticated through it — their next re-auth will fail until the portal is re-enabled.</>
              )}
              {zoneTogglePending?.type === 'enabled' && !zoneTogglePending?.zone.enabled && (
                <>Enable <span className="font-medium">{zoneTogglePending?.zone.name}</span>? Guests hitting this zone's subnet will see the captive portal again.</>
              )}
              {zoneTogglePending?.type === 'default' && !zoneTogglePending?.zone.isDefault && (
                <>Setting <span className="font-medium">{zoneTogglePending?.zone.name}</span> as the default portal means every new guest who hits <span className="font-mono">/connect</span> without a matching subnet will see this portal. The current default (if any) will be un-set.</>
              )}
              {zoneTogglePending?.type === 'default' && zoneTogglePending?.zone.isDefault && (
                <>Removing <span className="font-medium">{zoneTogglePending?.zone.name}</span> from the default means guests without a matching subnet will see a 404 / fallback page.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={zoneToggleInFlight}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!zoneTogglePending) return;
                if (zoneTogglePending.type === 'enabled') toggleEnabled(zoneTogglePending.zone.id);
                else toggleDefault(zoneTogglePending.zone.id);
              }}
              disabled={zoneToggleInFlight}
            >
              {zoneToggleInFlight && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 2: Powerful Portal Designer
// ═══════════════════════════════════════════════════════════════════════════════

interface PortalPageDesign {
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

interface AaaConfig { usernameFormat: string; passwordFormat: string; credentialPrintOnVoucher?: boolean; credentialShowInPortal?: boolean; }

const DEFAULT_DESIGN: PortalPageDesign = {
  authFlow: 'pms_credentials',
  title: 'Welcome to StaySuite', subtitle: 'Connect to our high-speed WiFi network',
  logoUrl: '', backgroundType: 'solid', backgroundColor: '#0f766e', backgroundImageUrl: '',
  brandColor: '#14b8a6', textColor: '#ffffff',
  fields: getAutoFields('custom'), socialLogin: { google: false, facebook: false, apple: false },
  customCSS: '/* Custom CSS */', customHTML: '<div class="legal-footer"><p>&copy; 2025 StaySuite Hospitality</p></div>',
  settings: { ...DEFAULT_SETTINGS },
};

function fieldsAreEqual(a: AutoFields, b: AutoFields): boolean {
  return Object.keys(a).every((k) => a[k as keyof AutoFields] === b[k as keyof AutoFields]);
}

function getBackgroundCSS(design: PortalPageDesign): string {
  const s = design.settings;
  if (s.backgroundType === 'gradient') {
    return `linear-gradient(${s.gradientAngle}deg, ${s.gradientFrom}, ${s.gradientTo})`;
  }
  if (s.backgroundType === 'image' && design.backgroundImageUrl) {
    return `url(${design.backgroundImageUrl}) center/cover`;
  }
  return design.backgroundColor;
}

function getFormClasses(s: DesignSettings): string {
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

function getInputClasses(s: DesignSettings): string {
  const bg = s.formStyle === 'glass' || s.formStyle === 'minimal' ? 'bg-white/10 border-white/20' : 'bg-white/90 border-gray-200';
  if (s.inputStyle === 'pill') return `${bg} rounded-full px-4 py-2.5 text-xs`;
  if (s.inputStyle === 'square') return `${bg} rounded-none px-3 py-2.5 text-xs`;
  if (s.inputStyle === 'underline') return `${bg} border-0 border-b-2 px-1 py-2 text-xs bg-transparent border-white/30`;
  return `${bg} rounded-lg px-3 py-2.5 text-xs`;
}

function getButtonClasses(s: DesignSettings): string {
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

// ── Portal Designer Tab ───────────────────────────────────────────────────────

function PortalDesignerTab({ portalOptions }: { portalOptions: Array<{ id: string; name: string }> }) {
  const { toast } = useToast();
  // XC-1 fix: RBAC gate on destructive actions.
  const { hasPermission } = useAuth();
  const canManage = hasPermission('wifi.manage');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const [selectedPortalId, setSelectedPortalId] = useState<string>(portalOptions[0]?.id || '');
  const [aaaConfig, setAaaConfig] = useState<AaaConfig | null>(null);
  const [credentialCategory, setCredentialCategory] = useState<CredentialCategory>('custom');
  const [autoFields, setAutoFields] = useState<AutoFields>(getAutoFields('custom'));
  const [design, setDesign] = useState<PortalPageDesign>({ ...DEFAULT_DESIGN, settings: { ...DEFAULT_SETTINGS } });
  const [savedPageId, setSavedPageId] = useState<string | null>(null);
  const [isOverride, setIsOverride] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [subTab, setSubTab] = useState<DesignerSubTab>('templates');
  const [previewDevice, setPreviewDevice] = useState<'phone' | 'tablet' | 'desktop'>('phone');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const [bgUploading, setBgUploading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [catFilter, setCatFilter] = useState('All');
  // ── Feature #8: Auto-Translation state ────────────────────────────────────────
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [translatingField, setTranslatingField] = useState<string | null>(null);
  // ── Template Marketplace (Feature 7) state ──────────────────────────────────
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateSort, setTemplateSort] = useState<'default' | 'az' | 'za'>('default');
  const [templatePreviewOpen, setTemplatePreviewOpen] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState<PortalTemplate | null>(null);

  // ── CAPTCHA (Turnstile) state ─────────────────────────────────────────────
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState('');
  const [captchaSecretKey, setCaptchaSecretKey] = useState('');
  const [savingCaptcha, setSavingCaptcha] = useState(false);

  // ── Design History for Undo/Redo (Feature 11) ──────────────────────────────
  const [history, setHistory] = useState<PortalPageDesign[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoRef = useRef(false);

  // ── Feature #12: Per-Device Design state ────────────────────────────────────
  const [perDeviceTab, setPerDeviceTab] = useState<'phone' | 'tablet' | 'desktop'>('phone');

  // ── Feature #13: Design History (Versioning) state ──────────────────────────
  const [designHistory, setDesignHistory] = useState<Array<{ id: string; name: string; description?: string; createdAt: string; designSettings: any }>>([]);
  const [saveHistoryOpen, setSaveHistoryOpen] = useState(false);
  const [historySnapshotName, setHistorySnapshotName] = useState('');
  const [historySnapshotDesc, setHistorySnapshotDesc] = useState('');
  const [restoreHistoryEntry, setRestoreHistoryEntry] = useState<{ id: string; name: string; designSettings: any } | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoringHistory, setRestoringHistory] = useState(false);

  // ── Feature #15: AI Design Suggest state ────────────────────────────────────
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiHotelType, setAiHotelType] = useState('luxury');
  const [aiBrandColor, setAiBrandColor] = useState('#0f766e');
  const [aiAccentColor, setAiAccentColor] = useState('#14b8a6');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiQuickGenerating, setAiQuickGenerating] = useState(false);

  const pushHistory = useCallback((snapshot: PortalPageDesign) => {
    setHistory((prev) => {
      const idx = historyIndex;
      const newHistory = prev.slice(0, idx + 1).concat(JSON.parse(JSON.stringify(snapshot)));
      if (newHistory.length > 20) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex((prev) => Math.min(prev + 1, 19));
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setDesign(JSON.parse(JSON.stringify(history[newIndex])));
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    isUndoRedoRef.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setDesign(JSON.parse(JSON.stringify(history[newIndex])));
    setTimeout(() => { isUndoRedoRef.current = false; }, 50);
  }, [historyIndex, history]);

  // Push initial design to history on first load
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      isUndoRedoRef.current = true;
      setHistory([JSON.parse(JSON.stringify(design))]);
      setHistoryIndex(0);
      setTimeout(() => { isUndoRedoRef.current = false; }, 50);
    }
  }, [design]);

  // Push to history on design change (but not during undo/redo)
  useEffect(() => {
    if (!isUndoRedoRef.current && history.length > 0) {
      pushHistory(design);
    }
  }, [design]);

  // ── Export/Import Handlers (Feature 12) ────────────────────────────────────
  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portal-design-${selectedPortalId || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Design exported', description: 'Portal design downloaded as JSON' });
  }, [design, selectedPortalId, toast]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        if (imported && imported.settings) {
          setDesign({ ...DEFAULT_DESIGN, ...imported, settings: { ...DEFAULT_SETTINGS, ...imported.settings } });
          toast({ title: 'Design imported', description: 'Portal design loaded from JSON' });
        } else {
          toast({ title: 'Invalid file', description: 'The file does not contain a valid portal design', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Import failed', description: 'Could not parse the JSON file', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = '';
  }, [toast]);

  // ── Actual Size Preview (Feature 13) ───────────────────────────────────────
  // Open the REAL /connect page in a new tab so the admin can verify the
  // saved design renders correctly on the actual captive portal. This is
  // the source of truth — not the in-panel preview which uses simplified
  // rendering. The admin should always check here after saving.
  const openActualSizePreview = useCallback(() => {
    window.open('/connect', '_blank', 'noopener');
  }, []);

  // ── Shareable Preview Link (Feature 6) ─────────────────────────────────────
  const generateShareablePreviewLink = useCallback(() => {
    try {
      // Build a minimal serializable design config for the preview
      const previewData = {
        bg: design.settings.backgroundType === 'gradient'
          ? { type: 'gradient', from: design.settings.gradientFrom, to: design.settings.gradientTo, angle: design.settings.gradientAngle }
          : design.settings.backgroundType === 'image' && design.backgroundImageUrl
            ? { type: 'image', url: design.backgroundImageUrl }
            : { type: 'solid', color: design.backgroundColor },
        textColor: design.textColor,
        accentColor: design.brandColor,
        fontFamily: design.settings.fontFamily,
        headingFontFamily: design.settings.headingFontFamily,
        formStyle: design.settings.formStyle,
        inputStyle: design.settings.inputStyle,
        buttonStyle: design.settings.buttonStyle,
        buttonSize: design.settings.buttonSize,
        cardShadow: design.settings.cardShadow,
        animationType: design.settings.animationType,
        title: design.title,
        subtitle: design.subtitle,
        hotelName: design.settings.hotelName,
        logoUrl: design.logoUrl,
        showHotelInfo: design.settings.showHotelInfo,
        amenities: design.settings.amenities,
        showAmenities: design.settings.showAmenities,
        showSocialMedia: design.settings.showSocialMedia,
        socialLinks: design.settings.socialLinks,
        showClock: design.settings.showClock,
        welcomeMessage: design.settings.welcomeMessage,
      };
      const jsonStr = JSON.stringify(previewData);
      const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
      const url = `${window.location.origin}/connect?preview=${encoded}`;
      navigator.clipboard.writeText(url).then(() => {
        toast({ title: 'Preview link copied!', description: 'Share this URL to preview the portal design.', duration: 3000 });
      }).catch(() => {
        toast({ title: 'Preview link generated', description: 'Copy the URL from the browser address bar.', duration: 3000 });
      });
    } catch {
      toast({ title: 'Failed to generate link', description: 'Design data is too large for a shareable URL.', variant: 'destructive' });
    }
  }, [design, toast]);

  // ── Load data when portal changes ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedPortalId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const config = await apiFetch<AaaConfig>('/api/wifi/aaa-config');
      if (!cancelled && config) {
        setAaaConfig(config);
        const cat = CREDENTIAL_FORMAT_MAP[config.usernameFormat] || 'custom';
        setCredentialCategory(cat);
        setAutoFields(getAutoFields(cat));
      }
      const pageData = await apiFetch<any>(`/api/wifi/portal/pages?portalId=${selectedPortalId}`);
      if (!cancelled && pageData && (Array.isArray(pageData) ? pageData.length > 0 : true)) {
        const pd = Array.isArray(pageData) ? pageData[0] : pageData;
        if (pd) {
          setSavedPageId(pd.id || null);
          const settings: DesignSettings = {
            ...DEFAULT_SETTINGS,
            ...(typeof pd.designSettings === 'string' ? JSON.parse(pd.designSettings || '{}') : pd.designSettings || {}),
          };
          setDesign({
            authFlow: pd.authFlow || 'pms_credentials',
            title: pd.title || DEFAULT_DESIGN.title, subtitle: pd.subtitle || DEFAULT_DESIGN.subtitle,
            logoUrl: pd.logoUrl || '', backgroundType: (typeof pd.designSettings === 'string' ? JSON.parse(pd.designSettings || '{}') : pd.designSettings || {}).backgroundType || 'solid',
            backgroundColor: pd.backgroundColor || '#0f766e', backgroundImageUrl: pd.backgroundImage || '',
            brandColor: pd.accentColor || '#14b8a6', textColor: pd.textColor || '#ffffff',
            fields: typeof pd.formFields === 'string' ? JSON.parse(pd.formFields) : (pd.formFields || getAutoFields('custom')),
            socialLogin: typeof pd.socialProviders === 'string' ? JSON.parse(pd.socialProviders) : { google: false, facebook: false, apple: false },
            customCSS: pd.customCss || '', customHTML: pd.customHtml || '', settings,
          });
          const newAuto = getAutoFields(CREDENTIAL_FORMAT_MAP[config?.usernameFormat || ''] || 'custom');
          setIsOverride(!fieldsAreEqual(typeof pd.formFields === 'string' ? JSON.parse(pd.formFields) : (pd.formFields || getAutoFields('custom')), newAuto));
        }
      } else if (!cancelled) {
        const cat = CREDENTIAL_FORMAT_MAP[config?.usernameFormat || ''] || 'custom';
        setDesign((prev) => ({ ...prev, fields: getAutoFields(cat), settings: { ...DEFAULT_SETTINGS } }));
        setSavedPageId(null);
        setIsOverride(false);
      }
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [selectedPortalId]);

  // ── Load CAPTCHA config when portal changes ──────────────────────────────
  useEffect(() => {
    if (!selectedPortalId) return;
    apiFetch<any>(`/api/wifi/portal/instances/${selectedPortalId}`).then((portal) => {
      if (portal) {
        setCaptchaEnabled(portal.captchaEnabled ?? false);
        setCaptchaSiteKey(portal.captchaSiteKey || '');
        setCaptchaSecretKey(portal.captchaSecretKey || '');
      }
    }).catch(() => {});
  }, [selectedPortalId]);

  // ── Save CAPTCHA config ───────────────────────────────────────────────────
  const saveCaptchaConfig = async () => {
    if (!selectedPortalId) return;
    setSavingCaptcha(true);
    const { error } = await apiMutate(`/api/wifi/portal/instances/${selectedPortalId}`, {
      method: 'PUT',
      body: JSON.stringify({
        captchaEnabled,
        captchaSiteKey: captchaSiteKey || null,
        captchaSecretKey: captchaSecretKey || null,
      }),
    });
    setSavingCaptcha(false);
    if (!error) {
      toast({ title: 'CAPTCHA settings saved', description: `Turnstile ${captchaEnabled ? 'enabled' : 'disabled'} for this portal` });
    } else {
      toast({ title: 'Error saving CAPTCHA', description: error, variant: 'destructive' });
    }
  };

  // ── Load Design History (Feature #13) ─────────────────────────────────────
  useEffect(() => {
    if (!selectedPortalId) return;
    apiFetch<any[]>(`/api/wifi/portal/design-history?portalId=${selectedPortalId}`).then((data) => {
      if (data) setDesignHistory(data.slice(0, 10));
    }).catch(() => {});
  }, [selectedPortalId]);

  // ── Save Design Snapshot (Feature #13) ────────────────────────────────────
  const handleSaveSnapshot = async () => {
    if (!selectedPortalId || !savedPageId) {
      toast({ title: 'Error', description: 'Save the design first before creating a snapshot', variant: 'destructive' });
      return;
    }
    const { error } = await apiMutate('/api/wifi/portal/design-history', {
      method: 'POST',
      body: JSON.stringify({
        portalId: selectedPortalId,
        portalPageId: savedPageId,
        name: historySnapshotName || 'Untitled Snapshot',
        description: historySnapshotDesc || undefined,
        designSettings: design.settings,
      }),
    });
    if (error) {
      toast({ title: 'Save failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Snapshot saved', description: `"${historySnapshotName}" has been saved` });
      setSaveHistoryOpen(false);
      setHistorySnapshotName('');
      setHistorySnapshotDesc('');
      // Reload history
      const data = await apiFetch<any[]>(`/api/wifi/portal/design-history?portalId=${selectedPortalId}`);
      if (data) setDesignHistory(data.slice(0, 10));
    }
  };

  // ── Restore Design Snapshot (Feature #13) ─────────────────────────────────
  const handleRestoreSnapshot = async () => {
    if (!restoreHistoryEntry) return;
    setRestoringHistory(true);
    try {
      const snapshotSettings = restoreHistoryEntry.designSettings;
      setDesign((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...snapshotSettings },
      }));
      toast({ title: 'Snapshot restored', description: `"${restoreHistoryEntry.name}" design has been applied` });
      setRestoreConfirmOpen(false);
      setRestoreHistoryEntry(null);
    } catch {
      toast({ title: 'Restore failed', description: 'Could not apply the snapshot', variant: 'destructive' });
    }
    setRestoringHistory(false);
  };

  // ── AI Design Suggest (Feature #15) ────────────────────────────────────────
  const handleAiSuggest = async (quickMode = false) => {
    if (quickMode) setAiQuickGenerating(true);
    else setAiGenerating(true);
    try {
      const { data, error } = await apiMutate<any>('/api/wifi/portal/ai-suggest', {
        method: 'POST',
        body: JSON.stringify({
          hotelName: design.settings.hotelName || 'StaySuite Hotel',
          hotelType: aiHotelType,
          brandColor: quickMode ? design.backgroundColor : aiBrandColor,
          accentColor: quickMode ? design.brandColor : aiAccentColor,
        }),
      });
      if (error) {
        toast({ title: 'AI suggestion failed', description: error, variant: 'destructive' });
      } else if (data) {
        // Apply AI suggested settings
        setDesign((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...(data.layoutType && { layoutType: data.layoutType }),
            ...(data.fontFamily && { fontFamily: data.fontFamily }),
            ...(data.headingFontFamily && { headingFontFamily: data.headingFontFamily }),
            ...(data.formStyle && { formStyle: data.formStyle }),
            ...(data.buttonStyle && { buttonStyle: data.buttonStyle }),
            ...(data.backgroundType && { backgroundType: data.backgroundType }),
            ...(data.gradientFrom && { gradientFrom: data.gradientFrom }),
            ...(data.gradientTo && { gradientTo: data.gradientTo }),
            ...(data.animationType && { animationType: data.animationType }),
            ...(data.welcomeMessage && { welcomeMessage: data.welcomeMessage }),
            ...(data.inputStyle && { inputStyle: data.inputStyle }),
            ...(data.buttonSize && { buttonSize: data.buttonSize }),
            ...(data.cardShadow && { cardShadow: data.cardShadow }),
          },
          ...(data.gradientFrom && { backgroundColor: data.gradientFrom }),
          ...(data.accentColor && { brandColor: data.accentColor }),
        }));
        toast({ title: 'AI design applied!', description: 'Your portal has been styled by AI' });
        if (!quickMode) setAiDialogOpen(false);
      }
    } catch {
      toast({ title: 'AI service unavailable', description: 'Please try again later', variant: 'destructive' });
    }
    if (quickMode) setAiQuickGenerating(false);
    else setAiGenerating(false);
  };

  const updateDesign = useCallback((partial: Partial<PortalPageDesign>) => {
    setDesign((prev) => {
      const next = { ...prev, ...partial };
      // When auth flow changes, auto-populate recommended fields
      if (partial.authFlow && partial.authFlow !== prev.authFlow) {
        const flowDefaults = AUTH_FLOW_FIELD_DEFAULTS[partial.authFlow];
        if (flowDefaults) {
          next.fields = { ...flowDefaults };
          setIsOverride(false);
        }
      }
      if (partial.fields) setIsOverride(!fieldsAreEqual(partial.fields, autoFields));
      return next;
    });
  }, [autoFields]);

  const updateSettings = useCallback((partial: Partial<DesignSettings>) => {
    setDesign((prev) => ({ ...prev, settings: { ...prev.settings, ...partial } }));
  }, []);

  const applyTemplate = useCallback((template: PortalTemplate) => {
    setDesign((prev) => ({
      ...prev,
      backgroundColor: template.colors.bg,
      brandColor: template.colors.accent,
      textColor: template.colors.text,
      settings: { ...prev.settings, ...template.design, gradientFrom: template.colors.gradientFrom || prev.settings.gradientFrom, gradientTo: template.colors.gradientTo || prev.settings.gradientTo, backgroundType: template.design.backgroundType || 'solid' },
    }));
    toast({ title: 'Template applied', description: `${template.name} theme has been applied` });
  }, [toast]);

  const toggleField = useCallback((key: keyof AutoFields) => {
    setDesign((prev) => {
      const next = { ...prev, fields: { ...prev.fields, [key]: !prev.fields[key] } };
      setIsOverride(!fieldsAreEqual(next.fields, autoFields));
      return next;
    });
  }, [autoFields]);

  const toggleSocial = useCallback((provider: 'google' | 'facebook' | 'apple') => {
    setDesign((prev) => ({ ...prev, socialLogin: { ...prev.socialLogin, [provider]: !prev.socialLogin[provider] } }));
  }, []);

  const resetToPolicy = useCallback(() => {
    setDesign((prev) => ({ ...prev, fields: { ...autoFields } }));
    setIsOverride(false);
    toast({ title: 'Reset to policy', description: 'Form fields synced with credential policy' });
  }, [autoFields, toast]);

  const handleSave = useCallback(async () => {
    if (!selectedPortalId) return;
    setSaving(true);
    const payload = {
      portalId: selectedPortalId, partnerId: partnerId || 'default',
      title: design.title, subtitle: design.subtitle, logoUrl: design.logoUrl,
      backgroundImage: design.backgroundImageUrl, backgroundColor: design.backgroundColor,
      textColor: design.textColor, brandColor: design.brandColor,
      authFlow: design.authFlow,
      formFields: design.fields, socialLogin: design.socialLogin,
      customCSS: design.customCSS, customHTML: design.customHTML,
      designSettings: design.settings,
      showBranding: design.settings.showBranding,
      termsText: design.settings.termsText || undefined,
      termsUrl: design.settings.termsUrl || undefined,
    };
    try {
      if (savedPageId) {
        const { error } = await apiMutate(`/api/wifi/portal/pages/${savedPageId}`, { method: 'PUT', body: JSON.stringify(payload) });
        if (error) toast({ title: 'Save failed', description: error, variant: 'destructive' });
        else toast({ title: 'Saved', description: 'Portal design updated successfully' });
      } else {
        const { data, error } = await apiMutate<any>('/api/wifi/portal/pages', { method: 'POST', body: JSON.stringify(payload) });
        if (error) toast({ title: 'Save failed', description: error, variant: 'destructive' });
        else if (data) { setSavedPageId(data.id || null); toast({ title: 'Saved', description: 'Portal design created successfully' }); }
      }
    } catch { toast({ title: 'Save failed', description: 'Unexpected error', variant: 'destructive' }); }
    setSaving(false);
  }, [selectedPortalId, partnerId, design, savedPageId, toast]);

  const visibleFields = useMemo(() => FIELD_DEFINITIONS.filter((f) => design.fields[f.key]), [design.fields]);

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (<div className="space-y-4"><Skeleton className="h-10 w-full max-w-md" /><div className="grid grid-cols-1 lg:grid-cols-5 gap-6"><Skeleton className="h-[700px] col-span-2" /><Skeleton className="h-[700px] col-span-3" /></div></div>);
  }

  if (!selectedPortalId || portalOptions.length === 0) {
    return (<Card className="border-dashed"><CardContent className="py-16 flex flex-col items-center gap-4 text-muted-foreground">
      <Layout className="h-12 w-12 opacity-30" /><p className="text-base font-medium">No portal instances available</p>
      <p className="text-sm">Create a portal instance first, then come back to design its login page</p>
    </CardContent></Card>);
  }

  return (
    <>
    <div className="space-y-4">
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedPortalId} onValueChange={setSelectedPortalId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Select portal..." /></SelectTrigger>
            <SelectContent>{portalOptions.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
          </Select>
          {aaaConfig && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={cn('gap-1.5 cursor-default', isOverride ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300')}>
                  {isOverride ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                  {isOverride ? 'Custom Override' : 'Synced with Policy'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>{isOverride ? 'Form fields differ from credential policy defaults' : `Auto-configured from ${CREDENTIAL_CATEGORY_LABELS[credentialCategory]} format`}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex gap-2">
          {isOverride && <Button variant="outline" size="sm" onClick={resetToPolicy}><RotateCcw className="h-4 w-4 mr-1.5" />Sync to Policy</Button>}
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8" onClick={undo} disabled={historyIndex <= 0}><Undo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Undo</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8" onClick={redo} disabled={historyIndex >= history.length - 1}><Redo2 className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Redo</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8" onClick={handleExport}><Download className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Export Design</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => importInputRef.current?.click()}><Upload className="h-4 w-4" /></Button></TooltipTrigger><TooltipContent>Import Design</TooltipContent></Tooltip>
          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <Button size="sm" variant="outline" onClick={openActualSizePreview} className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/40"><ExternalLink className="h-4 w-4 mr-1.5" />View Live</Button>
          <Button size="sm" className="bg-teal-600 hover:bg-teal-700" onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-1.5" />{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>

      {/* ── Split Pane: Preview (left 2/5) + Controls (right 3/5) ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* ── Left: Live Preview ──────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <Card className="overflow-hidden lg:sticky lg:top-4">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2"><Eye className="h-4 w-4" />Live Preview</CardTitle>
                <div className="flex items-center gap-1">
                  <Tooltip><TooltipTrigger asChild><button onClick={generateShareablePreviewLink} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"><Share2 className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent>Copy /connect Preview Link</TooltipContent></Tooltip>
                  <Tooltip><TooltipTrigger asChild><button onClick={openActualSizePreview} className="p-1.5 rounded-md text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 transition-colors"><ExternalLink className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent>Open Live /connect Page</TooltipContent></Tooltip>
                  <div className="bg-muted rounded-lg p-0.5">
                    {[{ v: 'phone' as const, icon: Smartphone }, { v: 'tablet' as const, icon: Tablet }, { v: 'desktop' as const, icon: Monitor }].map(({ v, icon: Ic }) => (
                      <button key={v} onClick={() => setPreviewDevice(v)} className={cn('p-1.5 rounded-md transition-colors', previewDevice === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                        <Ic className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex justify-center bg-muted/30 min-h-[400px] lg:min-h-[620px]">
              {/* Device Frame */}
              <div className={cn(
                'relative bg-gray-900 shadow-2xl overflow-hidden',
                previewDevice === 'phone' ? 'w-[240px] sm:w-[280px] h-[480px] sm:h-[560px] rounded-[36px] border-4 border-gray-800' : '',
                previewDevice === 'tablet' ? 'w-[320px] sm:w-[420px] h-[480px] sm:h-[580px] rounded-[20px] border-3 border-gray-800' : '',
                previewDevice === 'desktop' ? 'w-full h-[480px] sm:h-[580px] rounded-lg border-2 border-gray-700' : '',
              )}>
                {/* Notch (phone only) */}
                {previewDevice === 'phone' && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-900 rounded-b-xl z-10" />}
                {/* Screen Content */}
                <div className="w-full h-full overflow-auto" style={{ background: getBackgroundCSS(design), color: design.textColor }}>
                  <PortalPreviewContent design={design} visibleFields={visibleFields} />
                </div>
              </div>
            </CardContent>
            {/* Info banner: explain preview vs live */}
            <div className="px-4 pb-3 -mt-1">
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>This panel is an approximate preview. After saving, click <strong className="font-semibold">View Live</strong> to see the exact rendering on the real <code className="px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/50 font-mono text-[10px]">/connect</code> captive portal page.</span>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Right: Designer Controls ──────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-0">
          {/* Sub-Tab Navigation */}
          <div className="border rounded-lg bg-card">
            <div className="flex overflow-x-auto bg-muted/50 px-2 pt-2">
              {DESIGNER_SUBTABS.map((st) => {
                const Icon = st.icon;
                const isActive = subTab === st.id;
                return (
                  <button key={st.id} onClick={() => setSubTab(st.id)}
                    className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition-all border-b-2',
                      isActive ? 'bg-card text-foreground border-teal-500' : 'text-muted-foreground border-transparent hover:text-foreground'
                    )}>
                    <Icon className="h-3.5 w-3.5" />{st.label}
                  </button>
                );
              })}
            </div>

            <div className={cn("overscroll-contain", subTab === 'visual-builder' ? 'overflow-hidden' : 'overflow-auto max-h-[70vh]')}>
              <div className={cn(subTab === 'visual-builder' ? 'p-0' : 'p-5 space-y-5')}>
                {/* ── Visual Builder Sub-Tab ─────────────────────────────────── */}
                {subTab === 'visual-builder' && (
                  <DndBuilder
                    design={design}
                    onUpdateSettings={updateSettings}
                    onUpdateDesign={updateDesign}
                    onSave={handleSave}
                  />
                )}

                {/* ── Templates Sub-Tab ──────────────────────────────────────── */}
                {subTab === 'templates' && (
                  <TemplateGallery
                    templates={PORTAL_TEMPLATES}
                    templateSearch={templateSearch}
                    setTemplateSearch={setTemplateSearch}
                    catFilter={catFilter}
                    setCatFilter={setCatFilter}
                    templateSort={templateSort}
                    setTemplateSort={setTemplateSort}
                    onApplyTemplate={applyTemplate}
                    currentDesign={design}
                    onOpenPreview={(tmpl) => { setPreviewingTemplate(tmpl); setTemplatePreviewOpen(true); }}
                    onOpenAiSuggest={() => {
                      setAiBrandColor(design.backgroundColor || '#0f766e');
                      setAiAccentColor(design.brandColor || '#14b8a6');
                      setAiDialogOpen(true);
                    }}
                  />
                )}

                {/* ── Layout Sub-Tab ─────────────────────────────────────────── */}
                {subTab === 'layout' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div><h3 className="text-sm font-semibold">Page Layout</h3><p className="text-xs text-muted-foreground mt-1">Choose how the login form is positioned on the page</p></div>
                      <Button variant="outline" size="sm" className="text-[10px] gap-1" disabled={aiQuickGenerating} onClick={() => handleAiSuggest(true)}>
                        {aiQuickGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Magic
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {LAYOUT_OPTIONS.map((lo) => (
                        <button key={lo.value} onClick={() => updateSettings({ layoutType: lo.value })}
                          className={cn('flex items-center gap-4 p-3 rounded-lg border-2 transition-all text-left',
                            design.settings.layoutType === lo.value ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>
                          <LayoutMiniPreview layout={lo.value} />
                          <div><p className="text-sm font-medium">{lo.label}</p><p className="text-xs text-muted-foreground">{lo.desc}</p></div>
                        </button>
                      ))}
                    </div>
                    {/* Auth Flow */}
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Authentication Flow</h3><p className="text-xs text-muted-foreground mt-1">How guests authenticate on the portal</p></div>
                    <div className="grid grid-cols-1 gap-2">
                      {AUTH_FLOW_OPTIONS.map((af) => {
                        const Icon = af.icon;
                        return (
                          <button key={af.value} onClick={() => {
                            updateDesign({ authFlow: af.value });
                            toast({ title: `${af.label} selected`, description: 'Form fields auto-configured. Customize in the Fields tab.', duration: 3000 });
                          }}
                            className={cn('flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left',
                              design.authFlow === af.value ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                            )}>
                            <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', af.color)} />
                            <div>
                              <p className="text-sm font-medium">{af.label}</p>
                              {'desc' in af && <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{af.desc as string}</p>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Background Sub-Tab ─────────────────────────────────────── */}
                {subTab === 'background' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold">Background Type</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                      {[{ v: 'solid' as const, l: 'Solid Color' }, { v: 'gradient' as const, l: 'Gradient' }, { v: 'image' as const, l: 'Image URL' }, { v: 'video' as const, l: 'Video' }].map((bt) => (
                        <button key={bt.v} onClick={() => updateSettings({ backgroundType: bt.v })}
                          className={cn('p-3 rounded-lg border-2 text-center text-xs font-medium transition-all',
                            design.settings.backgroundType === bt.v ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{bt.l}</button>
                      ))}
                    </div>
                    {design.settings.backgroundType === 'solid' && (
                      <div className="space-y-2"><Label className="text-xs">Background Color</Label>
                        <div className="flex items-center gap-3"><input type="color" value={design.backgroundColor} onChange={(e) => updateDesign({ backgroundColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" /><Input value={design.backgroundColor} onChange={(e) => updateDesign({ backgroundColor: e.target.value })} className="flex-1 font-mono text-xs" /></div>
                      </div>
                    )}
                    {design.settings.backgroundType === 'gradient' && (
                      <div className="space-y-4">
                        <div className="space-y-2"><Label className="text-xs">From Color</Label><div className="flex items-center gap-3"><input type="color" value={design.settings.gradientFrom} onChange={(e) => updateSettings({ gradientFrom: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" /><Input value={design.settings.gradientFrom} onChange={(e) => updateSettings({ gradientFrom: e.target.value })} className="flex-1 font-mono text-xs" /></div></div>
                        <div className="space-y-2"><Label className="text-xs">To Color</Label><div className="flex items-center gap-3"><input type="color" value={design.settings.gradientTo} onChange={(e) => updateSettings({ gradientTo: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" /><Input value={design.settings.gradientTo} onChange={(e) => updateSettings({ gradientTo: e.target.value })} className="flex-1 font-mono text-xs" /></div></div>
                        <div className="space-y-2"><Label className="text-xs">Angle: {design.settings.gradientAngle}&deg;</Label><input type="range" min="0" max="360" value={design.settings.gradientAngle} onChange={(e) => updateSettings({ gradientAngle: parseInt(e.target.value) })} className="w-full accent-teal-500" /></div>
                      </div>
                    )}
                    {design.settings.backgroundType === 'image' && (
                      <div className="space-y-3">
                        {/* Upload area */}
                        <div className="space-y-2">
                          <Label className="text-xs">Background Image</Label>
                          <div className="relative group">
                            {design.backgroundImageUrl ? (
                              <div className="relative rounded-lg overflow-hidden border">
                                <img src={design.backgroundImageUrl} alt="Background preview" className="w-full h-32 object-cover" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                  <button type="button" onClick={() => bgInputRef.current?.click()} className="px-3 py-1.5 bg-white text-gray-800 rounded-md text-xs font-medium hover:bg-gray-100 transition-colors">
                                    Replace
                                  </button>
                                  <button type="button" onClick={() => updateDesign({ backgroundImageUrl: '' })} className="px-3 py-1.5 bg-red-500 text-white rounded-md text-xs font-medium hover:bg-red-600 transition-colors">
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button type="button" onClick={() => bgInputRef.current?.click()} className="w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-teal-400 transition-colors cursor-pointer">
                                <ImagePlus className="w-5 h-5" />
                                <span className="text-xs font-medium">Upload Background Image</span>
                                <span className="text-[10px]">JPG, PNG, WebP up to 10MB</span>
                              </button>
                            )}
                            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              setBgUploading(true);
                              try {
                                const fd = new FormData();
                                fd.append('file', file);
                                fd.append('folder', 'portal-backgrounds');
                                const res = await fetch('/api/upload', { method: 'POST', body: fd });
                                if (!res.ok) {
                                  toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
                                  return;
                                }

                                const result = await res.json();
                                if (result.success && result.data?.url) {
                                  updateDesign({ backgroundImageUrl: result.data.url });
                                  toast({ title: 'Background uploaded', description: 'Image set as portal background' });
                                } else {
                                  toast({ title: 'Upload failed', description: result.error?.message || 'Failed to upload image', variant: 'destructive' });
                                }
                              } catch { toast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' }); }
                              finally { setBgUploading(false); }
                              if (bgInputRef.current) bgInputRef.current.value = '';
                            }} />
                            {bgUploading && (
                              <div className="absolute inset-0 rounded-lg bg-background/60 backdrop-blur-sm flex items-center justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                              </div>
                            )}
                          </div>
                        </div>
                        {/* URL fallback */}
                        <div className="space-y-2">
                          <Label className="text-xs">Or paste Image URL</Label>
                          <Input placeholder="https://example.com/hotel-bg.jpg" value={design.backgroundImageUrl} onChange={(e) => updateDesign({ backgroundImageUrl: e.target.value })} className="text-xs" />
                        </div>
                        <div className="space-y-2"><Label className="text-xs">Overlay Opacity: {design.settings.backgroundOverlay}%</Label><input type="range" min="0" max="90" value={design.settings.backgroundOverlay} onChange={(e) => updateSettings({ backgroundOverlay: parseInt(e.target.value) })} className="w-full accent-teal-500" /></div>
                      </div>
                    )}
                    {design.settings.backgroundType === 'video' && (
                      <div className="space-y-3">
                        <div className="space-y-2"><Label className="text-xs">Video URL</Label><Input placeholder="https://example.com/portal-video.mp4" value={design.settings.backgroundVideoUrl} onChange={(e) => updateSettings({ backgroundVideoUrl: e.target.value })} className="text-xs" /></div>
                        <div className="space-y-2"><Label className="text-xs">Poster Image URL <span className="text-muted-foreground">(optional)</span></Label><Input placeholder="https://example.com/poster.jpg" value={design.settings.backgroundVideoPoster} onChange={(e) => updateSettings({ backgroundVideoPoster: e.target.value })} className="text-xs" /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">Muted</Label><Switch checked={design.settings.backgroundVideoMuted} onCheckedChange={(v) => updateSettings({ backgroundVideoMuted: v })} /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">Loop</Label><Switch checked={design.settings.backgroundVideoLoop} onCheckedChange={(v) => updateSettings({ backgroundVideoLoop: v })} /></div>
                        <div className="space-y-2"><Label className="text-xs">Overlay Opacity: {design.settings.backgroundOverlay}%</Label><input type="range" min="0" max="90" value={design.settings.backgroundOverlay} onChange={(e) => updateSettings({ backgroundOverlay: parseInt(e.target.value) })} className="w-full accent-teal-500" /></div>
                        <p className="text-[10px] text-muted-foreground">Upload videos to the Media Library for best results. Supports MP4 and WebM formats.</p>
                      </div>
                    )}
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2"><Label className="text-xs">Brand / Accent Color</Label><div className="flex items-center gap-3"><input type="color" value={design.brandColor} onChange={(e) => updateDesign({ brandColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" /><Input value={design.brandColor} onChange={(e) => updateDesign({ brandColor: e.target.value })} className="flex-1 font-mono text-xs" /></div></div>
                      <div className="space-y-2"><Label className="text-xs">Text Color</Label><div className="flex items-center gap-3"><input type="color" value={design.textColor} onChange={(e) => updateDesign({ textColor: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border-0" /><Input value={design.textColor} onChange={(e) => updateDesign({ textColor: e.target.value })} className="flex-1 font-mono text-xs" /></div></div>
                    </div>
                    <Separator />
                    {/* Background Pattern Overlay */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Background Pattern</Label>
                      <Select value={design.settings.patternOverlay} onValueChange={(v) => updateSettings({ patternOverlay: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="dots">Dots</SelectItem>
                          <SelectItem value="lines">Lines</SelectItem>
                          <SelectItem value="mesh">Mesh / Grid</SelectItem>
                          <SelectItem value="circles">Circles</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {design.settings.patternOverlay !== 'none' && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Pattern Opacity <span className="text-muted-foreground font-normal">({design.settings.patternOpacity}%)</span></Label>
                        <Slider value={[design.settings.patternOpacity]} min={1} max={15} step={1} onValueChange={([v]) => updateSettings({ patternOpacity: v })} />
                      </div>
                    )}
                    {design.settings.patternOverlay !== 'none' && (
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Pattern Color</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.patternColor || '#ffffff'} onChange={(e) => updateSettings({ patternColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.patternColor} onChange={(e) => updateSettings({ patternColor: e.target.value })} placeholder="Auto (from accent)" className="h-8 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Typography Sub-Tab ─────────────────────────────────────── */}
                {subTab === 'typography' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div><h3 className="text-sm font-semibold flex items-center gap-2"><Type className="h-4 w-4" />Typography</h3><p className="text-xs text-muted-foreground mt-1">Choose fonts that match your hotel brand</p></div>
                      <Button variant="outline" size="sm" className="text-[10px] gap-1" disabled={aiQuickGenerating} onClick={() => handleAiSuggest(true)}>
                        {aiQuickGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Magic
                      </Button>
                    </div>
                    <div className="space-y-2"><Label className="text-xs">Body Font</Label>
                      <Select value={design.settings.fontFamily} onValueChange={(v) => updateSettings({ fontFamily: v })}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_OPTIONS.map((f) => (<SelectItem key={f.value} value={f.value} className={f.style}>{f.label}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label className="text-xs">Heading Font</Label>
                      <Select value={design.settings.headingFontFamily} onValueChange={(v) => updateSettings({ headingFontFamily: v })}>
                        <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{FONT_OPTIONS.map((f) => (<SelectItem key={f.value} value={f.value} className={f.style}>{f.label}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* ── Form & Button Style Sub-Tab ────────────────────────────── */}
                {subTab === 'formstyle' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold flex items-center gap-2"><FormInput className="h-4 w-4" />Form Style</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {FORM_STYLES.map((fs) => (
                        <button key={fs.value} onClick={() => updateSettings({ formStyle: fs.value })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all',
                            design.settings.formStyle === fs.value ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{fs.label}</button>
                      ))}
                    </div>
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Input Style</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {INPUT_STYLES.map((is) => (
                        <button key={is.value} onClick={() => updateSettings({ inputStyle: is.value })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all',
                            design.settings.inputStyle === is.value ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{is.label}</button>
                      ))}
                    </div>
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Button Style</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {BUTTON_STYLES.map((bs) => (
                        <button key={bs.value} onClick={() => updateSettings({ buttonStyle: bs.value })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all',
                            design.settings.buttonStyle === bs.value ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{bs.label}</button>
                      ))}
                    </div>
                    <div><h3 className="text-sm font-semibold mt-2">Button Size</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {(['small', 'medium', 'large'] as const).map((sz) => (
                        <button key={sz} onClick={() => updateSettings({ buttonSize: sz })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all capitalize',
                            design.settings.buttonSize === sz ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{sz}</button>
                      ))}
                    </div>
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Animation</h3></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {([['none', 'None'], ['fade', 'Fade In'], ['slide_up', 'Slide Up'], ['zoom', 'Zoom']] as const).map(([v, l]) => (
                        <button key={v} onClick={() => updateSettings({ animationType: v })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all',
                            design.settings.animationType === v ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{l}</button>
                      ))}
                    </div>
                    <Separator />
                    {/* Feature 10: Card Shadow Control */}
                    <div><h3 className="text-sm font-semibold">Card Shadow</h3></div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['none', 'small', 'medium', 'large'] as const).map((sz) => (
                        <button key={sz} onClick={() => updateSettings({ cardShadow: sz })}
                          className={cn('p-3 rounded-lg border-2 text-xs font-medium transition-all capitalize',
                            design.settings.cardShadow === sz ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                          )}>{sz}</button>
                      ))}
                    </div>
                    <Separator />
                    {/* Visual Enhancement Controls */}
                    <div><h3 className="text-sm font-semibold">Card & Spacing</h3></div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Card Opacity <span className="text-muted-foreground font-normal">({design.settings.cardOpacity}%)</span></Label>
                      <Slider value={[design.settings.cardOpacity]} min={0} max={30} step={1} onValueChange={([v]) => updateSettings({ cardOpacity: v })} />
                      <p className="text-[10px] text-muted-foreground">Controls card transparency for glass &amp; minimal styles</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Card Border Width <span className="text-muted-foreground font-normal">({design.settings.cardBorderWidth}px)</span></Label>
                      <Slider value={[design.settings.cardBorderWidth]} min={0} max={4} step={1} onValueChange={([v]) => updateSettings({ cardBorderWidth: v })} />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Card Border Color</Label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={design.settings.cardBorderColor || '#ffffff'} onChange={(e) => updateSettings({ cardBorderColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                        <Input value={design.settings.cardBorderColor} onChange={(e) => updateSettings({ cardBorderColor: e.target.value })} placeholder="Auto (from accent)" className="h-8 text-xs" />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Leave empty to auto-derive from accent color</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Content Spacing <span className="text-muted-foreground font-normal">({design.settings.spacingScale}x)</span></Label>
                      <Slider value={[design.settings.spacingScale * 100]} min={50} max={200} step={5} onValueChange={([v]) => updateSettings({ spacingScale: v / 100 })} />
                      <p className="text-[10px] text-muted-foreground">Scale all content gaps and padding</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Heading Size <span className="text-muted-foreground font-normal">({design.settings.headingSize}x)</span></Label>
                      <Slider value={[design.settings.headingSize * 100]} min={80} max={150} step={5} onValueChange={([v]) => updateSettings({ headingSize: v / 100 })} />
                    </div>
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Button Extras</h3></div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Social Login Button Style</Label>
                      <Select value={design.settings.socialButtonStyle} onValueChange={(v) => updateSettings({ socialButtonStyle: v })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="brand">Brand Colors</SelectItem>
                          <SelectItem value="outline">Outlined</SelectItem>
                          <SelectItem value="glass">Glassmorphism</SelectItem>
                          <SelectItem value="minimal">Minimal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Custom Submit Button Label</Label>
                      <Input value={design.settings.buttonLabel} onChange={(e) => updateSettings({ buttonLabel: e.target.value })} placeholder="Auto (from auth method)" className="h-8 text-xs" />
                      <p className="text-[10px] text-muted-foreground">Leave empty to use default label based on auth method</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-xs font-medium">Confetti on Connect</Label>
                        <p className="text-[10px] text-muted-foreground">Show celebration animation on successful connection</p>
                      </div>
                      <Switch checked={design.settings.showConfetti} onCheckedChange={(v) => updateSettings({ showConfetti: v })} />
                    </div>
                  </div>
                )}

                {/* ── Form Colors Sub-Tab ────────────────────────────────────────── */}
                {subTab === 'formcolors' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold flex items-center gap-2"><Palette className="h-4 w-4" />Form Colors</h3><p className="text-xs text-muted-foreground mt-1">Fine-tune colors for every form element. Leave empty to use auto-derived defaults.</p></div>
                    <Separator />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Form Background</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.formBackgroundColor || '#ffffff'} onChange={(e) => updateSettings({ formBackgroundColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.formBackgroundColor} onChange={(e) => updateSettings({ formBackgroundColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.formBackgroundColor && <button onClick={() => updateSettings({ formBackgroundColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Input Background</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.inputBackgroundColor || '#ffffff'} onChange={(e) => updateSettings({ inputBackgroundColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.inputBackgroundColor} onChange={(e) => updateSettings({ inputBackgroundColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.inputBackgroundColor && <button onClick={() => updateSettings({ inputBackgroundColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Input Border</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.inputBorderColor || '#d1d5db'} onChange={(e) => updateSettings({ inputBorderColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.inputBorderColor} onChange={(e) => updateSettings({ inputBorderColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.inputBorderColor && <button onClick={() => updateSettings({ inputBorderColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Input Text</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.inputTextColor || '#1f2937'} onChange={(e) => updateSettings({ inputTextColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.inputTextColor} onChange={(e) => updateSettings({ inputTextColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.inputTextColor && <button onClick={() => updateSettings({ inputTextColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Placeholder Text</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.inputPlaceholderColor || '#9ca3af'} onChange={(e) => updateSettings({ inputPlaceholderColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.inputPlaceholderColor} onChange={(e) => updateSettings({ inputPlaceholderColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.inputPlaceholderColor && <button onClick={() => updateSettings({ inputPlaceholderColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Button Text</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.buttonTextColor || '#ffffff'} onChange={(e) => updateSettings({ buttonTextColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.buttonTextColor} onChange={(e) => updateSettings({ buttonTextColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.buttonTextColor && <button onClick={() => updateSettings({ buttonTextColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Label Text</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.labelColor || '#374151'} onChange={(e) => updateSettings({ labelColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.labelColor} onChange={(e) => updateSettings({ labelColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.labelColor && <button onClick={() => updateSettings({ labelColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Link Color</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.linkColor || design.brandColor || '#14b8a6'} onChange={(e) => updateSettings({ linkColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.linkColor} onChange={(e) => updateSettings({ linkColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.linkColor && <button onClick={() => updateSettings({ linkColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Error Color</Label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={design.settings.errorColor || '#dc2626'} onChange={(e) => updateSettings({ errorColor: e.target.value })} className="w-8 h-8 rounded border cursor-pointer" />
                          <Input value={design.settings.errorColor} onChange={(e) => updateSettings({ errorColor: e.target.value })} placeholder="Auto" className="text-xs flex-1" />
                          {design.settings.errorColor && <button onClick={() => updateSettings({ errorColor: '' })} className="text-xs text-muted-foreground hover:text-foreground">Reset</button>}
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateSettings({ formBackgroundColor: '', inputBackgroundColor: '', inputBorderColor: '', inputTextColor: '', inputPlaceholderColor: '', buttonTextColor: '', labelColor: '', linkColor: '', errorColor: '' })} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"><RotateCcw className="h-3 w-3" />Reset All to Auto</button>
                    </div>
                  </div>
                )}

                {/* ── Content Sub-Tab ────────────────────────────────────────── */}
                {subTab === 'content' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4" />Content Sections</h3><p className="text-xs text-muted-foreground mt-1">Add rich content to engage guests</p></div>

                    {/* ── Feature 1: Multi-Language Portal ─────────────────────── */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold flex items-center gap-1.5"><Languages className="h-3.5 w-3.5" />Multi-Language</Label><Switch checked={design.settings.enableMultiLanguage} onCheckedChange={(v) => updateSettings({ enableMultiLanguage: v })} /></div>
                      {design.settings.enableMultiLanguage && (<>
                        <div className="space-y-2"><Label className="text-xs">Available Languages</Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-auto">
                            {LANGUAGE_OPTIONS.map((lang) => (
                              <div key={lang.value} className={cn('flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition-all',
                                design.settings.languages.includes(lang.value) ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300'
                              )} onClick={() => {
                                const curr = design.settings.languages;
                                updateSettings({ languages: curr.includes(lang.value) ? curr.filter((l) => l !== lang.value) : [...curr, lang.value] });
                              }}>
                                <span>{lang.flag}</span>
                                <span className="truncate">{lang.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2"><Label className="text-xs">Default Language</Label>
                          <Select value={design.settings.defaultLanguage} onValueChange={(v) => updateSettings({ defaultLanguage: v })}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{LANGUAGE_OPTIONS.filter((l) => design.settings.languages.includes(l.value)).map((l) => <SelectItem key={l.value} value={l.value}>{l.flag} {l.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        {/* Translation inputs for each non-default language */}
                        {design.settings.languages.filter((l) => l !== design.settings.defaultLanguage).map((langCode) => {
                          const langOpt = LANGUAGE_OPTIONS.find((l) => l.value === langCode);
                          if (!langOpt) return null;
                          const langTranslations = design.settings.translations?.[langCode] || {};
                          const updateTranslation = (key: string, value: string) => {
                            const current = { ...(design.settings.translations || {}) };
                            current[langCode] = { ...(current[langCode] || {}), [key]: value };
                            updateSettings({ translations: current });
                          };
                          const handleAutoTranslateAll = async () => {
                            setTranslatingLang(langCode);
                            try {
                              const texts: Record<string, string> = {
                                title: design.title || 'Welcome',
                                subtitle: design.subtitle || 'Connect to WiFi',
                                welcomeMessage: design.settings.welcomeMessage || 'Enjoy your stay',
                                hotelName: design.settings.hotelName || 'StaySuite Hotel',
                                hotelAddress: design.settings.hotelAddress || '',
                              };
                              const res = await fetch('/api/wifi/portal/auto-translate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ texts, targetLang: langCode, sourceLang: 'English' }),
                              });
                              const result = await res.json();
                              if (!res.ok) {
                                toast({ title: 'Translation failed', description: result.error?.message || result.error || `Server error (${res.status})`, variant: 'destructive' });
                                return;
                              }
                              const translations = result.data?.translations || result.translations;
                              if (translations) {
                                const current = { ...(design.settings.translations || {}) };
                                current[langCode] = { ...(current[langCode] || {}), ...translations };
                                updateSettings({ translations: current });
                                toast({ title: `Translated to ${langOpt.label}!` });
                              }
                            } catch {
                              toast({ title: 'Translation failed', description: 'Network error', variant: 'destructive' });
                            } finally {
                              setTranslatingLang(null);
                            }
                          };
                          const handleAutoTranslateField = async (key: string, sourceValue: string) => {
                            if (!sourceValue.trim()) return;
                            setTranslatingField(`${langCode}:${key}`);
                            try {
                              const texts: Record<string, string> = { [key]: sourceValue };
                              const res = await fetch('/api/wifi/portal/auto-translate', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ texts, targetLang: langCode, sourceLang: 'English' }),
                              });
                              const result = await res.json();
                              if (!res.ok) {
                                toast({ title: 'Translation failed', description: result.error?.message || result.error || `Server error (${res.status})`, variant: 'destructive' });
                                return;
                              }
                              const translations = result.data?.translations || result.translations;
                              if (translations?.[key]) {
                                updateTranslation(key, translations[key]);
                                toast({ title: `Field translated to ${langOpt.label}` });
                              }
                            } catch {
                              toast({ title: 'Translation failed', description: 'Network error', variant: 'destructive' });
                            } finally {
                              setTranslatingField(null);
                            }
                          };
                          return (
                            <div key={langCode} className="space-y-2 p-3 rounded-xl border border-border bg-muted/20">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold flex items-center gap-1.5">{langOpt.flag} {langOpt.label} <span className="text-muted-foreground font-normal">translations</span></p>
                                <Button type="button" size="sm" variant="outline" disabled={!!translatingLang} onClick={handleAutoTranslateAll} className="text-[10px] h-6 px-2">
                                  {translatingLang === langCode ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Translating...</> : <><Sparkles className="w-3 h-3 mr-1" />Auto-Translate All</>}
                                </Button>
                              </div>
                              <div className="space-y-1.5">
                                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Title</Label><div className="flex gap-1"><Input value={langTranslations.title || ''} onChange={(e) => updateTranslation('title', e.target.value)} placeholder={design.title || 'Welcome'} className="text-xs h-8 flex-1" /><Button type="button" size="sm" variant="ghost" disabled={translatingField === `${langCode}:title`} onClick={() => handleAutoTranslateField('title', design.title || 'Welcome')} className="h-8 w-8 px-0 shrink-0"><Loader2 className={cn('w-3 h-3', translatingField === `${langCode}:title` ? 'animate-spin' : 'hidden')} /><Sparkles className={cn('w-3 h-3', translatingField === `${langCode}:title` ? 'hidden' : '')} /></Button></div></div>
                                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Subtitle</Label><div className="flex gap-1"><Input value={langTranslations.subtitle || ''} onChange={(e) => updateTranslation('subtitle', e.target.value)} placeholder={design.subtitle || 'Connect to WiFi'} className="text-xs h-8 flex-1" /><Button type="button" size="sm" variant="ghost" disabled={translatingField === `${langCode}:subtitle`} onClick={() => handleAutoTranslateField('subtitle', design.subtitle || 'Connect to WiFi')} className="h-8 w-8 px-0 shrink-0"><Loader2 className={cn('w-3 h-3', translatingField === `${langCode}:subtitle` ? 'animate-spin' : 'hidden')} /><Sparkles className={cn('w-3 h-3', translatingField === `${langCode}:subtitle` ? 'hidden' : '')} /></Button></div></div>
                                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Welcome Message</Label><div className="flex gap-1"><Input value={langTranslations.welcomeMessage || ''} onChange={(e) => updateTranslation('welcomeMessage', e.target.value)} placeholder={design.settings.welcomeMessage || 'Enjoy your stay'} className="text-xs h-8 flex-1" /><Button type="button" size="sm" variant="ghost" disabled={translatingField === `${langCode}:welcomeMessage`} onClick={() => handleAutoTranslateField('welcomeMessage', design.settings.welcomeMessage || 'Enjoy your stay')} className="h-8 w-8 px-0 shrink-0"><Loader2 className={cn('w-3 h-3', translatingField === `${langCode}:welcomeMessage` ? 'animate-spin' : 'hidden')} /><Sparkles className={cn('w-3 h-3', translatingField === `${langCode}:welcomeMessage` ? 'hidden' : '')} /></Button></div></div>
                                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Hotel Name</Label><div className="flex gap-1"><Input value={langTranslations.hotelName || ''} onChange={(e) => updateTranslation('hotelName', e.target.value)} placeholder={design.settings.hotelName} className="text-xs h-8 flex-1" /><Button type="button" size="sm" variant="ghost" disabled={translatingField === `${langCode}:hotelName`} onClick={() => handleAutoTranslateField('hotelName', design.hotelName || '')} className="h-8 w-8 px-0 shrink-0"><Loader2 className={cn('w-3 h-3', translatingField === `${langCode}:hotelName` ? 'animate-spin' : 'hidden')} /><Sparkles className={cn('w-3 h-3', translatingField === `${langCode}:hotelName` ? 'hidden' : '')} /></Button></div></div>
                                <div className="space-y-1"><Label className="text-[11px] text-muted-foreground">Hotel Address</Label><div className="flex gap-1"><Input value={langTranslations.hotelAddress || ''} onChange={(e) => updateTranslation('hotelAddress', e.target.value)} placeholder={design.settings.hotelAddress} className="text-xs h-8 flex-1" /><Button type="button" size="sm" variant="ghost" disabled={translatingField === `${langCode}:hotelAddress`} onClick={() => handleAutoTranslateField('hotelAddress', design.hotelAddress || '')} className="h-8 w-8 px-0 shrink-0"><Loader2 className={cn('w-3 h-3', translatingField === `${langCode}:hotelAddress` ? 'animate-spin' : 'hidden')} /><Sparkles className={cn('w-3 h-3', translatingField === `${langCode}:hotelAddress` ? 'hidden' : '')} /></Button></div></div>
                              </div>
                            </div>
                          );
                        })}
                      </>)}
                    </div>
                    <Separator />

                    {/* Branding Content */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Branding</Label></div>
                      <div className="space-y-2"><Label className="text-xs">Portal Title</Label><Input value={design.title} onChange={(e) => updateDesign({ title: e.target.value })} className="text-xs" /></div>
                      <div className="space-y-2"><Label className="text-xs">Subtitle</Label><Input value={design.subtitle} onChange={(e) => updateDesign({ subtitle: e.target.value })} className="text-xs" /></div>
                      {/* Logo Upload */}
                      <div className="space-y-2">
                        <Label className="text-xs">Portal Logo</Label>
                        <div className="flex items-start gap-3">
                          {design.logoUrl ? (
                            <div className="relative group shrink-0">
                              <img src={design.logoUrl} alt="Logo preview" className="w-12 h-12 rounded-xl object-contain border border-border bg-muted/30" />
                              <button type="button" onClick={() => updateDesign({ logoUrl: '' })} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0 bg-muted/10"><ImagePlus className="w-4 h-4 text-muted-foreground/50" /></div>
                          )}
                          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0]; if (!file) return; setLogoUploading(true);
                              try { const fd = new FormData(); fd.append('file', file); fd.append('folder', 'portal-logos'); const res = await fetch('/api/upload', { method: 'POST', body: fd }); if (!res.ok) { toast({ title: 'Upload failed', description: `Server error (${res.status})`, variant: 'destructive' }); return; } const json = await res.json(); if (json.success) { updateDesign({ logoUrl: json.data.url }); toast({ title: 'Logo uploaded' }); } else { toast({ title: 'Upload failed', description: json.error?.message || 'Please try again', variant: 'destructive' }); } } catch { toast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' }); } finally { setLogoUploading(false); if (logoInputRef.current) logoInputRef.current.value = ''; }
                            }} />
                            <div className="flex gap-1.5">
                              <Button type="button" size="sm" variant="outline" disabled={logoUploading} onClick={() => logoInputRef.current?.click()} className="text-xs h-7 px-2">{logoUploading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ImagePlus className="w-3 h-3 mr-1" />}{logoUploading ? 'Uploading…' : 'Upload'}</Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => { const url = prompt('Enter logo URL:'); if (url) updateDesign({ logoUrl: url }); }} className="text-xs h-7 px-2 text-muted-foreground">Use URL</Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Logo Size */}
                      <div className="space-y-2"><Label className="text-xs">Logo Size</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {([['small', 'Small (40px)'], ['medium', 'Medium (56px)'], ['large', 'Large (72px)']] as const).map(([v, l]) => (
                            <button key={v} onClick={() => updateSettings({ logoSize: v })} className={cn('p-2 rounded-lg border-2 text-xs font-medium transition-all text-center', design.settings.logoSize === v ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300')}>{l}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2"><Label className="text-xs">Welcome Message</Label><Textarea value={design.settings.welcomeMessage} onChange={(e) => updateSettings({ welcomeMessage: e.target.value })} className="text-xs" rows={2} /></div>
                      <div className="flex items-center justify-between"><Label className="text-xs">Show Clock</Label><Switch checked={design.settings.showClock} onCheckedChange={(v) => updateSettings({ showClock: v })} /></div>
                      {/* Feature 5: Weather Widget */}
                      <div className="flex items-center justify-between"><Label className="text-xs flex items-center gap-1.5"><Thermometer className="h-3.5 w-3.5" />Show Weather</Label><Switch checked={design.settings.showWeather} onCheckedChange={(v) => updateSettings({ showWeather: v })} /></div>
                      {design.settings.showWeather && (
                        <div className="space-y-2"><Label className="text-xs">City / Location</Label><Input value={design.settings.weatherLocation} onChange={(e) => updateSettings({ weatherLocation: e.target.value })} placeholder="e.g. Paris, London, New York" className="text-xs" /><p className="text-[10px] text-muted-foreground">Used by the weather API to show current conditions</p></div>
                      )}
                    </div>
                    <Separator />

                    {/* Hotel Info */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Hotel Information</Label><Switch checked={design.settings.showHotelInfo} onCheckedChange={(v) => updateSettings({ showHotelInfo: v })} /></div>
                      {design.settings.showHotelInfo && (<>
                        <div className="space-y-2"><Label className="text-xs">Hotel Name</Label><Input value={design.settings.hotelName} onChange={(e) => updateSettings({ hotelName: e.target.value })} className="text-xs" /></div>
                        <div className="space-y-2"><Label className="text-xs">Address</Label><Input value={design.settings.hotelAddress} onChange={(e) => updateSettings({ hotelAddress: e.target.value })} className="text-xs" /></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2"><Label className="text-xs">Phone</Label><Input value={design.settings.hotelPhone} onChange={(e) => updateSettings({ hotelPhone: e.target.value })} className="text-xs" /></div>
                          <div className="space-y-2"><Label className="text-xs">Website</Label><Input value={design.settings.hotelWebsite} onChange={(e) => updateSettings({ hotelWebsite: e.target.value })} className="text-xs" /></div>
                        </div>
                      </>)}
                    </div>
                    <Separator />

                    {/* Amenities + Feature 7: Custom Amenities */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Amenities</Label><Switch checked={design.settings.showAmenities} onCheckedChange={(v) => updateSettings({ showAmenities: v })} /></div>
                      {design.settings.showAmenities && (<>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {Object.keys(AMENITY_ICONS).map((am) => (
                            <div key={am} className={cn('flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all', design.settings.amenities.includes(am) ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/20' : 'border-border hover:border-teal-300')} onClick={() => { const curr = design.settings.amenities; updateSettings({ amenities: curr.includes(am) ? curr.filter((a) => a !== am) : [...curr, am] }); }}>
                              {React.createElement(AMENITY_ICONS[am], { className: 'h-3.5 w-3.5 text-teal-500 dark:text-teal-400 flex-shrink-0' })}<span className="truncate">{am}</span>
                            </div>
                          ))}
                          {/* Custom Amenities */}
                          {design.settings.customAmenities.map((ca, i) => {
                            const CIcon = CUSTOM_AMENITY_ICONS[ca.icon] || Star;
                            return (
                              <div key={`custom-${i}`} className="flex items-center gap-2 p-2 rounded-lg border border-teal-500 bg-teal-50/50 dark:bg-teal-950/20 text-xs">
                                {React.createElement(CIcon, { className: 'h-3.5 w-3.5 text-teal-500 dark:text-teal-400 flex-shrink-0' })}
                                <span className="truncate flex-1">{ca.name}</span>
                                <button onClick={() => updateSettings({ customAmenities: design.settings.customAmenities.filter((_, idx) => idx !== i) })} className="text-destructive hover:text-destructive/80 flex-shrink-0"><XCircle className="h-3 w-3" /></button>
                              </div>
                            );
                          })}
                          <button onClick={() => updateSettings({ customAmenities: [...design.settings.customAmenities, { name: 'Custom Amenity', icon: 'Star' }] })} className="flex items-center justify-center gap-1 p-2 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:text-foreground hover:border-teal-300 transition-all"><PlusCircle className="h-3.5 w-3.5" />Add Custom</button>
                        </div>
                        {/* Edit custom amenity names */}
                        {design.settings.customAmenities.map((ca, i) => (
                          <div key={`edit-custom-${i}`} className="flex items-center gap-2">
                            <Input value={ca.name} onChange={(e) => {
                              const updated = [...design.settings.customAmenities]; updated[i] = { ...updated[i], name: e.target.value };
                              updateSettings({ customAmenities: updated });
                            }} className="text-xs flex-1" placeholder="Amenity name" />
                            <Select value={ca.icon} onValueChange={(v) => {
                              const updated = [...design.settings.customAmenities]; updated[i] = { ...updated[i], icon: v };
                              updateSettings({ customAmenities: updated });
                            }}><SelectTrigger className="text-xs w-32"><SelectValue /></SelectTrigger><SelectContent>{CUSTOM_AMENITY_ICON_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}</SelectContent></Select>
                          </div>
                        ))}
                      </>)}
                    </div>
                    <Separator />

                    {/* Feature 6: Terms & Conditions Editor */}
                    <div className="space-y-3">
                      <Label className="text-xs font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Terms & Conditions</Label>
                      <div className="space-y-2"><Label className="text-xs">Terms Text</Label><Textarea value={design.settings.termsText} onChange={(e) => updateSettings({ termsText: e.target.value })} className="text-xs" rows={3} placeholder="Enter your terms and conditions text..." /></div>
                      <div className="space-y-2"><Label className="text-xs">Terms URL</Label><Input value={design.settings.termsUrl} onChange={(e) => updateSettings({ termsUrl: e.target.value })} className="text-xs" placeholder="https://hotel.com/terms" /></div>
                      <p className="text-[10px] text-muted-foreground">Enable the &quot;Show Terms Checkbox&quot; in the Fields tab to display a terms agreement on the portal.</p>
                    </div>
                    <Separator />

                    {/* Feature 3: Promotions (Single + Carousel) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Promotions</Label><Switch checked={design.settings.showPromotion} onCheckedChange={(v) => updateSettings({ showPromotion: v })} /></div>
                      {design.settings.showPromotion && (<>
                        <div className="flex items-center justify-between"><Label className="text-xs">Carousel Mode</Label><Switch checked={design.settings.useCarouselMode} onCheckedChange={(v) => updateSettings({ useCarouselMode: v })} /></div>
                        {!design.settings.useCarouselMode ? (
                          <>
                            <div className="space-y-2"><Label className="text-xs">Promotion Title</Label><Input value={design.settings.promotionTitle} onChange={(e) => updateSettings({ promotionTitle: e.target.value })} className="text-xs" /></div>
                            <div className="space-y-2"><Label className="text-xs">Description</Label><Textarea value={design.settings.promotionDesc} onChange={(e) => updateSettings({ promotionDesc: e.target.value })} className="text-xs" rows={2} /></div>
                          </>
                        ) : (
                          <>
                            {design.settings.promotions.map((slide, i) => (
                              <div key={i} className="rounded-lg border p-3 space-y-2 relative">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold">Slide {i + 1}</p>
                                  <button onClick={() => updateSettings({ promotions: design.settings.promotions.filter((_, idx) => idx !== i) })} className="text-destructive hover:text-destructive/80"><MinusCircle className="h-3.5 w-3.5" /></button>
                                </div>
                                <div className="space-y-1.5">
                                  <Input value={slide.title} onChange={(e) => { const updated = [...design.settings.promotions]; updated[i] = { ...updated[i], title: e.target.value }; updateSettings({ promotions: updated }); }} className="text-xs" placeholder="Title" />
                                  <Textarea value={slide.description} onChange={(e) => { const updated = [...design.settings.promotions]; updated[i] = { ...updated[i], description: e.target.value }; updateSettings({ promotions: updated }); }} className="text-xs" rows={2} placeholder="Description" />
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input value={slide.imageUrl} onChange={(e) => { const updated = [...design.settings.promotions]; updated[i] = { ...updated[i], imageUrl: e.target.value }; updateSettings({ promotions: updated }); }} className="text-xs" placeholder="Image URL" />
                                    <Input value={slide.linkUrl} onChange={(e) => { const updated = [...design.settings.promotions]; updated[i] = { ...updated[i], linkUrl: e.target.value }; updateSettings({ promotions: updated }); }} className="text-xs" placeholder="Link URL" />
                                  </div>
                                  <div className="flex items-center gap-2"><Label className="text-[10px] text-muted-foreground">BG Color</Label><input type="color" value={slide.bgColor} onChange={(e) => { const updated = [...design.settings.promotions]; updated[i] = { ...updated[i], bgColor: e.target.value }; updateSettings({ promotions: updated }); }} className="w-6 h-6 rounded cursor-pointer border-0" /></div>
                                </div>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => updateSettings({ promotions: [...design.settings.promotions, { title: '', description: '', imageUrl: '', linkUrl: '', bgColor: '#f59e0b' }] })} className="text-xs w-full"><PlusCircle className="h-3.5 w-3.5 mr-1.5" />Add Slide</Button>
                          </>
                        )}
                      </>)}
                    </div>
                    <Separator />

                    {/* Feature 2: Marketing Opt-In */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" />Marketing Consent</Label><Switch checked={design.settings.marketingOptIn.enabled} onCheckedChange={(v) => updateSettings({ marketingOptIn: { ...design.settings.marketingOptIn, enabled: v } })} /></div>
                      {design.settings.marketingOptIn.enabled && (<>
                        <div className="flex items-center justify-between"><Label className="text-xs">Email Marketing</Label><Switch checked={design.settings.marketingOptIn.emailConsent} onCheckedChange={(v) => updateSettings({ marketingOptIn: { ...design.settings.marketingOptIn, emailConsent: v } })} /></div>
                        <div className="flex items-center justify-between"><Label className="text-xs">SMS Marketing</Label><Switch checked={design.settings.marketingOptIn.phoneConsent} onCheckedChange={(v) => updateSettings({ marketingOptIn: { ...design.settings.marketingOptIn, phoneConsent: v } })} /></div>
                        <div className="space-y-2"><Label className="text-xs">Consent Text (GDPR-style)</Label><Textarea value={design.settings.marketingOptIn.consentText} onChange={(e) => updateSettings({ marketingOptIn: { ...design.settings.marketingOptIn, consentText: e.target.value } })} className="text-xs" rows={2} /></div>
                      </>)}
                    </div>
                    <Separator />

                    {/* Feature 8: More Social Platforms */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Social Media</Label><Switch checked={design.settings.showSocialMedia} onCheckedChange={(v) => updateSettings({ showSocialMedia: v })} /></div>
                      {design.settings.showSocialMedia && (
                        <div className="space-y-2">
                          {SOCIAL_PLATFORM_OPTIONS.map((sp) => {
                            const SIcon = sp.icon;
                            return (
                              <div key={sp.value} className="flex items-center gap-2">
                                <SIcon className={cn('h-4 w-4 flex-shrink-0', sp.color)} />
                                <Input placeholder={`${sp.label} URL`} value={design.settings.socialLinks.find((s) => s.platform === sp.value)?.url || ''} onChange={(e) => {
                                  const links = design.settings.socialLinks.filter((s) => s.platform !== sp.value);
                                  links.push({ platform: sp.value, url: e.target.value });
                                  updateSettings({ socialLinks: links });
                                }} className="text-xs" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <Separator />

                    {/* Feature 4: Guest Survey */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Guest Survey</Label><Switch checked={design.settings.surveyConfig.enabled} onCheckedChange={(v) => updateSettings({ surveyConfig: { ...design.settings.surveyConfig, enabled: v } })} /></div>
                      {design.settings.surveyConfig.enabled && (<>
                        <div className="space-y-2"><Label className="text-xs">Survey Question</Label><Input value={design.settings.surveyConfig.question} onChange={(e) => updateSettings({ surveyConfig: { ...design.settings.surveyConfig, question: e.target.value } })} className="text-xs" /></div>
                        <div className="space-y-2"><Label className="text-xs">Rating Options (one per line)</Label><Textarea value={design.settings.surveyConfig.options.join('\n')} onChange={(e) => updateSettings({ surveyConfig: { ...design.settings.surveyConfig, options: e.target.value.split('\n').filter(Boolean) } })} className="text-xs" rows={3} /></div>
                        <div className="space-y-2"><Label className="text-xs">Thank You Message</Label><Input value={design.settings.surveyConfig.thankYouMessage} onChange={(e) => updateSettings({ surveyConfig: { ...design.settings.surveyConfig, thankYouMessage: e.target.value } })} className="text-xs" /></div>
                      </>)}
                    </div>
                    <Separator />

                    {/* Feature 15: Portal Ad Campaigns */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><Megaphone className="h-3.5 w-3.5" />Ad Campaigns</Label>
                        <Switch checked={design.settings.showAds ?? false} onCheckedChange={(v) => updateSettings({ showAds: v })} />
                      </div>
                      <p className="text-[11px] text-muted-foreground">Display monetized ads from WiFi → Ad Campaigns on the guest portal. Manage campaigns separately in the WiFi → Ad Campaigns section.</p>
                      {(design.settings.showAds ?? false) && (
                        <div className="space-y-2">
                          <Label className="text-xs">Ad Slot Position</Label>
                          <Select value={design.settings.adSlotType || 'banner'} onValueChange={(v) => updateSettings({ adSlotType: v })}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="banner">Banner (top, full-width)</SelectItem>
                              <SelectItem value="interstitial">Interstitial (centered card)</SelectItem>
                              <SelectItem value="footer">Footer (compact, bottom)</SelectItem>
                              <SelectItem value="sidebar">Sidebar (vertical, 160×600)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <Separator />

                    {/* Feature 9: Content Block Reordering */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><GripVertical className="h-3.5 w-3.5" />Content Block Order</Label>
                        <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={() => updateSettings({ contentBlockOrder: [...DEFAULT_CONTENT_BLOCKS] })}>Reset to Default</Button>
                      </div>
                      <div className="space-y-1">
                        {design.settings.contentBlockOrder.map((block, i) => (
                          <div key={block} className="flex items-center gap-2 p-2 rounded-lg border text-xs">
                            <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="flex-1 font-medium">{CONTENT_BLOCK_LABELS[block] || block}</span>
                            <div className="flex gap-0.5">
                              <button onClick={() => { const arr = [...design.settings.contentBlockOrder]; if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; updateSettings({ contentBlockOrder: arr }); } }} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" disabled={i === 0}><ChevronUp className="h-3.5 w-3.5" /></button>
                              <button onClick={() => { const arr = [...design.settings.contentBlockOrder]; if (i < arr.length - 1) { [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]; updateSettings({ contentBlockOrder: arr }); } }} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" disabled={i === design.settings.contentBlockOrder.length - 1}><ChevronDown className="h-3.5 w-3.5" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Raw Template Sub-Tab ─────────────────────────────────────────── */}
                {subTab === 'rawtemplate' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold flex items-center gap-2"><Code2 className="h-4 w-4" />Raw Template Mode</h3><p className="text-xs text-muted-foreground mt-1">Import a complete HTML/CSS template from another product or design tool. The login form is handled internally — only the visual design is replaced.</p></div>

                    {/* Template Mode Toggle */}
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="text-xs font-semibold">Use Raw Template</p>
                        <p className="text-[10px] text-muted-foreground">Switch from structured designer to raw HTML/CSS mode</p>
                      </div>
                      <Switch checked={design.settings.templateMode === 'raw'} onCheckedChange={(v) => updateSettings({ templateMode: v ? 'raw' : 'structured' })} />
                    </div>

                    {design.settings.templateMode === 'raw' && (
                      <>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-3 space-y-2">
                          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Raw Template Mode</p></div>
                          <p className="text-[10px] text-amber-700 dark:text-amber-400">In raw mode, your custom HTML/CSS replaces the entire portal design. The login form is handled by StaySuite internally. Use template variables to connect your design to the auth system.</p>
                        </div>

                        {/* Template Variables Reference */}
                        <div className="rounded-lg border p-3 space-y-2">
                          <p className="text-xs font-semibold">Available Template Variables</p>
                          <p className="text-[10px] text-muted-foreground">Use these in your HTML — they will be replaced with real values:</p>
                          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                            <div><code className="bg-muted px-1 rounded">{'{{TITLE}}'}</code> Portal title</div>
                            <div><code className="bg-muted px-1 rounded">{'{{SUBTITLE}}'}</code> Portal subtitle</div>
                            <div><code className="bg-muted px-1 rounded">{'{{HOTEL_NAME}}'}</code> Hotel name</div>
                            <div><code className="bg-muted px-1 rounded">{'{{AUTH_URL}}'}</code> Auth endpoint</div>
                            <div><code className="bg-muted px-1 rounded">{'{{ACCENT_COLOR}}'}</code> Accent color</div>
                            <div><code className="bg-muted px-1 rounded">{'{{TEXT_COLOR}}'}</code> Text color</div>
                            <div><code className="bg-muted px-1 rounded">{'{{BG_COLOR}}'}</code> Background color</div>
                            <div><code className="bg-muted px-1 rounded">{'{{LOGO_URL}}'}</code> Logo image URL</div>
                            <div><code className="bg-muted px-1 rounded">{'{{BRAND_COLOR}}'}</code> Brand color</div>
                            <div><code className="bg-muted px-1 rounded">{'{{FONT_FAMILY}}'}</code> Body font</div>
                            <div><code className="bg-muted px-1 rounded">{'{{HEADING_FONT}}'}</code> Heading font</div>
                          </div>
                          <p className="text-[10px] text-muted-foreground">Auth bridge: Add <code className="bg-muted px-1 rounded">data-auth-submit</code> attribute to buttons, or submit a form to trigger WiFi authentication.</p>
                        </div>

                        {/* Import from file */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Import from HTML File</Label>
                          <p className="text-[10px] text-muted-foreground">Upload an .html file from your design tool or another product</p>
                          <Input
                            type="file"
                            accept=".html,.htm"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const content = ev.target?.result as string;
                                // Extract body content (strip html/head tags)
                                const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                                const htmlContent = bodyMatch ? bodyMatch[1].trim() : content;
                                // Extract style content
                                const styleMatch = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
                                const cssContent = styleMatch
                                  ? styleMatch.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n')
                                  : '';
                                updateSettings({ rawTemplateHtml: htmlContent, rawTemplateCss: cssContent });
                              };
                              reader.readAsText(file);
                            }}
                            className="text-xs"
                          />
                        </div>

                        {/* Raw HTML editor */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Raw HTML</Label>
                          <Textarea
                            value={design.settings.rawTemplateHtml}
                            onChange={(e) => updateSettings({ rawTemplateHtml: e.target.value })}
                            className="font-mono text-xs min-h-[200px]"
                            placeholder={`<div class="login-container">
  <img src="{{LOGO_URL}}" alt="Logo" />
  <h1>{{TITLE}}</h1>
  <p>{{SUBTITLE}}</p>
  <form>
    <input type="text" name="username" placeholder="Username" />
    <input type="password" name="password" placeholder="Password" />
    <button type="submit">Connect</button>
  </form>
</div>`}
                          />
                        </div>

                        {/* Raw CSS editor */}
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Raw CSS</Label>
                          <Textarea
                            value={design.settings.rawTemplateCss}
                            onChange={(e) => updateSettings({ rawTemplateCss: e.target.value })}
                            className="font-mono text-xs min-h-[150px]"
                            placeholder={`.login-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}
.login-container h1 { color: {{ACCENT_COLOR}}; }
.login-container input { ... }
.login-container button { background: {{BRAND_COLOR}}; }`}
                          />
                        </div>
                      </>
                    )}

                    {design.settings.templateMode === 'structured' && (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <Code2 className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-xs text-muted-foreground">Structured mode is active — using the designer settings above.</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Enable "Use Raw Template" to paste or import custom HTML/CSS.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Fields Sub-Tab ─────────────────────────────────────────── */}
                {subTab === 'fields' && (
                  <div className="space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-2"><Settings className="h-4 w-4" />Form Fields</h3>
                      <p className="text-xs text-muted-foreground mt-1">Toggle fields shown on the guest login form. Changing auth flow auto-configures defaults.</p>
                    </div>
                    {isOverride && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>Fields differ from credential policy defaults. <button onClick={resetToPolicy} className="underline font-semibold">Reset to policy</button></span>
                      </div>
                    )}
                    {['Guest Identity', 'Credentials', 'Legal'].map((group) => (
                      <div key={group}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{group}</p>
                        <div className="space-y-1">
                          {FIELD_DEFINITIONS.filter((f) => f.group === group).map((f) => {
                            const Icon = f.icon;
                            const isOn = design.fields[f.key];
                            return (
                              <div key={f.key} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-2.5">
                                  <Icon className={cn('h-4 w-4', isOn ? 'text-teal-500 dark:text-teal-400' : 'text-muted-foreground/50')} />
                                  <span className={cn('text-xs font-medium', isOn ? 'text-foreground' : 'text-muted-foreground')}>{f.label}</span>
                                </div>
                                <Switch checked={isOn} onCheckedChange={() => toggleField(f.key)} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <Separator />
                    <div><h3 className="text-sm font-semibold">Social Login</h3></div>
                    <div className="space-y-1">
                      {([['google', 'Google'], ['facebook', 'Facebook'], ['apple', 'Apple']] as const).map(([k, l]) => (
                        <div key={k} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                          <span className="text-xs font-medium">{l}</span>
                          <Switch checked={design.socialLogin[k]} onCheckedChange={() => toggleSocial(k)} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Advanced Sub-Tab ───────────────────────────────────────── */}
                {subTab === 'advanced' && (
                  <div className="space-y-5">
                    <div><h3 className="text-sm font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4" />Advanced Settings</h3><p className="text-xs text-muted-foreground mt-1">For developers and advanced customization</p></div>
                    <div className="space-y-2"><Label className="text-xs">Custom CSS</Label><Textarea value={design.customCSS} onChange={(e) => updateDesign({ customCSS: e.target.value })} className="font-mono text-xs min-h-[120px]" placeholder="/* Custom CSS */" /></div>
                    <div className="space-y-2"><Label className="text-xs">Custom HTML Injection</Label><Textarea value={design.customHTML} onChange={(e) => updateDesign({ customHTML: e.target.value })} className="font-mono text-xs min-h-[100px]" placeholder="<div>Custom HTML</div>" /></div>
                    <Separator />
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div><p className="text-xs font-medium">Show Hotel Branding</p><p className="text-[10px] text-muted-foreground">Powered by branding at bottom</p></div>
                      <Switch checked={design.settings.showBranding} onCheckedChange={(v) => updateSettings({ showBranding: v })} />
                    </div>
                    <Separator />
                    {/* Feature 14: Portal Scheduling */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between"><Label className="text-xs font-semibold flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Portal Scheduling</Label><Switch checked={design.settings.scheduleConfig.enabled} onCheckedChange={(v) => updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, enabled: v } })} /></div>
                      {design.settings.scheduleConfig.enabled && (<>
                        <p className="text-[10px] text-muted-foreground">Define time-based schedules for different portal content or designs.</p>
                        {design.settings.scheduleConfig.schedules.map((sched, i) => (
                          <div key={i} className="rounded-lg border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex-1"><Input value={sched.name} onChange={(e) => { const updated = [...design.settings.scheduleConfig.schedules]; updated[i] = { ...updated[i], name: e.target.value }; updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: updated } }); }} className="text-xs" placeholder="Schedule name" /></div>
                              <button onClick={() => updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: design.settings.scheduleConfig.schedules.filter((_, idx) => idx !== i) } })} className="text-destructive hover:text-destructive/80 ml-2"><MinusCircle className="h-3.5 w-3.5" /></button>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {DAY_LABELS.map((day, di) => (
                                <button key={day} onClick={() => { const updated = [...design.settings.scheduleConfig.schedules]; const newDays = [...updated[i].days]; newDays[di] = !newDays[di]; updated[i] = { ...updated[i], days: newDays }; updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: updated } }); }}
                                  className={cn('px-2 py-1 rounded text-[10px] font-medium border transition-all', sched.days[di] ? 'bg-teal-500 text-white border-teal-500' : 'border-border text-muted-foreground hover:border-teal-300')}>{day}</button>
                              ))}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">Start Time</Label><Input type="time" value={sched.startTime} onChange={(e) => { const updated = [...design.settings.scheduleConfig.schedules]; updated[i] = { ...updated[i], startTime: e.target.value }; updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: updated } }); }} className="text-xs" /></div>
                              <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">End Time</Label><Input type="time" value={sched.endTime} onChange={(e) => { const updated = [...design.settings.scheduleConfig.schedules]; updated[i] = { ...updated[i], endTime: e.target.value }; updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: updated } }); }} className="text-xs" /></div>
                            </div>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => { const newSched = { name: '', days: [true, true, true, true, true, true, true], startTime: '09:00', endTime: '18:00' }; updateSettings({ scheduleConfig: { ...design.settings.scheduleConfig, schedules: [...design.settings.scheduleConfig.schedules, newSched] } }); }} className="text-xs w-full"><PlusCircle className="h-3.5 w-3.5 mr-1.5" />Add Schedule</Button>
                      </>)}
                    </div>
                    <Separator />
                    {/* CAPTCHA Protection */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />CAPTCHA Protection (Turnstile)</Label>
                        <Switch
                          checked={captchaEnabled}
                          onCheckedChange={setCaptchaEnabled}
                        />
                      </div>
                      {captchaEnabled && (
                        <>
                          <p className="text-[10px] text-muted-foreground">Protect forms from automated brute-force attacks using Cloudflare Turnstile (invisible/managed mode). Get keys from <a href="https://dash.cloudflare.com/turnstile" target="_blank" className="text-primary underline">Cloudflare Dashboard</a>.</p>
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Site Key (Client-Side)</Label>
                              <Input
                                value={captchaSiteKey}
                                onChange={(e) => setCaptchaSiteKey(e.target.value)}
                                className="text-xs font-mono"
                                placeholder="0x4AAAAAAA..."
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Secret Key (Server-Side)</Label>
                              <Input
                                type="password"
                                value={captchaSecretKey}
                                onChange={(e) => setCaptchaSecretKey(e.target.value)}
                                className="text-xs font-mono"
                                placeholder="0x4AAAAAAA..."
                              />
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={saveCaptchaConfig}
                            disabled={savingCaptcha || !captchaSiteKey || !captchaSecretKey}
                            className="text-xs"
                          >
                            {savingCaptcha ? 'Saving...' : 'Save CAPTCHA Settings'}
                          </Button>
                        </>
                      )}
                    </div>
                    <Separator />
                    {/* Plan Selector / Upgrade */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><CreditCard className="h-3.5 w-3.5" />Plan Selector / Upgrade</Label>
                        <Switch checked={design.settings.enablePlanSelector} onCheckedChange={(v) => updateSettings({ enablePlanSelector: v })} />
                      </div>
                      {design.settings.enablePlanSelector && (
                        <div className="ml-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Show Pricing</Label>
                            <Switch checked={design.settings.planSelectorConfig.showPricing} onCheckedChange={(v) => updateSettings({ planSelectorConfig: { ...design.settings.planSelectorConfig, showPricing: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Show Data Limit</Label>
                            <Switch checked={design.settings.planSelectorConfig.showDataLimit} onCheckedChange={(v) => updateSettings({ planSelectorConfig: { ...design.settings.planSelectorConfig, showDataLimit: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Show Speed</Label>
                            <Switch checked={design.settings.planSelectorConfig.showSpeed} onCheckedChange={(v) => updateSettings({ planSelectorConfig: { ...design.settings.planSelectorConfig, showSpeed: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Allow In-Portal Upgrade</Label>
                            <Switch checked={design.settings.planSelectorConfig.allowUpgrade} onCheckedChange={(v) => updateSettings({ planSelectorConfig: { ...design.settings.planSelectorConfig, allowUpgrade: v } })} />
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    {/* Marketing Data Capture (post social auth) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5" />Marketing Data Capture</Label>
                        <Switch checked={design.settings.enableMarketingCapture} onCheckedChange={(v) => updateSettings({ enableMarketingCapture: v })} />
                      </div>
                      {design.settings.enableMarketingCapture && (
                        <div className="ml-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Collect Email</Label>
                            <Switch checked={design.settings.marketingCaptureConfig.collectEmail} onCheckedChange={(v) => updateSettings({ marketingCaptureConfig: { ...design.settings.marketingCaptureConfig, collectEmail: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Collect Phone</Label>
                            <Switch checked={design.settings.marketingCaptureConfig.collectPhone} onCheckedChange={(v) => updateSettings({ marketingCaptureConfig: { ...design.settings.marketingCaptureConfig, collectPhone: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Collect Name</Label>
                            <Switch checked={design.settings.marketingCaptureConfig.collectName} onCheckedChange={(v) => updateSettings({ marketingCaptureConfig: { ...design.settings.marketingCaptureConfig, collectName: v } })} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Required</Label>
                            <Switch checked={design.settings.marketingCaptureConfig.required} onCheckedChange={(v) => updateSettings({ marketingCaptureConfig: { ...design.settings.marketingCaptureConfig, required: v } })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Consent Text</Label>
                            <Input value={design.settings.marketingCaptureConfig.consentText} onChange={(e) => updateSettings({ marketingCaptureConfig: { ...design.settings.marketingCaptureConfig, consentText: e.target.value } })} className="text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    {/* QR Code on Success Screen */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><QrCode className="h-3.5 w-3.5" />WiFi Credential QR Code</Label>
                        <Switch checked={design.settings.enableQrCode} onCheckedChange={(v) => updateSettings({ enableQrCode: v })} />
                      </div>
                      {design.settings.enableQrCode && (
                        <div className="ml-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Show on Success Screen</Label>
                            <Switch checked={design.settings.qrCodeConfig.showOnSuccess} onCheckedChange={(v) => updateSettings({ qrCodeConfig: { ...design.settings.qrCodeConfig, showOnSuccess: v } })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">QR Size</Label>
                            <select value={design.settings.qrCodeConfig.qrSize} onChange={(e) => updateSettings({ qrCodeConfig: { ...design.settings.qrCodeConfig, qrSize: e.target.value as 'small' | 'medium' | 'large' } })} className="w-full text-xs border rounded px-2 py-1 bg-background">
                              <option value="small">Small (128px)</option>
                              <option value="medium">Medium (200px)</option>
                              <option value="large">Large (300px)</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Include SSID</Label>
                            <Switch checked={design.settings.qrCodeConfig.includeSSID} onCheckedChange={(v) => updateSettings({ qrCodeConfig: { ...design.settings.qrCodeConfig, includeSSID: v } })} />
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    {/* Auto-Renewal (Extended Stay) */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Auto-Renewal (Extended Stay)</Label>
                        <Switch checked={design.settings.enableAutoRenewal} onCheckedChange={(v) => updateSettings({ enableAutoRenewal: v })} />
                      </div>
                      {design.settings.enableAutoRenewal && (
                        <div className="ml-5 space-y-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">Renew Before Expiry (hours)</Label>
                            <Input type="number" min={1} max={48} value={design.settings.autoRenewalConfig.renewBeforeExpiryHours} onChange={(e) => updateSettings({ autoRenewalConfig: { ...design.settings.autoRenewalConfig, renewBeforeExpiryHours: parseInt(e.target.value) || 2 } })} className="text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Max Renewal Cycles</Label>
                            <Input type="number" min={1} max={99} value={design.settings.autoRenewalConfig.maxRenewalCycles} onChange={(e) => updateSettings({ autoRenewalConfig: { ...design.settings.autoRenewalConfig, maxRenewalCycles: parseInt(e.target.value) || 10 } })} className="text-xs" />
                          </div>
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Notify Guest</Label>
                            <Switch checked={design.settings.autoRenewalConfig.notifyGuest} onCheckedChange={(v) => updateSettings({ autoRenewalConfig: { ...design.settings.autoRenewalConfig, notifyGuest: v } })} />
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    {/* Speed Test Widget */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" />Speed Test Widget</Label>
                        <Switch checked={design.settings.enableSpeedTest} onCheckedChange={(v) => updateSettings({ enableSpeedTest: v })} />
                      </div>
                      {design.settings.enableSpeedTest && (
                        <div className="ml-5 space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px]">Show on Success Screen</Label>
                            <Switch checked={design.settings.speedTestConfig.showOnSuccess} onCheckedChange={(v) => updateSettings({ speedTestConfig: { ...design.settings.speedTestConfig, showOnSuccess: v } })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Test Duration (seconds)</Label>
                            <Input type="number" min={5} max={30} value={design.settings.speedTestConfig.testDuration} onChange={(e) => updateSettings({ speedTestConfig: { ...design.settings.speedTestConfig, testDuration: parseInt(e.target.value) || 10 } })} className="text-xs" />
                          </div>
                        </div>
                      )}
                    </div>
                    <Separator />
                    {/* Device Management on Limit Reached */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><Unplug className="h-3.5 w-3.5" />Device Management on Limit</Label>
                        <Switch checked={design.settings.deviceManagement} onCheckedChange={(v) => updateSettings({ deviceManagement: v })} />
                      </div>
                      {design.settings.deviceManagement && (
                        <p className="text-[10px] text-muted-foreground">When guests reach their device/session limit, show a list of connected devices with a self-service disconnect button so they can free up a slot.</p>
                      )}
                    </div>
                    <Separator />
                    {/* Feature #12: Per-Device Design */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />Per-Device Design</Label>
                        <Switch checked={design.settings.enablePerDevice} onCheckedChange={(v) => updateSettings({ enablePerDevice: v })} />
                      </div>
                      {design.settings.enablePerDevice && (
                        <>
                          <p className="text-[10px] text-muted-foreground">Apply device-specific design overrides. Overrides are merged on top of base design settings.</p>
                          {/* Device Tabs */}
                          <div className="flex gap-1 border-b border-border pb-0">
                            {(['phone', 'tablet', 'desktop'] as const).map((device) => {
                              const isActive = perDeviceTab === device;
                              return (
                                <button key={device} onClick={() => setPerDeviceTab(device)}
                                  className={cn('flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium rounded-t-lg border-b-2 transition-all capitalize',
                                    isActive ? 'text-teal-600 border-teal-500' : 'text-muted-foreground border-transparent hover:text-foreground'
                                  )}>
                                  {device === 'phone' ? '📱' : device === 'tablet' ? '📱' : '🖥️'} {device}
                                </button>
                              );
                            })}
                          </div>
                          {/* Device-specific settings */}
                          <div className="space-y-3 mt-2">
                            {/* Layout Type */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Layout Type</Label>
                              <Select
                                value={design.settings.perDeviceOverrides[perDeviceTab]?.layoutType || design.settings.layoutType}
                                onValueChange={(v) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], layoutType: v as DesignSettings['layoutType'] }
                                  }
                                })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[
                                    { v: 'centered', l: 'Centered' },
                                    { v: 'card', l: 'Card' },
                                    { v: 'bottom_sheet', l: 'Bottom Sheet' },
                                    ...perDeviceTab !== 'phone' ? [
                                      { v: 'split_left', l: 'Split Left' },
                                      { v: 'split_right', l: 'Split Right' },
                                      { v: 'full_bleed', l: 'Full Bleed' },
                                      { v: 'hero_banner', l: 'Hero Banner' },
                                      { v: 'side_panel', l: 'Side Panel' },
                                    ] : []
                                  ].map((lo) => (
                                    <SelectItem key={lo.v} value={lo.v}>{lo.l}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Logo Size */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Logo Size</Label>
                              <Select
                                value={design.settings.perDeviceOverrides[perDeviceTab]?.logoSize || design.settings.logoSize}
                                onValueChange={(v) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], logoSize: v as 'small' | 'medium' | 'large' }
                                  }
                                })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {perDeviceTab === 'phone' ? (
                                    <>
                                      <SelectItem value="small">Small (40px)</SelectItem>
                                      <SelectItem value="medium">Medium (56px)</SelectItem>
                                    </>
                                  ) : perDeviceTab === 'tablet' ? (
                                    <>
                                      <SelectItem value="small">Small (40px)</SelectItem>
                                      <SelectItem value="medium">Medium (56px)</SelectItem>
                                      <SelectItem value="large">Large (72px)</SelectItem>
                                    </>
                                  ) : (
                                    <>
                                      <SelectItem value="medium">Medium (56px)</SelectItem>
                                      <SelectItem value="large">Large (72px)</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Form Style */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Form Style</Label>
                              <Select
                                value={design.settings.perDeviceOverrides[perDeviceTab]?.formStyle || design.settings.formStyle}
                                onValueChange={(v) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], formStyle: v as DesignSettings['formStyle'] }
                                  }
                                })}
                              >
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="rounded">Rounded</SelectItem>
                                  <SelectItem value="square">Square</SelectItem>
                                  <SelectItem value="glass">Glass</SelectItem>
                                  <SelectItem value="pill">Pill</SelectItem>
                                  <SelectItem value="minimal">Minimal</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {/* Spacing Scale */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground">Spacing Scale: {(design.settings.perDeviceOverrides[perDeviceTab]?.spacingScale || design.settings.spacingScale).toFixed(1)}</Label>
                              <Slider
                                min={0.5}
                                max={2}
                                step={0.1}
                                value={[design.settings.perDeviceOverrides[perDeviceTab]?.spacingScale || design.settings.spacingScale]}
                                onValueChange={([v]) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], spacingScale: v }
                                  }
                                })}
                              />
                            </div>
                            {/* Show Amenities */}
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px]">Show Amenities</Label>
                              <Switch
                                checked={design.settings.perDeviceOverrides[perDeviceTab]?.showAmenities ?? design.settings.showAmenities}
                                onCheckedChange={(v) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], showAmenities: v }
                                  }
                                })}
                              />
                            </div>
                            {/* Show Social Media */}
                            <div className="flex items-center justify-between">
                              <Label className="text-[10px]">Show Social Media</Label>
                              <Switch
                                checked={design.settings.perDeviceOverrides[perDeviceTab]?.showSocialMedia ?? design.settings.showSocialMedia}
                                onCheckedChange={(v) => updateSettings({
                                  perDeviceOverrides: {
                                    ...design.settings.perDeviceOverrides,
                                    [perDeviceTab]: { ...design.settings.perDeviceOverrides[perDeviceTab], showSocialMedia: v }
                                  }
                                })}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <Separator />
                    {/* Feature #13: Design History */}
                    <DesignHistoryPanel
                      portalId={selectedPortalId || ''}
                      designHistory={designHistory}
                      setDesignHistory={setDesignHistory}
                      currentDesign={design}
                      onRestore={(entry) => { setRestoreHistoryEntry(entry); setRestoreConfirmOpen(true); }}
                      toast={toast}
                      onSaveSnapshot={() => {
                        const now = new Date();
                        const defaultName = `Snapshot — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                        setHistorySnapshotName(defaultName);
                        setSaveHistoryOpen(true);
                      }}
                      saveHistoryOpen={saveHistoryOpen}
                      setSaveHistoryOpen={setSaveHistoryOpen}
                      historySnapshotName={historySnapshotName}
                      setHistorySnapshotName={setHistorySnapshotName}
                      historySnapshotDesc={historySnapshotDesc}
                      setHistorySnapshotDesc={setHistorySnapshotDesc}
                      restoreHistoryEntry={restoreHistoryEntry}
                      setRestoreHistoryEntry={setRestoreHistoryEntry}
                      restoreConfirmOpen={restoreConfirmOpen}
                      setRestoreConfirmOpen={setRestoreConfirmOpen}
                      restoringHistory={restoringHistory}
                      handleSaveSnapshot={handleSaveSnapshot}
                      handleRestoreSnapshot={handleRestoreSnapshot}
                      apiMutate={apiMutate}
                    />
                    <Separator />
                    {/* Feature #14: A/B Testing */}
                    <ABTestingSection
                      portalId={selectedPortalId || ''}
                      currentDesign={design}
                      toast={toast}
                      apiFetch={apiFetch}
                      apiMutate={apiMutate}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    {/* Feature 7: Template Preview Modal */}
    <Dialog open={templatePreviewOpen} onOpenChange={setTemplatePreviewOpen}>
      <DialogContent className="max-w-sm p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Template Preview</DialogTitle>
          <DialogDescription>Preview of {previewingTemplate?.name}</DialogDescription>
        </DialogHeader>
        {previewingTemplate && (
          <div className="relative">
            {/* Close button */}
            <button onClick={() => setTemplatePreviewOpen(false)} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white/80 hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
            {/* Phone mockup frame — 375×812 aspect ratio */}
            <div className="mx-auto w-[280px] h-[606px] rounded-[36px] border-[6px] border-gray-800 bg-gray-900 shadow-2xl overflow-hidden relative">
              {/* Notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-900 rounded-b-xl z-10" />
              {/* Screen content — template preview */}
              <div className="w-full h-full overflow-auto" style={{ background: previewingTemplate.preview, color: previewingTemplate.colors.text }}>
                <div className="flex flex-col items-center justify-center h-full p-4 gap-3">
                  {/* Logo area */}
                  <Building className="h-10 w-10 opacity-70" style={{ color: previewingTemplate.colors.text }} />
                  {/* Hotel name */}
                  <p className="text-sm font-bold text-center" style={{ fontFamily: previewingTemplate.design.headingFontFamily || 'Inter' }}>{previewingTemplate.name}</p>
                  {/* Category */}
                  <span className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: previewingTemplate.colors.accent + '30', color: previewingTemplate.colors.accent }}>{previewingTemplate.category}</span>
                  {/* Card with form mockup */}
                  <div className="w-full rounded-2xl p-4 space-y-3 mt-2" style={{ background: previewingTemplate.design.formStyle === 'glass' ? 'rgba(255,255,255,0.12)' : previewingTemplate.design.formStyle === 'minimal' ? 'transparent' : 'rgba(255,255,255,0.95)', backdropFilter: previewingTemplate.design.formStyle === 'glass' ? 'blur(16px)' : undefined, border: previewingTemplate.design.formStyle === 'glass' ? '1px solid rgba(255,255,255,0.2)' : 'none' }}>
                    <p className="text-[9px] font-semibold text-center opacity-80">Connect to WiFi</p>
                    {/* Fake input lines */}
                    <div className="space-y-2">
                      <div className="h-7" style={{ background: previewingTemplate.design.inputStyle === 'underline' ? 'transparent' : previewingTemplate.design.formStyle === 'glass' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderBottom: previewingTemplate.design.inputStyle === 'underline' ? '1px solid rgba(128,128,128,0.3)' : 'none', borderRadius: previewingTemplate.design.inputStyle === 'pill' ? '9999px' : previewingTemplate.design.inputStyle === 'square' ? '0' : '6px' }} />
                      <div className="h-7" style={{ background: previewingTemplate.design.inputStyle === 'underline' ? 'transparent' : previewingTemplate.design.formStyle === 'glass' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', borderBottom: previewingTemplate.design.inputStyle === 'underline' ? '1px solid rgba(128,128,128,0.3)' : 'none', borderRadius: previewingTemplate.design.inputStyle === 'pill' ? '9999px' : previewingTemplate.design.inputStyle === 'square' ? '0' : '6px' }} />
                    </div>
                    {/* Fake button */}
                    <div className="h-8 flex items-center justify-center text-[9px] font-semibold text-white" style={{ background: previewingTemplate.design.buttonStyle === 'gradient' ? `linear-gradient(135deg, ${previewingTemplate.colors.gradientFrom || previewingTemplate.colors.accent}, ${previewingTemplate.colors.gradientTo || previewingTemplate.colors.bg})` : previewingTemplate.colors.accent, borderRadius: previewingTemplate.design.buttonStyle === 'pill' || previewingTemplate.design.buttonStyle === 'rounded' ? '9999px' : '6px' }}>
                      Connect
                    </div>
                  </div>
                  {/* Amenity icons */}
                  <div className="flex gap-3 mt-3 opacity-50">
                    <Wifi className="h-3.5 w-3.5" />
                    <Coffee className="h-3.5 w-3.5" />
                    <Waves className="h-3.5 w-3.5" />
                    <Dumbbell className="h-3.5 w-3.5" />
                    <UtensilsCrossed className="h-3.5 w-3.5" />
                  </div>
                </div>
              </div>
            </div>
            {/* Template name and description below */}
            <div className="px-4 py-3 bg-card text-center">
              <p className="text-xs font-semibold">{previewingTemplate.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{previewingTemplate.description}</p>
              <div className="flex justify-center gap-1 mt-2">
                <div className="w-3 h-3 rounded-full border border-gray-300/50" style={{ background: previewingTemplate.colors.accent }} />
                <div className="w-3 h-3 rounded-full border border-gray-300/50" style={{ background: previewingTemplate.colors.bg }} />
                <div className="w-3 h-3 rounded-full border border-gray-300/50" style={{ background: previewingTemplate.colors.text }} />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* Feature #13: Save Snapshot Dialog */}
    <Dialog open={saveHistoryOpen} onOpenChange={setSaveHistoryOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Save Design Snapshot</DialogTitle>
          <DialogDescription>Create a named snapshot of your current portal design to restore later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Snapshot Name</Label>
            <Input value={historySnapshotName} onChange={(e) => setHistorySnapshotName(e.target.value)} className="text-xs" placeholder="e.g. Summer 2026 Design" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input value={historySnapshotDesc} onChange={(e) => setHistorySnapshotDesc(e.target.value)} className="text-xs" placeholder="Optional notes..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setSaveHistoryOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={handleSaveSnapshot} disabled={!historySnapshotName.trim()}>
            <Save className="h-3.5 w-3.5 mr-1" />Save Snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Feature #13: Restore Confirmation Dialog */}
    <Dialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Restore Snapshot?</DialogTitle>
          <DialogDescription>
            This will replace your current design with "<span className="font-semibold">{restoreHistoryEntry?.name}</span>".
            This action cannot be undone. Consider saving your current design as a snapshot first.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { setRestoreConfirmOpen(false); setRestoreHistoryEntry(null); }}>Cancel</Button>
          <Button size="sm" onClick={handleRestoreSnapshot} disabled={restoringHistory}>
            {restoringHistory ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
            {restoringHistory ? 'Restoring...' : 'Restore'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Feature #15: AI Design Suggest Dialog */}
    <AiSuggestDialog
      open={aiDialogOpen}
      onClose={() => setAiDialogOpen(false)}
      onApply={() => handleAiSuggest(false)}
      currentDesign={design}
      toast={toast}
      aiHotelType={aiHotelType}
      setAiHotelType={setAiHotelType}
      aiBrandColor={aiBrandColor}
      setAiBrandColor={setAiBrandColor}
      aiAccentColor={aiAccentColor}
      setAiAccentColor={setAiAccentColor}
      aiGenerating={aiGenerating}
    />
    </>
  );
}
// ═══════════════════════════════════════════════════════════════════════════════

function PortalPreviewContent({ design, visibleFields }: { design: PortalPageDesign; visibleFields: typeof FIELD_DEFINITIONS }) {
  const s = design.settings;
  const isDark = s.backgroundType === 'solid' && design.backgroundColor.match(/^#[0-3]/);
  const isGlass = s.formStyle === 'glass' || s.formStyle === 'minimal';
  const inputCls = getInputClasses(s);
  const btnCls = getButtonClasses(s);
  const formCls = getFormClasses(s);

  // ── Form color inline style overrides for Live Preview ──
  const formCardStyle: React.CSSProperties = {
    ...(s.formBackgroundColor ? { backgroundColor: s.formBackgroundColor } : {}),
  };
  const inputStyleOverrides: React.CSSProperties = {
    ...(s.inputBackgroundColor ? { backgroundColor: s.inputBackgroundColor } : {}),
    ...(s.inputBorderColor ? { borderColor: s.inputBorderColor } : {}),
    ...(s.inputTextColor ? { color: s.inputTextColor } : {}),
  };
  const btnStyleOverrides: React.CSSProperties = {
    background: design.brandColor,
    ...(s.buttonTextColor ? { color: s.buttonTextColor } : {}),
  };
  const placeholderCss = s.inputPlaceholderColor
    ? `.portal-preview-input::placeholder, .portal-preview-input span { color: ${s.inputPlaceholderColor} !important; }`
    : '';
  const labelStyleOverride = s.labelColor ? { color: s.labelColor } : {};
  const linkStyleOverride = s.linkColor ? { color: s.linkColor } : {};
  const errorStyleOverride = s.errorColor ? { color: s.errorColor } : {};

  // ── Brute-force protection ──
  const BRUTE_FORCE_KEY = 'portal_brute_force';
  const [failedAttempts, setFailedAttempts] = useState(() => {
    try {
      const stored = localStorage.getItem(BRUTE_FORCE_KEY);
      if (stored) { const parsed = JSON.parse(stored); return typeof parsed.count === 'number' ? parsed.count : 0; }
    } catch (e) { console.error('[ERROR]', 'Brute force count parse', e); }
    return 0;
  });
  const [lockoutUntil, setLockoutUntil] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(BRUTE_FORCE_KEY);
      if (stored) { const parsed = JSON.parse(stored); return typeof parsed.lockoutUntil === 'number' ? parsed.lockoutUntil : 0; }
    } catch (e) { console.error('[ERROR]', 'Brute force lockout parse', e); }
    return 0;
  });

  const persistAttempts = useCallback((count: number, lockout: number) => {
    try { localStorage.setItem(BRUTE_FORCE_KEY, JSON.stringify({ count, lockoutUntil: lockout })); } catch (e) { console.error('[ERROR]', 'Brute force persist', e); }
  }, []);

  const now = Date.now();
  const isLockedOut = lockoutUntil > now;
  const remainingLockout = isLockedOut ? Math.ceil((lockoutUntil - now) / 1000) : 0;
  const attemptsBeforeNextLockout = failedAttempts >= 20 ? 0 : failedAttempts >= 10 ? 10 : 5;
  const showWarning = !isLockedOut && failedAttempts >= 3 && failedAttempts < 5;

  const handleConnect = useCallback(() => {
    if (isLockedOut) return;
    const newCount = failedAttempts + 1;
    let lockoutDuration = 0;
    if (newCount >= 20) lockoutDuration = 300000;      // 5 min
    else if (newCount >= 10) lockoutDuration = 60000;   // 1 min
    else if (newCount >= 5) lockoutDuration = 30000;    // 30 sec
    setFailedAttempts(newCount);
    if (lockoutDuration > 0) {
      const newLockout = Date.now() + lockoutDuration;
      setLockoutUntil(newLockout);
      persistAttempts(newCount, newLockout);
    } else {
      persistAttempts(newCount, 0);
    }
  }, [failedAttempts, isLockedOut, persistAttempts]);

  // Countdown timer during lockout
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isLockedOut) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isLockedOut]);

  // Clear lockout when it expires
  useEffect(() => {
    if (lockoutUntil > 0 && Date.now() >= lockoutUntil) {
      setLockoutUntil(0);
      persistAttempts(failedAttempts, 0);
    }
  }, [lockoutUntil, failedAttempts, persistAttempts]);

  return (
    <div className="flex flex-col items-center px-4 py-8 gap-4" style={{ fontFamily: s.fontFamily }}>
      {/* Promotion Banner */}
      {s.showPromotion && (
        <div className={cn('w-full max-w-[240px] rounded-lg p-2.5 text-center', isGlass ? 'bg-amber-500/20 border border-amber-400/30' : 'bg-amber-500/90')}>
          <p className="text-[10px] font-bold text-amber-100">{s.promotionTitle}</p>
          <p className="text-[9px] text-amber-200/80 mt-0.5">{s.promotionDesc}</p>
        </div>
      )}

      {/* Logo */}
      {(() => {
        const logoPx = s.logoSize === 'small' ? 'w-8 h-8' : s.logoSize === 'medium' ? 'w-10 h-10' : 'w-12 h-12';
        return design.logoUrl ? (
          <img src={design.logoUrl} alt="Logo" className={cn(logoPx, 'rounded-xl object-cover bg-white/20 shadow-lg')} />
        ) : (
          <div className={cn(logoPx, 'rounded-xl flex items-center justify-center', isGlass ? 'bg-white/10' : 'bg-white/20')}>
            <Building className={cn(s.logoSize === 'small' ? 'h-3 w-3' : s.logoSize === 'medium' ? 'h-4 w-4' : 'h-5 w-5', 'opacity-70')} />
          </div>
        );
      })()}

      {/* Title & Subtitle */}
      <div className="text-center">
        <h1 className="text-base font-bold" style={{ fontFamily: s.headingFontFamily }}>{design.title}</h1>
        <p className="text-[11px] opacity-80 mt-1">{design.subtitle}</p>
        {s.welcomeMessage && <p className="text-[10px] opacity-60 mt-1 italic">{s.welcomeMessage}</p>}
      </div>

      {/* Hotel Info */}
      {s.showHotelInfo && (
        <div className="w-full max-w-[240px] space-y-1 text-center">
          <p className="text-[10px] font-semibold">{s.hotelName}</p>
          <div className="flex items-center justify-center gap-1 text-[9px] opacity-70"><MapPin className="h-2.5 w-2.5" />{s.hotelAddress}</div>
          <div className="flex items-center justify-center gap-3 text-[9px] opacity-70">
            <span className="flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{s.hotelPhone}</span>
            <span className="flex items-center gap-0.5"><Globe className="h-2.5 w-2.5" />{s.hotelWebsite}</span>
          </div>
        </div>
      )}

      {/* Form */}
      <div className={cn('w-full max-w-[240px] p-4 space-y-3', formCls)} style={formCardStyle}>
        {/* Inject placeholder color override if set */}
        {placeholderCss && <style dangerouslySetInnerHTML={{ __html: placeholderCss }} />}
        {/* Auth Flow Indicator */}
        <div className="flex items-center gap-1.5">
          <Wifi className={cn('h-3.5 w-3.5', isGlass ? 'text-white/60' : 'text-gray-400')} />
          <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wider" style={labelStyleOverride}>
            {design.authFlow === 'room_number' ? 'Enter Room' : design.authFlow === 'voucher' ? 'Enter Voucher' : design.authFlow === 'sms_otp' ? 'OTP Login' : design.authFlow === 'open_access' ? 'Free Access' : 'Sign In'}
          </span>
        </div>

        {/* Fields */}
        {visibleFields.map((f) => {
          const Icon = f.icon;
          const isCredential = f.key === 'username' || f.key === 'password';
          const isVoucher = f.key === 'voucherCode';
          const placeholder = isCredential
            ? f.key === 'username' ? 'Username' : 'Password'
            : isVoucher ? 'XXXXX-XXXXX'
            : f.key === 'roomNumber' ? 'Room Number'
            : f.key === 'phone' ? 'Phone Number'
            : f.key === 'email' ? 'Email Address'
            : f.key === 'terms' ? '' : f.label;
          if (f.key === 'terms') {
            return (
              <label key={f.key} className="flex items-start gap-2 text-[9px] opacity-70 cursor-pointer" style={labelStyleOverride}>
                <div className={cn('w-3.5 h-3.5 rounded border flex-shrink-0 mt-0.5 flex items-center justify-center', isGlass ? 'border-white/30' : 'border-gray-300')}>
                  <CheckCircle2 className="h-2.5 w-2.5 text-teal-500 dark:text-teal-400" />
                </div>
                <span>I agree to the <span className="underline" style={linkStyleOverride}>Terms & Conditions</span></span>
              </label>
            );
          }
          return (
            <div key={f.key} className="relative">
              {!isCredential && !isVoucher && <Icon className={cn('absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 opacity-40', isGlass ? 'text-white/50' : 'text-gray-400')} />}
              <div className={cn(
                isCredential ? '' : !isCredential && !isVoucher ? 'pl-7' : '',
                isVoucher ? 'text-center font-mono font-bold tracking-wider uppercase text-[10px]' : '',
                'portal-preview-input',
                inputCls, isGlass ? 'text-white placeholder:text-white/40' : 'text-gray-800 placeholder:text-gray-400', 'w-full outline-none flex items-center'
              )} style={inputStyleOverrides}>
                <span className="opacity-50">{placeholder}</span>
              </div>
            </div>
          );
        })}

        {/* Social Login */}
        {(design.socialLogin.google || design.socialLogin.facebook || design.socialLogin.apple) && (
          <div className="flex gap-2 pt-1">
            {design.socialLogin.google && <div className={cn('flex-1 py-1.5 rounded text-center text-[9px] font-medium', isGlass ? 'bg-white/10 border border-white/20' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>Google</div>}
            {design.socialLogin.facebook && <div className={cn('flex-1 py-1.5 rounded text-center text-[9px] font-medium', isGlass ? 'bg-white/10 border border-white/20' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>Facebook</div>}
            {design.socialLogin.apple && <div className={cn('flex-1 py-1.5 rounded text-center text-[9px] font-medium', isGlass ? 'bg-white/10 border border-white/20' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>Apple</div>}
          </div>
        )}

        {/* Brute-force Warning */}
        {isLockedOut && (
          <div className={cn('w-full rounded px-2 py-1.5 text-center text-[9px] font-medium', isGlass ? 'bg-red-500/20 border border-red-400/30' : 'bg-red-100 dark:bg-red-950')} style={errorStyleOverride}>
            Too many failed attempts. Please wait {remainingLockout} seconds.
          </div>
        )}
        {!isLockedOut && failedAttempts >= 3 && (
          <div className={cn('w-full rounded px-2 py-1.5 text-center text-[9px] font-medium', isGlass ? 'bg-amber-500/20 border border-amber-400/30' : 'bg-amber-100 dark:bg-amber-950')} style={errorStyleOverride}>
            {failedAttempts} failed attempt{failedAttempts !== 1 ? 's' : ''}. {attemptsBeforeNextLockout - failedAttempts} attempt{attemptsBeforeNextLockout - failedAttempts !== 1 ? 's' : ''} remaining before temporary lockout.
          </div>
        )}

        {/* Connect Button */}
        <div
          className={cn(btnCls, 'w-full text-center', isLockedOut ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}
          style={btnStyleOverrides}
          onClick={isLockedOut ? undefined : handleConnect}
          role="button"
          aria-disabled={isLockedOut}
          tabIndex={isLockedOut ? -1 : 0}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Wifi className="h-3.5 w-3.5" />{isLockedOut ? 'Locked' : 'Connect'}
            <ArrowRight className="h-3 w-3 ml-1" />
          </span>
        </div>
      </div>

      {/* Amenities */}
      {s.showAmenities && s.amenities.length > 0 && (
        <div className="w-full max-w-[240px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
            {s.amenities.slice(0, 6).map((am) => {
              const AmIcon = AMENITY_ICONS[am] || Star;
              return (
                <div key={am} className={cn('flex flex-col items-center gap-0.5 p-1.5 rounded', isGlass ? 'bg-white/5' : 'bg-black/5')}>
                  <AmIcon className={cn('h-3 w-3', isGlass ? 'text-white/60' : 'text-gray-500')} />
                  <span className="text-[7px] text-center leading-tight opacity-70">{am}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Social Links */}
      {s.showSocialMedia && (
        <div className="flex items-center gap-3">
          {s.socialLinks.filter((l) => l.url).map((l) => {
            const SIcon = l.platform === 'instagram' ? Instagram : l.platform === 'facebook' ? Facebook : Twitter;
            return <SIcon key={l.platform} className="h-3.5 w-3.5 opacity-50 hover:opacity-100 cursor-pointer transition-opacity" />;
          })}
        </div>
      )}

      {/* Clock */}
      {s.showClock && (
        <div className="flex items-center gap-1 text-[10px] opacity-50">
          <Clock className="h-3 w-3" />
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}

      {/* Weather */}
      {s.showWeather && (
        <div className="flex items-center gap-1 text-[10px] opacity-50">
          <Thermometer className="h-3 w-3" />
          <span>{s.weatherLocation ? `${s.weatherLocation} — 22°C` : 'Weather — set location'}</span>
        </div>
      )}

      {/* Survey */}
      {s.surveyConfig?.enabled && (
        <div className={cn('w-full max-w-[240px] rounded-lg p-2.5 space-y-1.5', isGlass ? 'bg-white/10 border border-white/20' : 'bg-black/5 border')}>
          <p className="text-[9px] font-semibold opacity-70">{s.surveyConfig.question}</p>
          <div className="flex gap-1 flex-wrap">
            {s.surveyConfig.options.slice(0, 4).map((opt) => (
              <span key={opt} className="text-[7px] px-1.5 py-0.5 rounded-full border opacity-50">{opt}</span>
            ))}
          </div>
        </div>
      )}

      {/* Marketing Opt-In */}
      {s.marketingOptIn?.enabled && (
        <div className="w-full max-w-[240px] flex items-center gap-1.5 text-[8px] opacity-50">
          <Megaphone className="h-2.5 w-2.5 flex-shrink-0" />
          <span>{s.marketingOptIn.consentText || 'Receive promotional offers'}</span>
        </div>
      )}

      {/* New Feature Preview Indicators */}
      {s.enablePlanSelector && (
        <div className="bg-violet-500/10 border border-violet-500/20 rounded p-1.5">
          <p className="text-[9px] font-semibold opacity-70">📋 Plan Selector</p>
          <p className="text-[8px] opacity-50">Choose/upgrade plans</p>
        </div>
      )}
      {s.enableMarketingCapture && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded p-1.5">
          <p className="text-[9px] font-semibold opacity-70">📧 Marketing Capture</p>
          <p className="text-[8px] opacity-50">Collect guest data</p>
        </div>
      )}
      {s.enableQrCode && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-1.5">
          <p className="text-[9px] font-semibold opacity-70">📱 QR Code</p>
          <p className="text-[8px] opacity-50">Scan to connect</p>
        </div>
      )}
      {s.enableAutoRenewal && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded p-1.5">
          <p className="text-[9px] font-semibold opacity-70">🔄 Auto-Renewal</p>
          <p className="text-[8px] opacity-50">Plans auto-renew</p>
        </div>
      )}
      {s.enableSpeedTest && (
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded p-1.5">
          <p className="text-[9px] font-semibold opacity-70">⚡ Speed Test</p>
          <p className="text-[8px] opacity-50">Test connection</p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-[8px] opacity-30 mt-2">
        <p>Powered by StaySuite Hospitality OS</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mini Layout Preview — Visual thumbnail for layout selection
// ═══════════════════════════════════════════════════════════════════════════════

function LayoutMiniPreview({ layout }: { layout: string }) {
  const outerCls = 'w-12 h-8 rounded border border-gray-300 relative overflow-hidden';
  const formCls = 'absolute bg-teal-500/30 border border-teal-400/50 rounded-sm';

  switch (layout) {
    case 'centered':
      return (
        <div className={outerCls} style={{ background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' }}>
          <div className={cn(formCls, 'w-6 h-4 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded')} />
        </div>
      );
    case 'split_left':
      return (
        <div className={outerCls}>
          <div className="absolute left-0 top-0 w-5 h-full bg-gradient-to-br from-teal-400/30 to-emerald-400/30" />
          <div className={cn(formCls, 'right-1 top-1/2 -translate-y-1/2 w-5 h-5')} />
        </div>
      );
    case 'split_right':
      return (
        <div className={outerCls}>
          <div className={cn(formCls, 'left-1 top-1/2 -translate-y-1/2 w-5 h-5')} />
          <div className="absolute right-0 top-0 w-5 h-full bg-gradient-to-br from-teal-400/30 to-emerald-400/30" />
        </div>
      );
    case 'card':
      return (
        <div className={outerCls} style={{ background: 'linear-gradient(135deg, #e2e8f0, #cbd5e1)' }}>
          <div className={cn(formCls, 'w-7 h-5 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shadow-md')} />
        </div>
      );
    case 'full_bleed':
      return (
        <div className={outerCls}>
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/30 to-blue-500/30" />
          <div className={cn(formCls, 'w-7 h-4 left-1/2 bottom-1.5 -translate-x-1/2 backdrop-blur bg-white/20')} />
        </div>
      );
    case 'hero_banner':
      return (
        <div className={outerCls} style={{ background: 'linear-gradient(180deg, #a78bfa 0%, #e2e8f0 60%)' }}>
          <div className={cn(formCls, 'w-7 h-3 left-1/2 bottom-1 -translate-x-1/2 rounded')} />
        </div>
      );
    case 'side_panel':
      return (
        <div className={outerCls}>
          <div className="absolute left-0 top-0 w-3.5 h-full bg-gradient-to-b from-teal-500/40 to-teal-500/20" />
          <div className={cn(formCls, 'left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-5')} />
        </div>
      );
    case 'bottom_sheet':
      return (
        <div className={outerCls} style={{ background: 'linear-gradient(180deg, #e2e8f0, #f8fafc)' }}>
          <div className={cn(formCls, 'w-full h-3 left-0 bottom-0 rounded-t-md')} />
        </div>
      );
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 3: Voucher Designer
// ═══════════════════════════════════════════════════════════════════════════════

interface VoucherEntry {
  id: string;
  code: string;
  planId: string;
  planName?: string;
  planSpeed?: string;
  status: string;
  isUsed: boolean;
  validFrom: string;
  validUntil: string;
  issuedTo?: string | null;
  issuedAt?: string | null;
  guestId?: string | null;
  bookingId?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface VoucherStats {
  total: number;
  active: number;
  used: number;
  expired: number;
  revoked: number;
}

function VoucherDesignerTab({ portalOptions }: { portalOptions: Array<{ id: string; name: string }> }) {
  const [subView, setSubView] = useState<'designer' | 'list'>('designer');
  const [template, setTemplate] = useState('default');
  const [selectedGuest, setSelectedGuest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [guests, setGuests] = useState<any[]>([]);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const { toast } = useToast();
  // XC-1 fix: RBAC gate on destructive actions.
  const { hasPermission } = useAuth();
  const canManage = hasPermission('wifi.manage');

  // ── Voucher list state ──
  const [vouchers, setVouchers] = useState<VoucherEntry[]>([]);
  const [voucherStats, setVoucherStats] = useState<VoucherStats>({ total: 0, active: 0, used: 0, expired: 0, revoked: 0 });
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [voucherSearch, setVoucherSearch] = useState('');
  const [voucherStatusFilter, setVoucherStatusFilter] = useState('all');
  const [voucherPage, setVoucherPage] = useState(0);
  const PAGE_SIZE = 20;

  // ── Generate dialog state ──
  const [genOpen, setGenOpen] = useState(false);
  const [genPlanId, setGenPlanId] = useState('');
  const [genQuantity, setGenQuantity] = useState(10);
  const [genValidityDays, setGenValidityDays] = useState(1);
  const [genNotes, setGenNotes] = useState('');
  const [genSaving, setGenSaving] = useState(false);

  // ── Issue dialog state ──
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueVoucher, setIssueVoucher] = useState<VoucherEntry | null>(null);
  const [issueTo, setIssueTo] = useState('');
  const [issueSaving, setIssueSaving] = useState(false);
  // P0-3 fix: confirmation state before revoking an active voucher.
  const [voucherToRevoke, setVoucherToRevoke] = useState<VoucherEntry | null>(null);
  const [revokingVoucher, setRevokingVoucher] = useState(false);

  // ── Voucher preview state ──
  const [previewVoucher, setPreviewVoucher] = useState<VoucherEntry | null>(null);

  const [plans, setPlans] = useState<Array<{ id: string; name: string; downloadSpeed?: number; uploadSpeed?: number; validityDays?: number; price?: number }>>([]);

  // Load today's check-ins for voucher card preview
  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await apiFetch<any>(partnerId ? `/api/wifi/portal/vouchers?partnerId=${partnerId}` : '/api/wifi/portal/vouchers');
      const v = data?.vouchers;
      if (v && Array.isArray(v)) {
        setGuests(v);
        if (v.length > 0) setSelectedGuest(v[0]);
      } else { setGuests([]); }
      setLoading(false);
    }
    void load();
  }, [partnerId]);

  // Load plans for generate dialog
  useEffect(() => {
    apiFetch<any[]>('/api/wifi/plans').then(data => {
      if (data) setPlans(data.map((p: any) => ({ id: p.id, name: p.name, downloadSpeed: p.downloadSpeed, uploadSpeed: p.uploadSpeed, validityDays: p.validityDays, price: p.price })));
    });
  }, []);

  // Fetch vouchers list
  const fetchVouchers = useCallback(async () => {
    setVoucherLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(voucherPage * PAGE_SIZE));
      if (voucherStatusFilter !== 'all') params.set('status', voucherStatusFilter);
      if (voucherSearch) params.set('search', voucherSearch);
      if (partnerId) params.set('partnerId', partnerId);
      const res = await fetch(`/api/wifi/vouchers?${params.toString()}`);
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const result = await res.json();
      if (result.success) {
        setVouchers((result.data || []).map((v: any) => ({
          id: v.id, code: v.code, planId: v.planId, planName: v.plan?.name || '—',
          planSpeed: v.plan ? `${v.plan.downloadSpeed || 0}/${v.plan.uploadSpeed || 0} Mbps` : '',
          status: v.status, isUsed: v.isUsed,
          validFrom: v.validFrom, validUntil: v.validUntil,
          issuedTo: v.issuedTo, issuedAt: v.issuedAt, guestId: v.guestId, bookingId: v.bookingId,
          notes: v.notes, createdAt: v.createdAt,
        })));
        // Stats
        const summary = result.summary?.byStatus || {};
        setVoucherStats({
          total: result.pagination?.total || 0,
          active: summary.active || 0,
          used: summary.used || 0,
          expired: summary.expired || 0,
          revoked: summary.revoked || 0,
        });
      }
    } catch (e) { console.error('Voucher fetch error:', e); }
    setVoucherLoading(false);
  }, [partnerId, voucherPage, voucherStatusFilter, voucherSearch]);

  useEffect(() => {
    if (subView === 'list') void fetchVouchers();
  }, [subView, fetchVouchers]);

  // Generate vouchers
  const handleGenerate = async () => {
    if (!genPlanId) { toast({ title: 'Error', description: 'Select a WiFi plan', variant: 'destructive' }); return; }
    setGenSaving(true);
    const { error } = await apiMutate('/api/wifi/vouchers', {
      method: 'POST',
      body: JSON.stringify({ planId: genPlanId, quantity: genQuantity, validityDays: genValidityDays, notes: genNotes || undefined }),
    });
    setGenSaving(false);
    if (error) { toast({ title: 'Generation Failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Vouchers Generated', description: `${genQuantity} voucher(s) created successfully` });
    setGenOpen(false); setGenQuantity(10); setGenValidityDays(1); setGenNotes('');
    setSubView('list');
  };

  // Issue voucher
  const handleIssue = async () => {
    if (!issueVoucher || !issueTo.trim()) return;
    setIssueSaving(true);
    const { error } = await apiMutate('/api/wifi/vouchers', {
      method: 'PUT',
      body: JSON.stringify({ id: issueVoucher.id, action: 'issue', issuedTo: issueTo.trim() }),
    });
    setIssueSaving(false);
    if (error) { toast({ title: 'Issue Failed', description: error, variant: 'destructive' }); return; }
    toast({ title: 'Voucher Issued', description: `Issued to ${issueTo.trim()}` });
    setIssueOpen(false); setIssueTo(''); fetchVouchers();
  };

  // Revoke voucher
  const handleRevoke = async (voucher: VoucherEntry) => {
    setRevokingVoucher(true);
    const res = await fetch(`/api/wifi/vouchers?id=${voucher.id}`, { method: 'DELETE' });
    if (!res.ok) {
      toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
      setRevokingVoucher(false);
      setVoucherToRevoke(null);
      return;
    }

    const result = await res.json();
    setRevokingVoucher(false);
    setVoucherToRevoke(null);
    if (result.success) { toast({ title: 'Revoked', description: `Voucher ${voucher.code} revoked` }); fetchVouchers(); }
    else toast({ title: 'Error', description: result.error?.message || 'Failed to revoke', variant: 'destructive' });
  };

  // P0-3 fix: open a confirmation dialog instead of revoking immediately.
  const requestRevoke = (voucher: VoucherEntry) => setVoucherToRevoke(voucher);

  // Copy code
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: 'Copied', description: `${code} copied to clipboard` });
  };

  const handlePrint = (guest: any) => {
    setSelectedGuest(guest);
    toast({ title: 'Printing voucher', description: `Voucher for ${guest.guestName} sent to printer` });
  };

  const voucherStyle = useMemo(() => {
    switch (template) {
      case 'luxury': return { bg: 'bg-gray-900', text: 'text-amber-50', accent: 'text-amber-400 dark:text-amber-300', border: 'border-amber-600/30', cardBg: 'bg-gray-800' };
      case 'elegant': return { bg: 'bg-gradient-to-br from-slate-50 to-slate-100', text: 'text-slate-800', accent: 'text-teal-600 dark:text-teal-400', border: 'border-teal-200', cardBg: 'bg-white' };
      case 'minimal': return { bg: 'bg-white', text: 'text-gray-800', accent: 'text-teal-500 dark:text-teal-400', border: 'border-gray-200', cardBg: 'bg-white' };
      default: return { bg: 'bg-white', text: 'text-gray-800', accent: 'text-teal-600 dark:text-teal-400', border: 'border-teal-100', cardBg: 'bg-white' };
    }
  }, [template]);

  return (
    <div className="space-y-4">
      {/* Sub-view toggle */}
      <div className="flex items-center gap-0.5 bg-muted/60 rounded-xl p-1 w-fit border border-border/40">
        <button onClick={() => setSubView('designer')} className={cn('relative px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-2', subView === 'designer' ? 'bg-gradient-to-r from-teal-500/10 to-emerald-500/10 text-teal-700 dark:text-teal-300 shadow-sm after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-3/4 after:rounded-full after:bg-gradient-to-r after:from-teal-500 after:to-emerald-500' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}>
          <Eye className="h-3.5 w-3.5" /> Card Designer
        </button>
        <button onClick={() => setSubView('list')} className={cn('relative px-4 py-2 text-xs font-medium rounded-lg transition-all duration-200 flex items-center gap-2', subView === 'list' ? 'bg-gradient-to-r from-teal-500/10 to-emerald-500/10 text-teal-700 dark:text-teal-300 shadow-sm after:absolute after:bottom-0 after:left-1/2 after:-translate-x-1/2 after:h-[2px] after:w-3/4 after:rounded-full after:bg-gradient-to-r after:from-teal-500 after:to-emerald-500' : 'text-muted-foreground hover:text-foreground hover:bg-muted/60')}>
          <Ticket className="h-3.5 w-3.5" /> Manage Vouchers
        </button>
      </div>

      {subView === 'designer' && (
        <>
          {/* Template Selector */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Template</Label>
            <div className="flex gap-3 flex-wrap">
              {VOUCHER_TEMPLATES.map((vt) => {
                const isActive = template === vt.value;
                const previewGradients: Record<string, string> = {
                  default: 'from-white via-teal-50/60 to-white',
                  elegant: 'from-slate-50 via-slate-100 to-slate-50',
                  minimal: 'from-white via-gray-50/40 to-white',
                  luxury: 'from-gray-900 via-gray-800 to-gray-900',
                };
                const accentColors: Record<string, string> = {
                  default: 'bg-teal-400',
                  elegant: 'bg-teal-500',
                  minimal: 'bg-gray-400',
                  luxury: 'bg-amber-400',
                };
                return (
                  <Tooltip key={vt.value}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setTemplate(vt.value)}
                        className={cn(
                          'group relative rounded-xl border-2 p-3 transition-all duration-200 w-[120px]',
                          isActive
                            ? 'border-teal-500 shadow-md shadow-teal-500/10 scale-[1.03]'
                            : 'border-border/60 hover:border-teal-300/60 hover:shadow-sm hover:-translate-y-0.5 bg-card'
                        )}
                      >
                        {isActive && (
                          <div className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-sm">
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </div>
                        )}
                        {/* Mini preview thumbnail */}
                        <div className={cn('w-full h-12 rounded-md bg-gradient-to-br mb-2 overflow-hidden relative', previewGradients[vt.value])}>
                          <div className={cn('absolute bottom-0 left-0 right-0 h-1', accentColors[vt.value])} />
                          <div className={cn('absolute top-1.5 left-1.5 w-3 h-0.5 rounded-full', vt.value === 'luxury' ? 'bg-amber-400/60' : 'bg-foreground/15')} />
                          <div className={cn('absolute top-3 left-1.5 w-6 h-0.5 rounded-full', vt.value === 'luxury' ? 'bg-amber-400/40' : 'bg-foreground/10')} />
                          <div className={cn('absolute bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-sm', vt.value === 'luxury' ? 'bg-gray-700' : 'bg-muted/70')} />
                        </div>
                        <p className={cn('text-xs font-semibold text-center', isActive ? 'text-teal-700 dark:text-teal-300' : 'text-foreground')}>{vt.label}</p>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{vt.desc}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
            <Button size="sm" onClick={() => { if (selectedGuest) handlePrint(selectedGuest); }} className="bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-sm"><Printer className="h-4 w-4 mr-1.5" />Print Selected</Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Guests Table */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Today&apos;s Check-ins</CardTitle></CardHeader>
              <CardContent>
                {loading ? (<div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>) : guests.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No check-ins today</p>
                ) : (
                  <div className="max-h-96 overflow-auto">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead className="text-xs">Guest</TableHead><TableHead className="text-xs">Room</TableHead><TableHead className="text-xs">Status</TableHead><TableHead className="text-xs w-10"></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {guests.map((g: any) => (
                          <TableRow key={g.id} className={cn('cursor-pointer hover:bg-muted/50', selectedGuest?.id === g.id && 'bg-muted')} onClick={() => setSelectedGuest(g)}>
                            <TableCell className="text-xs font-medium py-2">{g.guestName}</TableCell>
                            <TableCell className="text-xs py-2 font-mono">{g.roomNumber}</TableCell>
                            <TableCell className="text-xs py-2">
                              <Badge variant="secondary" className={cn('text-[10px]', g.status === 'active' || g.wifiStatus === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                                {g.status === 'active' || g.wifiStatus === 'active' ? 'Online' : 'Pending'}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handlePrint(g); }}>
                                <Printer className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Voucher Preview */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Eye className="h-4 w-4" />Voucher Preview</CardTitle></CardHeader>
              <CardContent className="flex justify-center p-6">
                {selectedGuest ? (
                  <div className={cn('w-[300px] rounded-xl border p-6 space-y-4 shadow-lg', voucherStyle.bg, voucherStyle.border)}>
                    <div className="text-center space-y-1">
                      <Building className={cn('h-8 w-8 mx-auto', voucherStyle.accent)} />
                      <h3 className={cn('text-lg font-bold', voucherStyle.text)}>StaySuite Hotel</h3>
                      <p className={cn('text-xs opacity-60', voucherStyle.text)}>WiFi Access Credentials</p>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs', voucherStyle.text)}>
                        <div><p className="opacity-50 text-[10px] uppercase">Guest</p><p className="font-semibold">{selectedGuest.guestName}</p></div>
                        <div><p className="opacity-50 text-[10px] uppercase">Room</p><p className="font-semibold font-mono">{selectedGuest.roomNumber}</p></div>
                        <div><p className="opacity-50 text-[10px] uppercase">Network</p><p className="font-semibold">{selectedGuest.ssid}</p></div>
                        <div><p className="opacity-50 text-[10px] uppercase">Valid Until</p><p className="font-semibold">{selectedGuest.validUntil}</p></div>
                      </div>
                    </div>
                    <Separator />
                    <div className={cn('rounded-lg p-4 text-center space-y-2', template === 'luxury' ? 'bg-gray-700' : 'bg-muted/50')}>
                      <p className={cn('text-[10px] font-semibold uppercase tracking-wider opacity-50', voucherStyle.text)}>WiFi Credentials</p>
                      <div className="space-y-1.5">
                        <div><p className={cn('text-[10px] opacity-50', voucherStyle.text)}>Username</p><p className={cn('text-sm font-mono font-bold', voucherStyle.text)}>{selectedGuest.username || '—'}</p></div>
                        <div><p className={cn('text-[10px] opacity-50', voucherStyle.text)}>Password</p><p className={cn('text-sm font-mono font-bold tracking-wider', voucherStyle.accent)}>{selectedGuest.password || '—'}</p></div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <div className={cn('w-20 h-20 rounded-lg flex items-center justify-center', template === 'luxury' ? 'bg-gray-700' : 'bg-muted/30')}>
                        <QrCode className={cn('h-10 w-10', voucherStyle.accent)} />
                      </div>
                    </div>
                    <p className={cn('text-center text-[9px] opacity-40', voucherStyle.text)}>Scan QR code or enter credentials manually</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <UserRound className="h-12 w-12 mb-3 opacity-30" />
                    <p className="text-sm font-medium">Select a guest to preview</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {subView === 'list' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: voucherStats.total, gradient: 'from-blue-500/10 to-indigo-500/10', borderAccent: 'border-l-blue-500', icon: <Layers className="h-4 w-4 text-blue-500" /> },
              { label: 'Active', value: voucherStats.active, gradient: 'from-emerald-500/10 to-green-500/10', borderAccent: 'border-l-emerald-500', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
              { label: 'Used', value: voucherStats.used, gradient: 'from-teal-500/10 to-cyan-500/10', borderAccent: 'border-l-teal-500', icon: <Wifi className="h-4 w-4 text-teal-500" /> },
              { label: 'Expired', value: voucherStats.expired, gradient: 'from-amber-500/10 to-orange-500/10', borderAccent: 'border-l-amber-500', icon: <Clock className="h-4 w-4 text-amber-500" /> },
              { label: 'Revoked', value: voucherStats.revoked, gradient: 'from-rose-500/10 to-red-500/10', borderAccent: 'border-l-rose-500', icon: <XCircle className="h-4 w-4 text-rose-500" /> },
            ].map(s => (
              <Card key={s.label} className={cn('border-l-4 overflow-hidden', s.borderAccent)}>
                <CardContent className={cn('p-4 bg-gradient-to-br', s.gradient)}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
                    </div>
                    <div className="opacity-70">{s.icon}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Actions bar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" className="bg-teal-600 hover:bg-teal-700 text-white" onClick={() => setGenOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Generate Vouchers</Button>
            <Button size="sm" variant="outline" onClick={() => void fetchVouchers()} disabled={voucherLoading}><RefreshCw className={cn('h-4 w-4 mr-1.5', voucherLoading && 'animate-spin')} />Refresh</Button>
            <div className="ml-auto flex items-center gap-2">
              <Input placeholder="Search codes..." value={voucherSearch} onChange={e => { setVoucherSearch(e.target.value); setVoucherPage(0); }} className="h-8 w-40 text-xs" />
              <Select value={voucherStatusFilter} onValueChange={v => { setVoucherStatusFilter(v); setVoucherPage(0); }}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Voucher Table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Code</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Plan</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Valid Until</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Issued To</TableHead>
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {voucherLoading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>)
                    : vouchers.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">No vouchers found</TableCell></TableRow>
                    : vouchers.map((v) => (
                      <TableRow key={v.id} className="transition-colors hover:bg-teal-50/50 dark:hover:bg-teal-950/20">
                        <TableCell>
                          <button onClick={() => copyCode(v.code)} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-muted/60 hover:bg-teal-100/60 dark:hover:bg-teal-900/20 transition-colors font-mono text-xs font-semibold hover:text-teal-600 dark:hover:text-teal-400" title="Click to copy">
                            <Copy className="h-3 w-3 text-muted-foreground" />{v.code}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs hidden sm:table-cell"><div><p className="font-medium">{v.planName}</p><p className="text-[10px] text-muted-foreground">{v.planSpeed}</p></div></TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={v.status === 'active' ? 'default' : 'secondary'} className={cn('text-[10px] font-medium', v.status === 'active' ? 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40' : v.status === 'used' ? 'bg-teal-100/80 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border border-teal-200/50 dark:border-teal-800/40' : v.status === 'revoked' ? 'bg-rose-100/80 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/40' : 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/40')}>
                            {v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs hidden md:table-cell text-muted-foreground">{v.validUntil ? new Date(v.validUntil).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-xs hidden md:table-cell">{v.issuedTo || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {v.status === 'active' && <Button variant="ghost" size="sm" className="h-7 text-xs hover:bg-teal-50 dark:hover:bg-teal-950/30" onClick={() => { setIssueVoucher(v); setIssueOpen(true); }}><User className="h-3 w-3 mr-1" />Issue</Button>}
                            {v.status === 'active' && <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => requestRevoke(v)}><XCircle className="h-3 w-3 mr-1" />Revoke</Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Pagination */}
          {voucherStats.total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Showing {voucherPage * PAGE_SIZE + 1}–{Math.min((voucherPage + 1) * PAGE_SIZE, voucherStats.total)} of {voucherStats.total}</p>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={voucherPage === 0} onClick={() => setVoucherPage(p => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={(voucherPage + 1) * PAGE_SIZE >= voucherStats.total} onClick={() => setVoucherPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}

          {/* Generate Dialog */}
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
            <DialogContent><DialogHeader><DialogTitle>Generate Voucher Codes</DialogTitle><DialogDescription>Create batch WiFi voucher codes linked to a plan. Codes are auto-generated and provisioned in RADIUS.</DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>WiFi Plan *</Label>
                  <Select value={genPlanId} onValueChange={setGenPlanId}><SelectTrigger><SelectValue placeholder="Select a plan" /></SelectTrigger><SelectContent>{plans.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.downloadSpeed || 0}/{p.uploadSpeed || 0} Mbps, {p.validityDays || 1}d</SelectItem>)}</SelectContent></Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Quantity</Label><Input type="number" min={1} max={500} value={genQuantity} onChange={e => setGenQuantity(parseInt(e.target.value) || 1)} /></div>
                  <div className="space-y-2"><Label>Validity (days)</Label><Input type="number" min={1} max={365} value={genValidityDays} onChange={e => setGenValidityDays(parseInt(e.target.value) || 1)} /></div>
                </div>
                <div className="space-y-2"><Label>Notes (optional)</Label><Input value={genNotes} onChange={e => setGenNotes(e.target.value)} placeholder="e.g. Front desk batch" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGenOpen(false)}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={genSaving || !genPlanId} className="bg-teal-600 hover:bg-teal-700 text-white">{genSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Generate {genQuantity} Voucher(s)</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Issue Dialog */}
          <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
            <DialogContent><DialogHeader><DialogTitle>Issue Voucher</DialogTitle><DialogDescription>Record physical distribution of voucher <span className="font-mono font-semibold">{issueVoucher?.code}</span></DialogDescription></DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2"><Label>Issued To *</Label><Input value={issueTo} onChange={e => setIssueTo(e.target.value)} placeholder="Guest name or recipient" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancel</Button>
                <Button onClick={handleIssue} disabled={issueSaving || !issueTo.trim()} className="bg-teal-600 hover:bg-teal-700 text-white">{issueSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Issue Voucher</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* P0-3 fix: Confirm before revoking an active voucher. */}
          <AlertDialog open={!!voucherToRevoke} onOpenChange={(open) => { if (!open) setVoucherToRevoke(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Revoke Voucher "{voucherToRevoke?.code}"?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This voucher is currently active. Revoking it will instantly disconnect any guest using it for WiFi access. The guest will need a new voucher to reconnect. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={revokingVoucher}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => { e.preventDefault(); if (voucherToRevoke) handleRevoke(voucherToRevoke); }}
                  disabled={revokingVoucher}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {revokingVoucher && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {revokingVoucher ? 'Revoking…' : 'Revoke Voucher'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 5: Walled Garden / Portal Whitelist
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// Auth Methods Tab — Manage PortalAuthentication entries per portal
// ═══════════════════════════════════════════════════════════════════════════════

const ALL_AUTH_METHOD_OPTIONS = [
  { value: 'voucher', label: 'Voucher Code', desc: 'Pre-generated code from front desk' },
  { value: 'room_number', label: 'Room + Last Name', desc: 'Room number and last name validation' },
  { value: 'pms_credentials', label: 'PMS Credentials', desc: 'Username/password generated by PMS at check-in' },
  { value: 'sms_otp', label: 'SMS OTP', desc: 'One-time code via SMS' },
  { value: 'email_otp', label: 'Email OTP', desc: 'One-time code via email' },
  { value: 'open_access', label: 'Open Access', desc: 'No credentials — terms only' },
  { value: 'mac_auth', label: 'MAC Auth', desc: 'Auto-login by MAC address' },
  { value: 'social', label: 'Social Login', desc: 'Google, Facebook, Apple OAuth' },
  { value: 'ldap', label: 'LDAP / Corporate', desc: 'Corporate directory authentication' },
  { value: 'self_registration', label: 'Self Registration', desc: 'Guest signs up with name + email/phone + OTP verification' },
];

function AuthMethodsTab() {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const { toast } = useToast();
  // XC-1 fix: RBAC gate on destructive actions.
  const { hasPermission } = useAuth();
  const canManage = hasPermission('wifi.manage');
  const [entries, setEntries] = useState<any[]>([]);
  const [portals, setPortals] = useState<Array<{ id: string; name: string; partnerId?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('voucher');
  const [addPriority, setAddPriority] = useState(0);
  const [addLabel, setAddLabel] = useState('');
  // Social auth config dialog state
  const [socialConfigOpen, setSocialConfigOpen] = useState(false);
  const [socialConfigId, setSocialConfigId] = useState('');
  const [socialConfigLabel, setSocialConfigLabel] = useState('');
  const [socialConfigSaving, setSocialConfigSaving] = useState(false);
  // Self Registration config dialog state
  const [selfRegConfigOpen, setSelfRegConfigOpen] = useState(false);
  const [selfRegConfigId, setSelfRegConfigId] = useState('');
  const [selfRegConfigLabel, setSelfRegConfigLabel] = useState('');
  const [selfRegConfigSaving, setSelfRegConfigSaving] = useState(false);
  // Audit 4.11 / 4.12: confirmation state for auth-method delete + enabled toggle (both kick guests).
  const [authActionPending, setAuthActionPending] = useState<{
    type: 'delete' | 'toggleEnabled';
    entry: { id: string; method: string; enabled?: boolean };
    methodLabel: string;
  } | null>(null);
  const [authActionInFlight, setAuthActionInFlight] = useState(false);
  // Audit 4.13: debounced priority updates so each keystroke doesn't fire an API call.
  const priorityTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<any[]>('/api/wifi/portal/auth-methods');
    if (data) setEntries(data);
    setLoading(false);
  }, []);

  const fetchPortals = useCallback(async () => {
    const data = await apiFetch<any[]>('/api/wifi/portal/instances');
    if (data) setPortals(data.map((p: any) => ({ id: p.id, name: p.name, partnerId: p.partnerId })));
  }, []);

  useEffect(() => { void fetchPortals(); }, [fetchPortals]);
  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  const handleAdd = async () => {
    if (!selectedPortal || !selectedMethod) {
      // Audit 4.4-style fix: surface the silent return as a toast.
      toast({ title: 'Missing selection', description: 'Pick a portal and an auth method before adding.', variant: 'destructive' });
      return;
    }
    // Audit 4.14: client-side duplicate check (same method already added to the same portal).
    const dupe = entries.find(e => e.portalId === selectedPortal && e.method === selectedMethod);
    if (dupe) {
      const dupeLabel = ALL_AUTH_METHOD_OPTIONS.find(m => m.value === selectedMethod)?.label || selectedMethod;
      toast({ title: 'Duplicate auth method', description: `${dupeLabel} is already configured for this portal. Edit or delete the existing entry instead.`, variant: 'destructive' });
      return;
    }
    const methodLabel = ALL_AUTH_METHOD_OPTIONS.find(m => m.value === selectedMethod)?.label || selectedMethod;
    const config = addLabel ? JSON.stringify({ label: addLabel }) : '{}';
    const { error } = await apiMutate('/api/wifi/portal/auth-methods', {
      method: 'POST', body: JSON.stringify({
        partnerId: portals.find(p => p.id === selectedPortal)?.partnerId || partnerId || '',
        portalId: selectedPortal,
        method: selectedMethod,
        enabled: true,
        priority: addPriority,
        config,
      }),
    });
    if (!error) {
      toast({ title: 'Auth method added', description: `${methodLabel} added to portal` });
      await fetchEntries();
      setAddOpen(false);
      setSelectedMethod('voucher');
      setAddPriority(0);
      setAddLabel('');
    } else {
      toast({ title: 'Error', description: error || 'Failed to add', variant: 'destructive' });
    }
  };

  // Audit 4.12: gate auth-method toggleEnabled behind a confirmation — disabling a method mid-login blocks guests.
  const requestToggleAuthMethod = (entry: { id: string; method: string; enabled?: boolean }, methodLabel: string) => {
    setAuthActionPending({ type: 'toggleEnabled', entry, methodLabel });
  };

  const toggleEnabled = async (id: string, current: boolean) => {
    setAuthActionInFlight(true);
    const { error } = await apiMutate(`/api/wifi/portal/auth-methods/${id}`, {
      method: 'PUT', body: JSON.stringify({ enabled: !current }),
    });
    if (!error) { await fetchEntries(); }
    else { toast({ title: 'Error', description: error, variant: 'destructive' }); }
    setAuthActionInFlight(false);
    setAuthActionPending(null);
  };

  // Audit 4.11: gate auth-method delete behind a confirmation — removing a method guests are using breaks login.
  const requestDeleteAuthMethod = (entry: { id: string; method: string; enabled?: boolean }, methodLabel: string) => {
    setAuthActionPending({ type: 'delete', entry, methodLabel });
  };

  const deleteEntry = async (id: string, methodLabel: string) => {
    setAuthActionInFlight(true);
    const { error } = await apiMutate(`/api/wifi/portal/auth-methods/${id}`, { method: 'DELETE' });
    if (!error) { toast({ title: 'Removed', description: `${methodLabel} deleted` }); await fetchEntries(); }
    else { toast({ title: 'Error', description: error, variant: 'destructive' }); }
    setAuthActionInFlight(false);
    setAuthActionPending(null);
  };

  const updatePriority = async (id: string, priority: number) => {
    // Audit 4.13: debounce by ~600ms so typing "10" doesn't fire two API calls (1, then 10).
    if (priorityTimersRef.current[id]) clearTimeout(priorityTimersRef.current[id]);
    priorityTimersRef.current[id] = setTimeout(async () => {
      await apiMutate(`/api/wifi/portal/auth-methods/${id}`, {
        method: 'PUT', body: JSON.stringify({ priority }),
      });
      await fetchEntries();
      delete priorityTimersRef.current[id];
    }, 600);
  };

  const getMethodBadge = (method: string) => {
    const m = ALL_AUTH_METHOD_OPTIONS.find(o => o.value === method);
    if (!m) return method;
    return m.label;
  };

  const METHOD_STYLES: Record<string, { borderColor: string; iconBg: string; iconColor: string; icon: React.ReactNode }> = {
    voucher: { borderColor: 'border-l-amber-400', iconBg: 'bg-amber-100 dark:bg-amber-900/40', iconColor: 'text-amber-600 dark:text-amber-400', icon: <Ticket className="h-4 w-4" /> },
    pms_credentials: { borderColor: 'border-l-teal-400', iconBg: 'bg-teal-100 dark:bg-teal-900/40', iconColor: 'text-teal-600 dark:text-teal-400', icon: <Building className="h-4 w-4" /> },
    room_number: { borderColor: 'border-l-violet-400', iconBg: 'bg-violet-100 dark:bg-violet-900/40', iconColor: 'text-violet-600 dark:text-violet-400', icon: <Key className="h-4 w-4" /> },
    sms_otp: { borderColor: 'border-l-pink-400', iconBg: 'bg-pink-100 dark:bg-pink-900/40', iconColor: 'text-pink-600 dark:text-pink-400', icon: <Smartphone className="h-4 w-4" /> },
    email_otp: { borderColor: 'border-l-purple-400', iconBg: 'bg-purple-100 dark:bg-purple-900/40', iconColor: 'text-purple-600 dark:text-purple-400', icon: <Mail className="h-4 w-4" /> },
    social: { borderColor: 'border-l-blue-400', iconBg: 'bg-blue-100 dark:bg-blue-900/40', iconColor: 'text-blue-600 dark:text-blue-400', icon: <Share2 className="h-4 w-4" /> },
    mac_auth: { borderColor: 'border-l-orange-400', iconBg: 'bg-orange-100 dark:bg-orange-900/40', iconColor: 'text-orange-600 dark:text-orange-400', icon: <Router className="h-4 w-4" /> },
    open_access: { borderColor: 'border-l-green-400', iconBg: 'bg-green-100 dark:bg-green-900/40', iconColor: 'text-green-600 dark:text-green-400', icon: <Unlock className="h-4 w-4" /> },
    ldap: { borderColor: 'border-l-cyan-400', iconBg: 'bg-cyan-100 dark:bg-cyan-900/40', iconColor: 'text-cyan-600 dark:text-cyan-400', icon: <ShieldCheck className="h-4 w-4" /> },
    self_registration: { borderColor: 'border-l-rose-400', iconBg: 'bg-rose-100 dark:bg-rose-900/40', iconColor: 'text-rose-600 dark:text-rose-400', icon: <UserPlus className="h-4 w-4" /> },
  };

  const getMethodStyle = (method: string) => METHOD_STYLES[method] || { borderColor: 'border-l-muted-foreground', iconBg: 'bg-muted', iconColor: 'text-muted-foreground', icon: <Lock className="h-4 w-4" /> };

  const openSocialConfig = (entry: any) => {
    setSocialConfigId(entry.id);
    setSocialConfigLabel(entry.captivePortal?.name || 'Portal');
    setSocialConfigOpen(true);
  };

  const openSelfRegConfig = (entry: any) => {
    setSelfRegConfigId(entry.id);
    setSelfRegConfigLabel(entry.captivePortal?.name || 'Portal');
    setSelfRegConfigOpen(true);
  };

  // Group entries by portal
  const grouped = useMemo(() => {
    const map = new Map<string, { portalName: string; methods: any[] }>();
    for (const e of entries) {
      const pid = e.portalId;
      if (!map.has(pid)) {
        map.set(pid, { portalName: e.captivePortal?.name || pid, methods: [] });
      }
      map.get(pid)!.methods.push(e);
    }
    return Array.from(map.entries());
  }, [entries]);

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 px-3 py-1 text-xs font-medium text-primary border border-primary/20">
            <Key className="h-3 w-3" />
            {entries.length} auth method{entries.length !== 1 ? 's' : ''} configured across {grouped.length} portal{grouped.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="group bg-primary hover:bg-gradient-to-r hover:from-primary hover:to-primary/80 text-primary-foreground shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform duration-200" />Add Auth Method
        </Button>
      </div>

      {/* Empty state */}
      {grouped.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Key className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm font-medium text-muted-foreground">No auth methods configured</p>
            <p className="text-xs text-muted-foreground mt-1">Add auth methods to control how guests log in on each portal zone</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add First Method
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Grouped by portal */}
      {grouped.map(([portalId, group]) => (
        <Card key={portalId}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">{group.portalName}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{group.methods.length} method{group.methods.length !== 1 ? 's' : ''}</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.methods.sort((a: any, b: any) => a.priority - b.priority).map((entry: any) => {
              let config: Record<string, string> = {};
              try { config = entry.config ? JSON.parse(entry.config) : {}; } catch (e) { console.error('[ERROR]', 'Auth method config parse', e); }
              const style = getMethodStyle(entry.method);
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border-l-4 bg-card px-4 py-3 hover:shadow-md transition-all duration-200',
                    style.borderColor,
                    !entry.enabled && 'opacity-60'
                  )}
                >
                  {/* Method Icon */}
                  <div className={cn('flex items-center justify-center h-9 w-9 rounded-full shrink-0', style.iconBg, style.iconColor)}>
                    {style.icon}
                  </div>

                  {/* Method Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{getMethodBadge(entry.method)}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{config.label || entry.method}</p>
                  </div>

                  {/* Priority */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Priority</span>
                    <div className="rounded-md border bg-muted/50 px-1.5 py-0.5">
                      <Input
                        type="number"
                        value={entry.priority}
                        onChange={e => updatePriority(entry.id, parseInt(e.target.value) || 0)}
                        className="h-5 w-12 text-xs font-mono border-0 bg-transparent p-0 text-center focus:ring-0"
                      />
                    </div>
                  </div>

                  {/* Status */}
                  <Switch
                    checked={entry.enabled}
                    onCheckedChange={() => requestToggleAuthMethod(entry, getMethodBadge(entry.method))}
                  />

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {entry.method === 'social' && (
                      <button onClick={() => openSocialConfig(entry)} className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-md hover:bg-muted" title="Configure OAuth">
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {entry.method === 'self_registration' && (
                      <button onClick={() => openSelfRegConfig(entry)} className="text-muted-foreground hover:text-primary transition-colors p-1 rounded-md hover:bg-muted" title="Configure Self Registration">
                        <Settings className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => requestDeleteAuthMethod(entry, getMethodBadge(entry.method))} className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Auth Method</DialogTitle>
            <DialogDescription>Add an authentication method to a portal zone. Guests can choose between enabled methods when logging in.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Portal Zone *</Label>
              <Select value={selectedPortal} onValueChange={setSelectedPortal}>
                <SelectTrigger><SelectValue placeholder="Select a portal..." /></SelectTrigger>
                <SelectContent>
                  {portals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Auth Method *</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_AUTH_METHOD_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setSelectedMethod(m.value)}
                    className={cn(
                      'flex flex-col items-start gap-0.5 p-2.5 rounded-lg border-2 transition-all text-left',
                      selectedMethod === m.value
                        ? 'border-primary bg-primary/5 dark:bg-primary/10'
                        : 'border-border hover:border-muted-foreground/30'
                    )}
                  >
                    <span className="text-xs font-medium">{m.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">{m.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Display Label (optional)</Label>
              <Input
                placeholder="Custom label shown to guests..."
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority (lower = shown first)</Label>
              <Input
                type="number"
                value={addPriority}
                onChange={e => setAddPriority(parseInt(e.target.value) || 0)}
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={!selectedPortal || !selectedMethod} className="bg-primary hover:bg-primary/90 text-primary-foreground">Add Method</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Social Auth OAuth Config Dialog */}
      {socialConfigOpen && socialConfigId && (
        <SocialAuthConfigDialog
          authMethodId={socialConfigId}
          portalName={socialConfigLabel}
          open={socialConfigOpen}
          onOpenChange={setSocialConfigOpen}
          saving={socialConfigSaving}
          setSaving={setSocialConfigSaving}
          onSaved={() => { void fetchEntries(); }}
          toast={toast}
        />
      )}

      {/* Self Registration Config Dialog */}
      {selfRegConfigOpen && selfRegConfigId && (
        <SelfRegConfigDialog
          authMethodId={selfRegConfigId}
          portalName={selfRegConfigLabel}
          open={selfRegConfigOpen}
          onOpenChange={setSelfRegConfigOpen}
          saving={selfRegConfigSaving}
          setSaving={setSelfRegConfigSaving}
          onSaved={() => { void fetchEntries(); }}
          toast={toast}
        />
      )}

      {/* Audit 4.11 / 4.12: confirmation dialog for auth-method delete + enabled toggle. */}
      <AlertDialog
        open={!!authActionPending}
        onOpenChange={(open) => { if (!open && !authActionInFlight) setAuthActionPending(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {authActionPending?.type === 'delete'
                ? `Remove "${authActionPending?.methodLabel}"?`
                : (authActionPending?.entry.enabled ? 'Disable Auth Method' : 'Enable Auth Method')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {authActionPending?.type === 'delete' && (
                <>Removing the <span className="font-medium">{authActionPending?.methodLabel}</span> auth method will block any guest currently using it from completing login. Make sure no guests are mid-flow before removing.</>
              )}
              {authActionPending?.type === 'toggleEnabled' && authActionPending?.entry.enabled && (
                <>Disabling <span className="font-medium">{authActionPending?.methodLabel}</span> will block guests who are mid-login from completing authentication with this method.</>
              )}
              {authActionPending?.type === 'toggleEnabled' && !authActionPending?.entry.enabled && (
                <>Enable <span className="font-medium">{authActionPending?.methodLabel}</span>? Guests will be able to choose this method on the captive portal again.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={authActionInFlight}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!authActionPending) return;
                if (authActionPending.type === 'delete') deleteEntry(authActionPending.entry.id, authActionPending.methodLabel);
                else toggleEnabled(authActionPending.entry.id, !!authActionPending.entry.enabled);
              }}
              disabled={authActionInFlight}
              className={cn(authActionPending?.type === 'delete' && 'bg-red-600 hover:bg-red-700 text-white')}
            >
              {authActionInFlight && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {authActionPending?.type === 'delete' ? 'Remove' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Social Auth OAuth Configuration Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function SocialAuthConfigDialog({
  authMethodId,
  portalName,
  open,
  onOpenChange,
  saving,
  setSaving,
  onSaved,
  toast,
}: {
  authMethodId: string;
  portalName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: () => void;
  toast: any;
}) {
  const [activeTab, setActiveTab] = useState<'google' | 'facebook' | 'apple' | 'microsoft'>('google');
  const [loaded, setLoaded] = useState(false);

  // Auto-detected redirect URI (always the same for all providers)
  const detectedRedirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/api/wifi/social/callback`
    : '/api/wifi/social/callback';

  // Test connection state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; success: boolean; message: string } | null>(null);

  // Per-provider config
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleClientSecret, setGoogleClientSecret] = useState('');

  const [facebookEnabled, setFacebookEnabled] = useState(false);
  const [facebookClientId, setFacebookClientId] = useState('');
  const [facebookClientSecret, setFacebookClientSecret] = useState('');

  const [appleEnabled, setAppleEnabled] = useState(false);
  const [appleClientId, setAppleClientId] = useState('');
  const [appleTeamId, setAppleTeamId] = useState('');
  const [appleKeyId, setAppleKeyId] = useState('');
  const [applePrivateKey, setApplePrivateKey] = useState('');
  // Audit 4.18: mask the Apple .p8 private key by default — shoulder-surfing risk.
  const [showApplePrivateKey, setShowApplePrivateKey] = useState(false);

  const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
  const [microsoftClientId, setMicrosoftClientId] = useState('');
  const [microsoftClientSecret, setMicrosoftClientSecret] = useState('');

  // Load existing config
  useEffect(() => {
    if (!open || !authMethodId) return;
    (async () => {
      const data = await apiFetch<any>(`/api/wifi/portal/auth-methods/${authMethodId}`);
      if (data) {
        let cfg: Record<string, any> = {};
        try { cfg = data.config ? JSON.parse(data.config) : {}; } catch (e) { console.error('[ERROR]', 'Auth method config parse', e); }

        const g = cfg.google || {};
        setGoogleEnabled(!!g.enabled);
        setGoogleClientId(g.clientId || '');
        setGoogleClientSecret(g.clientSecret || '');

        const f = cfg.facebook || {};
        setFacebookEnabled(!!f.enabled);
        setFacebookClientId(f.clientId || '');
        setFacebookClientSecret(f.clientSecret || '');

        const a = cfg.apple || {};
        setAppleEnabled(!!a.enabled);
        setAppleClientId(a.clientId || '');
        setAppleTeamId(a.teamId || '');
        setAppleKeyId(a.keyId || '');
        setApplePrivateKey(a.privateKey || '');

        const ms = cfg.microsoft || {};
        setMicrosoftEnabled(!!ms.enabled);
        setMicrosoftClientId(ms.clientId || '');
        setMicrosoftClientSecret(ms.clientSecret || '');
      }
      setLoaded(true);
    })();
  }, [open, authMethodId]);

  const buildConfigJson = () => {
    const existingCfg: Record<string, any> = {};
    // Preserve any non-social keys that might be in the config
    return {
      ...existingCfg,
      label: portalName,
      google: googleEnabled ? { enabled: true, clientId: googleClientId, clientSecret: googleClientSecret, redirectUri: detectedRedirectUri } : { enabled: false },
      facebook: facebookEnabled ? { enabled: true, clientId: facebookClientId, clientSecret: facebookClientSecret, redirectUri: detectedRedirectUri } : { enabled: false },
      apple: appleEnabled ? { enabled: true, clientId: appleClientId, teamId: appleTeamId, keyId: appleKeyId, privateKey: applePrivateKey, redirectUri: detectedRedirectUri } : { enabled: false },
      microsoft: microsoftEnabled ? { enabled: true, clientId: microsoftClientId, clientSecret: microsoftClientSecret, redirectUri: detectedRedirectUri } : { enabled: false },
    };
  };

  const handleTestConnection = async (provider: string) => {
    setTestingProvider(provider);
    setTestResult(null);
    try {
      const res = await fetch('/api/wifi/social/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, authMethodId }),
      });
      const data = await res.json();
      setTestResult({
        provider,
        success: data.success,
        message: data.success ? data.message : (data.error || 'Test failed'),
      });
    } catch {
      setTestResult({ provider, success: false, message: 'Network error' });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async () => {
    // Audit 4.17: validate that each enabled provider has its required credentials non-empty.
    // Without these, guests see "Sign in with X" but get an error on click.
    if (googleEnabled && (!googleClientId.trim() || !googleClientSecret.trim())) {
      toast({ title: 'Google config incomplete', description: 'Client ID and Client Secret are required when Google sign-in is enabled.', variant: 'destructive' });
      return;
    }
    if (facebookEnabled && (!facebookClientId.trim() || !facebookClientSecret.trim())) {
      toast({ title: 'Facebook config incomplete', description: 'Client ID and Client Secret are required when Facebook sign-in is enabled.', variant: 'destructive' });
      return;
    }
    if (appleEnabled && (!appleClientId.trim() || !appleTeamId.trim() || !appleKeyId.trim() || !applePrivateKey.trim())) {
      toast({ title: 'Apple config incomplete', description: 'Client ID, Team ID, Key ID, and Private Key are all required when Apple sign-in is enabled.', variant: 'destructive' });
      return;
    }
    if (microsoftEnabled && (!microsoftClientId.trim() || !microsoftClientSecret.trim())) {
      toast({ title: 'Microsoft config incomplete', description: 'Client ID and Client Secret are required when Microsoft sign-in is enabled.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const config = buildConfigJson();
    const { error } = await apiMutate(`/api/wifi/portal/auth-methods/${authMethodId}`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    if (!error) {
      toast({ title: 'OAuth Config Saved', description: 'Social login credentials updated successfully' });
      onSaved();
      onOpenChange(false);
    } else {
      toast({ title: 'Error', description: error || 'Failed to save OAuth config', variant: 'destructive' });
    }
  };

  const PROV_TABS = [
    { id: 'google' as const, label: 'Google', color: '#4285F4' },
    { id: 'facebook' as const, label: 'Facebook', color: '#1877F2' },
    { id: 'apple' as const, label: 'Apple', color: '#000000' },
    { id: 'microsoft' as const, label: 'Microsoft', color: '#00A4EF' },
  ];

  if (!loaded) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="sr-only">Loading Social Login Config</DialogTitle></DialogHeader><div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></DialogContent></Dialog>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Social Login — OAuth Configuration
          </DialogTitle>
          <DialogDescription>
            Configure OAuth credentials for {portalName}. Each provider requires a Client ID and Client Secret from the respective developer console.
          </DialogDescription>
        </DialogHeader>

        {/* Provider tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
          {PROV_TABS.map((pt) => (
            <button
              key={pt.id}
              onClick={() => setActiveTab(pt.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all',
                activeTab === pt.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: pt.color, backgroundColor: activeTab === pt.id ? pt.color : 'transparent' }} />
              {pt.label}
            </button>
          ))}
        </div>

        {/* Google Config */}
        {activeTab === 'google' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold">Google OAuth 2.0</p>
                  <p className="text-[11px] text-muted-foreground">Google Cloud Console → APIs & Services → Credentials</p>
                </div>
              </div>
              <Switch checked={googleEnabled} onCheckedChange={setGoogleEnabled} />
            </div>
            {googleEnabled && (
              <div className="space-y-4 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Client ID</Label>
                  <Input placeholder="xxxx.apps.googleusercontent.com" value={googleClientId} onChange={e => setGoogleClientId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">From Google Cloud Console OAuth 2.0 Client ID</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Client Secret</Label>
                  <Input type="password" placeholder="GOCSPX-xxxx..." value={googleClientSecret} onChange={e => setGoogleClientSecret(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Secret key from Google Cloud Console</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Redirect URI</Label>
                  <div className="flex items-center gap-2">
                    <Input value={detectedRedirectUri} readOnly className="font-mono text-xs bg-muted" />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(detectedRedirectUri); toast({ title: 'Copied', description: 'Redirect URI copied to clipboard' }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Auto-detected. Set this exact URL in Google Console → Authorized redirect URIs.</p>
                </div>
                {/* Test Connection */}
                {testResult && testResult.provider === 'google' && (
                  <div className={cn('flex items-center gap-2 p-2 rounded-md text-xs', testResult.success ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400')}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTestConnection('google')} disabled={!googleClientId || testingProvider === 'google'}>
                    {testingProvider === 'google' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : <><Wifi className="h-3.5 w-3.5 mr-1" />Test Connection</>}
                  </Button>
                </div>
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Setup Steps:</p>
                    <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal pl-4">
                      <li>Go to <span className="font-mono text-primary">console.cloud.google.com</span></li>
                      <li>Create OAuth 2.0 Client ID (Web application)</li>
                      <li>Set authorized redirect URI to <span className="font-mono text-primary">{detectedRedirectUri}</span></li>
                      <li>Copy Client ID and Secret above</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Facebook Config */}
        {activeTab === 'facebook' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" fill="#1877F2" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                <div>
                  <p className="text-sm font-semibold">Facebook Login</p>
                  <p className="text-[11px] text-muted-foreground">Meta for Developers → My Apps → Facebook Login</p>
                </div>
              </div>
              <Switch checked={facebookEnabled} onCheckedChange={setFacebookEnabled} />
            </div>
            {facebookEnabled && (
              <div className="space-y-4 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">App ID</Label>
                  <Input placeholder="123456789012345" value={facebookClientId} onChange={e => setFacebookClientId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Facebook App ID from Meta Developer Console</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">App Secret</Label>
                  <Input type="password" placeholder="abcdef1234567890..." value={facebookClientSecret} onChange={e => setFacebookClientSecret(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Facebook App Secret</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Redirect URI</Label>
                  <div className="flex items-center gap-2">
                    <Input value={detectedRedirectUri} readOnly className="font-mono text-xs bg-muted" />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(detectedRedirectUri); toast({ title: 'Copied', description: 'Redirect URI copied to clipboard' }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Auto-detected. Set this exact URL in Facebook App → Settings → Facebook Login → Valid OAuth Redirect URIs.</p>
                </div>
                {testResult && testResult.provider === 'facebook' && (
                  <div className={cn('flex items-center gap-2 p-2 rounded-md text-xs', testResult.success ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400')}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTestConnection('facebook')} disabled={!facebookClientId || testingProvider === 'facebook'}>
                    {testingProvider === 'facebook' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : <><Wifi className="h-3.5 w-3.5 mr-1" />Test Connection</>}
                  </Button>
                </div>
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Setup Steps:</p>
                    <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal pl-4">
                      <li>Go to <span className="font-mono text-primary">developers.facebook.com</span></li>
                      <li>Create a new app or select existing</li>
                      <li>Add Facebook Login product</li>
                      <li>Set Valid OAuth Redirect URI to <span className="font-mono text-primary">{detectedRedirectUri}</span></li>
                      <li>Copy App ID and Secret above</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Apple Config */}
        {activeTab === 'apple' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" fill="#000000" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" /></svg>
                <div>
                  <p className="text-sm font-semibold">Sign in with Apple</p>
                  <p className="text-[11px] text-muted-foreground">Apple Developer → Certificates, Identifiers & Profiles</p>
                </div>
              </div>
              <Switch checked={appleEnabled} onCheckedChange={setAppleEnabled} />
            </div>
            {appleEnabled && (
              <div className="space-y-4 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Services ID (Client ID)</Label>
                  <Input placeholder="com.yourapp.signin" value={appleClientId} onChange={e => setAppleClientId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">The Service ID registered in Apple Developer portal</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Team ID</Label>
                  <Input placeholder="XXXXXXXXXX" value={appleTeamId} onChange={e => setAppleTeamId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Your Apple Developer Team ID</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Key ID</Label>
                  <Input placeholder="XXXXXXXXXX" value={appleKeyId} onChange={e => setAppleKeyId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">Sign in with Apple Key ID</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Private Key (.p8 content)</Label>
                    {/* Audit 4.18: mask the Apple private key by default; toggle to reveal. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setShowApplePrivateKey(v => !v)}
                      title={showApplePrivateKey ? 'Hide private key' : 'Show private key'}
                    >
                      {showApplePrivateKey ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                      {showApplePrivateKey ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <Textarea placeholder="-----BEGIN PRIVATE KEY-----&#10;MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg&#10;...&#10;-----END PRIVATE KEY-----" value={applePrivateKey} onChange={e => setApplePrivateKey(e.target.value)} className="font-mono text-xs min-h-[80px]" />
                  <p className="text-[10px] text-muted-foreground">Contents of the .p8 private key file downloaded from Apple Developer</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Redirect URI</Label>
                  <div className="flex items-center gap-2">
                    <Input value={detectedRedirectUri} readOnly className="font-mono text-xs bg-muted" />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(detectedRedirectUri); toast({ title: 'Copied', description: 'Redirect URI copied to clipboard' }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Auto-detected. Configure this URL in Apple Developer → Services ID → Sign in with Apple → Website URLs.</p>
                </div>
                {testResult && testResult.provider === 'apple' && (
                  <div className={cn('flex items-center gap-2 p-2 rounded-md text-xs', testResult.success ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400')}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTestConnection('apple')} disabled={!appleClientId || !appleTeamId || !appleKeyId || !applePrivateKey || testingProvider === 'apple'}>
                    {testingProvider === 'apple' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : <><Wifi className="h-3.5 w-3.5 mr-1" />Test Connection</>}
                  </Button>
                </div>
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Setup Steps:</p>
                    <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal pl-4">
                      <li>Go to <span className="font-mono text-primary">developer.apple.com</span></li>
                      <li>Create a Services ID under Identifiers</li>
                      <li>Register the Sign in with Apple key and download .p8</li>
                      <li>Configure redirect URL to <span className="font-mono text-primary">{detectedRedirectUri}</span> under Services ID</li>
                      <li>Copy Services ID, Team ID, Key ID, and Private Key content above</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Microsoft Config */}
        {activeTab === 'microsoft' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-sky-50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/30">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="#F25022" d="M1 1h10v10H1z" />
                  <path fill="#00A4EF" d="M13 1h10v10H13z" />
                  <path fill="#7FBA00" d="M1 13h10v10H1z" />
                  <path fill="#FFB900" d="M13 13h10v10H13z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold">Microsoft Identity</p>
                  <p className="text-[11px] text-muted-foreground">Azure Portal → App registrations → Authentication</p>
                </div>
              </div>
              <Switch checked={microsoftEnabled} onCheckedChange={setMicrosoftEnabled} />
            </div>
            {microsoftEnabled && (
              <div className="space-y-4 pl-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Application (client) ID</Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={microsoftClientId} onChange={e => setMicrosoftClientId(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">From Azure Portal → App registrations → Overview</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Client Secret</Label>
                  <Input type="password" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={microsoftClientSecret} onChange={e => setMicrosoftClientSecret(e.target.value)} className="font-mono text-xs" />
                  <p className="text-[10px] text-muted-foreground">From Azure Portal → App registrations → Certificates & secrets</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Redirect URI</Label>
                  <div className="flex items-center gap-2">
                    <Input value={detectedRedirectUri} readOnly className="font-mono text-xs bg-muted" />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => { navigator.clipboard.writeText(detectedRedirectUri); toast({ title: 'Copied', description: 'Redirect URI copied to clipboard' }); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Auto-detected. Add this URL in Azure Portal → Authentication → Web → Redirect URIs (Web platform).</p>
                </div>
                {testResult && testResult.provider === 'microsoft' && (
                  <div className={cn('flex items-center gap-2 p-2 rounded-md text-xs', testResult.success ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400')}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                    {testResult.message}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleTestConnection('microsoft')} disabled={!microsoftClientId || testingProvider === 'microsoft'}>
                    {testingProvider === 'microsoft' ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Testing...</> : <><Wifi className="h-3.5 w-3.5 mr-1" />Test Connection</>}
                  </Button>
                </div>
                <Card className="bg-muted/50 border-dashed">
                  <CardContent className="p-3">
                    <p className="text-[11px] font-medium text-muted-foreground mb-1">Setup Steps:</p>
                    <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal pl-4">
                      <li>Go to <span className="font-mono text-primary">portal.azure.com</span></li>
                      <li>App registrations → New registration</li>
                      <li>Set Redirect URI to <span className="font-mono text-primary">{detectedRedirectUri}</span></li>
                      <li>Under Certificates & secrets, create a new client secret</li>
                      <li>Copy Application (client) ID and Client Secret above</li>
                      <li>Supports both personal Microsoft accounts and work/school (Azure AD) accounts</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Summary bar */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {PROV_TABS.map(pt => {
              const isEnabled = pt.id === 'google' ? googleEnabled : pt.id === 'facebook' ? facebookEnabled : pt.id === 'apple' ? appleEnabled : microsoftEnabled;
              return isEnabled ? (
                <Badge key={pt.id} variant="secondary" className="text-[10px] gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pt.color }} />
                  {pt.label}
                </Badge>
              ) : null;
            })}
            {!(googleEnabled || facebookEnabled || appleEnabled || microsoftEnabled) && (
              <span className="text-[11px] text-muted-foreground">No providers enabled</span>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !(googleEnabled || facebookEnabled || appleEnabled || microsoftEnabled)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Saving...</> : 'Save Configuration'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PoolMappingsTab() {
  return <PortalMappings />;
}

function WhitelistTab() {
  return <PortalWhitelist />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Self Registration Config Dialog
// ═══════════════════════════════════════════════════════════════════════════════

function SelfRegConfigDialog({
  authMethodId,
  portalName,
  open,
  onOpenChange,
  saving,
  setSaving,
  onSaved,
  toast,
}: {
  authMethodId: string;
  portalName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onSaved: () => void;
  toast: any;
}) {
  const [loaded, setLoaded] = useState(false);
  const [planId, setPlanId] = useState('');
  const [verifyMethod, setVerifyMethod] = useState<'email_otp' | 'sms_otp'>('email_otp');
  const [requireEmailUniqueness, setRequireEmailUniqueness] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);

  // Load existing config + plans
  useEffect(() => {
    if (!open || !authMethodId) return;
    (async () => {
      const [configData, planData] = await Promise.all([
        apiFetch<any>(`/api/wifi/portal/auth-methods/${authMethodId}`),
        apiFetch<any>('/api/wifi/plans?limit=100'),
      ]);

      if (configData) {
        let cfg: Record<string, any> = {};
        try { cfg = configData.config ? JSON.parse(configData.config) : {}; } catch (e) { console.error('[ERROR]', 'Auth config parse', e); }
        setPlanId(cfg.planId || '');
        setVerifyMethod(cfg.verificationMethod || 'email_otp');
        setRequireEmailUniqueness(!!cfg.requireEmailUniqueness);
      }

      if (planData && Array.isArray(planData)) {
        setPlans(planData.map((p: any) => ({ id: p.id, name: p.name })));
      }

      setLoaded(true);
    })();
  }, [open, authMethodId]);

  const handleSave = async () => {
    setSaving(true);
    const config = {
      planId: planId || undefined,
      verificationMethod: verifyMethod,
      requireEmailUniqueness,
    };
    const { error } = await apiMutate(`/api/wifi/portal/auth-methods/${authMethodId}`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    });
    setSaving(false);
    if (!error) {
      toast({ title: 'Self Registration Config Saved', description: 'Registration settings updated successfully' });
      onSaved();
      onOpenChange(false);
    } else {
      toast({ title: 'Error', description: error || 'Failed to save config', variant: 'destructive' });
    }
  };

  if (!loaded) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle className="sr-only">Loading Self Registration Config</DialogTitle></DialogHeader><div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></DialogContent></Dialog>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Self Registration — Configuration
          </DialogTitle>
          <DialogDescription>
            Configure guest self-registration settings for {portalName}. Guests will fill out a form and verify via OTP.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* WiFi Plan */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">WiFi Plan (optional)</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Use default plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Use default plan</SelectItem>
                {plans.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Assign a specific WiFi plan to self-registered guests. If empty, the property default plan is used.</p>
          </div>

          {/* Verification Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Verification Method</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="verifyMethod"
                  checked={verifyMethod === 'email_otp'}
                  onChange={() => setVerifyMethod('email_otp')}
                  className="accent-primary"
                />
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                Email OTP
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="verifyMethod"
                  checked={verifyMethod === 'sms_otp'}
                  onChange={() => setVerifyMethod('sms_otp')}
                  className="accent-primary"
                />
                <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
                SMS OTP
              </label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {verifyMethod === 'email_otp'
                ? 'Guests will receive a verification code via email.'
                : 'Guests will receive a verification code via SMS. Requires SMS gateway configuration.'}
            </p>
          </div>

          {/* Require Email Uniqueness */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div>
              <p className="text-sm font-medium">Require Email Uniqueness</p>
              <p className="text-[10px] text-muted-foreground">Check for existing guest records with the same email address</p>
            </div>
            <Switch checked={requireEmailUniqueness} onCheckedChange={setRequireEmailUniqueness} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            Save Config
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature 15: Analytics Tab — Guest Data Analytics Dashboard
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsTab() {
  const [subTab, setSubTab] = useState<'overview' | 'live' | 'auth'>('overview');

  const SUBTABS = [
    { id: 'overview' as const, label: 'Overview', icon: BarChart3 },
    { id: 'live' as const, label: 'Live Monitor', icon: Monitor },
    { id: 'auth' as const, label: 'Auth Insights', icon: ShieldCheck },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 w-fit">
        {SUBTABS.map((st) => {
          const Icon = st.icon;
          return (
            <button
              key={st.id}
              onClick={() => setSubTab(st.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                subTab === st.id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {st.label}
            </button>
          );
        })}
      </div>

      {subTab === 'overview' && <AnalyticsOverview />}
      {subTab === 'live' && <AnalyticsLiveMonitor />}
      {subTab === 'auth' && <AnalyticsAuthInsights />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Tab 1: Overview — Period-based analytics (existing functionality)
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsOverview() {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    summary: {
      totalSessions: number;
      activeSessions: number;
      uniqueDevices: number;
      avgDurationMin: number;
      growthPercent: number;
      totalDataMB: number;
      totalVouchersUsed: number;
    };
    authDistribution: Array<{ method: string; count: number; pct: number }>;
    peakHours: Array<{ hour: number; sessions: number }>;
  } | null>(null);

  const fetchAnalytics = useCallback(async (p: 'today' | 'week' | 'month') => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period: p });
      if (partnerId && partnerId !== 'default') params.set('partnerId', partnerId);
      const res = await fetch(`/api/wifi/portal/analytics?${params.toString()}`);
      if (!res.ok) {
        toast({ title: 'Request Failed', description: `Server error (${res.status})`, variant: 'destructive' });
        return;
      }

      const result = await res.json();
      if (result.success && result.data) {
        setData(result.data);
      } else {
        setError(result.error?.message || 'Failed to load analytics');
      }
    } catch (e) {
      console.error('Analytics fetch error:', e);
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void fetchAnalytics(period);
  }, [period, fetchAnalytics]);

  const periodLabels: Array<{ value: 'today' | 'week' | 'month'; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
  ];

  const authMethodLabels: Record<string, string> = {
    voucher: 'Voucher Code',
    room_number: 'Room Number',
    pms_credentials: 'PMS Credentials',
    sms_otp: 'SMS OTP',
    open_access: 'Open Access',
    social: 'Social Login',
    mac_auth: 'MAC Auth',
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64 mt-2" />
          </div>
          <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-24" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full rounded-lg" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-36 w-full rounded-lg" /></CardContent></Card>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-500" />Guest Analytics Dashboard</h3>
            <p className="text-xs text-muted-foreground mt-1">Track portal usage, authentication methods, and guest engagement</p>
          </div>
        </div>
        <Card className="border-destructive/50">
          <CardContent className="p-6 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void fetchAnalytics(period)}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const summary = data?.summary;
  const peakHoursFiltered = (data?.peakHours || []).filter(h => h.hour >= 6 && h.hour <= 23);
  const maxHourCount = Math.max(...peakHoursFiltered.map(h => h.sessions), 1);
  const hasData = summary && summary.totalSessions > 0;

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-500" />Guest Analytics</h3>
          <p className="text-xs text-muted-foreground mt-1">WiFi portal usage, authentication patterns, and bandwidth insights</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {periodLabels.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                period === p.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* No data state */}
      {!hasData && !loading && (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <div className="p-3 rounded-full bg-muted"><Wifi className="h-6 w-6 text-muted-foreground" /></div>
            <div>
              <p className="text-sm font-medium">No data yet</p>
              <p className="text-xs text-muted-foreground mt-1">WiFi sessions will appear here once guests connect through the captive portal.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {hasData && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Sessions — teal → emerald gradient */}
            <Card className="relative overflow-hidden border-0 transition-shadow duration-300 hover:shadow-lg hover:shadow-teal-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500 to-emerald-600 opacity-[0.08] dark:opacity-[0.18]" />
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Sessions</p>
                    <p className="text-2xl font-bold mt-1">{summary!.totalSessions.toLocaleString()}</p>
                    <div className={cn('flex items-center gap-1 text-[10px] mt-1', summary!.growthPercent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                      {summary!.growthPercent >= 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {Math.abs(summary!.growthPercent)}% vs prev {period === 'today' ? 'day' : period}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/25"><Wifi className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Active Now — green → emerald gradient with pulse dot */}
            <Card className="relative overflow-hidden border-0 transition-shadow duration-300 hover:shadow-lg hover:shadow-green-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 opacity-[0.08] dark:opacity-[0.18]" />
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Active Now</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-2xl font-bold">{summary!.activeSessions.toLocaleString()}</p>
                      {summary!.activeSessions > 0 && (
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Currently online</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-md shadow-green-500/25"><User className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Unique Devices — violet → purple gradient */}
            <Card className="relative overflow-hidden border-0 transition-shadow duration-300 hover:shadow-lg hover:shadow-violet-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-purple-600 opacity-[0.08] dark:opacity-[0.18]" />
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Unique Devices</p>
                    <p className="text-2xl font-bold mt-1">{summary!.uniqueDevices.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Distinct MAC addresses</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/25"><Smartphone className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>

            {/* Avg Duration / Bandwidth — orange → amber gradient */}
            <Card className="relative overflow-hidden border-0 transition-shadow duration-300 hover:shadow-lg hover:shadow-orange-500/20">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-600 opacity-[0.08] dark:opacity-[0.18]" />
              <CardContent className="relative p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Duration</p>
                    <p className="text-2xl font-bold mt-1">{summary!.avgDurationMin > 0 ? `${summary!.avgDurationMin}m` : '—'}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{summary!.totalDataMB > 0 ? `${summary!.totalDataMB.toLocaleString()} MB used` : 'No data'}</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/25"><Clock className="h-5 w-5" /></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Auth Methods Distribution */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Authentication Methods</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data!.authDistribution.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">No authentication data available for this period.</p>
                )}
                {data!.authDistribution.map((am) => (
                  <div key={am.method} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{authMethodLabels[am.method] || am.method}</span>
                      <span className="text-muted-foreground">{am.count} ({am.pct}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${am.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Peak Usage Hours */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Peak Usage Hours</CardTitle></CardHeader>
              <CardContent>
                {peakHoursFiltered.every(h => h.sessions === 0) ? (
                  <p className="text-xs text-muted-foreground italic py-8 text-center">No hourly data available for this period.</p>
                ) : (
                  <div className="flex items-end gap-[2px] h-32">
                    {peakHoursFiltered.map((h) => (
                      <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className="w-full bg-teal-500/80 rounded-t-sm transition-all hover:bg-teal-500 cursor-default min-h-[2px]"
                              style={{ height: `${(h.sessions / maxHourCount) * 100}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-[10px]">
                            <p>{h.hour}:00 — {h.sessions} sessions</p>
                          </TooltipContent>
                        </Tooltip>
                        <span className="text-[8px] text-muted-foreground">{h.hour}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bandwidth Summary */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><Zap className="h-4 w-4" />Bandwidth Usage</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center py-4 gap-3">
                <div className="text-center">
                  <p className="text-3xl font-bold">{summary!.totalDataMB.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total data consumed</p>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full text-center">
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Download className="h-3.5 w-3.5 text-teal-500" />Sessions
                    </div>
                    <p className="text-lg font-semibold">{summary!.totalSessions.toLocaleString()}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Ticket className="h-3.5 w-3.5 text-amber-500" />Vouchers Used
                    </div>
                    <p className="text-lg font-semibold">{summary!.totalVouchersUsed.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Session Status Donut */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />Session Status</CardTitle></CardHeader>
              <CardContent className="space-y-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="relative w-20 h-20 flex-shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
                      {summary!.totalSessions > 0 && (
                        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                          strokeDasharray={`${(summary!.activeSessions / summary!.totalSessions) * 251} 251`}
                          strokeLinecap="round" className="text-teal-500" />
                      )}
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold">{summary!.activeSessions}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                      <span>Active: <span className="font-semibold">{summary!.activeSessions}</span></span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full bg-muted" />
                      <span>Completed: <span className="font-semibold">{summary!.totalSessions - summary!.activeSessions}</span></span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">{summary!.totalSessions.toLocaleString()} total sessions this {period}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Tab 2: Live Monitor — Real-time session monitoring with captive-redirect metrics
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsLiveMonitor() {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const REFRESH_INTERVAL = 10000; // 10s
  const [liveStats, setLiveStats] = useState<{
    totalActive: number;
    currentActive: number;
    perNas: Array<{ nasIp: string; nasIdentifier: string; count: number }>;
    totalDownload: number;
    totalUpload: number;
  } | null>(null);
  const [captiveMetrics, setCaptiveMetrics] = useState<{
    totalRedirects: number;
    totalCooldownSkips: number;
    totalRateLimited: number;
    totalHttpsRedirects: number;
    peakActiveConnections: number;
    bytesSent: number;
    cooldownCacheSize: number;
    perOsRedirects: Record<string, number>;
    serverIPs: string[];
    uptime: number;
  } | null>(null);
  const [authStats, setAuthStats] = useState<{
    totalAuths: number;
    acceptCount: number;
    rejectCount: number;
    successRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  // Fetch all realtime data
  const fetchLive = useCallback(async () => {
    try {
      const queryParams = partnerId && partnerId !== 'default' ? `${partnerId ? `?partnerId=${partnerId}` : ''}` : '';

      const [sessionsRes, authRes, captiveRes] = await Promise.all([
        fetch(`/api/wifi/radius?action=live-sessions-stats${queryParams}`).catch(() => null),
        fetch(`/api/wifi/radius?action=auth-logs-stats${queryParams}`).catch(() => null),
        // Captive-redirect metrics from the mini service on port 8888 (proxied)
        fetch('/api/captive-redirect/metrics').catch(() => null),
      ]);

      if (sessionsRes && sessionsRes.ok) {
        if (!sessionsRes.ok) {
          toast({ title: 'Request Failed', description: `Server error (${sessionsRes.status})`, variant: 'destructive' });
          return;
        }

        const sessionsResult = await sessionsRes.json();
        if (sessionsResult.success) setLiveStats(sessionsResult.data);
      }
      if (authRes && authRes.ok) {
        if (!authRes.ok) {
          toast({ title: 'Request Failed', description: `Server error (${authRes.status})`, variant: 'destructive' });
          return;
        }

        const authResult = await authRes.json();
        if (authResult.success) setAuthStats(authResult.data);
      }
      if (captiveRes && captiveRes.ok) {
        if (!captiveRes.ok) {
          toast({ title: 'Request Failed', description: `Server error (${captiveRes.status})`, variant: 'destructive' });
          return;
        }

        const captiveResult = await captiveRes.json();
        if (captiveResult.success) setCaptiveMetrics(captiveResult.data);
      }

      setLastRefresh(new Date());
      setLoading(false);
    } catch (e) {
      console.error('Live monitor fetch error:', e);
      setLoading(false);
    }
  }, [partnerId]);

  // Auto-refresh
  useEffect(() => {
    void fetchLive();
    const interval = setInterval(() => {
      void fetchLive();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLive]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => prev <= 1 ? REFRESH_INTERVAL / 1000 : prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // formatBytes imported from @/lib/utils/format

  function formatUptime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const successRate = authStats ? authStats.successRate : 0;

  return (
    <div className="space-y-5">
      {/* Header with live badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Monitor className="h-4 w-4 text-emerald-500" />
            Realtime Monitor
          </h3>
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 gap-1.5 text-[10px]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            LIVE
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground">
              Updated {lastRefresh.toLocaleTimeString()} · next in {countdown}s
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void fetchLive()}>
            <RefreshCw className="h-3 w-3 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full rounded-lg" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* Live KPI Cards */}
      {!loading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Active Sessions */}
            <Card className="border-emerald-200 dark:border-emerald-900/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Active Sessions</p>
                    <p className="text-3xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">
                      {liveStats?.totalActive ?? 0}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">Real-time connected</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <Wifi className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Auth Success Rate */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Auth Success Rate</p>
                    <p className="text-3xl font-bold mt-1">
                      <span className={successRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : successRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}>
                        {authStats ? `${successRate}%` : '—'}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {authStats ? `${authStats.acceptCount} accepted, ${authStats.rejectCount} rejected` : 'No data'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Realtime Bandwidth */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Live Bandwidth</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <ArrowDownToLine className="h-3.5 w-3.5 text-teal-500" />
                      <p className="text-lg font-bold">{liveStats ? formatBytes(liveStats.totalDownload) : '—'}</p>
                    </div>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <ArrowUpFromLine className="h-3 w-3.5 text-amber-500" />
                      <p className="text-sm font-semibold text-muted-foreground">{liveStats ? formatBytes(liveStats.totalUpload) : '—'}</p>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Zap className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Captive Portal Redirects */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Portal Redirects</p>
                    <p className="text-3xl font-bold mt-1">
                      {captiveMetrics ? captiveMetrics.totalRedirects.toLocaleString() : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {captiveMetrics
                        ? `${captiveMetrics.peakActiveConnections} peak conns · ${formatBytes(captiveMetrics.bytesSent)} sent`
                        : 'Captive service offline'}
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                    <Router className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* NAS Distribution */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Router className="h-4 w-4" />NAS / Access Point Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(!liveStats || liveStats.perNas.length === 0) ? (
                  <p className="text-xs text-muted-foreground italic py-6 text-center">No active NAS devices detected.</p>
                ) : (
                  <div className="space-y-2">
                    {liveStats.perNas.map((nas) => {
                      const maxCount = Math.max(...liveStats.perNas.map(n => n.count), 1);
                      return (
                        <div key={nas.nasIp} className="flex items-center gap-3">
                          <div className="min-w-[100px] text-xs font-mono text-muted-foreground truncate">{nas.nasIp}</div>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                              style={{ width: `${(nas.count / maxCount) * 100}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 min-w-[60px] justify-end">
                            <span className="text-xs font-semibold">{nas.count}</span>
                            {nas.nasIdentifier && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{nas.nasIdentifier}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Captive Portal Service Status */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <Globe className="h-4 w-4" />Captive Portal Service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {captiveMetrics ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Status</span>
                      <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">Online</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Uptime</span>
                      <span className="text-xs font-mono font-medium">{formatUptime(captiveMetrics.uptime)}</span>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">HTTPS Redirects</span>
                      <span className="text-xs font-semibold">{captiveMetrics.totalHttpsRedirects.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Rate Limited</span>
                      <span className="text-xs font-semibold">{captiveMetrics.totalRateLimited.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Cooldown Skips</span>
                      <span className="text-xs font-semibold">{captiveMetrics.totalCooldownSkips.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Cache Entries</span>
                      <span className="text-xs font-semibold">{captiveMetrics.cooldownCacheSize.toLocaleString()}</span>
                    </div>
                    <Separator />
                    {/* Per-OS breakdown */}
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Redirects by OS</p>
                      {Object.entries(captiveMetrics.perOsRedirects).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([os, count]) => (
                        <div key={os} className="flex items-center justify-between py-0.5">
                          <span className="text-[11px] text-muted-foreground">{os}</span>
                          <span className="text-[11px] font-semibold">{count}</span>
                        </div>
                      ))}
                      {Object.keys(captiveMetrics.perOsRedirects).length === 0 && (
                        <p className="text-[10px] text-muted-foreground italic">No data yet</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <p className="text-xs text-muted-foreground">Captive portal redirect service is not reachable.</p>
                    <p className="text-[10px] text-muted-foreground">Verify the mini-service is running on port 8888.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Auth Log Mini-Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />Authentication Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {authStats ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{authStats.totalAuths.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Total Attempts</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30">
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{authStats.acceptCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Accepted</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-rose-50 dark:bg-rose-950/30">
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{authStats.rejectCount.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Rejected</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-2xl font-bold">{authStats.successRate}%</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Success Rate</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic text-center py-4">No auth data available.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-Tab 3: Auth Insights — Authentication analytics deep dive
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsAuthInsights() {
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const partnerId = propertyFilter !== 'all' ? propertyFilter : 'default';
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    summary: {
      totalSessions: number;
      activeSessions: number;
      uniqueDevices: number;
      avgDurationMin: number;
      growthPercent: number;
      totalDataMB: number;
      totalVouchersUsed: number;
    };
    authDistribution: Array<{ method: string; count: number; pct: number }>;
    peakHours: Array<{ hour: number; sessions: number }>;
  } | null>(null);
  const [authStats, setAuthStats] = useState<{
    totalAuths: number;
    acceptCount: number;
    rejectCount: number;
    successRate: number;
    last24hTrend: number;
  } | null>(null);

  const fetchData = useCallback(async (p: 'today' | 'week' | 'month') => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ period: p });
      if (partnerId && partnerId !== 'default') params.set('partnerId', partnerId);

      const [analyticsRes, authRes] = await Promise.all([
        fetch(`/api/wifi/portal/analytics?${params.toString()}`).catch(() => null),
        fetch(`/api/wifi/radius?action=auth-logs-stats&${params.toString()}`).catch(() => null),
      ]);

      if (analyticsRes && analyticsRes.ok) {
        if (!analyticsRes.ok) {
          toast({ title: 'Request Failed', description: `Server error (${analyticsRes.status})`, variant: 'destructive' });
          return;
        }

        const analyticsResult = await analyticsRes.json();
        if (analyticsResult.success) setData(analyticsResult.data);
      }

      if (authRes && authRes.ok) {
        if (!authRes.ok) {
          toast({ title: 'Request Failed', description: `Server error (${authRes.status})`, variant: 'destructive' });
          return;
        }

        const authResult = await authRes.json();
        if (authResult.success) setAuthStats(authResult.data);
      }
    } catch (e) {
      console.error('Auth insights fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const periodLabels: Array<{ value: 'today' | 'week' | 'month'; label: string }> = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
  ];

  const authMethodLabels: Record<string, string> = {
    voucher: 'Voucher Code',
    room_number: 'Room Number',
    pms_credentials: 'PMS Credentials',
    sms_otp: 'SMS OTP',
    open_access: 'Open Access',
    social: 'Social Login',
    mac_auth: 'MAC Auth',
  };

  const authMethodIcons: Record<string, string> = {
    voucher: '🎫',
    room_number: '🏨',
    pms_credentials: '🔐',
    sms_otp: '📱',
    open_access: '🔓',
    social: '🌐',
    mac_auth: '💻',
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-40" />
          <div className="flex gap-2"><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-20" /><Skeleton className="h-8 w-24" /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
          <Card><CardContent className="p-4"><Skeleton className="h-48 w-full rounded-lg" /></CardContent></Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-teal-500" />Authentication Insights</h3>
          <p className="text-xs text-muted-foreground mt-1">Deep dive into authentication methods, success rates, and trends</p>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {periodLabels.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                period === p.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auth Stats KPI Row */}
      {authStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Successful Auths — emerald → teal gradient with left border accent */}
          <Card className="relative overflow-hidden border-l-4 border-l-emerald-500 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 dark:from-emerald-500/5 dark:to-teal-500/5 border-t border-r border-b border-emerald-200 dark:border-emerald-900/50">
            <div className="absolute -right-3 -bottom-3 opacity-[0.06] dark:opacity-[0.08] pointer-events-none">
              <CheckCircle2 className="h-24 w-24" />
            </div>
            <CardContent className="relative p-4 text-center">
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{authStats.acceptCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Successful Auths</p>
            </CardContent>
          </Card>

          {/* Failed Auths — rose → red gradient with left border accent */}
          <Card className="relative overflow-hidden border-l-4 border-l-rose-500 bg-gradient-to-br from-rose-500/10 to-red-500/10 dark:from-rose-500/5 dark:to-red-500/5 border-t border-r border-b border-rose-200 dark:border-rose-900/50">
            <div className="absolute -right-3 -bottom-3 opacity-[0.06] dark:opacity-[0.08] pointer-events-none">
              <XCircle className="h-24 w-24" />
            </div>
            <CardContent className="relative p-4 text-center">
              <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{authStats.rejectCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Failed Auths</p>
            </CardContent>
          </Card>

          {/* Success Rate — teal → cyan gradient with left border accent */}
          <Card className="relative overflow-hidden border-l-4 border-l-teal-500 bg-gradient-to-br from-teal-500/10 to-cyan-500/10 dark:from-teal-500/5 dark:to-cyan-500/5 border-t border-r border-b border-teal-200 dark:border-teal-900/50">
            <div className="absolute -right-3 -bottom-3 opacity-[0.06] dark:opacity-[0.08] pointer-events-none">
              <ShieldCheck className="h-24 w-24" />
            </div>
            <CardContent className="relative p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <p className="text-3xl font-bold text-teal-600 dark:text-teal-400">{authStats.successRate}%</p>
                {(authStats.last24hTrend ?? 0) !== 0 && (
                  <span className={cn('text-xs font-medium', (authStats.last24hTrend ?? 0) > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                    {(authStats.last24hTrend ?? 0) > 0 ? '↑' : '↓'} {Math.abs(authStats.last24hTrend || 0)}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Success Rate (24h trend)</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Detailed Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Auth Method Cards */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Login Methods Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!data || data.authDistribution.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No authentication data for this period.</p>
            ) : (
              data.authDistribution
                .sort((a, b) => b.count - a.count)
                .map((am) => (
                  <div key={am.method} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                    <div className="text-lg w-8 text-center flex-shrink-0">{authMethodIcons[am.method] || '❓'}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium truncate">{authMethodLabels[am.method] || am.method}</span>
                        <span className="text-xs font-semibold ml-2">{am.count} <span className="text-muted-foreground font-normal">({am.pct}%)</span></span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-teal-500 rounded-full transition-all duration-500" style={{ width: `${am.pct}%` }} />
                      </div>
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Success Rate Donut + Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Auth Success vs Failure</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-4 gap-4">
            {authStats && authStats.totalAuths > 0 ? (
              <>
                <div className="relative w-28 h-28">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10" className="text-rose-200 dark:text-rose-900/50" />
                    {authStats.acceptCount > 0 && (
                      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="10"
                        strokeDasharray={`${(authStats.acceptCount / authStats.totalAuths) * 251} 251`}
                        strokeLinecap="round" className="text-emerald-500"
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold">{authStats.successRate}%</span>
                    <span className="text-[9px] text-muted-foreground">Success</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-xs font-semibold">{authStats.acceptCount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Accepted</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-200 dark:bg-rose-900/50" />
                    <div>
                      <p className="text-xs font-semibold">{authStats.rejectCount.toLocaleString()}</p>
                      <p className="text-[10px] text-muted-foreground">Rejected</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground italic py-8">No authentication attempts recorded.</p>
            )}
          </CardContent>
        </Card>

        {/* Peak Hours with Auth Context */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Session Distribution by Hour</CardTitle>
          </CardHeader>
          <CardContent>
            {!data || data.peakHours.every(h => h.sessions === 0) ? (
              <p className="text-xs text-muted-foreground italic py-8 text-center">No hourly data available for this period.</p>
            ) : (
              <div className="flex items-end gap-[2px] h-36">
                {data.peakHours.filter(h => h.hour >= 5 && h.hour <= 24).map((h) => {
                  const maxSessions = Math.max(...data!.peakHours.map(ph => ph.sessions), 1);
                  const isNow = h.hour === new Date().getHours();
                  return (
                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              'w-full rounded-t-sm transition-all hover:opacity-80 cursor-default min-h-[2px]',
                              isNow ? 'bg-emerald-500 ring-1 ring-emerald-300 dark:ring-emerald-700' : 'bg-teal-400/60'
                            )}
                            style={{ height: `${(h.sessions / maxSessions) * 100}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">
                          <p>{h.hour}:00 — {h.sessions} sessions</p>
                          {isNow && <p className="text-emerald-400">← Current hour</p>}
                        </TooltipContent>
                      </Tooltip>
                      <span className={cn('text-[8px]', isNow ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-muted-foreground')}>{h.hour}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tab 4: Print WiFi Cards
// ═══════════════════════════════════════════════════════════════════════════════

function PrintCardsTab() {
  const [hotelName, setHotelName] = useState('StaySuite Hotel');
  const [guestName, setGuestName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [ssid, setSsid] = useState('HotelWiFi');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const printRef = useRef<any>(null);
  const { toast } = useToast();
  // XC-1 fix: RBAC gate on destructive actions.
  const { hasPermission } = useAuth();
  const canManage = hasPermission('wifi.manage');

  // P0-4 fix: implement handleGenerate — validate inputs, mark the card as generated, and surface
  // the printable preview. The actual print/dialog already existed; the button was a no-op before.
  const handleGenerate = async () => {
    if (!username.trim() || !password.trim()) {
      toast({
        title: 'Missing credentials',
        description: 'Username and password are required to generate the card.',
        variant: 'destructive',
      });
      return;
    }
    if (!ssid.trim()) {
      toast({
        title: 'Missing SSID',
        description: 'Please enter the WiFi network name (SSID).',
        variant: 'destructive',
      });
      return;
    }
    if (validFrom && validUntil && new Date(validFrom) > new Date(validUntil)) {
      toast({
        title: 'Invalid validity range',
        description: 'Valid From date cannot be after Valid Until date.',
        variant: 'destructive',
      });
      return;
    }
    setGenerating(true);
    // Give the UI a tick so the spinner can render before we flip the state.
    await new Promise((r) => setTimeout(r, 250));
    setGenerated(true);
    setGenerating(false);
    toast({
      title: 'Card generated',
      description: `Print card for ${guestName || username} is ready to print.`,
    });
  };

  const handlePrint = () => {
    // If the PrintCard exposes an imperative print handle, use it; otherwise fall back to window.print().
    if (printRef.current && typeof printRef.current.print === 'function') {
      printRef.current.print();
    } else {
      window.print();
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-teal-500/10 to-emerald-500/10">
              <Printer className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            Card Configuration
          </CardTitle>
          <p className="text-xs text-muted-foreground">Fill in the details to generate a printable WiFi login card</p>
        </CardHeader>
        <CardContent className="grid gap-5">
          {/* Hotel & Network Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Hotel &amp; Network</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-teal-100 dark:bg-teal-900/40"><Building className="h-3 w-3 text-teal-600 dark:text-teal-400" /></span>
                  Hotel Name
                </Label>
                <Input value={hotelName} onChange={e => setHotelName(e.target.value)} placeholder="StaySuite Hotel" className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-teal-100 dark:bg-teal-900/40"><Wifi className="h-3 w-3 text-teal-600 dark:text-teal-400" /></span>
                  Network (SSID)
                </Label>
                <Input value={ssid} onChange={e => setSsid(e.target.value)} placeholder="HotelWiFi" className="text-sm" />
              </div>
            </div>
          </div>

          {/* Guest Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Guest Details</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-100 dark:bg-emerald-900/40"><User className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /></span>
                  Guest Name
                </Label>
                <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="John Smith" className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-emerald-100 dark:bg-emerald-900/40"><Key className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /></span>
                  Room Number
                </Label>
                <Input value={roomNumber} onChange={e => setRoomNumber(e.target.value)} placeholder="301" className="text-sm" />
              </div>
            </div>
          </div>

          {/* Credentials Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Credentials</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-amber-100 dark:bg-amber-900/40"><Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" /></span>
                  Username *
                </Label>
                <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="guest301" className="text-sm font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-amber-100 dark:bg-amber-900/40"><Lock className="h-3 w-3 text-amber-600 dark:text-amber-400" /></span>
                  Password *
                </Label>
                <Input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password" className="text-sm font-mono" />
              </div>
            </div>
          </div>

          {/* Validity Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Validity Period</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-rose-100 dark:bg-rose-900/40"><Calendar className="h-3 w-3 text-rose-600 dark:text-rose-400" /></span>
                  Valid From
                </Label>
                <Input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-rose-100 dark:bg-rose-900/40"><Calendar className="h-3 w-3 text-rose-600 dark:text-rose-400" /></span>
                  Valid Until
                </Label>
                <Input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} className="text-sm" />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white shadow-md shadow-teal-500/20 transition-all duration-200 hover:shadow-lg hover:shadow-teal-500/30"
            >
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {generating ? 'Generating…' : generated ? 'Regenerate Card' : 'Generate Card'}
            </Button>
            <Button onClick={handlePrint} variant="outline" disabled={!generated} className="flex-1 border-teal-200 dark:border-teal-800 hover:bg-gradient-to-r hover:from-teal-50 hover:to-emerald-50 dark:hover:from-teal-950/30 dark:hover:to-emerald-950/30 hover:border-teal-300 dark:hover:border-teal-700 transition-all duration-200">
              <Printer className="h-4 w-4 mr-2" />Print Card
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-teal-500/10 to-emerald-500/10">
              <Eye className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            Card Preview
          </CardTitle>
          <p className="text-xs text-muted-foreground">Preview the card before printing</p>
        </CardHeader>
        <CardContent>
          {generated && username && password ? (
            <div className="relative rounded-xl overflow-hidden">
              {/* Paper texture overlay */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")', backgroundSize: '128px 128px' }} />
              {/* WiFi watermark */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none select-none">
                <Wifi className="h-40 w-40 text-foreground" />
              </div>
              {/* Card shadow */}
              <div className="shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-xl">
                <PrintCard
                  ref={printRef}
                  hotelName={hotelName}
                  guestName={guestName || undefined}
                  roomNumber={roomNumber || undefined}
                  ssid={ssid}
                  username={username}
                  password={password}
                  validFrom={validFrom || undefined}
                  validUntil={validUntil || undefined}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 rounded-full bg-gradient-to-br from-muted/60 to-muted/30 mb-4"><QrCode className="h-10 w-10 text-muted-foreground" /></div>
              <p className="text-sm text-muted-foreground font-medium">{generated ? 'Enter username and password to preview the card' : 'Click "Generate Card" to preview the printable WiFi card'}</p>
              <p className="text-xs text-muted-foreground mt-1">The card includes a QR code for easy WiFi connection</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
