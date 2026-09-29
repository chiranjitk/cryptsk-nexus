import { describe, it, expect } from 'vitest'
import {
  isValidIPv6,
  isValidIPv6CIDR,
  isValidIPv6Prefix,
  isValidDUID,
  isValidIPv6PrefixLength,
  isValidAssignmentMode,
} from './ipv6'

// ============================================================
// isValidIPv6
// ============================================================
describe('isValidIPv6', () => {
  it('returns true for empty string by default (allowEmpty=true)', () => {
    expect(isValidIPv6('')).toBe(true)
  })

  it('returns true for whitespace-only string by default', () => {
    expect(isValidIPv6('   ')).toBe(true)
  })

  it('returns false for empty string when allowEmpty=false', () => {
    expect(isValidIPv6('', false)).toBe(false)
  })

  it('returns false for whitespace-only when allowEmpty=false', () => {
    expect(isValidIPv6('   ', false)).toBe(false)
  })

  it('validates full expanded IPv6 address', () => {
    expect(isValidIPv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true)
  })

  it('validates full compressed (no leading zeros) IPv6 address', () => {
    expect(isValidIPv6('2001:db8:85a3:0:0:8a2e:370:7334')).toBe(true)
  })

  it('validates :: shorthand for consecutive zero groups', () => {
    expect(isValidIPv6('2001:db8::8a2e:370:7334')).toBe(true)
  })

  it('validates all-zeros address with :: shorthand', () => {
    expect(isValidIPv6('::')).toBe(true)
  })

  it('validates address starting with ::', () => {
    expect(isValidIPv6('::1')).toBe(true)
    expect(isValidIPv6('::ffff:192.0.2.1')).toBe(false) // IPv4-mapped is not valid pure IPv6
  })

  it('validates loopback address', () => {
    expect(isValidIPv6('::1')).toBe(true)
  })

  it('validates link-local address', () => {
    expect(isValidIPv6('fe80::')).toBe(true)
    expect(isValidIPv6('fe80::1')).toBe(true)
  })

  it('rejects IPv4 addresses', () => {
    expect(isValidIPv6('192.168.1.1')).toBe(false)
  })

  it('rejects IPv4-mapped IPv6 addresses (with dots)', () => {
    expect(isValidIPv6('::ffff:192.168.1.1')).toBe(false)
  })

  it('rejects addresses with CIDR notation', () => {
    expect(isValidIPv6('2001:db8::/32')).toBe(false)
  })

  it('rejects addresses with too many groups', () => {
    expect(isValidIPv6('2001:db8:85a3:0:0:8a2e:370:7334:extra')).toBe(false)
  })

  it('rejects addresses with invalid characters', () => {
    expect(isValidIPv6('2001:gggg::1')).toBe(false)
    expect(isValidIPv6('2001:db8:hello::1')).toBe(false)
  })

  it('rejects addresses with only one colon', () => {
    expect(isValidIPv6('2001:')).toBe(false)
  })

  it('rejects plain text', () => {
    expect(isValidIPv6('not-an-ipv6')).toBe(false)
  })

  it('handles whitespace-padded addresses (trims before validation)', () => {
    expect(isValidIPv6('  2001:db8::1  ', false)).toBe(true)
  })

  it('rejects address with multiple ::', () => {
    expect(isValidIPv6('2001::db8::1')).toBe(false)
  })

  it('rejects address that ends with a colon', () => {
    expect(isValidIPv6('2001:db8:')).toBe(false)
  })
})

