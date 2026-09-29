/**
 * Cryptsk — Auth Store (Zustand)
 * Manages authentication state with localStorage persistence.
 */

import { create } from "zustand";
import type { UserInfo, UserRole } from "@/types";

// ─── Types ────────────────────────────────────────────────────

/** Full user data returned from the login API */
export interface AuthUserFull {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
  status: string;
  avatarUrl: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface LoginResponse {
  success: boolean;
  user?: AuthUserFull;
  token?: string;
  error?: string;
}

interface MeResponse {
  success: boolean;
  user?: AuthUserFull;
  error?: string;
}

/** Options for login call (timeout, abort signal) */
interface LoginOptions {
  signal?: AbortSignal;
  timeout?: number;
}

// ─── Store Interface ──────────────────────────────────────────

interface AuthStore {
  /** Current logged-in user (null = not authenticated) */
  user: UserInfo | null;

  /** Full user data from API (includes phone, status, etc.) */
  userFull: AuthUserFull | null;

  /** Whether the user is authenticated */
  isAuthenticated: boolean;

  /** Loading state (during auth check on mount) */
  isLoading: boolean;

  /** Loading state (during login form submission) */
  isLoggingIn: boolean;

  /** Error message from the last failed operation */
  error: string | null;

  /** Sign in with email & password */
  login: (email: string, password: string, options?: LoginOptions) => Promise<boolean>;

  /** Sign out and clear session */
  logout: () => Promise<void>;

  /** On mount: restore user from localStorage and validate via /api/auth/me */
  checkAuth: () => Promise<void>;

  /** Clear any stored error */
  clearError: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────

const STORAGE_KEY = "cryptsk_auth_user";
const TOKEN_KEY = "cryptsk_auth_token";

function saveToStorage(user: AuthUserFull, token?: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  } catch {
    // localStorage unavailable (SSR / incognito)
  }
}

function loadFromStorage(): AuthUserFull | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUserFull;
  } catch {
    return null;
  }
}

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/** Convert AuthUserFull → UserInfo */
function toUserInfo(full: AuthUserFull): UserInfo {
  return {
    id: full.id,
    name: full.name,
    email: full.email,
    role: full.role,
    avatarUrl: full.avatarUrl || undefined,
  };
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

  // Listen to the external signal
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

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  userFull: null,
  isAuthenticated: false,
  isLoading: false,
  isLoggingIn: false,
  error: null,

  clearError: () => set({ error: null }),

  login: async (email: string, password: string, options?: LoginOptions): Promise<boolean> => {
    set({ isLoggingIn: true, error: null });

    try {
      const res = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: options?.signal,
        timeout: options?.timeout ?? 15000,
      });

      // Handle non-JSON responses gracefully
      let data: LoginResponse;
      try {
        data = await res.json();
      } catch {
        set({
          isLoggingIn: false,
          error: "Received an invalid response from the server.",
        });
        return false;
      }

      if (!data.success || !data.user) {
        set({
          isLoggingIn: false,
          error: data.error || "Login failed",
        });
        return false;
      }

      const userInfo = toUserInfo(data.user);
      saveToStorage(data.user, data.token);

      set({
        user: userInfo,
        userFull: data.user,
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
      const token = getStoredToken();
      // Best-effort call to logout API
      await fetchWithTimeout("/api/auth/logout", {
        method: "POST",
        timeout: 5000,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      // ignore network errors on logout
    }

    clearStorage();
    set({
      user: null,
      userFull: null,
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
      const token = getStoredToken();
      const res = await fetchWithTimeout("/api/auth/me", {
        timeout: 10000,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data: MeResponse = await res.json();

      if (data.success && data.user) {
        const userInfo = toUserInfo(data.user);
        saveToStorage(data.user);
        set({
          user: userInfo,
          userFull: data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else {
        // Session invalid – clear stored data
        clearStorage();
        set({
          user: null,
          userFull: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch {
      // Network error - don't treat as authenticated
      set({
        user: null,
        userFull: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));
