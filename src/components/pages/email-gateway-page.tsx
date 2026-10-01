"use client";

// ═══════════════════════════════════════════════════════════════
// Email Gateway Management — SMTP configuration + logs
// ═══════════════════════════════════════════════════════════════
import { Mail } from "lucide-react";
import { ChannelManagerSection } from "@/components/integrations/shared";

export function EmailGatewayPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Mail className="h-5 w-5 text-sky-600" />Email Gateway</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Transactional email via your SMTP server — invoices, receipts and notifications. Test connectivity and audit delivery logs.</p>
      </div>
      <ChannelManagerSection
        allowedProviders={["smtp"]}
        accentButton="bg-sky-600 hover:bg-sky-700"
        emptyHint="Configure your SMTP server to send invoices, receipts and email notifications."
      />
    </div>
  );
}

export default EmailGatewayPage;
