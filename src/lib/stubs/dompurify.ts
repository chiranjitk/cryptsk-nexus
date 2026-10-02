// Stub for dompurify — used by captive portal ad-slot
// In production, install the real dompurify npm package
export function sanitize(html: string): string {
  // Basic HTML sanitization — removes script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/g, '')
    .replace(/javascript:/gi, '');
}
export default { sanitize };
