/**
 * Cryptsk — Subscriber Auth Store (Zustand)
 * Manages subscriber self-care authentication state with localStorage persistence.
 * Follows the same pattern as auth-store.ts but for subscriber portal.
 */

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────

/** Subscriber profile data returned from the API */
export interface SubscriberProfile {
  id: string;
  code: string;
  name: string;
  email: string;
  phone: string;
  altPhone: string;
  address: string;
  area?: { id: string; name: string } | null;
  landmark: string;
  pincode: string;
  connectionType: string;
  status: string;
  serviceUsername: string;
  ipType: string;
  ipAddress: string;
  macAddress: string;
  plan: {
    id: string;
    name: string;
    speedDown: number;
    speedUp: number;
    dataLimitGb: number;
    price: number;
  } | null;
  activationDate: string | null;
  billingStartDate: string | null;
  balance: number;
  currentSpeedDown: number;
  currentSpeedUp: number;
  currentCycleDataUsed: number;
  lastAuthAt: string | null;
  lastAuthResult: string;
  radiusEnabled: boolean;
  routerRented: boolean;
  routerSerial: string;
  routerDeposit: number;
  createdAt: string;
}

export interface UsageData {
  currentUsed: number;
  dataLimit: number | null;
  percentage: number;
  dailyUsage: { date: string; download: number; upload: number; total: number }[];
  cycleStart: string | null;
  cycleEnd: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  totalTax: number;
  discountAmount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

export interface PaymentItem {
  id: string;
  amount: number;
  paymentMode: string;
  status: string;
  transactionRef: string;
  receiptNumber: string;
  bankName: string;
  notes: string;
  createdAt: string;
}

export interface ComplaintItem {
  id: string;
  ticketNumber: string;
  type: string;
  priority: string;
  status: string;
  description: string;
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  customerRating: number | null;
}

export interface ServiceStatus {
  connectionType: string;
  ipType: string;
  ipAddress: string;
  gateway?: string;
  macAddress: string;
  dnsServers?: string[];
  mtu?: number;
  lastAuthAt: string | null;
  lastAuthResult: string;
  sessionDuration?: number;
  sessionTimeout?: number;
  idleTimeout?: number;
  routerRented: boolean;
  routerSerial: string;
  routerDeposit: number;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  uptime?: number;
}

interface SubscriberLoginResponse {
  success: boolean;
  subscriber?: SubscriberProfile;
  error?: string;
}

interface SubscriberMeResponse {
  success: boolean;
  subscriber?: SubscriberProfile;
  error?: string;
}

interface LoginOptions {
  signal?: AbortSignal;
  timeout?: number;
}

// ─── Store Interface ──────────────────────────────────────────

interface SubscriberAuthStore {
  /** Current subscriber profile (null = not authenticated) */
  subscriber: SubscriberProfile | null;

  /** Whether the subscriber is authenticated */
  isAuthenticated: boolean;

  /** Loading state (during auth check on mount) */
  isLoading: boolean;

  /** Loading state (during login form submission) */
  isLoggingIn: boolean;

  /** Error message from the last failed operation */
  error: string | null;

  /** Sign in with service username & password */
  login: (
    serviceUsername: string,
    password: string,
    options?: LoginOptions,
  ) => Promise<boolean>;

  /** Sign out and clear session */
  logout: () => Promise<void>;

  /** On mount: restore subscriber from localStorage and validate via /api/subscriber-auth/me */
  checkAuth: () => Promise<void>;

  /** Clear any stored error */
  clearError: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────

const STORAGE_KEY = "cryptsk_subscriber_auth";

function saveToStorage(subscriber: SubscriberProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subscriber));
  } catch {
    // localStorage unavailable (SSR / incognito)
  }
}

function loadFromStorage(): SubscriberProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SubscriberProfile;
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Fetch with timeout: wraps fetch to abort after a given duration.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = 15000, signal, ...rest } = options;

  if (signal?.aborted) {
    throw new DOMException("The user aborted a request.", "AbortError");
  }

  const controller = new AbortController();

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...rest,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new Error(
        "Request timed out. Please check your connection and try again.",
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Classify errors into user-friendly messages */
function classifyError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "Request was cancelled.";
  }
  if (err instanceof TypeError && err.message.includes("fetch")) {
    return "Network error — unable to reach the server. Please check your internet connection.";
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "An unexpected error occurred. Please try again.";
}

// ─── Zustand Store ────────────────────────────────────────────

export const useSubscriberAuthStore = create<SubscriberAuthStore>((set, get) => ({
  subscriber: null,
  isAuthenticated: false,
  isLoading: false,
  isLoggingIn: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (
    serviceUsername: string,
    password: string,
    options?: LoginOptions,
  ): Promise<boolean> => {
    set({ isLoggingIn: true, error: null });

    try {
      const res = await fetchWithTimeout("/api/subscriber-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceUsername, password }),
        signal: options?.signal,
        timeout: options?.timeout ?? 15000,
      });

      let data: SubscriberLoginResponse;
      try {
        data = await res.json();
      } catch {
        set({
          isLoggingIn: false,
          error: "Received an invalid response from the server.",
        });
        return false;
      }

      if (!data.success || !data.subscriber) {
        set({
          isLoggingIn: false,
          error: data.error || "Login failed",
        });
        return false;
      }

      saveToStorage(data.subscriber);

      set({
        subscriber: data.subscriber,
        isAuthenticated: true,
        isLoggingIn: false,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (err) {
      const message = classifyError(err);
      set({ isLoggingIn: false, error: message });
      return false;
    }
  },

  logout: async (): Promise<void> => {
    try {
      await fetchWithTimeout("/api/subscriber-auth/logout", {
        method: "POST",
        timeout: 5000,
      });
    } catch {
      // ignore network errors on logout
    }

    clearStorage();
    set({
      subscriber: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  },

  checkAuth: async (): Promise<void> => {
    // Always re-validate with server (removed short-circuit to handle token expiry)

    const stored = loadFromStorage();
    if (!stored) {
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true });

    try {
      const res = await fetchWithTimeout("/api/subscriber-auth/me", {
        timeout: 10000,
      });
      const data: SubscriberMeResponse = await res.json();

      if (data.success && data.subscriber) {
        saveToStorage(data.subscriber);
        set({
          subscriber: data.subscriber,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        clearStorage();
        set({
          subscriber: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch {
      // Network error - don't treat as authenticated
      set({
        subscriber: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
