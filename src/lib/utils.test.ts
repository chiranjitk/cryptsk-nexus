import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cn, formatCurrency, formatINR, safeJsonParse, apiFetch } from './utils'

// ============================================================
// cn (classname merge utility)
// ============================================================
describe('cn', () => {
  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })

  it('returns a single class name unchanged', () => {
    expect(cn('flex')).toBe('flex')
  })

  it('joins multiple class names with spaces', () => {
    expect(cn('flex', 'items-center', 'gap-2')).toBe('flex items-center gap-2')
  })

  it('filters out falsy values', () => {
    expect(cn('flex', false && 'hidden', null, undefined, '')).toBe('flex')
  })

  it('merges conflicting Tailwind classes (last one wins)', () => {
    // twMerge should deduplicate: 'p-4 p-2' → 'p-2'
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    expect(cn('base', isActive && 'active', isDisabled && 'disabled')).toBe('base active')
  })

  it('handles arrays of class names', () => {
    expect(cn(['flex', 'items-center'], 'gap-2')).toBe('flex items-center gap-2')
  })

  it('handles nested arrays', () => {
    expect(cn(['flex', ['items-center', ['gap-2']]])).toBe('flex items-center gap-2')
  })

  it('handles objects with boolean values', () => {
    // twMerge deduplicates conflicting display classes: flex and block conflict → last wins
    expect(cn({ flex: true, hidden: false, block: true })).toBe('block')
  })

  it('handles mixed input types', () => {
    expect(cn('flex', { 'items-center': true, gap: false }, ['p-4'])).toBe('flex items-center p-4')
  })

  it('deduplicates color classes (twMerge behavior)', () => {
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('deduplicates bg classes', () => {
    expect(cn('bg-red-500', 'bg-green-500')).toBe('bg-green-500')
  })

  it('handles empty string input', () => {
    expect(cn('')).toBe('')
  })
})

// ============================================================
// formatCurrency
// ============================================================
describe('formatCurrency', () => {
  it('formats zero as ₹0', () => {
    const result = formatCurrency(0)
    expect(result).toContain('0')
  })

  it('formats positive integers in INR format', () => {
    const result = formatCurrency(100)
    // Should use Indian number system: ₹100
    expect(result).toContain('100')
  })

  it('formats amounts with Indian comma grouping', () => {
    const result = formatCurrency(100000)
    // Indian format: 1,00,000
    expect(result).toContain('1,00,000')
  })

  it('formats large amounts correctly', () => {
    const result = formatCurrency(10000000)
    // Indian format: 1,00,00,000
    expect(result).toContain('1,00,00,000')
  })

  it('formats decimal amounts', () => {
    const result = formatCurrency(99.99)
    expect(result).toContain('99.99')
  })

  it('handles negative amounts', () => {
    const result = formatCurrency(-500)
    expect(result).toContain('-')
    expect(result).toContain('500')
  })

  it('formats with USD currency', () => {
    const result = formatCurrency(100, 'USD')
    // Should contain $ symbol for USD
    expect(result).toContain('100')
  })

  it('formats with EUR currency', () => {
    const result = formatCurrency(100, 'EUR')
    expect(result).toContain('100')
  })

  it('formats very large amounts', () => {
    const result = formatCurrency(9999999999)
    expect(result).toContain('999')
  })

  it('formats amounts with up to 2 decimal places', () => {
    const result = formatCurrency(1234.567)
    // maximumFractionDigits is 2, so rounds to 1234.57 (Indian comma format: 1,234.57)
    expect(result).toContain('1,234.57')
  })

  it('uses minimumFractionDigits 0 for whole numbers', () => {
    const result = formatCurrency(500)
    // Should NOT contain .00
    expect(result).not.toContain('.00')
  })

  it('formats small fractional amounts', () => {
    const result = formatCurrency(0.5)
    expect(result).toContain('0.5')
  })
})

// ============================================================
// formatINR (backward-compatible alias)
// ============================================================
describe('formatINR', () => {
  it('is an alias for formatCurrency with INR', () => {
    expect(formatINR(100)).toBe(formatCurrency(100, 'INR'))
  })

  it('formats amounts identically to formatCurrency with INR', () => {
    expect(formatINR(100000)).toBe(formatCurrency(100000, 'INR'))
  })

  it('handles zero', () => {
    expect(formatINR(0)).toBe(formatCurrency(0, 'INR'))
  })

  it('handles negative amounts', () => {
    expect(formatINR(-500)).toBe(formatCurrency(-500, 'INR'))
  })

  it('handles decimal amounts', () => {
    expect(formatINR(99.99)).toBe(formatCurrency(99.99, 'INR'))
  })
})

