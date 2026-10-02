/**
 * Test all credential generation formats
 * Run: bun run src/lib/wifi/services/test-credential-engine.ts
 */

import {
  generateUsername,
  generatePassword,
  generateCredentials,
  generatePreview,
  getDefaultCredentialPolicy,
  USERNAME_FORMATS,
  PASSWORD_FORMATS,
  type CredentialPolicy,
  type GuestContext,
} from './credential-engine';

// ─── Test Helpers ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.log(`  ❌ ${label}`);
  }
}

function section(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

// ─── Sample Data ─────────────────────────────────────────────────────

const fullGuest: GuestContext = {
  firstName: 'John',
  lastName: 'Smith',
  mobile: '9876543210',
  email: 'john.smith@email.com',
  passport: 'AB1234567',
  roomNumber: '101',
  bookingId: 'booking-x7k9m2p3q4',
  checkIn: new Date(2024, 0, 15), // Jan 15, 2024
  checkOut: new Date(2024, 0, 17),
};

const noRoomGuest: GuestContext = {
  firstName: 'Jane',
  lastName: 'Doe',
  mobile: '9123456789',
  email: 'jane.doe@company.com',
  passport: 'CD9876543',
  bookingId: 'booking-z1y2x3w4',
};

const minimalGuest: GuestContext = {
  firstName: 'A',
  lastName: 'B',
  bookingId: 'booking-minimal',
};

const defaultPolicy: CredentialPolicy = getDefaultCredentialPolicy();

// ─── Test 1: All Username Formats ────────────────────────────────────

section('TEST 1: All 14 Username Formats');

USERNAME_FORMATS.forEach((fmt) => {
  const policy = { ...defaultPolicy, usernameFormat: fmt.value };
  const username = generateUsername(policy, fullGuest);

  console.log(`\n  Format: ${fmt.label} (${fmt.value})`);
  console.log(`    Generated: "${username}"`);
  console.log(`    Expected pattern: ${fmt.example}`);

  assert(typeof username === 'string' && username.length > 0, `${fmt.label}: generates non-empty string`);
  assert(username.length >= policy.usernameMinLength, `${fmt.label}: meets min length (${username.length} >= ${policy.usernameMinLength})`);
  assert(username.length <= policy.usernameMaxLength, `${fmt.label}: within max length (${username.length} <= ${policy.usernameMaxLength})`);
});

// ─── Test 2: All Password Formats ───────────────────────────────────

section('TEST 2: All 10 Password Formats');

PASSWORD_FORMATS.forEach((fmt) => {
  const policy = { ...defaultPolicy, passwordFormat: fmt.value };
  const password = generatePassword(policy, fullGuest);

  console.log(`\n  Format: ${fmt.label} (${fmt.value})`);
  console.log(`    Generated: "${password}"`);
  console.log(`    Expected pattern: ${fmt.example}`);

  assert(typeof password === 'string' && password.length > 0, `${fmt.label}: generates non-empty string`);
});

// ─── Test 3: Full Credential Generation (all combos) ────────────────

section('TEST 3: Full Credential Generation (all username × password combos)');

const comboResults: Array<{ username: string; password: string; uFmt: string; pFmt: string }> = [];

USERNAME_FORMATS.forEach((uFmt) => {
  PASSWORD_FORMATS.forEach((pFmt) => {
    const policy = { ...defaultPolicy, usernameFormat: uFmt.value, passwordFormat: pFmt.value };
    const creds = generateCredentials(policy, fullGuest);
    comboResults.push({ uFmt: uFmt.value, pFmt: pFmt.value, ...creds });
  });
});

assert(comboResults.length === USERNAME_FORMATS.length * PASSWORD_FORMATS.length,
  `All ${comboResults.length} combinations generated (14 × 10 = 140)`);

// Verify no empty credentials in combos
const emptyCreds = comboResults.filter(c => !c.username || !c.password);
assert(emptyCreds.length === 0, `No empty credentials in any combo`);

// Verify no duplicate usernames in this batch (statistical check — random suffix should make collisions rare)
// Note: deterministic formats (room_only, mobile, email_prefix) produce same username across 10 password combos
// Only formats with random suffix should be unique each time
const randomUserFormats = ['room_random', 'lastname_random', 'mobile_random'];
const randomCombos = comboResults.filter(c => randomUserFormats.includes(c.uFmt));
const randomUsernames = randomCombos.map(c => c.username);
const uniqueRandomUsernames = new Set(randomUsernames);
assert(uniqueRandomUsernames.size >= randomUsernames.length * 0.95, `High uniqueness for random formats: ${uniqueRandomUsernames.size}/${randomUsernames.length} unique usernames`);

// Print sample of 5 combos
console.log('\n  Sample combos (5 of 140):');
comboResults.slice(0, 5).forEach(c => {
  console.log(`    ${c.uFmt.padEnd(30)} + ${c.pFmt.padEnd(25)} → ${c.username.padEnd(25)} / ${c.password}`);
});

// ─── Test 4: Case Control ────────────────────────────────────────────

section('TEST 4: Case Control');

const caseFormats = ['room_random', 'firstinitial_lastname', 'lastname_room'] as const;
const cases: Array<'lowercase' | 'uppercase' | 'as_is'> = ['lowercase', 'uppercase', 'as_is'];

caseFormats.forEach(fmt => {
  cases.forEach(casing => {
    const policy = { ...defaultPolicy, usernameFormat: fmt, usernameCase: casing };
    const username = generateUsername(policy, fullGuest);
    console.log(`    ${fmt} + ${casing.padEnd(12)} → "${username}"`);

    if (casing === 'lowercase') {
      assert(username === username.toLowerCase(), `${fmt} lowercase`);
    } else if (casing === 'uppercase') {
      assert(username === username.toUpperCase(), `${fmt} uppercase`);
    }
    // 'as_is' — no assertion, just check it generates
  });
});

// ─── Test 5: Separator ──────────────────────────────────────────────

section('TEST 5: Separator Characters');

const separators = ['_', '-', '.', ''];
separators.forEach(sep => {
  const policy = { ...defaultPolicy, usernameFormat: 'room_random', credentialSeparator: sep };
  const username = generateUsername(policy, fullGuest);
  console.log(`    Separator "${sep || '(none)'}" → "${username}"`);

  if (sep) {
    assert(username.includes(sep), `Contains separator "${sep}"`);
  } else {
    // With empty separator, room_random produces 'room101abcd' (no _ anywhere)
    assert(!username.includes('_') && !username.includes('-'), `No default separator when empty: "${username}"`);
  }
});

// ─── Test 6: Min/Max Length ─────────────────────────────────────────

section('TEST 6: Min/Max Length Enforcement');

// Short format (room_only = "101") with high min length
const minPolicy = { ...defaultPolicy, usernameFormat: 'room_only', usernameMinLength: 10 };
const minResult = generateUsername(minPolicy, fullGuest);
console.log(`    room_only with minLength=10 → "${minResult}" (length: ${minResult.length})`);
assert(minResult.length >= 10, `Padded to min length 10`);

// Long format with max length
const maxPolicy = { ...defaultPolicy, usernameFormat: 'firstinitial_lastname_room', usernameMaxLength: 6 };
const maxResult = generateUsername(maxPolicy, fullGuest);
console.log(`    firstinitial_lastname_room with maxLength=6 → "${maxResult}" (length: ${maxResult.length})`);
assert(maxResult.length <= 6, `Truncated to max length 6`);

// Password length
const pwLenPolicy = { ...defaultPolicy, passwordFormat: 'random_alphanumeric', passwordLength: 16 };
const pw16 = generatePassword(pwLenPolicy, fullGuest);
console.log(`    random_alphanumeric length=16 → "${pw16}" (length: ${pw16.length})`);
assert(pw16.length === 16, `Password length = 16`);

const pw4Policy = { ...defaultPolicy, passwordFormat: 'random_numeric', passwordLength: 4 };
const pw4 = generatePassword(pw4Policy, fullGuest);
console.log(`    random_numeric length=4 → "${pw4}" (length: ${pw4.length})`);
assert(pw4.length === 4, `PIN length = 4`);

// ─── Test 7: Edge Cases — Missing Guest Data ────────────────────────

section('TEST 7: Edge Cases — Missing Guest Data');

// No room number → room formats should still work (fallback)
const noRoomPolicy = { ...defaultPolicy, usernameFormat: 'room_random' };
const noRoomUser = generateUsername(noRoomPolicy, noRoomGuest);
console.log(`    room_random (no room) → "${noRoomUser}"`);
assert(noRoomUser.length > 0, 'Generates fallback username when no room');

// No room for room_only
const roomOnlyNoRoom = generateUsername({ ...defaultPolicy, usernameFormat: 'room_only' }, noRoomGuest);
console.log(`    room_only (no room) → "${roomOnlyNoRoom}"`);
assert(roomOnlyNoRoom.length > 0, 'Room-only fallback when no room');

// Minimal guest
const minimalUser = generateUsername(defaultPolicy, minimalGuest);
console.log(`    room_random (minimal guest) → "${minimalUser}"`);
assert(minimalUser.length > 0, 'Works with minimal guest data');

// No name formats with minimal guest
const nameOnlyGuest = generateUsername({ ...defaultPolicy, usernameFormat: 'firstinitial_lastname' }, minimalGuest);
console.log(`    firstinitial_lastname (minimal) → "${nameOnlyGuest}"`);
assert(nameOnlyGuest.length > 0, 'Name format works with minimal data');

// No mobile
const noMobilePw = generatePassword({ ...defaultPolicy, passwordFormat: 'last4_mobile' }, minimalGuest);
console.log(`    last4_mobile (no mobile) → "${noMobilePw}"`);
assert(noMobilePw.length > 0, 'Password fallback when no mobile');

// No check-in date
const noDatePw = generatePassword({ ...defaultPolicy, passwordFormat: 'checkin_date' }, minimalGuest);
console.log(`    checkin_date (no date) → "${noDatePw}"`);
assert(noDatePw.length > 0, 'Date fallback when no check-in');

// ─── Test 8: Fixed Password ─────────────────────────────────────────

section('TEST 8: Fixed Password');

const fixedPolicy = { ...defaultPolicy, passwordFormat: 'fixed', passwordFixedValue: 'hotel2024' };
const fixedPw = generatePassword(fixedPolicy, fullGuest);
console.log(`    Fixed password → "${fixedPw}"`);
assert(fixedPw === 'hotel2024', 'Fixed password matches configured value');

const fixedEmpty = generatePassword({ ...defaultPolicy, passwordFormat: 'fixed' }, fullGuest);
console.log(`    Fixed (no value set) → "${fixedEmpty}"`);
assert(fixedEmpty.length > 0, 'Fixed password fallback when not set');

// ─── Test 9: Custom Prefix ──────────────────────────────────────────

section('TEST 9: Custom Prefix');

const customPolicy = { ...defaultPolicy, usernameFormat: 'custom_prefix', usernamePrefix: 'grandhotel' };
const customUser = generateUsername(customPolicy, fullGuest);
console.log(`    Custom prefix "grandhotel" → "${customUser}"`);
assert(customUser.startsWith('grandhotel'), 'Username starts with custom prefix');

const noPrefix = generateUsername({ ...defaultPolicy, usernameFormat: 'custom_prefix' }, fullGuest);
console.log(`    Custom prefix (not set) → "${noPrefix}"`);
assert(noPrefix.startsWith('guest'), 'Falls back to "guest" prefix');

// ─── Test 10: Random Password Character Options ─────────────────────

section('TEST 10: Random Password Character Options');

// Only lowercase
const lowerOnly = generatePassword({
  ...defaultPolicy,
  passwordFormat: 'random_alphanumeric',
  passwordLength: 20,
  passwordIncludeUppercase: false,
  passwordIncludeNumbers: false,
  passwordIncludeSymbols: false,
}, fullGuest);
console.log(`    Lowercase only → "${lowerOnly}"`);
assert(lowerOnly === lowerOnly.toLowerCase(), 'All lowercase');

// Include uppercase
const upperInc = generatePassword({
  ...defaultPolicy,
  passwordFormat: 'random_alphanumeric',
  passwordLength: 20,
  passwordIncludeUppercase: true,
  passwordIncludeNumbers: false,
  passwordIncludeSymbols: false,
}, fullGuest);
console.log(`    Lower + Upper → "${upperInc}"`);
assert(upperInc !== upperInc.toLowerCase(), 'Contains uppercase');

// Include numbers
const numInc = generatePassword({
  ...defaultPolicy,
  passwordFormat: 'random_alphanumeric',
  passwordLength: 20,
  passwordIncludeUppercase: false,
  passwordIncludeNumbers: true,
  passwordIncludeSymbols: false,
}, fullGuest);
console.log(`    Lower + Numbers → "${numInc}"`);
assert(/\d/.test(numInc), 'Contains numbers');

// Include symbols
const symInc = generatePassword({
  ...defaultPolicy,
  passwordFormat: 'random_alphanumeric',
  passwordLength: 20,
  passwordIncludeUppercase: false,
  passwordIncludeNumbers: false,
  passwordIncludeSymbols: true,
}, fullGuest);
console.log(`    Lower + Symbols → "${symInc}"`);
assert(/[^a-z0-9]/.test(symInc), 'Contains symbols');

// Numeric only
const numOnly = generatePassword({
  ...defaultPolicy,
  passwordFormat: 'random_numeric',
  passwordLength: 8,
}, fullGuest);
console.log(`    Numeric only → "${numOnly}"`);
assert(/^\d+$/.test(numOnly), 'All digits');
assert(numOnly.length === 8, `Length = ${numOnly.length}`);

// ─── Test 11: Name-based Passwords ──────────────────────────────────

section('TEST 11: Name-based Passwords');

const lastNamePw = generatePassword({ ...defaultPolicy, passwordFormat: 'lastname' }, fullGuest);
console.log(`    lastname → "${lastNamePw}"`);
assert(lastNamePw === 'smith', 'Matches last name (lowercased)');

const lastNameRoomPw = generatePassword({ ...defaultPolicy, passwordFormat: 'lastname_room' }, fullGuest);
console.log(`    lastname_room → "${lastNameRoomPw}"`);
assert(lastNameRoomPw.includes('smith'), 'Contains last name');
assert(lastNameRoomPw.includes('101'), 'Contains room number');

const initialLastNamePw = generatePassword({ ...defaultPolicy, passwordFormat: 'firstinitial_lastname' }, fullGuest);
console.log(`    firstinitial_lastname → "${initialLastNamePw}"`);
assert(initialLastNamePw.startsWith('j'), 'Starts with first initial');
assert(initialLastNamePw.includes('smith'), 'Contains last name');

// ─── Test 12: Document-based Formats ────────────────────────────────

section('TEST 12: Document-based Formats');

const passportUser = generateUsername({ ...defaultPolicy, usernameFormat: 'passport' }, fullGuest);
console.log(`    Username (passport) → "${passportUser}"`);
assert(passportUser.includes('ab1234567'), 'Contains passport number');

const passportPw = generatePassword({ ...defaultPolicy, passwordFormat: 'passport' }, fullGuest);
console.log(`    Password (passport) → "${passportPw}"`);
assert(passportPw.includes('ab1234567'), 'Contains passport number');

// ─── Test 13: Mobile-based Formats ──────────────────────────────────

section('TEST 13: Mobile-based Formats');

const mobileUser = generateUsername({ ...defaultPolicy, usernameFormat: 'mobile' }, fullGuest);
console.log(`    Username (mobile) → "${mobileUser}"`);
assert(mobileUser === '9876543210', 'Full mobile number');

const last4Mobile = generateUsername({ ...defaultPolicy, usernameFormat: 'last4_mobile' }, fullGuest);
console.log(`    Username (last4_mobile) → "${last4Mobile}"`);
assert(last4Mobile === '3210', 'Last 4 digits');

const mobileRandom = generateUsername({ ...defaultPolicy, usernameFormat: 'mobile_random' }, fullGuest);
console.log(`    Username (mobile_random) → "${mobileRandom}"`);
assert(mobileRandom.startsWith('3210'), 'Starts with last 4 mobile');

const last4Pw = generatePassword({ ...defaultPolicy, passwordFormat: 'last4_mobile' }, fullGuest);
console.log(`    Password (last4_mobile) → "${last4Pw}"`);
assert(last4Pw === '3210', 'Last 4 of mobile');

// ─── Test 14: Email-based ───────────────────────────────────────────

section('TEST 14: Email-based Format');

const emailUser = generateUsername({ ...defaultPolicy, usernameFormat: 'email_prefix' }, fullGuest);
console.log(`    Username (email_prefix) → "${emailUser}"`);
assert(emailUser === 'john.smith', 'Email prefix before @');

// ─── Test 15: Booking ID Format ─────────────────────────────────────

section('TEST 15: Booking ID Format');

const bookingUser = generateUsername({ ...defaultPolicy, usernameFormat: 'booking_id' }, fullGuest);
console.log(`    Username (booking_id) → "${bookingUser}"`);
assert(bookingUser.startsWith('bk'), 'Contains "bk" prefix');

const bookingFallback = generateUsername(
  { ...defaultPolicy, usernameFormat: 'booking_id' },
  { firstName: 'X', lastName: 'Y' },
  'booking-fallback123'
);
console.log(`    Username (booking_id fallback) → "${bookingFallback}"`);
assert(bookingFallback.startsWith('bk'), 'Works with fallback booking ID');

// ─── Test 16: Default Policy / Preview ──────────────────────────────

section('TEST 16: Default Policy & Preview');

const defaultCreds = generateCredentials(defaultPolicy, fullGuest);
console.log(`    Default username: "${defaultCreds.username}"`);
console.log(`    Default password: "${defaultCreds.password}"`);
assert(defaultCreds.username.startsWith('room'), 'Default username starts with "room"');
assert(defaultCreds.password.length === 8, 'Default password is 8 chars');

const preview = generatePreview(defaultPolicy);
console.log(`    Preview username: "${preview.usernamePreview}"`);
console.log(`    Preview password: "${preview.passwordPreview}"`);
assert(preview.usernamePreview.startsWith('room'), 'Preview username starts with "room"');
assert(preview.passwordPreview.length > 0, 'Preview password is non-empty');

// ─── Test 17: No Confusing Characters ───────────────────────────────

section('TEST 17: No Confusing Characters in Random Passwords');

const confusing = /[0OlI1]/;
let confusingFound = false;
for (let i = 0; i < 50; i++) {
  const pw = generatePassword({
    ...defaultPolicy,
    passwordFormat: 'random_alphanumeric',
    passwordLength: 20,
    passwordIncludeUppercase: true,
    passwordIncludeNumbers: true,
  }, fullGuest);
  if (confusing.test(pw)) {
    confusingFound = true;
    console.log(`    Found confusing chars in: "${pw}"`);
    break;
  }
}
assert(!confusingFound, 'No confusing characters (0/O/l/I/1) in 50 samples');

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(60)}`);
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${'═'.repeat(60)}`);

if (failures.length > 0) {
  console.log('\n  Failed tests:');
  failures.forEach(f => console.log(`    ❌ ${f}`));
  process.exit(1);
} else {
  console.log('\n  🎉 All tests passed!');
}