// ============================================================
// isValidIPv6CIDR
// ============================================================
describe('isValidIPv6CIDR', () => {
  it('returns true for empty string (optional field)', () => {
    expect(isValidIPv6CIDR('')).toBe(true)
  })

  it('returns true for whitespace-only string', () => {
    expect(isValidIPv6CIDR('   ')).toBe(true)
  })

  it('validates CIDR with prefix length 64', () => {
    expect(isValidIPv6CIDR('2001:db8::/64')).toBe(true)
  })

  it('validates CIDR with prefix length 48', () => {
    expect(isValidIPv6CIDR('2001:db8::/48')).toBe(true)
  })

  it('validates CIDR with prefix length 128', () => {
    expect(isValidIPv6CIDR('2001:db8::1/128')).toBe(true)
  })

  it('validates CIDR with prefix length 1', () => {
    expect(isValidIPv6CIDR('2001:db8::/1')).toBe(true)
  })

  it('rejects CIDR with prefix length 0', () => {
    expect(isValidIPv6CIDR('2001:db8::/0')).toBe(false)
  })

  it('rejects CIDR with prefix length 129', () => {
    expect(isValidIPv6CIDR('2001:db8::/129')).toBe(false)
  })

  it('rejects CIDR with prefix length 300', () => {
    expect(isValidIPv6CIDR('2001:db8::/300')).toBe(false)
  })

  it('rejects CIDR with negative prefix length', () => {
    expect(isValidIPv6CIDR('2001:db8::/-1')).toBe(false)
  })

  it('rejects plain IPv6 without CIDR notation', () => {
    expect(isValidIPv6CIDR('2001:db8::1')).toBe(false)
  })

  it('rejects invalid IPv6 with CIDR', () => {
    expect(isValidIPv6CIDR('notvalid::/64')).toBe(false)
  })

  it('rejects just a slash', () => {
    expect(isValidIPv6CIDR('/64')).toBe(false)
  })

  it('handles whitespace-padded CIDR', () => {
    expect(isValidIPv6CIDR('  2001:db8::/64  ')).toBe(true)
  })

  it('validates :: shorthand with CIDR', () => {
    expect(isValidIPv6CIDR('::/0')).toBe(false) // /0 is out of valid range
    expect(isValidIPv6CIDR('::/128')).toBe(true)
  })
})

// ============================================================
// isValidIPv6Prefix
// ============================================================
describe('isValidIPv6Prefix', () => {
  it('is an alias for isValidIPv6CIDR (returns true for empty)', () => {
    expect(isValidIPv6Prefix('')).toBe(true)
  })

  it('is an alias for isValidIPv6CIDR (validates prefix)', () => {
    expect(isValidIPv6Prefix('2001:db8::/48')).toBe(true)
  })

  it('is an alias for isValidIPv6CIDR (rejects invalid)', () => {
    expect(isValidIPv6Prefix('2001:db8::/200')).toBe(false)
  })

  it('returns true for whitespace-only string', () => {
    expect(isValidIPv6Prefix('   ')).toBe(true)
  })

  it('validates /56 prefix', () => {
    expect(isValidIPv6Prefix('fd00::/56')).toBe(true)
  })

  it('validates /60 prefix', () => {
    expect(isValidIPv6Prefix('fd00::/60')).toBe(true)
  })

  it('rejects prefix without slash', () => {
    expect(isValidIPv6Prefix('2001:db8::')).toBe(false)
  })
})

// ============================================================
// isValidDUID
// ============================================================
describe('isValidDUID', () => {
  it('returns true for empty string (optional field)', () => {
    expect(isValidDUID('')).toBe(true)
  })

  it('returns true for whitespace-only string', () => {
    expect(isValidDUID('   ')).toBe(true)
  })

  it('validates standard DUID format (colon-separated hex pairs)', () => {
    expect(isValidDUID('00:01:02:03:04:05')).toBe(true)
  })

  it('validates DUID with more bytes', () => {
    expect(isValidDUID('00:11:22:33:44:55:66:77:88:99:aa:bb')).toBe(true)
  })

  it('validates DUID with uppercase hex', () => {
    expect(isValidDUID('AA:BB:CC:DD:EE:FF')).toBe(true)
  })

  it('validates DUID with lowercase hex', () => {
    expect(isValidDUID('aa:bb:cc:dd:ee:ff')).toBe(true)
  })

  it('validates DUID with mixed case hex', () => {
    expect(isValidDUID('Aa:Bb:Cc:Dd:Ee:Ff')).toBe(true)
  })

  it('validates single hex digit pairs', () => {
    expect(isValidDUID('0:1:2:3:4')).toBe(true)
  })

  it('rejects DUID with fewer than 5 bytes (minimum 4+1=5 hex groups)', () => {
    expect(isValidDUID('00:01:02:03')).toBe(false) // Only 4 groups
  })

  it('rejects DUID with only 3 groups', () => {
    expect(isValidDUID('00:01:02')).toBe(false)
  })

  it('rejects DUID with invalid hex characters', () => {
    expect(isValidDUID('gg:hh:ii:jj:kk')).toBe(false)
  })

  it('rejects DUID without colons', () => {
    expect(isValidDUID('000102030405')).toBe(false)
  })

  it('rejects DUID with dashes instead of colons', () => {
    expect(isValidDUID('00-01-02-03-04-05')).toBe(false)
  })

  it('rejects DUID with empty segments', () => {
    expect(isValidDUID('00:01::03:04:05')).toBe(false)
  })

  it('handles whitespace-padded DUID', () => {
    expect(isValidDUID('  00:01:02:03:04:05  ')).toBe(true)
  })

  it('rejects plain text', () => {
    expect(isValidDUID('not-a-duid')).toBe(false)
  })

  it('rejects single group', () => {
    expect(isValidDUID('00')).toBe(false)
  })
})

