/**
 * Production unit tests for the Auth Zustand store (useAuthStore)
 *
 * Covers: initial state, login success/failure, logout, checkAuth, clearError,
 * localStorage persistence, fetch timeouts, network errors, invalid JSON,
 * concurrent state updates, abort signal handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthStore } from '@/store/auth-store'

// ─── Helpers ──────────────────────────────────────────────────

const MOCK_USER_FULL = {
  id: 'user-1',
  email: 'admin@cryptsk.com',
  name: 'Admin User',
  phone: '+911234567890',
  role: 'SUPER_ADMIN' as const,
  status: 'ACTIVE',
  avatarUrl: 'https://example.com/avatar.png',
  twoFactorEnabled: false,
  lastLoginAt: '2024-01-15T10:30:00Z',
  createdAt: '2023-06-01T00:00:00Z',
}

function mockFetchResponse(data: object, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    headers: new Headers(),
  } as Response
}

function mockFetchError(message: string) {
  const err = new TypeError(message)
  return Promise.reject(err)
}

// ─── Tests ────────────────────────────────────────────────────

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = vi.fn()
    // Reset store to initial state before each test
    useAuthStore.setState({
      user: null,
      userFull: null,
      isAuthenticated: false,
      isLoading: false,
      isLoggingIn: false,
      error: null,
    })
    vi.clearAllMocks()
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockImplementation(() => {})
    vi.mocked(localStorage.removeItem).mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════
  // Initial State
  // ═══════════════════════════════════════════════════════════════

  describe('initial state', () => {
    it('should have null user by default', () => {
      expect(useAuthStore.getState().user).toBeNull()
    })

    it('should have null userFull by default', () => {
      expect(useAuthStore.getState().userFull).toBeNull()
    })

    it('should not be authenticated by default', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should not be loading by default', () => {
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should not be logging in by default', () => {
      expect(useAuthStore.getState().isLoggingIn).toBe(false)
    })

    it('should have null error by default', () => {
      expect(useAuthStore.getState().error).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Login – Success
  // ═══════════════════════════════════════════════════════════════

  describe('login success', () => {
    it('should set isLoggingIn to true during login', async () => {
      const fetchPromise = new Promise<unknown>((resolve) =>
        setTimeout(() => resolve(mockFetchResponse({ success: true, user: MOCK_USER_FULL })), 100),
      )
      vi.mocked(global.fetch).mockReturnValue(fetchPromise as unknown as Promise<Response>)

      const loginPromise = useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')
      expect(useAuthStore.getState().isLoggingIn).toBe(true)

      await vi.advanceTimersByTimeAsync(100)
      await loginPromise
    })

    it('should set user data on successful login', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(result).toBe(true)
      expect(useAuthStore.getState().user).toEqual({
        id: MOCK_USER_FULL.id,
        name: MOCK_USER_FULL.name,
        email: MOCK_USER_FULL.email,
        role: MOCK_USER_FULL.role,
        avatarUrl: MOCK_USER_FULL.avatarUrl,
      })
    })

    it('should set userFull data on successful login', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().userFull).toEqual(MOCK_USER_FULL)
    })

    it('should set isAuthenticated to true on successful login', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    it('should save user to localStorage on successful login', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'cryptsk_auth_user',
        JSON.stringify(MOCK_USER_FULL),
      )
    })

    it('should clear error on successful login', async () => {
      // Start with an error
      useAuthStore.setState({ error: 'Previous error' })

      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().error).toBeNull()
    })

    it('should set isLoggingIn to false after successful login', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().isLoggingIn).toBe(false)
    })

    it('should handle missing avatarUrl gracefully', async () => {
      const userNoAvatar = { ...MOCK_USER_FULL, avatarUrl: '' }
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: userNoAvatar }),
      )

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().user?.avatarUrl).toBeUndefined()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Login – Failure
  // ═══════════════════════════════════════════════════════════════

  describe('login failure', () => {
    it('should return false when API returns success: false', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: false, error: 'Invalid credentials' }),
      )

      const result = await useAuthStore.getState().login('bad@email.com', 'wrong')

      expect(result).toBe(false)
    })

    it('should set error message from API response', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: false, error: 'Invalid email or password' }),
      )

      await useAuthStore.getState().login('bad@email.com', 'wrong')

      expect(useAuthStore.getState().error).toBe('Invalid email or password')
    })

    it('should use default error message when API error is missing', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: false }),
      )

      await useAuthStore.getState().login('bad@email.com', 'wrong')

      expect(useAuthStore.getState().error).toBe('Login failed')
    })

    it('should handle network errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValue(
        new TypeError('Failed to fetch'),
      )

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toContain('Network error')
    })

    it('should handle invalid JSON response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Unexpected token')
        },
      } as Response)

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toContain('invalid response')
    })

    it('should handle AbortError from fetch as cancellation', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError')
      vi.mocked(global.fetch).mockRejectedValue(abortError)

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123', { timeout: 1 })

      expect(result).toBe(false)
      // classifyError maps DOMException AbortError → 'Request was cancelled.'
      expect(useAuthStore.getState().error).toBe('Request was cancelled.')
    })

    it('should handle user abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()
      const abortError = new DOMException('The user aborted a request.', 'AbortError')
      vi.mocked(global.fetch).mockRejectedValue(abortError)

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123', {
        signal: abortController.signal,
      })

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toBe('Request was cancelled.')
    })

    it('should set isLoggingIn to false after failed login', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().isLoggingIn).toBe(false)
    })

    it('should remain unauthenticated on failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Logout
  // ═══════════════════════════════════════════════════════════════

  describe('logout', () => {
    it('should clear user state on logout', async () => {
      // Set up authenticated state
      useAuthStore.setState({
        user: { id: '1', name: 'Admin', email: 'admin@test.com', role: 'SUPER_ADMIN' },
        userFull: MOCK_USER_FULL,
        isAuthenticated: true,
      })

      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ success: true }))
      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().userFull).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should clear localStorage on logout', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ success: true }))
      await useAuthStore.getState().logout()

      expect(localStorage.removeItem).toHaveBeenCalledWith('cryptsk_auth_user')
    })

    it('should clear error on logout', async () => {
      useAuthStore.setState({ error: 'Some error' })
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ success: true }))

      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().error).toBeNull()
    })

    it('should clear isLoading on logout', async () => {
      useAuthStore.setState({ isLoading: true })
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ success: true }))

      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should succeed even if logout API call fails', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      // Should not throw
      await useAuthStore.getState().logout()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // checkAuth
  // ═══════════════════════════════════════════════════════════════

  describe('checkAuth', () => {
    it('should skip server call if no stored user', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      await useAuthStore.getState().checkAuth()

      expect(global.fetch).not.toHaveBeenCalled()
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should set isLoading to false when no stored user', async () => {
      useAuthStore.setState({ isLoading: true })
      vi.mocked(localStorage.getItem).mockReturnValue(null)

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should validate session with /api/auth/me when user is stored', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().checkAuth()

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    it('should set user as authenticated when /api/auth/me succeeds', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().user?.id).toBe(MOCK_USER_FULL.id)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should clear session when /api/auth/me returns invalid session', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: false, error: 'Session expired' }),
      )

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
      expect(localStorage.removeItem).toHaveBeenCalledWith('cryptsk_auth_user')
    })

    it('should clear session on network error during checkAuth', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should handle /api/auth/me returning user: null', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: undefined }),
      )

      await useAuthStore.getState().checkAuth()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should set isLoading to true while checking auth', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))

      const fetchPromise = new Promise<unknown>((resolve) =>
        setTimeout(() => resolve(mockFetchResponse({ success: true, user: MOCK_USER_FULL })), 50),
      )
      vi.mocked(global.fetch).mockReturnValue(fetchPromise as unknown as Promise<Response>)

      const checkPromise = useAuthStore.getState().checkAuth()

      // While fetching, isLoading should be true
      expect(useAuthStore.getState().isLoading).toBe(true)

      await vi.advanceTimersByTimeAsync(50)
      await checkPromise

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should update localStorage with fresh user data on successful checkAuth', async () => {
      const freshUser = { ...MOCK_USER_FULL, lastLoginAt: '2024-02-01T10:00:00Z' }
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(MOCK_USER_FULL))
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: freshUser }),
      )

      await useAuthStore.getState().checkAuth()

      expect(localStorage.setItem).toHaveBeenCalledWith('cryptsk_auth_user', JSON.stringify(freshUser))
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // clearError
  // ═══════════════════════════════════════════════════════════════

  describe('clearError', () => {
    it('should clear error state', () => {
      useAuthStore.setState({ error: 'Some error message' })

      useAuthStore.getState().clearError()

      expect(useAuthStore.getState().error).toBeNull()
    })

    it('should not affect other state', () => {
      useAuthStore.setState({
        error: 'Some error',
        isAuthenticated: true,
        isLoading: true,
      })

      useAuthStore.getState().clearError()

      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().isLoading).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // Edge Cases
  // ═══════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should classify unknown errors with a generic message', async () => {
      vi.mocked(global.fetch).mockRejectedValue('string error') // non-Error rejection

      const result = await useAuthStore.getState().login('a@b.com', 'p')

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toContain('unexpected error')
    })

    it('should handle fetch returning HTTP 500 with JSON body', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: false, error: 'Internal Server Error' }, 500),
      )

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toBe('Internal Server Error')
    })

    it('should handle response with success but no user field', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true }),
      )

      const result = await useAuthStore.getState().login('admin@cryptsk.com', 'Admin@123')

      expect(result).toBe(false)
      expect(useAuthStore.getState().error).toBe('Login failed')
    })

    it('should not save to localStorage when login fails', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

      await useAuthStore.getState().login('admin@cryptsk.com', 'wrong')

      // Should only have been called by this test's login call IF it succeeded (it didn't)
      // After clearAllMocks in beforeEach, setItem should not have been called for a failed login
      expect(localStorage.setItem).not.toHaveBeenCalledWith(
        'cryptsk_auth_user',
        expect.any(String),
      )
    })

    it('should send POST request with correct headers and body', async () => {
      vi.mocked(global.fetch).mockResolvedValue(
        mockFetchResponse({ success: true, user: MOCK_USER_FULL }),
      )

      await useAuthStore.getState().login('test@example.com', 'password123')

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
        }),
      )
    })

    it('should send POST to /api/auth/logout on logout', async () => {
      vi.mocked(global.fetch).mockResolvedValue(mockFetchResponse({ success: true }))

      await useAuthStore.getState().logout()

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })

    it('should handle localStorage unavailable (SSR)', async () => {
      vi.mocked(localStorage.getItem).mockImplementation(() => {
        throw new Error('localStorage unavailable')
      })

      await useAuthStore.getState().checkAuth()

      // Should not throw, just return
      expect(useAuthStore.getState().isLoading).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should handle malformed JSON in localStorage', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue('not valid json{{{')

      await useAuthStore.getState().checkAuth()

      expect(global.fetch).not.toHaveBeenCalled()
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
  })
})
