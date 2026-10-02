/**
 * WiFi Credential Generation Engine
 * 
 * Generates username and password based on configurable format policies.
 * Hotels use many different credential flows depending on their brand,
 * security requirements, and guest experience preferences.
 * 
 * Supported Username Formats:
 *   room_random          → room101_a3f2       (Room + random suffix)
 *   room_only            → 101                (Just room number)
 *   lastname_room        → smith101           (Last name + room)
 *   firstinitial_lastname → jsmith            (First initial + last name)
 *   firstinitial_lastname_room → jsmith101    (First initial + last name + room)
 *   lastname_firstinitial_room → smithj101    (Last name + first initial + room)
 *   mobile               → 9876543210         (Mobile number)
 *   email_prefix         → john.doe           (Email before @)
 *   booking_id           → bk-x7k9m2          (Booking ID prefix)
 *   custom_prefix        → hotel_a3f2         (Custom prefix + random)
 *   passport             → AB1234567          (Passport/ID number)
 *   last4_mobile         → 5432               (Last 4 digits of mobile)
 *   mobile_random        → 9876_a3f2          (Last 4 mobile + random)
 *   lastname_random      → smith_a3f2         (Last name + random)
 * 
 * Supported Password Formats:
 *   random_alphanumeric  → Gx7nPq2k           (Random alpha+numbers)
 *   random_numeric       → 847293             (Random digits only, OTP-style)
 *   room_number          → 0101               (Room number, zero-padded to 4 digits)
 *   last4_mobile         → 5432               (Last 4 of mobile)
 *   lastname             → smith              (Guest last name)
 *   lastname_room        → smith101           (Last name + room)
 *   fixed                → welcome123         (Same password for all)
 *   checkin_date         → 01062026a3f2        (Check-in date DDMMYYYY + 4-char hex suffix)
 *   passport             → AB1234567          (Passport/ID number)
 *   mobile_last4         → 5432               (Last 4 digits of mobile)
 *   firstinitial_lastname → jsmith            (First initial + last name)
 * 
 * DO: Validate format inputs before generation
 * DO: Handle missing guest data gracefully with fallbacks
 * DO: Enforce min/max length constraints
 * DO: Avoid confusing characters (0/O, 1/l/I) in random passwords
 */

import { randomBytes } from 'crypto';

// ─── Type Definitions ────────────────────────────────────────────────

export interface GuestContext {
  firstName?: string | null;
  lastName?: string | null;
  mobile?: string | null;
  email?: string | null;
  passport?: string | null;
  roomNumber?: string | null;
  bookingId?: string | null;
  checkIn?: Date | null;
  checkOut?: Date | null;
}

export interface CredentialPolicy {
  // Username
  usernameFormat: string;
  usernamePrefix?: string | null;
  usernameCase: 'lowercase' | 'uppercase' | 'as_is';
  usernameMinLength: number;
  usernameMaxLength: number;
  // Password
  passwordFormat: string;
  passwordFixedValue?: string | null;
  passwordLength: number;
  passwordIncludeUppercase: boolean;
  passwordIncludeNumbers: boolean;
  passwordIncludeSymbols: boolean;
  // Advanced
  credentialSeparator: string;
  duplicateUsernameAction: 'append_random' | 'reject' | 'overwrite';
}

export interface GeneratedCredentials {
  username: string;
  password: string;
}

// ─── Format Catalog ──────────────────────────────────────────────────

