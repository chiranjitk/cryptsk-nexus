'use client';

/**
 * Printable WiFi Card Component
 *
 * Renders a hotel-style WiFi credential card with QR code.
 * Used by event-wifi.tsx and guest detail pages.
 */

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Printer, QrCode } from 'lucide-react';
import QRCode from 'qrcode';

export interface PrintCardProps {
  hotelName?: string;
  roomNumber?: string;
  ssid?: string;
  username: string;
  password: string;
  validFrom?: string;
  validUntil?: string;
  guestName?: string;
  className?: string;
}

export interface PrintCardHandle {
  print: () => void;
}

export const PrintCard = forwardRef<PrintCardHandle, PrintCardProps>(({
  hotelName = 'StaySuite Hotel',
  roomNumber,
  ssid = 'HotelWiFi',
  username,
  password,
  validFrom,
  validUntil,
  guestName,
  className,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cardContentRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const isGeneratingRef = useRef(false);

  // Generate QR code when credentials change using a stable ref-based approach
  useEffect(() => {
    const wifiString = `WIFI:T:WPA;S:${ssid};U:${username};P:${password};;`;
    if (!wifiString || isGeneratingRef.current) return;

    isGeneratingRef.current = true;
    QRCode.toDataURL(wifiString, {
      width: 120,
      margin: 1,
      color: { dark: '#1a1a2e', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then((url) => {
      setQrDataUrl(url);
      isGeneratingRef.current = false;
    }).catch((err) => {
      console.error('QR code generation failed:', err);
      isGeneratingRef.current = false;
    });
  }, [ssid, username, password]);

  useImperativeHandle(ref, () => ({
    print: () => {
      if (cardContentRef.current) {
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>WiFi Credentials</title>
              <style>
                body { margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #fff; }
                .print-card { width: 400px; border: 2px solid #1a1a2e; border-radius: 12px; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
                .print-card img { width: 120px; height: 120px; }
              </style>
            </head>
            <body></body>
            </html>
          `);
          printWindow.document.close();
          // Use DOM cloneNode + adoptNode instead of innerHTML for React safety
          const clone = cardContentRef.current.cloneNode(true) as HTMLElement;
          clone.className = 'print-card';
          printWindow.document.body.appendChild(printWindow.document.adoptNode(clone));
          printWindow.print();
        }
      }
    },
  }));

  const formatDate = (date?: string) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div ref={cardRef} className={className}>
      {/* Screen-only print button */}
      <div className="print:hidden mb-3">
        <Button variant="outline" size="sm" onClick={() => ref && ref.current?.print()}>
          <Printer className="h-4 w-4 mr-2" />
          Print Card
        </Button>
      </div>

      {/* Card */}
      <div
        ref={cardContentRef}
        className="border-2 border-gray-800 rounded-xl p-6 bg-white text-black max-w-[400px] mx-auto"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
      >
        {/* Hotel Name */}
        <div className="text-center mb-1">
          <p className="text-xl font-bold text-gray-900">{hotelName}</p>
          {roomNumber && (
            <p className="text-sm text-muted-foreground mt-0.5">Room {roomNumber}</p>
          )}
        </div>

        {/* Divider */}
        <div className="h-0.5 bg-gradient-to-r from-primary to-primary/70 my-3" />

        {/* Title */}
        <p className="text-center text-xs text-muted-foreground uppercase tracking-wider mb-3">
          WiFi Access Credentials
        </p>

        {/* Network Name */}
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Network</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">{ssid}</p>
          </div>
          <div className="text-right">
            {guestName && (
              <>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Guest</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{guestName}</p>
              </>
            )}
          </div>
        </div>

        {/* Username */}
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Username</p>
          <p className="text-base font-bold text-gray-900 font-mono tracking-wide">{username}</p>
        </div>

        {/* Password */}
        <div className="mb-3">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Password</p>
          <p className="text-xl font-bold text-gray-900 font-mono tracking-widest">{password}</p>
        </div>

        {/* Valid Dates */}
        {(validFrom || validUntil) && (
          <div className="flex justify-between items-start mb-3">
            {validFrom && (
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Valid From</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{formatDate(validFrom)}</p>
              </div>
            )}
            {validUntil && (
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Valid Until</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{formatDate(validUntil)}</p>
              </div>
            )}
          </div>
        )}

        {/* QR Code */}
        <div className="text-center mt-4">
          <canvas ref={canvasRef} className="hidden" />
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="WiFi QR Code"
              className="w-[120px] h-[120px] mx-auto"
            />
          ) : (
            <div className="w-[120px] h-[120px] mx-auto bg-gray-100 rounded flex items-center justify-center">
              <QrCode className="h-8 w-8 text-gray-300" />
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">Scan to connect</p>
        </div>

        {/* Footer */}
        <div className="text-center mt-3 pt-2 border-t border-gray-200">
          <p className="text-[10px] text-muted-foreground">
            For assistance, please contact the front desk.
          </p>
        </div>
      </div>
    </div>
  );
});

PrintCard.displayName = 'PrintCard';

export default PrintCard;
