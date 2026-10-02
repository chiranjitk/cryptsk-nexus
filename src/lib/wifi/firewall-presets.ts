/**
 * Firewall Preset Rule Templates
 *
 * Hardcoded preset rule templates — no DB involved.
 * Each preset contains an array of rule templates that can be applied
 * to a property via POST /api/wifi/firewall/presets/[id]/apply.
 *
 * Imported by:
 *   - src/app/api/wifi/firewall/presets/route.ts (GET list)
 *   - src/app/api/wifi/firewall/presets/[id]/apply/route.ts (POST apply)
 */
export const FIREWALL_PRESETS = [
  {
    id: 'block-social',
    name: 'Block Social Media',
    category: 'security',
    description: 'Blocks Facebook, Instagram, Twitter, TikTok, YouTube',
    rules: [
      { chain: 'firewallchains', protocol: 'tcp', destPort: 443, destIp: '1.1.1.1/32', action: 'drop', comment: 'Block social media domains via DNS sinkhole' },
      { chain: 'firewallchainsdn', protocol: 'tcp', destPort: 443, destIp: '1.1.1.1/32', action: 'drop', comment: 'Block social media inbound via DNS sinkhole' },
    ],
  },
  {
    id: 'allow-management',
    name: 'Allow Hotel Management',
    category: 'networking',
    description: 'Allows access to hotel management systems',
    rules: [
      { chain: 'firewallchains', protocol: 'tcp', destIp: '10.0.0.0/8', destPort: 443, action: 'accept', comment: 'Allow access to hotel management systems' },
      { chain: 'firewallchains', protocol: 'tcp', destIp: '10.0.0.0/8', destPort: 80, action: 'accept', comment: 'Allow HTTP access to management systems' },
    ],
  },
  {
    id: 'guest-isolation',
    name: 'Guest Isolation',
    category: 'security',
    description: 'Complete guest network isolation',
    rules: [
      { chain: 'firewallchains', protocol: 'tcp', sourceIp: '0.0.0.0/0', destIp: '10.0.0.0/8', action: 'drop', comment: 'Drop guest access to internal networks' },
      { chain: 'firewallchains', protocol: 'udp', sourceIp: '0.0.0.0/0', destIp: '10.0.0.0/8', action: 'drop', comment: 'Drop guest UDP to internal networks' },
      { chain: 'firewallchainsdn', protocol: 'tcp', destIp: '10.0.0.0/8', action: 'drop', comment: 'Drop inbound from internal to guest' },
    ],
  },
  {
    id: 'iot-lockdown',
    name: 'IoT Lockdown',
    category: 'security',
    description: 'Restricts IoT devices to required services only',
    rules: [
      { chain: 'firewallchains', protocol: 'tcp', destIp: '0.0.0.0/0', destPort: 443, action: 'accept', comment: 'Allow IoT HTTPS outbound' },
      { chain: 'firewallchains', protocol: 'tcp', destIp: '0.0.0.0/0', destPort: 80, action: 'drop', comment: 'Block IoT HTTP (force HTTPS)' },
      { chain: 'firewallchains', protocol: 'tcp', destIp: '0.0.0.0/0', destPort: 22, action: 'drop', comment: 'Block IoT SSH access' },
      { chain: 'firewallchains', protocol: 'udp', destIp: '0.0.0.0/0', destPort: 53, action: 'accept', comment: 'Allow IoT DNS queries' },
    ],
  },
  {
    id: 'remote-access',
    name: 'Remote Access',
    category: 'remote-access',
    description: 'Allow VPN and remote desktop access',
    rules: [
      { chain: 'firewallchains', protocol: 'udp', destPort: 1194, action: 'accept', comment: 'Allow OpenVPN' },
      { chain: 'firewallchains', protocol: 'udp', destPort: 500, action: 'accept', comment: 'Allow IPSec IKE' },
      { chain: 'firewallchains', protocol: 'udp', destPort: 4500, action: 'accept', comment: 'Allow IPSec NAT-T' },
      { chain: 'firewallchains', protocol: 'tcp', destPort: 3389, action: 'accept', comment: 'Allow RDP' },
      { chain: 'firewallchainsdn', protocol: 'tcp', sourceIp: '0.0.0.0/0', destPort: 443, action: 'accept', comment: 'Allow WireGuard/WebVPN inbound' },
    ],
  },
  {
    id: 'content-filter-adult',
    name: 'Content Filter - Adult',
    category: 'content-filter',
    description: 'Block adult content categories',
    rules: [
      { chain: 'firewallchains', protocol: 'tcp', destPort: 443, action: 'drop', comment: 'Block adult content (DNS-level filtering recommended)' },
      { chain: 'firewallchains', protocol: 'tcp', destPort: 80, action: 'drop', comment: 'Block adult content HTTP' },
      { chain: 'firewallchainsdn', protocol: 'tcp', destPort: 443, action: 'drop', comment: 'Block adult content inbound' },
    ],
  },
  {
    id: 'voip-priority',
    name: 'VoIP Priority',
    category: 'networking',
    description: 'Prioritize VoIP traffic',
    rules: [
      { chain: 'firewallchains', protocol: 'udp', destPort: 5060, action: 'accept', comment: 'Allow SIP signaling' },
      { chain: 'firewallchains', protocol: 'udp', destPort: 5061, action: 'accept', comment: 'Allow SIP-TLS signaling' },
      { chain: 'firewallchains', protocol: 'udp', destPort: 10000, action: 'accept', comment: 'Allow RTP media' },
      { chain: 'firewallchains_conn', protocol: 'udp', destPort: 5060, action: 'accept', comment: 'Mark VoIP connections for priority queue' },
    ],
  },
] as const;