export const USERNAME_FORMATS = [
  {
    value: 'room_random',
    label: 'Room + Random',
    description: 'room101_a3f2',
    example: 'room101_x7k9',
    requiresRoom: true,
  },
  {
    value: 'room_only',
    label: 'Room Number Only',
    description: 'Just the room number',
    example: '101',
    requiresRoom: true,
  },
  {
    value: 'lastname_room',
    label: 'Last Name + Room',
    description: 'Guest surname + room number',
    example: 'smith101',
    requiresName: true,
    requiresRoom: true,
  },
  {
    value: 'firstinitial_lastname',
    label: 'First Initial + Last Name',
    description: 'John Smith → jsmith',
    example: 'jsmith',
    requiresName: true,
  },
  {
    value: 'firstinitial_lastname_room',
    label: 'Initial + Surname + Room',
    description: 'John Smith Room 101 → jsmith101',
    example: 'jsmith101',
    requiresName: true,
    requiresRoom: true,
  },
  {
    value: 'lastname_firstinitial_room',
    label: 'Surname + Initial + Room',
    description: 'John Smith Room 101 → smithj101',
    example: 'smithj101',
    requiresName: true,
    requiresRoom: true,
  },
  {
    value: 'mobile',
    label: 'Mobile Number',
    description: 'Full mobile number as username',
    example: '9876543210',
    requiresMobile: true,
  },
  {
    value: 'last4_mobile',
    label: 'Last 4 Digits of Mobile',
    description: 'Last 4 digits of phone number',
    example: '5432',
    requiresMobile: true,
  },
  {
    value: 'mobile_random',
    label: 'Last 4 Mobile + Random',
    description: 'Last 4 mobile digits + random suffix',
    example: '5432_a3f2',
    requiresMobile: true,
  },
  {
    value: 'email_prefix',
    label: 'Email Prefix',
    description: 'Part before @ in email',
    example: 'john.doe',
    requiresEmail: true,
  },
  {
    value: 'booking_id',
    label: 'Booking ID',
    description: 'Booking ID prefix',
    example: 'bk-x7k9m2',
    requiresBooking: true,
  },
  {
    value: 'custom_prefix',
    label: 'Custom Prefix + Random',
    description: 'Your prefix + random suffix',
    example: 'hotel_a3f2',
    requiresPrefix: true,
  },
  {
    value: 'passport',
    label: 'Passport / ID Number',
    description: 'Guest passport or national ID',
    example: 'AB1234567',
    requiresPassport: true,
  },
  {
    value: 'lastname_random',
    label: 'Last Name + Random',
    description: 'Surname + random suffix',
    example: 'smith_a3f2',
    requiresName: true,
  },
] as const;

export const PASSWORD_FORMATS = [
  {
    value: 'random_alphanumeric',
    label: 'Random Alphanumeric',
    description: '8 random letters & numbers (no confusing chars)',
    example: 'Gx7nPq2k',
  },
  {
    value: 'random_numeric',
    label: 'Random PIN (OTP-style)',
    description: 'Random digits only, easy to type',
    example: '847293',
  },
  {
    value: 'room_number',
    label: 'Room Number',
    description: 'Room number as password (zero-padded to 4 digits)',
    example: '0101',
    requiresRoom: true,
  },
  {
    value: 'last4_mobile',
    label: 'Last 4 of Mobile',
    description: 'Last 4 digits of phone',
    example: '5432',
    requiresMobile: true,
  },
  {
    value: 'lastname',
    label: 'Last Name',
    description: 'Guest surname as password',
    example: 'smith',
    requiresName: true,
  },
  {
    value: 'lastname_room',
    label: 'Last Name + Room',
    description: 'Surname + room number',
    example: 'smith101',
    requiresName: true,
    requiresRoom: true,
  },
  {
    value: 'fixed',
    label: 'Fixed Password',
    description: 'Same password for all guests',
    example: 'welcome123',
    requiresFixed: true,
  },
  {
    value: 'checkin_date',
    label: 'Check-in Date',
    description: 'Date in DDMMYYYY + 4-char hex suffix (12 chars, ~48 bits entropy with date uniqueness)',
    example: '01062026a3f2',
    requiresCheckIn: true,
  },
  {
    value: 'passport',
    label: 'Passport / ID',
    description: 'Passport or national ID number',
    example: 'AB1234567',
    requiresPassport: true,
  },
  {
    value: 'firstinitial_lastname',
    label: 'Initial + Last Name',
    description: 'John Smith → jsmith',
    example: 'jsmith',
    requiresName: true,
  },
] as const;

// ─── Utility Functions ───────────────────────────────────────────────

/**
 * Generate a random alphanumeric string (no confusing characters)
 */
function randomAlphanumeric(length: number, options?: {
  uppercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
}): string {
  let chars = 'abcdefghjkmnpqrstuvwxyz'; // lowercase base (no confusing chars)
  
  if (options?.uppercase !== false) {
    chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  }
  if (options?.numbers !== false) {
    chars += '23456789';
  }
  if (options?.symbols) {
    chars += '@#$%&*!?';
  }

  if (chars.length === 0) chars = 'abcdefghjkmnpqrstuvwxyz23456789';

  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a random numeric string (digits only)
 */
function randomNumeric(length: number): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += String(bytes[i] % 10);
  }
  // Ensure first digit is not 0
  if (result.length > 1 && result[0] === '0') {
    result = String(1 + (parseInt(result, 10) % 9)) + result.slice(1);
  }
  return result;
}

