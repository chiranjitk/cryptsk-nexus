import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ClientLayout } from "@/components/client-layout";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cryptskFavicon = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <path d="M16 2L4 8v8c0 7.2 5.12 13.92 12 16 6.88-2.08 12-8.8 12-16V8L16 2z" fill="#DC2626"/>
  <path d="M16 6L8 10v6c0 5.4 3.84 10.44 9 12 5.16-1.56 9-6.6 9-12v-6L16 6z" fill="#0F172A"/>
  <circle cx="16" cy="15" r="4" fill="#DC2626"/>
  <circle cx="16" cy="15" r="1.5" fill="#FFFFFF"/>
  <line x1="16" y1="11" x2="16" y2="9" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="19.5" y1="17" x2="21" y2="18.5" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="12.5" y1="17" x2="11" y2="18.5" stroke="#DC2626" stroke-width="1.5" stroke-linecap="round"/>
</svg>`)}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#DC2626",
};

export const metadata: Metadata = {
  title: {
    default: "Cryptsk - Intelligent ISP Platform",
    template: "%s | Cryptsk",
  },
  description:
    "AI-powered ISP management platform by Cryptsk Pvt Ltd. Manage subscribers, monitor networks, automate billing, and deliver superior connectivity.",
  icons: {
    icon: cryptskFavicon,
    shortcut: cryptskFavicon,
    apple: cryptskFavicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={true}
          disableTransitionOnChange
        >
          <ClientLayout>
            {children}
          </ClientLayout>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
