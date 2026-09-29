/**
 * CRYPTSKINTELLIGENT — /api/nas-clients/vendors
 *
 * Return hardcoded vendor templates for NAS client creation.
 * Each vendor defines supported attributes, auth protocols, CoA support, etc.
 *
 * GET — List all vendor templates, or get one by ?vendor=mikrotik
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/api-auth";

// ---------------------------------------------------------------------------
// Vendor Templates
// ---------------------------------------------------------------------------

const VENDOR_TEMPLATES = [
  {
    id: "mikrotik",
    name: "MikroTik RouterOS",
    type: "other",
    description:
      "MikroTik routers and switches — supports CoA, interim accounting, vendor-specific attributes",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Mikrotik-Rate-Limit",
        type: "reply",
        dataType: "string",
        description: "Bandwidth limit (e.g. 50M/50M)",
      },
      {
        name: "Mikrotik-Address-List",
        type: "reply",
        dataType: "string",
        description: "Firewall address list assignment",
      },
      {
        name: "Mikrotik-Group",
        type: "reply",
        dataType: "string",
        description: "User group assignment",
      },
      {
        name: "Mikrotik-Wireless-Forwarding",
        type: "reply",
        dataType: "integer",
        description: "Wireless forwarding mode",
      },
      {
        name: "Mikrotik-Recv-Limit",
        type: "reply",
        dataType: "integer",
        description: "Download data limit (bytes)",
      },
      {
        name: "Mikrotik-Xmit-Limit",
        type: "reply",
        dataType: "integer",
        description: "Upload data limit (bytes)",
      },
    ],
  },
  {
    id: "cisco",
    name: "Cisco IOS/IOS-XE",
    type: "other",
    description:
      "Cisco routers, switches, and wireless controllers — enterprise-grade CoA and DM support",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2", "EAP"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Cisco-AVPair",
        type: "reply",
        dataType: "string",
        description:
          "Vendor-specific AV pair (e.g. subscriber:policy-name=value)",
      },
      {
        name: "Cisco-NAS-Port",
        type: "check",
        dataType: "string",
        description: "NAS port description",
      },
      {
        name: "h323-return-code",
        type: "reply",
        dataType: "integer",
        description: "VoIP return code",
      },
      {
        name: "cisco-msit-redirection-url",
        type: "reply",
        dataType: "string",
        description: "Captive portal redirect URL",
      },
    ],
  },
  {
    id: "huawei",
    name: "Huawei VRP/BRAS",
    type: "other",
    description:
      "Huawei BRAS, routers, and access servers — widely used in ISP environments",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Huawei-Qos-Profile-Name",
        type: "reply",
        dataType: "string",
        description: "QoS bandwidth profile",
      },
      {
        name: "Huawei-Input-Peak-Information-Rate",
        type: "reply",
        dataType: "integer",
        description: "Input peak rate (bps)",
      },
      {
        name: "Huawei-Output-Peak-Information-Rate",
        type: "reply",
        dataType: "integer",
        description: "Output peak rate (bps)",
      },
      {
        name: "Huawei-IPv6-Prefix-Delegation-Pool",
        type: "reply",
        dataType: "string",
        description: "IPv6 PD pool name",
      },
      {
        name: "HW-Accounting-Interval",
        type: "reply",
        dataType: "integer",
        description: "Interim accounting interval (seconds)",
      },
    ],
  },
  {
    id: "juniper",
    name: "Juniper JunOS",
    type: "other",
    description:
      "Juniper routers and SRX firewalls — CoA and dynamic authorization support",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2", "EAP"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Juniper-Allow-Interfaces",
        type: "reply",
        dataType: "string",
        description: "Allowed interface pattern",
      },
      {
        name: "Juniper-Local-User-Name",
        type: "reply",
        dataType: "string",
        description: "Local username override",
      },
      {
        name: "Juniper-Session-Timeout",
        type: "reply",
        dataType: "integer",
        description: "Session timeout (seconds)",
      },
    ],
  },
  {
    id: "aruba",
    name: "Aruba / HPE Aruba",
    type: "other",
    description:
      "Aruba wireless controllers and access points — Role-based access control",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2", "EAP-PEAP", "EAP-TLS"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Aruba-User-Role",
        type: "reply",
        dataType: "string",
        description: "User role assignment",
      },
      {
        name: "Aruba-AP-Group",
        type: "reply",
        dataType: "string",
        description: "AP group for session",
      },
      {
        name: "Aruba-IPv6-Address",
        type: "reply",
        dataType: "ipaddr",
        description: "IPv6 address assignment",
      },
      {
        name: "Aruba-Interface-Name",
        type: "reply",
        dataType: "string",
        description: "Tunnel interface name",
      },
    ],
  },
  {
    id: "ubiquiti",
    name: "Ubiquiti UniFi/EdgeMAX",
    type: "other",
    description:
      "Ubiquiti gateways, USG, and UniFi controllers — basic RADIUS with CoA",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "UniFi-Filter-Id",
        type: "reply",
        dataType: "string",
        description: "Firewall filter ID",
      },
      {
        name: "UniFi-VLAN",
        type: "reply",
        dataType: "integer",
        description: "VLAN assignment",
      },
    ],
  },
  {
    id: "fortinet",
    name: "Fortinet FortiGate",
    type: "other",
    description:
      "Fortinet firewalls — RADIUS authentication for VPN and WiFi",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2", "EAP-TLS"],
    defaultPorts: 3799,
    coaSupport: false,
    attributes: [
      {
        name: "Fortinet-Group-Name",
        type: "reply",
        dataType: "string",
        description: "User group for policy matching",
      },
      {
        name: "Fortinet-Vdom-Name",
        type: "reply",
        dataType: "string",
        description: "Virtual domain assignment",
      },
    ],
  },
  {
    id: "linux",
    name: "Linux (pppd/coova-chilli)",
    type: "other",
    description:
      "Linux-based NAS — pppd server, CoovaChilli captive portal, accel-ppp",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Framed-IP-Address",
        type: "reply",
        dataType: "ipaddr",
        description: "Static IP assignment",
      },
      {
        name: "Framed-IP-Netmask",
        type: "reply",
        dataType: "ipaddr",
        description: "IP netmask",
      },
      {
        name: "Framed-Pool",
        type: "reply",
        dataType: "string",
        description: "IP address pool name",
      },
    ],
  },
  {
    id: "cambium",
    name: "Cambium ePMP/cnPilot",
    type: "other",
    description:
      "Cambium wireless broadband — PMP and ePMP series for WISP",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: false,
    attributes: [
      {
        name: "Cambium-Service-Type",
        type: "reply",
        dataType: "integer",
        description: "Service type ID",
      },
      {
        name: "Cambium-Download-Rate",
        type: "reply",
        dataType: "integer",
        description: "Download rate (kbps)",
      },
      {
        name: "Cambium-Upload-Rate",
        type: "reply",
        dataType: "integer",
        description: "Upload rate (kbps)",
      },
    ],
  },
  {
    id: "mikrotik-pppoe",
    name: "MikroTik (PPPoE Server)",
    type: "other",
    description:
      "MikroTik PPPoE server with per-user rate limiting and session management",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 3799,
    coaSupport: true,
    attributes: [
      {
        name: "Mikrotik-Rate-Limit",
        type: "reply",
        dataType: "string",
        description: "Bandwidth limit (e.g. 50M/50M)",
      },
      {
        name: "Mikrotik-Address-List",
        type: "reply",
        dataType: "string",
        description: "Firewall address list",
      },
      {
        name: "Mikrotik-Only-Password",
        type: "check",
        dataType: "string",
        description: "Accept any username",
      },
      {
        name: "Mikrotik-PPPoE-One-To-One",
        type: "check",
        dataType: "string",
        description: "One session per user",
      },
      {
        name: "Mikrotik-Advertise-URL",
        type: "reply",
        dataType: "string",
        description: "PPPoE advertise URL",
      },
    ],
  },
  {
    id: "other",
    name: "Other / Generic",
    type: "other",
    description: "Generic NAS device with standard RADIUS attributes",
    authProtocols: ["PAP", "CHAP", "MS-CHAPv2"],
    defaultPorts: 0,
    coaSupport: false,
    attributes: [
      {
        name: "Framed-Protocol",
        type: "reply",
        dataType: "string",
        description: "Framed protocol (PPP, SLIP, etc.)",
      },
      {
        name: "Framed-IP-Address",
        type: "reply",
        dataType: "ipaddr",
        description: "Static IP assignment",
      },
      {
        name: "Framed-Pool",
        type: "reply",
        dataType: "string",
        description: "IP address pool name",
      },
      {
        name: "Session-Timeout",
        type: "reply",
        dataType: "integer",
        description: "Max session duration (seconds)",
      },
      {
        name: "Idle-Timeout",
        type: "reply",
        dataType: "integer",
        description: "Max idle time (seconds)",
      },
      {
        name: "Acct-Interim-Interval",
        type: "reply",
        dataType: "integer",
        description: "Interim accounting interval (seconds)",
      },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// GET /api/nas-clients/vendors — Return vendor templates
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);

    const sp = request.nextUrl.searchParams;
    const vendorId = sp.get("vendor");

    if (vendorId) {
      const vendor = VENDOR_TEMPLATES.find((v) => v.id === vendorId);
      if (!vendor) {
        return NextResponse.json(
          {
            success: false,
            error: `Vendor '${vendorId}' not found. Available: ${VENDOR_TEMPLATES.map((v) => v.id).join(", ")}`,
          },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        data: vendor,
      });
    }

    // Return summary list (without full attributes) for lightweight listing
    const summary = VENDOR_TEMPLATES.map((v) => ({
      id: v.id,
      name: v.name,
      type: v.type,
      description: v.description,
      authProtocols: v.authProtocols,
      defaultPorts: v.defaultPorts,
      coaSupport: v.coaSupport,
      attributeCount: v.attributes.length,
    }));

    return NextResponse.json({
      success: true,
      data: {
        vendors: summary,
        total: summary.length,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("[nas-clients/vendors] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list vendor templates" },
      { status: 500 }
    );
  }
}