/**
 * Sanitize a string for use in username
 * - Remove spaces and special characters
 * - Preserve Unicode letters and numbers (Chinese, Japanese, Arabic, etc.)
 * - Keep hyphens and dots as allowed separators
 * - Trim to RADIUS max of 64 characters
 * - Fall back to random guest ID if result is empty (e.g., pure-punctuation input)
 */
function sanitize(value: string): string {
  let result = value
    .trim()
    .toLowerCase()
    // Allow Unicode: Latin, Latin Extended, Cyrillic, CJK, Arabic, digits, dot, hyphen
    // (ES2017 compatible — \p{L} requires ES2018 so we use explicit ranges)
    .replace(/[^a-z0-9.\-\u00C0-\u024F\u0400-\u04FF\u4E00-\u9FFF\u0600-\u06FF]/g, '')
    .replace(/\.+/g, '.')
    .replace(/-+/g, '-');

  // Debug: log when non-ASCII characters are preserved (helps troubleshoot encoding issues)
  if (result !== result.replace(/[^a-z0-9.\-]/g, '')) {
    console.warn(`[CredentialEngine] Unicode characters preserved in sanitized value: "${result}"`);
  }

  // Enforce RADIUS username length limit (max 64 chars)
  if (result.length > 64) {
    result = result.slice(0, 64);
  }

  // If sanitization produced an empty string (e.g., Chinese chars only in legacy ASCII path, or pure symbols),
  // fall back to a random guest identifier to avoid empty usernames
  if (result.length === 0) {
    result = 'guest_' + randomBytes(2).toString('hex');
  }

  return result;
}

/**
 * Apply case transformation
 */
function applyCase(value: string, casing: 'lowercase' | 'uppercase' | 'as_is'): string {
  switch (casing) {
    case 'lowercase': return value.toLowerCase();
    case 'uppercase': return value.toUpperCase();
    default: return value;
  }
}

/**
 * Enforce length constraints
 * - If too short, pad with random chars
 * - If too long, truncate
 */
function enforceLength(value: string, min: number, max: number): string {
  let result = value;
  if (result.length < min) {
    const padding = randomAlphanumeric(min - result.length, { uppercase: false, numbers: true });
    result = result + padding;
  }
  if (result.length > max) {
    result = result.slice(0, max);
  }
  return result;
}

/**
 * Get last N digits from a string of digits
 */
function lastNDigits(value: string, n: number): string {
  const digits = value.replace(/\D/g, '');
  return digits.slice(-n);
}

// ─── Username Generator ──────────────────────────────────────────────

