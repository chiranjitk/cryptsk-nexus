import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Providers } from "@/components/providers";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "CRYPTSK Nexus — ISP Platform",
    template: "%s — CRYPTSK Nexus",
  },
  description:
    "Enterprise OSS/BSS + Network Gateway platform for ISPs, telecom operators, and MSPs. One Platform. Every Connection. Complete Control.",
  keywords: [
    "CRYPTSK", "Nexus", "ISP", "OSS", "BSS", "RADIUS",
    "FreeRADIUS", "VPP", "DPDK", "telecom", "broadband",
  ],
  authors: [{ name: "CRYPTSK PRIVATE LIMITED" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "CRYPTSK Nexus",
    description: "Enterprise ISP Platform — OSS/BSS + Network Gateway",
    siteName: "CRYPTSK Nexus",
    type: "website",
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
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <SidebarProvider>
              <AppSidebar />
              <SidebarInset>
                <div className="flex min-h-screen flex-col">
                  <AppHeader />
                  <main className="flex-1 flex flex-col">
                    {children}
                  </main>
                  <AppFooter />
                </div>
              </SidebarInset>
            </SidebarProvider>
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
