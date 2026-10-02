'use client';

import { useEffect, useState } from 'react';
import { needsGoogleFont } from '@/lib/wifi/portal-design-utils';

/**
 * Dynamically loads Google Font <link> tags based on the portal's
 * CSS custom properties (--portal-font-family, --portal-heading-font).
 *
 * Polls for the CSS variables set by the portal config provider
 * and injects <link> elements when non-system fonts are detected.
 */
export function PortalFontLoader() {
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    // Poll for CSS custom properties set by the portal config provider
    const interval = setInterval(() => {
      const style = getComputedStyle(document.documentElement);
      const bodyFont = style.getPropertyValue('--portal-font-family').trim();
      const headingFont = style.getPropertyValue('--portal-heading-font').trim();
      const fontList: string[] = [];

      const bf = needsGoogleFont(bodyFont);
      if (bf && !fontList.includes(bf)) fontList.push(bf);
      const hf = needsGoogleFont(headingFont);
      if (hf && !fontList.includes(hf)) fontList.push(hf);

      if (fontList.length > 0) {
        setFonts(fontList);
        clearInterval(interval);
      }
    }, 500);

    // Also check after a delay in case fonts are set via class
    const timeout = setTimeout(() => {
      const style = getComputedStyle(document.documentElement);
      const bodyFont = style.getPropertyValue('--portal-font-family').trim();
      const headingFont = style.getPropertyValue('--portal-heading-font').trim();
      const fontList: string[] = [];

      const bf = needsGoogleFont(bodyFont);
      if (bf) fontList.push(bf);
      const hf = needsGoogleFont(headingFont);
      if (hf && !fontList.includes(hf)) fontList.push(hf);

      if (fontList.length > 0) {
        setFonts(prev => [...new Set([...prev, ...fontList])]);
        clearInterval(interval);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  if (fonts.length === 0) return null;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {fonts.map(font => (
        <link
          key={font}
          href={`https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`}
          rel="stylesheet"
        />
      ))}
    </>
  );
}