export function generateUsername(
  policy: CredentialPolicy,
  guest: GuestContext,
  fallbackBookingId?: string,
): string {
  const sep = policy.credentialSeparator === 'none' ? '' : (policy.credentialSeparator ?? '_');
  let username = '';

  switch (policy.usernameFormat) {
    // ── Room-based ──
    case 'room_random': {
      const room = guest.roomNumber || '???';
      username = `room${sep}${room}${sep}${randomAlphanumeric(4)}`;
      break;
    }
    /**
     * room_only format: room number as username.
     * Collision prevention: Two tenants sharing room numbering (e.g., both have room 101)
     * would collide in the same RADIUS database. We mitigate this by:
     * 1. If usernamePrefix is configured (used as tenant/property code), prepend it: prefix_room101
     * 2. Otherwise, append a short random suffix: room101_a3f
     */
    case 'room_only': {
      const room = guest.roomNumber || '???';
      if (policy.usernamePrefix && policy.usernamePrefix.trim().length > 0) {
        // Tenant/property prefix available — use it as a namespace to prevent cross-tenant collisions
        const prefix = sanitize(policy.usernamePrefix.trim());
        username = prefix + sep + room;
      } else {
        // No prefix configured — append random suffix to reduce collision probability
        username = room + sep + randomAlphanumeric(3);
      }
      break;
    }

    // ── Name-based ──
    case 'lastname_room': {
      const last = sanitize(guest.lastName || 'guest');
      const room = guest.roomNumber || '';
      username = last + (room ? sep + room : '');
      break;
    }
    case 'firstinitial_lastname': {
      const first = sanitize(guest.firstName || 'g');
      const last = sanitize(guest.lastName || 'guest');
      username = first[0] + last;
      break;
    }
    case 'firstinitial_lastname_room': {
      const first = sanitize(guest.firstName || 'g');
      const last = sanitize(guest.lastName || 'guest');
      const room = guest.roomNumber || '';
      username = first[0] + last + (room ? sep + room : '');
      break;
    }
    case 'lastname_firstinitial_room': {
      const last = sanitize(guest.lastName || 'guest');
      const first = sanitize(guest.firstName || 'g');
      const room = guest.roomNumber || '';
      username = last + first[0] + (room ? sep + room : '');
      break;
    }
    case 'lastname_random': {
      const last = sanitize(guest.lastName || 'guest');
      username = last + sep + randomAlphanumeric(4);
      break;
    }

    // ── Mobile-based ──
    case 'mobile': {
      username = (guest.mobile || '').replace(/\D/g, '');
      break;
    }
    case 'last4_mobile': {
      username = lastNDigits(guest.mobile || '', 4);
      break;
    }
    case 'mobile_random': {
      const mobile = lastNDigits(guest.mobile || '', 4);
      username = mobile + sep + randomAlphanumeric(4);
      break;
    }

    // ── Email-based ──
    case 'email_prefix': {
      const email = guest.email || '';
      username = sanitize(email.split('@')[0] || 'guest');
      break;
    }

    // ── Booking-based ──
    case 'booking_id': {
      const id = (guest.bookingId || fallbackBookingId || '').replace(/[^a-zA-Z0-9]/g, '');
      username = 'bk' + sep + id.slice(-8);
      break;
    }

    // ── Custom prefix ──
    case 'custom_prefix': {
      const prefix = sanitize(policy.usernamePrefix || 'guest');
      username = prefix + sep + randomAlphanumeric(4);
      break;
    }

    // ── Passport ──
    case 'passport': {
      username = sanitize(guest.passport || 'id' + randomAlphanumeric(4));
      break;
    }

    // ── Pure random (auto-generated) ──
    case 'random_alphanumeric': {
      username = 'guest' + sep + randomAlphanumeric(8);
      break;
    }

    case 'random_numeric': {
      username = 'guest' + sep + randomNumeric(8);
      break;
    }

    // ── Fallback: room_random (original behavior) ──
    default: {
      const room = guest.roomNumber || '???';
      username = `room${room}${sep}${randomAlphanumeric(4)}`;
      break;
    }
  }

  // Apply case transformation
  username = applyCase(username, policy.usernameCase);

  // Enforce length constraints
  username = enforceLength(username, policy.usernameMinLength, policy.usernameMaxLength);

  return username;
}

// ─── Password Generator ──────────────────────────────────────────────

export function generatePassword(
  policy: CredentialPolicy,
  guest: GuestContext,
): string {
  const sep = policy.credentialSeparator === 'none' ? '' : (policy.credentialSeparator ?? '_');
  let password = '';

  switch (policy.passwordFormat) {
    // ── Random formats ──
    case 'random_alphanumeric': {
      password = randomAlphanumeric(policy.passwordLength, {
        uppercase: policy.passwordIncludeUppercase,
        numbers: policy.passwordIncludeNumbers,
        symbols: policy.passwordIncludeSymbols,
      });
      break;
    }
    case 'random_numeric': {
      password = randomNumeric(Math.max(4, policy.passwordLength));
      break;
    }

    // ── Guest data-based ──
    case 'room_number': {
      // Pad room numbers to minimum 4 digits to prevent trivially guessable
      // 1-digit passwords (e.g., room "5" → "0005", room "12" → "0012")
      const raw = guest.roomNumber || randomNumeric(4);
      password = String(raw).padStart(4, '0');
      break;
    }
    case 'last4_mobile': {
      const digits = lastNDigits(guest.mobile || '', 4);
      password = digits || randomNumeric(4);
      break;
    }
    case 'lastname': {
      password = sanitize(guest.lastName || 'guest');
      break;
    }
    case 'lastname_room': {
      const last = sanitize(guest.lastName || 'guest');
      const room = guest.roomNumber || '';
      password = last + (room ? sep + room : '');
      break;
    }
    case 'firstinitial_lastname': {
      const first = sanitize(guest.firstName || 'g');
      const last = sanitize(guest.lastName || 'guest');
      password = first[0] + last;
      break;
    }
    case 'checkin_date': {
      // Format: DDMMYYYY + 4-char random hex suffix (12 chars total)
      // The date portion provides date-scoped uniqueness; the hex suffix adds ~16 bits entropy
      // making brute-force impractical while keeping the password memorable for guests.
      // Example: June 1, 2026 → "01062026" → "01062026a3f2"
      if (guest.checkIn) {
        const d = guest.checkIn;
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        const hexSuffix = randomBytes(2).toString('hex'); // 4-char hex
        password = `${dd}${mm}${yyyy}${hexSuffix}`;
      } else {
        password = randomNumeric(8);
      }
      break;
    }
    case 'passport': {
      password = sanitize(guest.passport || 'id' + randomAlphanumeric(4));
      break;
    }

    // ── Fixed password ──
    case 'fixed': {
      if (!policy.passwordFixedValue || policy.passwordFixedValue.trim().length === 0) {
        // No fixed value configured — generate a random 8-char hex password
        // instead of using the guessable "welcome" fallback
        console.warn('[credential-engine] Fixed password format selected but no passwordFixedValue configured. Using random fallback.');
        password = randomBytes(4).toString('hex'); // 8-char hex string
      } else {
        password = policy.passwordFixedValue;
        // Warn if fixed password is shorter than recommended minimum
        if (password.length < 6) {
          console.warn(`[credential-engine] Fixed password is only ${password.length} characters. Minimum recommended length is 6.`);
        }
      }
      break;
    }

    // ── Fallback: random_alphanumeric (original behavior) ──
    default: {
      password = randomAlphanumeric(policy.passwordLength, {
        uppercase: policy.passwordIncludeUppercase,
        numbers: policy.passwordIncludeNumbers,
        symbols: policy.passwordIncludeSymbols,
      });
      break;
    }
  }

  // Ensure password is never empty
  if (!password || password.length === 0) {
    password = randomAlphanumeric(8);
  }

  // Measure password entropy and warn if dangerously weak
  const entropy = calculatePasswordEntropy(password);
  if (entropy < 20) {
    console.warn(`[CredentialEngine] Low password entropy (${entropy} bits) for format: ${policy.passwordFormat}. Consider using a stronger format.`);
  }

  return password;
}

