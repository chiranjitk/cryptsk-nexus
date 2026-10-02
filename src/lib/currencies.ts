/**
 * Shared currency data for the application.
 * Comprehensive ISO 4217 currency list with symbols and names.
 * Used by multiple routes (tax-currency, localization, properties, etc.)
 * to avoid duplicating the same data.
 */

export interface CurrencyOption {
  value: string;   // ISO 4217 code
  label: string;   // Display label
  symbol: string;  // Currency symbol
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', AED: 'د.إ',
  SGD: 'S$', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥',
  CHF: 'CHF', HKD: 'HK$', NZD: 'NZ$', SEK: 'kr', KRW: '₩',
  MXN: 'MX$', BRL: 'R$', ZAR: 'R', RUB: '₽', TRY: '₺',
  THB: '฿', MYR: 'RM', PHP: '₱', IDR: 'Rp', VND: '₫',
  SAR: '﷼', EGP: 'E£', NGN: '₦', KES: 'KSh', GHS: '₵',
  UAH: '₴', PLN: 'zł', NOK: 'kr', DKK: 'kr', CZK: 'Kč',
  HUF: 'Ft', RON: 'lei', BGN: 'лв', ILS: '₪', TWD: 'NT$',
  BDT: '৳', PKR: 'Rs', LKR: 'Rs', NPR: 'रू', MUR: 'Rs',
};

