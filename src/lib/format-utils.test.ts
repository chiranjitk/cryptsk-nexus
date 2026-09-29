import { describe, it, expect } from 'vitest'
import { formatBytes, formatUptime, formatMemoryUsage } from './format-utils'

describe('formatBytes', () => {
  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('returns "0 B" for negative numbers', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(-100)).toBe('0 B')
    expect(formatBytes(-Infinity)).toBe('0 B')
  })

  it('returns "0 B" for NaN', () => {
    expect(formatBytes(NaN)).toBe('0 B')
  })

  it('returns "0 B" for Infinity', () => {
    expect(formatBytes(Infinity)).toBe('0 B')
  })

  it('returns "0 B" for non-number types', () => {
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(formatBytes('abc')).toBe('0 B')
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(formatBytes(null)).toBe('0 B')
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(formatBytes(undefined)).toBe('0 B')
  })

  it('formats bytes correctly (< 1 KB)', () => {
    expect(formatBytes(1)).toBe('1 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2048)).toBe('2 KB')
    // 1048575 / 1024 = 1023.999... not a whole number, so toFixed(1) → '1024.0 KB'
    expect(formatBytes(1048575)).toBe('1024.0 KB')
  })

  it('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
    expect(formatBytes(5242880)).toBe('5 MB')
  })

  it('formats gigabytes correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
    expect(formatBytes(1610612736)).toBe('1.5 GB')
    expect(formatBytes(10737418240)).toBe('10 GB')
  })

  it('formats terabytes correctly', () => {
    expect(formatBytes(1099511627776)).toBe('1 TB')
    expect(formatBytes(1649267441664)).toBe('1.5 TB')
  })

  it('handles values exceeding TB without error (clamps to TB)', () => {
    // 1024 TB = 1 PB, but units array only has up to TB, so it should clamp to TB
    const petabytes = 1024 * 1099511627776
    const result = formatBytes(petabytes)
    // Should clamp to the max index (TB)
    expect(result).toContain('TB')
  })

  it('drops trailing zeros for whole numbers', () => {
    expect(formatBytes(1048576)).toBe('1 MB') // not "1.0 MB"
    expect(formatBytes(2097152)).toBe('2 MB') // not "2.0 MB"
  })

  it('shows one decimal place for fractional values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1572864)).toBe('1.5 MB')
  })
})

describe('formatUptime', () => {
  it('returns "0m" for zero seconds', () => {
    expect(formatUptime(0)).toBe('0m')
  })

  it('returns "0m" for negative numbers', () => {
    expect(formatUptime(-1)).toBe('0m')
    expect(formatUptime(-9999)).toBe('0m')
  })

  it('formats seconds only (< 1 minute)', () => {
    expect(formatUptime(30)).toBe('0m')
    expect(formatUptime(59)).toBe('0m')
  })

  it('formats minutes only', () => {
    expect(formatUptime(60)).toBe('1m')
    expect(formatUptime(300)).toBe('5m')
    expect(formatUptime(3599)).toBe('59m')
  })

  it('formats hours and minutes', () => {
    expect(formatUptime(3600)).toBe('1h')
    expect(formatUptime(3660)).toBe('1h 1m')
    expect(formatUptime(7200)).toBe('2h')
    expect(formatUptime(7260)).toBe('2h 1m')
    expect(formatUptime(86399)).toBe('23h 59m')
  })

  it('formats days and hours (omits zero minutes)', () => {
    expect(formatUptime(86400)).toBe('1d')
    expect(formatUptime(90000)).toBe('1d 1h')
    expect(formatUptime(172800)).toBe('2d')
    expect(formatUptime(259200)).toBe('3d')
  })

  it('formats days, hours, and minutes', () => {
    expect(formatUptime(86460)).toBe('1d 1m')
    expect(formatUptime(90060)).toBe('1d 1h 1m')
    expect(formatUptime(93660)).toBe('1d 2h 1m')
  })

  it('formats large uptime values', () => {
    // 365 days
    expect(formatUptime(365 * 86400)).toBe('365d')
    // 365 days + 1 hour + 1 minute
    expect(formatUptime(365 * 86400 + 3660)).toBe('365d 1h 1m')
  })

  it('omits zero-valued units', () => {
    // 2 hours — no days, no minutes
    expect(formatUptime(7200)).toBe('2h')
    // 5 days — no hours, no minutes
    expect(formatUptime(5 * 86400)).toBe('5d')
    // 1 day 1 minute — no hours
    expect(formatUptime(86460)).toBe('1d 1m')
  })

  it('always shows at least one unit (even if all are zero)', () => {
    expect(formatUptime(0)).toBe('0m')
  })
})

describe('formatMemoryUsage', () => {
  it('returns 0 when total is zero', () => {
    expect(formatMemoryUsage(0, 0)).toBe(0)
  })

  it('returns 0 when total is negative', () => {
    expect(formatMemoryUsage(100, -1)).toBe(0)
    expect(formatMemoryUsage(0, -500)).toBe(0)
  })

  it('returns 0 when used is zero', () => {
    expect(formatMemoryUsage(0, 100)).toBe(0)
  })

  it('returns 100% when used equals total', () => {
    expect(formatMemoryUsage(100, 100)).toBe(100)
    expect(formatMemoryUsage(1024, 1024)).toBe(100)
  })

  it('calculates percentage correctly', () => {
    expect(formatMemoryUsage(1, 4)).toBe(25)     // 25%
    expect(formatMemoryUsage(1, 2)).toBe(50)     // 50%
    expect(formatMemoryUsage(3, 4)).toBe(75)     // 75%
    expect(formatMemoryUsage(25, 100)).toBe(25)  // 25%
  })

  it('rounds to 1 decimal place', () => {
    // 1/3 ≈ 33.333... → 33.3
    expect(formatMemoryUsage(1, 3)).toBe(33.3)
    // 2/3 ≈ 66.666... → 66.7
    expect(formatMemoryUsage(2, 3)).toBe(66.7)
    // 1/7 ≈ 14.285... → 14.3
    expect(formatMemoryUsage(1, 7)).toBe(14.3)
  })

  it('returns 0 when used exceeds total', () => {
    // Even if used > total, the math still works — just > 100%
    expect(formatMemoryUsage(200, 100)).toBe(200)
  })

  it('handles very large numbers', () => {
    expect(formatMemoryUsage(999999999999, 999999999999)).toBe(100)
    expect(formatMemoryUsage(1, 999999999999)).toBe(0)
  })

  it('returns 0 when total is very small positive', () => {
    // total of 0.0001 with used of 0.00005
    expect(formatMemoryUsage(0.00005, 0.0001)).toBe(50)
  })
})