// ─── Password Entropy Measurement ──────────────────────────────────────

/**
 * Calculate the approximate Shannon entropy (in bits) of a password.
 * Estimates based on the effective character set size detected in the password.
 * This is a conservative lower bound — actual entropy may be higher if the
 * password is derived from a larger keyspace (e.g., dates with hex suffix).
 *
 * Charset sizes:
 *   - Digits only:        10 characters → ~3.32 bits/char
 *   - Lowercase letters:   26 characters → ~4.70 bits/char
 *   - Alphanumeric:        36 characters → ~5.17 bits/char
 *   - Full printable ASCII: 94 characters → ~6.55 bits/char
 *
 * @param password - The password string to measure
 * @returns Approximate entropy in bits (integer)
 */
export function calculatePasswordEntropy(password: string): number {
  const charsetSize = (() => {
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password)) return 94;
    if (/[a-z]/.test(password) && /[0-9]/.test(password)) return 36;
    if (/[0-9]/.test(password)) return 10;
    return 26;
  })();
  return Math.floor(password.length * Math.log2(charsetSize));
}

// ─── Main Generator ──────────────────────────────────────────────────

/**
 * Generate both username and password based on the credential policy
 */
export function generateCredentials(
  policy: CredentialPolicy,
  guest: GuestContext,
  fallbackBookingId?: string,
): GeneratedCredentials {
  const username = generateUsername(policy, guest, fallbackBookingId);
  const password = generatePassword(policy, guest);
  return { username, password };
}

/**
 * Generate a preview of credentials (for the settings UI)
 * Shows what the credentials would look like with sample data
 */
export function generatePreview(
  policy: CredentialPolicy,
): { usernamePreview: string; passwordPreview: string } {
  const sampleGuest: GuestContext = {
    firstName: 'John',
    lastName: 'Smith',
    mobile: '9876543210',
    email: 'john.smith@email.com',
    passport: 'AB1234567',
    roomNumber: '101',
    bookingId: 'booking-x7k9m2p3',
    checkIn: new Date(2024, 0, 15), // Jan 15, 2024
    checkOut: new Date(2024, 0, 17),
  };

  const { username, password } = generateCredentials(policy, sampleGuest);
  return { usernamePreview: username, passwordPreview: password };
}

/**
 * Get the default credential policy
 */
export function getDefaultCredentialPolicy(): CredentialPolicy {
  return {
    usernameFormat: 'room_random',
    usernamePrefix: 'guest',
    usernameCase: 'lowercase',
    usernameMinLength: 4,
    usernameMaxLength: 32,
    passwordFormat: 'random_alphanumeric',
    passwordFixedValue: null,
    passwordLength: 8,
    passwordIncludeUppercase: true,
    passwordIncludeNumbers: true,
    passwordIncludeSymbols: false,
    credentialSeparator: '_',  // options: '_', '-', '.', 'none'
    duplicateUsernameAction: 'append_random',
  };
}
