import '@testing-library/jest-dom/vitest'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}))

// Mock Next.js server components
vi.mock('next/server', () => ({
  NextRequest: class {
    url: string
    headers: Map<string, string>
    cookies: { get: (name: string) => { value: string } | undefined; set: (name: string, value: string, opts?: any) => void }
    method: string
    nextUrl: { pathname: string }

    constructor(urlOrInit: string | RequestInit, init?: RequestInit) {
      if (typeof urlOrInit === 'string') {
        this.url = urlOrInit
        this.nextUrl = { pathname: new URL(urlOrInit).pathname }
      } else {
        this.url = 'http://localhost/api/test'
        this.nextUrl = { pathname: '/api/test' }
      }
      this.headers = new Map()
      this.cookies = {
        get: vi.fn(() => undefined),
        set: vi.fn(),
      }
      this.method = 'GET'
    }
  },
  NextResponse: {
    json: (data: any, init?: any) => ({
      json: async () => data,
      status: init?.status || 200,
      cookies: {
        set: vi.fn(),
        get: vi.fn(),
      },
      headers: new Map(Object.entries(init?.headers || {})),
    }),
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock crypto.getRandomValues
Object.defineProperty(globalThis, 'crypto', {
  value: {
    ...globalThis.crypto,
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256)
      }
      return arr
    },
    subtle: {
      importKey: vi.fn().mockResolvedValue({}),
      sign: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
      verify: vi.fn().mockResolvedValue(true),
    },
  },
})

// Suppress console.error during tests (optional, comment out for debugging)
// vi.spyOn(console, 'error').mockImplementation(() => {})
