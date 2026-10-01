"use client";

// ═══════════════════════════════════════════════════════════════
// SMS Gateway Management — MSG91 + provider framework
// ═══════════════════════════════════════════════════════════════
import { Smartphone } from "lucide-react";
import { ChannelManagerSection } from "@/components/integrations/shared";

export function SmsGatewayPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><Smartphone className="h-5 w-5 text-orange-600" />SMS Gateway</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Transactional SMS for OTPs, payment reminders and alerts. Configure provider credentials, send tests and audit delivery logs.</p>
      </div>
      <ChannelManagerSection
        allowedProviders={["msg91"]}
        accentButton="bg-orange-500 hover:bg-orange-600"
        emptyHint="Configure MSG91 to send OTPs, payment reminders and notifications via SMS."
      />
    </div>
  );
}

export default SmsGatewayPage;
