"use client";

// ═══════════════════════════════════════════════════════════════
// WhatsApp & Push Channels — WhatsApp Business API + Firebase FCM
// ═══════════════════════════════════════════════════════════════
import { MessageSquare } from "lucide-react";
import { ChannelManagerSection } from "@/components/integrations/shared";

export function WhatsappPushPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><MessageSquare className="h-5 w-5 text-green-600" />WhatsApp & Push Channels</h1>
        <p className="text-sm text-muted-foreground mt-0.5">WhatsApp Business API for customer messaging and Firebase Cloud Messaging for mobile push notifications.</p>
      </div>
      <ChannelManagerSection
        allowedProviders={["whatsapp", "fcm"]}
        accentButton="bg-green-600 hover:bg-green-700"
        emptyHint="Configure WhatsApp Business API or Firebase FCM to message customers on their favourite channels."
      />
    </div>
  );
}

export default WhatsappPushPage;