// ============================================================
// isValidIPv6PrefixLength
// ============================================================
describe('isValidIPv6PrefixLength', () => {
  it('returns true for valid prefix lengths', () => {
    expect(isValidIPv6PrefixLength(48)).toBe(true)
    expect(isValidIPv6PrefixLength(56)).toBe(true)
    expect(isValidIPv6PrefixLength(60)).toBe(true)
    expect(isValidIPv6PrefixLength(64)).toBe(true)
    expect(isValidIPv6PrefixLength(80)).toBe(true)
    expect(isValidIPv6PrefixLength(96)).toBe(true)
    expect(isValidIPv6PrefixLength(112)).toBe(true)
    expect(isValidIPv6PrefixLength(120)).toBe(true)
    expect(isValidIPv6PrefixLength(128)).toBe(true)
  })

  it('returns false for invalid prefix lengths', () => {
    expect(isValidIPv6PrefixLength(0)).toBe(false)
    expect(isValidIPv6PrefixLength(1)).toBe(false)
    expect(isValidIPv6PrefixLength(32)).toBe(false)
    expect(isValidIPv6PrefixLength(47)).toBe(false)
    expect(isValidIPv6PrefixLength(49)).toBe(false)
    expect(isValidIPv6PrefixLength(55)).toBe(false)
    expect(isValidIPv6PrefixLength(65)).toBe(false)
    expect(isValidIPv6PrefixLength(100)).toBe(false)
    expect(isValidIPv6PrefixLength(127)).toBe(false)
    expect(isValidIPv6PrefixLength(129)).toBe(false)
    expect(isValidIPv6PrefixLength(255)).toBe(false)
  })

  it('returns false for negative numbers', () => {
    expect(isValidIPv6PrefixLength(-1)).toBe(false)
    expect(isValidIPv6PrefixLength(-64)).toBe(false)
  })

  it('returns false for non-whole numbers (float)', () => {
    expect(isValidIPv6PrefixLength(48.5)).toBe(false)
    expect(isValidIPv6PrefixLength(64.1)).toBe(false)
  })

  it('returns false for very large numbers', () => {
    expect(isValidIPv6PrefixLength(999)).toBe(false)
    expect(isValidIPv6PrefixLength(2147483647)).toBe(false)
  })

  it('returns false for zero', () => {
    expect(isValidIPv6PrefixLength(0)).toBe(false)
  })
})

// ============================================================
// isValidAssignmentMode
// ============================================================
describe('isValidAssignmentMode', () => {
  it('returns true for SLAAC', () => {
    expect(isValidAssignmentMode('SLAAC')).toBe(true)
  })

  it('returns true for DHCPV6', () => {
    expect(isValidAssignmentMode('DHCPV6')).toBe(true)
  })

  it('returns true for STATIC', () => {
    expect(isValidAssignmentMode('STATIC')).toBe(true)
  })

  it('returns true for PD_ONLY', () => {
    expect(isValidAssignmentMode('PD_ONLY')).toBe(true)
  })

  it('returns false for lowercase variants', () => {
    expect(isValidAssignmentMode('slaac')).toBe(false)
    expect(isValidAssignmentMode('dhcpv6')).toBe(false)
    expect(isValidAssignmentMode('static')).toBe(false)
    expect(isValidAssignmentMode('pd_only')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidAssignmentMode('')).toBe(false)
  })

  it('returns false for mixed case', () => {
    expect(isValidAssignmentMode('Slaac')).toBe(false)
    expect(isValidAssignmentMode('DhcpV6')).toBe(false)
  })

  it('returns false for invalid modes', () => {
    expect(isValidAssignmentMode('RANDOM')).toBe(false)
    expect(isValidAssignmentMode('AUTO')).toBe(false)
    expect(isValidAssignmentMode('MANUAL')).toBe(false)
    expect(isValidAssignmentMode('DHCP')).toBe(false)
  })

  it('returns false for null-like values', () => {
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(isValidAssignmentMode(null)).toBe(false)
    // @ts-expect-error — testing runtime behavior with invalid input
    expect(isValidAssignmentMode(undefined)).toBe(false)
  })

  it('returns false for random strings', () => {
    expect(isValidAssignmentMode('something')).toBe(false)
    expect(isValidAssignmentMode('SLAAC ')).toBe(false) // trailing space
    expect(isValidAssignmentMode(' SLAAC')).toBe(false) // leading space
  })
})
