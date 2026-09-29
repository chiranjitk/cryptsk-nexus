/**
 * Escapes HTML special characters to prevent XSS in contexts where
 * dynamic user data is interpolated into HTML strings (e.g., document.write, innerHTML).
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for safe use inside a JavaScript string literal.
 * Use this when user data is placed inside <script> tags or event handlers.
 */
export function escapeJs(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/</g, '\\x3c')
    .replace(/>/g, '\\x3e')
    .replace(/\//g, '\\/');
}