/**
 * Comprehensive list of currencies for dropdowns.
 * Organized by major global currencies, then alphabetical.
 */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  // Major global currencies (most commonly used)
  { value: 'USD', label: 'USD - US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR - Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP - British Pound', symbol: '£' },
  { value: 'JPY', label: 'JPY - Japanese Yen', symbol: '¥' },
  { value: 'CNY', label: 'CNY - Chinese Yuan', symbol: '¥' },
  { value: 'INR', label: 'INR - Indian Rupee', symbol: '₹' },
  { value: 'AUD', label: 'AUD - Australian Dollar', symbol: 'A$' },
  { value: 'CAD', label: 'CAD - Canadian Dollar', symbol: 'C$' },
  { value: 'CHF', label: 'CHF - Swiss Franc', symbol: 'CHF' },
  { value: 'HKD', label: 'HKD - Hong Kong Dollar', symbol: 'HK$' },
  { value: 'SGD', label: 'SGD - Singapore Dollar', symbol: 'S$' },
  { value: 'NZD', label: 'NZD - New Zealand Dollar', symbol: 'NZ$' },
  // Middle East
  { value: 'AED', label: 'AED - UAE Dirham', symbol: 'د.إ' },
  { value: 'SAR', label: 'SAR - Saudi Riyal', symbol: '﷼' },
  { value: 'QAR', label: 'QAR - Qatari Riyal', symbol: '﷼' },
  { value: 'BHD', label: 'BHD - Bahraini Dinar', symbol: 'BD' },
  { value: 'OMR', label: 'OMR - Omani Rial', symbol: '﷼' },
  { value: 'KWD', label: 'KWD - Kuwaiti Dinar', symbol: 'KD' },
  { value: 'ILS', label: 'ILS - Israeli Shekel', symbol: '₪' },
  { value: 'JOD', label: 'JOD - Jordanian Dinar', symbol: 'JD' },
  { value: 'LBP', label: 'LBP - Lebanese Pound', symbol: 'ل.ل' },
  { value: 'IQD', label: 'IQD - Iraqi Dinar', symbol: 'ع.د' },
  // Southeast Asia
  { value: 'THB', label: 'THB - Thai Baht', symbol: '฿' },
  { value: 'MYR', label: 'MYR - Malaysian Ringgit', symbol: 'RM' },
  { value: 'IDR', label: 'IDR - Indonesian Rupiah', symbol: 'Rp' },
  { value: 'PHP', label: 'PHP - Philippine Peso', symbol: '₱' },
  { value: 'VND', label: 'VND - Vietnamese Dong', symbol: '₫' },
  { value: 'KHR', label: 'KHR - Cambodian Riel', symbol: '៛' },
  { value: 'LAK', label: 'LAK - Lao Kip', symbol: '₭' },
  { value: 'MMK', label: 'MMK - Myanmar Kyat', symbol: 'K' },
  { value: 'BND', label: 'BND - Brunei Dollar', symbol: 'B$' },
  // East Asia
  { value: 'KRW', label: 'KRW - South Korean Won', symbol: '₩' },
  { value: 'TWD', label: 'TWD - Taiwan Dollar', symbol: 'NT$' },
  { value: 'MOP', label: 'MOP - Macanese Pataca', symbol: 'MOP$' },
  // South Asia
  { value: 'PKR', label: 'PKR - Pakistani Rupee', symbol: 'Rs' },
  { value: 'BDT', label: 'BDT - Bangladeshi Taka', symbol: '৳' },
  { value: 'LKR', label: 'LKR - Sri Lankan Rupee', symbol: 'Rs' },
  { value: 'NPR', label: 'NPR - Nepalese Rupee', symbol: 'रू' },
  { value: 'AFN', label: 'AFN - Afghan Afghani', symbol: '؋' },
  { value: 'MVR', label: 'MVR - Maldivian Rufiyaa', symbol: 'Rf' },
  // Americas
  { value: 'MXN', label: 'MXN - Mexican Peso', symbol: 'MX$' },
  { value: 'BRL', label: 'BRL - Brazilian Real', symbol: 'R$' },
  { value: 'ARS', label: 'ARS - Argentine Peso', symbol: '$' },
  { value: 'CLP', label: 'CLP - Chilean Peso', symbol: '$' },
  { value: 'COP', label: 'COP - Colombian Peso', symbol: '$' },
  { value: 'PEN', label: 'PEN - Peruvian Sol', symbol: 'S/.' },
  { value: 'UYU', label: 'UYU - Uruguayan Peso', symbol: '$U' },
  { value: 'PYG', label: 'PYG - Paraguayan Guarani', symbol: '₲' },
  { value: 'BOB', label: 'BOB - Bolivian Boliviano', symbol: 'Bs' },
  { value: 'CRC', label: 'CRC - Costa Rican Colon', symbol: '₡' },
  { value: 'DOP', label: 'DOP - Dominican Peso', symbol: 'RD$' },
  { value: 'GTQ', label: 'GTQ - Guatemalan Quetzal', symbol: 'Q' },
  { value: 'PAB', label: 'PAB - Panamanian Balboa', symbol: 'B/.' },
  { value: 'JMD', label: 'JMD - Jamaican Dollar', symbol: 'J$' },
  { value: 'TTD', label: 'TTD - Trinidad Dollar', symbol: 'TT$' },
  { value: 'BBD', label: 'BBD - Barbadian Dollar', symbol: 'Bds$' },
  { value: 'BZD', label: 'BZD - Belize Dollar', symbol: 'BZ$' },
  { value: 'NIO', label: 'NIO - Nicaraguan Cordoba', symbol: 'C$' },
  { value: 'HNL', label: 'HNL - Honduran Lempira', symbol: 'L' },
  { value: 'SVC', label: 'SVC - Salvadoran Colon', symbol: '₡' },
  { value: 'CUP', label: 'CUP - Cuban Peso', symbol: '$MN' },
  { value: 'VES', label: 'VES - Venezuelan Bolivar', symbol: 'Bs.S' },
  { value: 'GYD', label: 'GYD - Guyanese Dollar', symbol: 'G$' },
  { value: 'SRD', label: 'SRD - Surinamese Dollar', symbol: '$' },
  // Europe
  { value: 'SEK', label: 'SEK - Swedish Krona', symbol: 'kr' },
  { value: 'NOK', label: 'NOK - Norwegian Krone', symbol: 'kr' },
  { value: 'DKK', label: 'DKK - Danish Krone', symbol: 'kr' },
  { value: 'PLN', label: 'PLN - Polish Zloty', symbol: 'zł' },
  { value: 'CZK', label: 'CZK - Czech Koruna', symbol: 'Kč' },
  { value: 'HUF', label: 'HUF - Hungarian Forint', symbol: 'Ft' },
  { value: 'RON', label: 'RON - Romanian Leu', symbol: 'lei' },
  { value: 'BGN', label: 'BGN - Bulgarian Lev', symbol: 'лв' },
  { value: 'HRK', label: 'HRK - Croatian Kuna', symbol: 'kn' },
  { value: 'RSD', label: 'RSD - Serbian Dinar', symbol: 'din' },
  { value: 'TRY', label: 'TRY - Turkish Lira', symbol: '₺' },
  { value: 'RUB', label: 'RUB - Russian Ruble', symbol: '₽' },
  { value: 'UAH', label: 'UAH - Ukrainian Hryvnia', symbol: '₴' },
  { value: 'GEL', label: 'GEL - Georgian Lari', symbol: '₾' },
  { value: 'AMD', label: 'AMD - Armenian Dram', symbol: '֏' },
  { value: 'AZN', label: 'AZN - Azerbaijani Manat', symbol: '₼' },
  { value: 'MDL', label: 'MDL - Moldovan Leu', symbol: 'L' },
  { value: 'ALL', label: 'ALL - Albanian Lek', symbol: 'L' },
  { value: 'MKD', label: 'MKD - Macedonian Denar', symbol: 'ден' },
  { value: 'BAM', label: 'BAM - Bosnia Mark', symbol: 'KM' },
  { value: 'ISK', label: 'ISK - Icelandic Krona', symbol: 'kr' },
  { value: 'BYN', label: 'BYN - Belarusian Ruble', symbol: 'Br' },
  // Africa
  { value: 'ZAR', label: 'ZAR - South African Rand', symbol: 'R' },
  { value: 'EGP', label: 'EGP - Egyptian Pound', symbol: 'E£' },
  { value: 'NGN', label: 'NGN - Nigerian Naira', symbol: '₦' },
  { value: 'KES', label: 'KES - Kenyan Shilling', symbol: 'KSh' },
  { value: 'GHS', label: 'GHS - Ghanaian Cedi', symbol: '₵' },
  { value: 'TZS', label: 'TZS - Tanzanian Shilling', symbol: 'TSh' },
  { value: 'UGX', label: 'UGX - Ugandan Shilling', symbol: 'USh' },
  { value: 'ETB', label: 'ETB - Ethiopian Birr', symbol: 'Br' },
  { value: 'MAD', label: 'MAD - Moroccan Dirham', symbol: 'MAD' },
  { value: 'TND', label: 'TND - Tunisian Dinar', symbol: 'د.ت' },
  { value: 'DZD', label: 'DZD - Algerian Dinar', symbol: 'د.ج' },
  { value: 'XOF', label: 'XOF - West African CFA', symbol: 'CFA' },
  { value: 'XAF', label: 'XAF - Central African CFA', symbol: 'FCFA' },
  { value: 'MGA', label: 'MGA - Malagasy Ariary', symbol: 'Ar' },
  { value: 'MUR', label: 'MUR - Mauritian Rupee', symbol: 'Rs' },
  { value: 'SCR', label: 'SCR - Seychellois Rupee', symbol: '₨' },
  { value: 'BWP', label: 'BWP - Botswana Pula', symbol: 'P' },
  { value: 'NAD', label: 'NAD - Namibian Dollar', symbol: 'N$' },
  { value: 'ZMW', label: 'ZMW - Zambian Kwacha', symbol: 'ZK' },
  { value: 'MWK', label: 'MWK - Malawian Kwacha', symbol: 'MK' },
  { value: 'RWF', label: 'RWF - Rwandan Franc', symbol: 'FRw' },
  { value: 'BIF', label: 'BIF - Burundian Franc', symbol: 'FBu' },
  { value: 'SDG', label: 'SDG - Sudanese Pound', symbol: 'ج.س.' },
  { value: 'LYD', label: 'LYD - Libyan Dinar', symbol: 'ل.د' },
  { value: 'GMD', label: 'GMD - Gambian Dalasi', symbol: 'D' },
  { value: 'SLL', label: 'SLL - Sierra Leonean Leone', symbol: 'Le' },
  { value: 'CVE', label: 'CVE - Cape Verdean Escudo', symbol: '$' },
  { value: 'STN', label: 'STN - Sao Tome Dobra', symbol: 'Db' },
  { value: 'ERN', label: 'ERN - Eritrean Nakfa', symbol: 'Nfk' },
  { value: 'DJF', label: 'DJF - Djiboutian Franc', symbol: 'Fdj' },
  { value: 'KMF', label: 'KMF - Comorian Franc', symbol: 'CF' },
  { value: 'CDF', label: 'CDF - Congolese Franc', symbol: 'FC' },
  { value: 'GNF', label: 'GNF - Guinean Franc', symbol: 'FG' },
  // Oceania
  { value: 'FJD', label: 'FJD - Fijian Dollar', symbol: 'FJ$' },
  { value: 'PGK', label: 'PGK - Papua New Guinean Kina', symbol: 'K' },
  { value: 'WST', label: 'WST - Samoan Tala', symbol: 'WS$' },
  { value: 'TOP', label: 'TOP - Tongan Pa\'anga', symbol: 'T$' },
  { value: 'VUV', label: 'VUV - Vanuatu Vatu', symbol: 'VT' },
  { value: 'SBD', label: 'SBD - Solomon Islands Dollar', symbol: 'SI$' },
  { value: 'XPF', label: 'XPF - CFP Franc', symbol: '₣' },
];

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || currency;
}