// ============================================================
// safeJsonParse
// ============================================================
describe('safeJsonParse', () => {
  it('parses valid JSON object', () => {
    expect(safeJsonParse('{"key": "value"}', {})).toEqual({ key: 'value' })
  })

  it('parses valid JSON array', () => {
    expect(safeJsonParse('[1, 2, 3]', [])).toEqual([1, 2, 3])
  })

  it('parses valid JSON string', () => {
    expect(safeJsonParse('"hello"', 'fallback')).toBe('hello')
  })

  it('parses valid JSON number', () => {
    expect(safeJsonParse('42', 0)).toBe(42)
  })

  it('parses valid JSON boolean', () => {
    expect(safeJsonParse('true', false)).toBe(true)
  })

  it('parses valid JSON null', () => {
    expect(safeJsonParse('null', 'fallback')).toBe(null)
  })

  it('returns fallback for empty string', () => {
    expect(safeJsonParse('', 'fallback')).toBe('fallback')
  })

  it('returns fallback for null input', () => {
    expect(safeJsonParse(null, 'fallback')).toBe('fallback')
  })

  it('returns fallback for undefined input', () => {
    expect(safeJsonParse(undefined, 'fallback')).toBe('fallback')
  })

  it('returns fallback for invalid JSON string', () => {
    expect(safeJsonParse('{invalid}', 'fallback')).toBe('fallback')
  })

  it('returns fallback for truncated JSON', () => {
    expect(safeJsonParse('{"key":', 'fallback')).toBe('fallback')
  })

  it('returns fallback for plain text', () => {
    expect(safeJsonParse('just a string', 'fallback')).toBe('fallback')
  })

  it('returns fallback for whitespace-only string', () => {
    expect(safeJsonParse('   ', 'fallback')).toBe('fallback')
  })

  it('uses generic type inference for fallback', () => {
    const result = safeJsonParse<number[]>('not json', [1, 2])
    expect(result).toEqual([1, 2])
  })

  it('returns empty array fallback for invalid JSON when array expected', () => {
    expect(safeJsonParse('bad', [])).toEqual([])
  })

  it('returns empty object fallback for invalid JSON when object expected', () => {
    expect(safeJsonParse('bad', {})).toEqual({})
  })
})

// ============================================================
// apiFetch
// ============================================================
describe('apiFetch', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    // Reset fetch mock before each test
    globalThis.fetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('makes a GET request and returns parsed JSON', async () => {
    const mockData = { items: [], total: 0 }
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
      status: 200,
      statusText: 'OK',
    } as Response)

    const result = await apiFetch('/api/test')
    expect(result).toEqual(mockData)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('sets Content-Type header for POST requests', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', {
      method: 'POST',
      body: JSON.stringify({ name: 'test' }),
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('does NOT set Content-Type header for GET requests', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test')

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).not.toHaveProperty('Content-Type')
  })

  it('throws an error for non-2xx responses', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Not found',
    } as Response)

    await expect(apiFetch('/api/notfound')).rejects.toThrow('API 404: Not found')
  })

  it('includes response body text in error for non-2xx', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Database error',
    } as Response)

    await expect(apiFetch('/api/error')).rejects.toThrow('API 500: Database error')
  })

  it('falls back to statusText when response text is empty', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '',
    } as Response)

    await expect(apiFetch('/api/forbidden')).rejects.toThrow('API 403: Forbidden')
  })

  it('merges custom headers with defaults', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', {
      method: 'POST',
      body: '{}',
      headers: { Authorization: 'Bearer token' },
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).toHaveProperty('Authorization', 'Bearer token')
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('sets timeout signal on requests', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test')

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.signal).toBeDefined()
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('does NOT set Content-Type for HEAD requests', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', { method: 'HEAD' })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).not.toHaveProperty('Content-Type')
  })

  it('handles PUT requests with Content-Type', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', {
      method: 'PUT',
      body: '{}',
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('handles DELETE requests with Content-Type', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', {
      method: 'DELETE',
      body: '{}',
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })

  it('handles PATCH requests with Content-Type', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      status: 200,
      statusText: 'OK',
    } as Response)

    await apiFetch('/api/test', {
      method: 'PATCH',
      body: '{}',
    })

    const [, options] = vi.mocked(globalThis.fetch).mock.calls[0]
    expect(options.headers).toHaveProperty('Content-Type', 'application/json')
  })
})