/**
 * Grouped currency list for settings dropdowns.
 * Organized by region for better UX.
 */
export const CURRENCY_OPTIONS_GROUPED: { group: string; options: CurrencyOption[] }[] = [
  { group: 'Indian Subcontinent', options: CURRENCY_OPTIONS.filter(c => ['INR','PKR','BDT','LKR','NPR','MUR'].includes(c.value)) },
  { group: 'Asia Pacific', options: CURRENCY_OPTIONS.filter(c => ['CNY','JPY','KRW','SGD','HKD','THB','VND','MYR','IDR','PHP','TWD','AUD','NZD'].includes(c.value)) },
  { group: 'Europe', options: CURRENCY_OPTIONS.filter(c => ['EUR','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','BGN','TRY','RUB','UAH'].includes(c.value)) },
  { group: 'Americas', options: CURRENCY_OPTIONS.filter(c => ['USD','CAD','MXN','BRL','ARS','CLP','COP','PEN'].includes(c.value)) },
  { group: 'Middle East & Africa', options: CURRENCY_OPTIONS.filter(c => ['AED','SAR','QAR','KWD','BHD','OMR','ILS','EGP','ZAR','NGN','KES','GHS'].includes(c.value)) },
  { group: 'Oceania', options: CURRENCY_OPTIONS.filter(c => ['AUD','NZD','FJD','PGK'].includes(c.value)) },
];
