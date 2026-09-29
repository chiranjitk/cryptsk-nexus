/**
 * nDPI Application Awareness Mini-Service
 * 
 * Simulates nDPI daemon data (mock data since we can't run the actual C daemon in sandbox).
 * API structure matches the real nDPI daemon JSON API.
 * 
 * Port: 3031
 * Database: SQLite via Prisma (for QoS rules CRUD)
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";

// ─── Configuration ───────────────────────────────────────────
const PORT = 3031;
const startTime = Date.now();

const db = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || "postgresql://cryptsk:Cryptsk2026@localhost:5432/ispplatform",
    },
  },
});

// ─── nDPI Application Catalog ────────────────────────────────
// Complete list of nDPI detected applications with IDs matching real nDPI protocol numbers

interface NdpiApp {
  ndpiId: number;
  name: string;
  category: string;
  risk: string;
  icon: string;
  color: string;
  description: string;
}

const NDPI_APPS: NdpiApp[] = [
  // ═══════════════════════════════════════════════════════════
  // Media / Streaming
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 124, name: "YouTube", category: "Media", risk: "LOW", icon: "Youtube", color: "#FF0000", description: "Google's video sharing platform" },
  { ndpiId: 133, name: "Netflix", category: "Media", risk: "LOW", icon: "Tv", color: "#E50914", description: "Streaming video subscription service" },
  { ndpiId: 157, name: "Hulu", category: "Media", risk: "LOW", icon: "Tv", color: "#1CE783", description: "American streaming service" },
  { ndpiId: 158, name: "Vimeo", category: "Media", risk: "LOW", icon: "Video", color: "#1AB7EA", description: "Ad-free video hosting platform" },
  { ndpiId: 159, name: "Dailymotion", category: "Media", risk: "LOW", icon: "Play", color: "#0066DC", description: "Video sharing platform" },
  { ndpiId: 178, name: "Amazon Prime Video", category: "Media", risk: "LOW", icon: "Film", color: "#00A8E1", description: "Amazon streaming video service" },
  { ndpiId: 201, name: "Twitch", category: "Media", risk: "LOW", icon: "Radio", color: "#9146FF", description: "Live streaming platform for gamers" },
  { ndpiId: 200, name: "Disney+", category: "Media", risk: "LOW", icon: "Sparkles", color: "#113CCF", description: "Disney streaming service" },
  { ndpiId: 49, name: "TikTok", category: "Media", risk: "LOW", icon: "Clapperboard", color: "#000000", description: "Short-form video platform by ByteDance" },
  { ndpiId: 211, name: "Instagram Reels", category: "Media", risk: "LOW", icon: "Film", color: "#E4405F", description: "Instagram short video feature" },
  { ndpiId: 160, name: "HBO Max", category: "Media", risk: "LOW", icon: "Crown", color: "#B833FF", description: "Warner Bros streaming service" },
  { ndpiId: 161, name: "Peacock", category: "Media", risk: "LOW", icon: "Bird", color: "#000000", description: "NBCUniversal streaming service" },
  { ndpiId: 162, name: "Paramount+", category: "Media", risk: "LOW", icon: "Star", color: "#0064FF", description: "ViacomCBS streaming service" },
  { ndpiId: 163, name: "Apple TV+", category: "Media", risk: "LOW", icon: "Apple", color: "#000000", description: "Apple original content streaming" },
  { ndpiId: 164, name: "Crunchyroll", category: "Media", risk: "LOW", icon: "PlayCircle", color: "#F47521", description: "Anime streaming platform" },
  { ndpiId: 165, name: "BBC iPlayer", category: "Media", risk: "LOW", icon: "Tv", color: "#000000", description: "BBC streaming service" },
  { ndpiId: 166, name: "Sling TV", category: "Media", risk: "LOW", icon: "Monitor", color: "#009EDE", description: "Live TV streaming service" },
  { ndpiId: 167, name: "YouTube TV", category: "Media", risk: "LOW", icon: "Youtube", color: "#FF0000", description: "YouTube live TV service" },

  // ═══════════════════════════════════════════════════════════
  // Streaming Audio
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 156, name: "Spotify", category: "Streaming Audio", risk: "LOW", icon: "Music", color: "#1DB954", description: "Music streaming platform" },
  { ndpiId: 500, name: "Apple Music", category: "Streaming Audio", risk: "LOW", icon: "Music2", color: "#FC3C44", description: "Apple music streaming service" },
  { ndpiId: 213, name: "SoundCloud", category: "Streaming Audio", risk: "LOW", icon: "Volume2", color: "#FF5500", description: "Audio sharing platform" },
  { ndpiId: 214, name: "Pandora", category: "Streaming Audio", risk: "LOW", icon: "Radio", color: "#224099", description: "Internet radio and music streaming" },
  { ndpiId: 233, name: "Deezer", category: "Streaming Audio", risk: "LOW", icon: "Music", color: "#A238FF", description: "French music streaming service" },
  { ndpiId: 501, name: "Amazon Music", category: "Streaming Audio", risk: "LOW", icon: "Headphones", color: "#25D1DA", description: "Amazon music streaming" },
  { ndpiId: 502, name: "YouTube Music", category: "Streaming Audio", risk: "LOW", icon: "Music", color: "#FF0000", description: "YouTube music streaming service" },
  { ndpiId: 503, name: "Tidal", category: "Streaming Audio", risk: "LOW", icon: "Waves", color: "#000000", description: "High-fidelity music streaming" },
  { ndpiId: 504, name: "iHeartRadio", category: "Streaming Audio", risk: "LOW", icon: "Radio", color: "#C6002B", description: "Internet radio platform" },
  { ndpiId: 505, name: "Audible", category: "Streaming Audio", risk: "LOW", icon: "BookOpen", color: "#FF8900", description: "Audiobooks and podcasts" },

  // ═══════════════════════════════════════════════════════════
  // Social Media
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 119, name: "Facebook", category: "Social Media", risk: "MEDIUM", icon: "Users", color: "#1877F2", description: "Meta social networking platform" },
  { ndpiId: 211, name: "Instagram", category: "Social Media", risk: "LOW", icon: "Camera", color: "#E4405F", description: "Photo and video sharing by Meta" },
  { ndpiId: 120, name: "Twitter", category: "Social Media", risk: "MEDIUM", icon: "AtSign", color: "#1DA1F2", description: "Microblogging platform (now X)" },
  { ndpiId: 205, name: "Reddit", category: "Social Media", risk: "LOW", icon: "MessageSquare", color: "#FF4500", description: "Social news aggregation and discussion" },
  { ndpiId: 506, name: "LinkedIn", category: "Social Media", risk: "LOW", icon: "Briefcase", color: "#0A66C2", description: "Professional networking platform" },
  { ndpiId: 183, name: "Pinterest", category: "Social Media", risk: "LOW", icon: "Pin", color: "#E60023", description: "Image discovery and bookmarking" },
  { ndpiId: 199, name: "Snapchat", category: "Social Media", risk: "LOW", icon: "Ghost", color: "#FFFC00", description: "Multimedia messaging with disappearing content" },
  { ndpiId: 507, name: "Tumblr", category: "Social Media", risk: "LOW", icon: "PenTool", color: "#36465D", description: "Microblogging and social networking" },
  { ndpiId: 49, name: "TikTok Social", category: "Social Media", risk: "LOW", icon: "Clapperboard", color: "#000000", description: "TikTok social features" },
  { ndpiId: 508, name: "WeChat", category: "Social Media", risk: "MEDIUM", icon: "MessageCircle", color: "#07C160", description: "Chinese multi-purpose messaging and social" },
  { ndpiId: 509, name: "Weibo", category: "Social Media", risk: "MEDIUM", icon: "AtSign", color: "#E6162D", description: "Chinese microblogging platform" },
  { ndpiId: 510, name: "VK", category: "Social Media", risk: "LOW", icon: "Users", color: "#4680C2", description: "Russian social network" },
  { ndpiId: 511, name: "Mastodon", category: "Social Media", risk: "LOW", icon: "MessageCircle", color: "#6364FF", description: "Decentralized social network" },
  { ndpiId: 512, name: "Threads", category: "Social Media", risk: "LOW", icon: "AtSign", color: "#000000", description: "Meta text-based social platform" },
  { ndpiId: 513, name: "X (Twitter)", category: "Social Media", risk: "MEDIUM", icon: "AtSign", color: "#000000", description: "X platform (formerly Twitter)" },

  // ═══════════════════════════════════════════════════════════
  // Messaging / Communication
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 142, name: "WhatsApp", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#25D366", description: "End-to-end encrypted messaging by Meta" },
  { ndpiId: 185, name: "Telegram", category: "Messaging", risk: "LOW", icon: "Send", color: "#0088CC", description: "Cloud-based encrypted messaging" },
  { ndpiId: 58, name: "Discord", category: "Messaging", risk: "LOW", icon: "Headphones", color: "#5865F2", description: "Voice, video and text chat for communities" },
  { ndpiId: 189, name: "Zoom", category: "Messaging", risk: "LOW", icon: "Video", color: "#2D8CFF", description: "Video conferencing and online meetings" },
  { ndpiId: 202, name: "Skype", category: "Messaging", risk: "LOW", icon: "Phone", color: "#00AFF0", description: "Microsoft voice and video calls" },
  { ndpiId: 514, name: "Signal", category: "Messaging", risk: "LOW", icon: "Shield", color: "#3A76F0", description: "End-to-end encrypted messaging" },
  { ndpiId: 515, name: "Viber", category: "Messaging", risk: "LOW", icon: "Phone", color: "#7360F2", description: "VoIP and messaging app" },
  { ndpiId: 203, name: "Microsoft Teams", category: "Messaging", risk: "LOW", icon: "Users", color: "#6264A7", description: "Microsoft collaboration platform" },
  { ndpiId: 204, name: "Slack", category: "Messaging", risk: "LOW", icon: "Hash", color: "#4A154B", description: "Business messaging by Salesforce" },
  { ndpiId: 516, name: "Google Hangouts", category: "Messaging", risk: "LOW", icon: "MessageSquare", color: "#0F9D58", description: "Google messaging platform" },
  { ndpiId: 517, name: "FaceTime", category: "Messaging", risk: "LOW", icon: "Video", color: "#32D74B", description: "Apple video calling service" },
  { ndpiId: 122, name: "Gmail", category: "Messaging", risk: "MEDIUM", icon: "Mail", color: "#EA4335", description: "Google email service" },
  { ndpiId: 518, name: "WeChat Work", category: "Messaging", risk: "LOW", icon: "Briefcase", color: "#2BAD13", description: "Enterprise WeChat (WeCom)" },
  { ndpiId: 519, name: "Line", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#00C300", description: "Japanese messaging app" },
  { ndpiId: 520, name: "KakaoTalk", category: "Messaging", risk: "LOW", icon: "MessageSquare", color: "#FEE500", description: "South Korean messaging app" },

  // ═══════════════════════════════════════════════════════════
  // VoIP
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 95, name: "SIP", category: "VoIP", risk: "LOW", icon: "Phone", color: "#4A90D9", description: "Session Initiation Protocol" },
  { ndpiId: 96, name: "RTP", category: "VoIP", risk: "LOW", icon: "AudioLines", color: "#2ECC71", description: "Real-time Transport Protocol" },
  { ndpiId: 97, name: "WebRTC", category: "VoIP", risk: "LOW", icon: "Video", color: "#FF6B35", description: "Web Real-Time Communication" },
  { ndpiId: 521, name: "Cisco Jabber", category: "VoIP", risk: "LOW", icon: "Phone", color: "#00BCEB", description: "Cisco unified communications client" },
  { ndpiId: 522, name: "Zoom Phone", category: "VoIP", risk: "LOW", icon: "PhoneCall", color: "#2D8CFF", description: "Zoom cloud phone system" },
  { ndpiId: 523, name: "Google Voice", category: "VoIP", risk: "LOW", icon: "Phone", color: "#4285F4", description: "Google VoIP telephone service" },
  { ndpiId: 202, name: "Skype VoIP", category: "VoIP", risk: "LOW", icon: "Phone", color: "#00AFF0", description: "Skype voice over IP calls" },

  // ═══════════════════════════════════════════════════════════
  // P2P / File Sharing
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 37, name: "BitTorrent", category: "P2P", risk: "HIGH", icon: "Download", color: "#4A90D9", description: "Peer-to-peer file sharing protocol" },
  { ndpiId: 39, name: "eMule", category: "P2P", risk: "HIGH", icon: "Download", color: "#7B2D8E", description: "eDonkey network file sharing client" },
  { ndpiId: 40, name: "uTorrent", category: "P2P", risk: "HIGH", icon: "Download", color: "#539648", description: "Popular BitTorrent client" },
  { ndpiId: 121, name: "Dropbox", category: "P2P", risk: "LOW", icon: "Folder", color: "#0061FF", description: "Cloud file storage and sharing" },
  { ndpiId: 207, name: "Google Drive", category: "P2P", risk: "LOW", icon: "HardDrive", color: "#4285F4", description: "Google cloud storage and file sync" },
  { ndpiId: 208, name: "OneDrive", category: "P2P", risk: "LOW", icon: "Cloud", color: "#0078D4", description: "Microsoft cloud storage service" },
  { ndpiId: 524, name: "Mega", category: "P2P", risk: "MEDIUM", icon: "Cloud", color: "#D9272E", description: "Encrypted cloud storage" },
  { ndpiId: 525, name: "FileZilla", category: "P2P", risk: "LOW", icon: "Upload", color: "#BF0000", description: "FTP/FTPS/SFTP file transfer client" },
  { ndpiId: 526, name: "SFTP", category: "P2P", risk: "LOW", icon: "FolderLock", color: "#FF6600", description: "SSH File Transfer Protocol" },
  { ndpiId: 527, name: "NFS", category: "P2P", risk: "LOW", icon: "Server", color: "#333333", description: "Network File System" },
  { ndpiId: 528, name: "SMB/CIFS", category: "P2P", risk: "MEDIUM", icon: "Folder", color: "#0078D4", description: "Server Message Block file sharing" },
  { ndpiId: 529, name: "Ares", category: "P2P", risk: "HIGH", icon: "Download", color: "#FF6600", description: "P2P file sharing network" },
  { ndpiId: 530, name: "Gnutella", category: "P2P", risk: "HIGH", icon: "Share2", color: "#669933", description: "Gnutella P2P file sharing protocol" },

  // ═══════════════════════════════════════════════════════════
  // Gaming
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 74, name: "Steam", category: "Gaming", risk: "LOW", icon: "Gamepad2", color: "#1B2838", description: "Valve's game distribution platform" },
  { ndpiId: 531, name: "Epic Games", category: "Gaming", risk: "LOW", icon: "Gamepad", color: "#2A2A2A", description: "Epic Games Store and Fortnite" },
  { ndpiId: 532, name: "PlayStation Network", category: "Gaming", risk: "LOW", icon: "Gamepad", color: "#003087", description: "Sony PlayStation Network services" },
  { ndpiId: 222, name: "Xbox Live", category: "Gaming", risk: "LOW", icon: "Gamepad2", color: "#107C10", description: "Microsoft Xbox online gaming" },
  { ndpiId: 533, name: "Battle.net", category: "Gaming", risk: "LOW", icon: "Swords", color: "#009AE4", description: "Blizzard gaming platform" },
  { ndpiId: 534, name: "Roblox", category: "Gaming", risk: "LOW", icon: "Blocks", color: "#E2231A", description: "Online gaming and creation platform" },
  { ndpiId: 535, name: "Minecraft", category: "Gaming", risk: "LOW", icon: "Pickaxe", color: "#62B545", description: "Sandbox game by Mojang" },
  { ndpiId: 536, name: "PUBG", category: "Gaming", risk: "LOW", icon: "Crosshair", color: "#F7B731", description: "PlayerUnknown's Battlegrounds" },
  { ndpiId: 537, name: "Valorant", category: "Gaming", risk: "LOW", icon: "Target", color: "#FF4655", description: "Riot Games tactical shooter" },
  { ndpiId: 538, name: "League of Legends", category: "Gaming", risk: "LOW", icon: "Shield", color: "#C89B3C", description: "Riot Games MOBA" },
  { ndpiId: 539, name: "DOTA 2", category: "Gaming", risk: "LOW", icon: "Swords", color: "#BE0E2D", description: "Valve MOBA game" },
  { ndpiId: 540, name: "Fortnite", category: "Gaming", risk: "LOW", icon: "Target", color: "#0099FF", description: "Epic Games battle royale" },
  { ndpiId: 541, name: "Origin", category: "Gaming", risk: "LOW", icon: "Gamepad", color: "#F56C2D", description: "EA game distribution platform" },
  { ndpiId: 542, name: "GOG", category: "Gaming", risk: "LOW", icon: "Gamepad2", color: "#86328A", description: "Good Old Games digital store" },
  { ndpiId: 543, name: "Nintendo Switch", category: "Gaming", risk: "LOW", icon: "Gamepad", color: "#E4000F", description: "Nintendo online services" },

  // ═══════════════════════════════════════════════════════════
  // VPN / Proxy / Security
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 206, name: "OpenVPN", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#EC7424", description: "Open-source VPN tunneling protocol" },
  { ndpiId: 207, name: "WireGuard", category: "VPN", risk: "LOW", icon: "ShieldCheck", color: "#88171A", description: "Modern fast VPN tunnel" },
  { ndpiId: 163, name: "Tor", category: "Security", risk: "HIGH", icon: "EyeOff", color: "#7E4798", description: "Anonymous onion routing network" },
  { ndpiId: 544, name: "VPN Master", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#4CAF50", description: "Mobile VPN application" },
  { ndpiId: 545, name: "ExpressVPN", category: "VPN", risk: "MEDIUM", icon: "ShieldCheck", color: "#DA3940", description: "Commercial VPN service" },
  { ndpiId: 546, name: "NordVPN", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#4687FF", description: "Panama-based VPN provider" },
  { ndpiId: 547, name: "Cisco AnyConnect", category: "VPN", risk: "MEDIUM", icon: "ShieldCheck", color: "#049FD9", description: "Cisco enterprise VPN client" },
  { ndpiId: 548, name: "PPTP", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#0066CC", description: "Point-to-Point Tunneling Protocol" },
  { ndpiId: 549, name: "IPsec", category: "VPN", risk: "MEDIUM", icon: "ShieldCheck", color: "#333333", description: "Internet Protocol Security" },
  { ndpiId: 550, name: "Shadowsocks", category: "VPN", risk: "HIGH", icon: "EyeOff", color: "#AA0000", description: "Encrypted proxy for circumventing censorship" },
  { ndpiId: 551, name: "L2TP", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#0099CC", description: "Layer 2 Tunneling Protocol" },
  { ndpiId: 552, name: "Surfshark", category: "VPN", risk: "MEDIUM", icon: "ShieldCheck", color: "#2ECE7E", description: "VPN service provider" },
  { ndpiId: 553, name: "CyberGhost", category: "VPN", risk: "MEDIUM", icon: "Ghost", color: "#2B0542", description: "Romanian VPN provider" },
  { ndpiId: 554, name: "ProtonVPN", category: "VPN", risk: "LOW", icon: "Shield", color: "#6D4AFF", description: "Swiss VPN by Proton Technologies" },

  // ═══════════════════════════════════════════════════════════
  // Remote Access
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 88, name: "RDP", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#0078D7", description: "Remote Desktop Protocol by Microsoft" },
  { ndpiId: 555, name: "TeamViewer", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#0E8EE6", description: "Remote access and support software" },
  { ndpiId: 556, name: "AnyDesk", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#F26522", description: "Remote desktop software" },
  { ndpiId: 557, name: "VNC", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#FF6633", description: "Virtual Network Computing" },
  { ndpiId: 92, name: "SSH Remote", category: "Remote Access", risk: "LOW", icon: "Terminal", color: "#84CC16", description: "Secure Shell remote access" },
  { ndpiId: 90, name: "Telnet", category: "Remote Access", risk: "CRITICAL", icon: "Terminal", color: "#CC0000", description: "Unencrypted remote terminal protocol" },
  { ndpiId: 558, name: "Citrix", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#333333", description: "Citrix Virtual Apps and Desktops" },
  { ndpiId: 559, name: "LogMeIn", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#45B759", description: "Remote access and support" },
  { ndpiId: 560, name: "Splashtop", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#0057A8", description: "Remote desktop access" },
  { ndpiId: 561, name: "Parsec", category: "Remote Access", risk: "LOW", icon: "Gamepad2", color: "#0099FF", description: "Low-latency remote desktop for gaming" },

  // ═══════════════════════════════════════════════════════════
  // Remote Desktop (combined view)
  // ═══════════════════════════════════════════════════════════
  // RDP, VNC, TeamViewer, AnyDesk, Citrix already in Remote Access
  { ndpiId: 562, name: "Parallels Access", category: "Remote Desktop", risk: "MEDIUM", icon: "Monitor", color: "#ED1C24", description: "Parallels remote access app" },

  // ═══════════════════════════════════════════════════════════
  // Productivity
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 212, name: "Microsoft 365", category: "Productivity", risk: "LOW", icon: "FileText", color: "#D83B01", description: "Microsoft Office cloud suite" },
  { ndpiId: 214, name: "Google Workspace", category: "Productivity", risk: "LOW", icon: "Layout", color: "#4285F4", description: "Google Docs, Sheets, Slides cloud suite" },
  { ndpiId: 215, name: "Outlook", category: "Productivity", risk: "LOW", icon: "Mail", color: "#0078D4", description: "Microsoft email client" },
  { ndpiId: 563, name: "Thunderbird", category: "Productivity", risk: "LOW", icon: "Mail", color: "#0A84FF", description: "Mozilla email client" },
  { ndpiId: 564, name: "Google Docs", category: "Productivity", risk: "LOW", icon: "FileText", color: "#4285F4", description: "Online document editor" },
  { ndpiId: 565, name: "Trello", category: "Productivity", risk: "LOW", icon: "Columns3", color: "#0079BF", description: "Kanban-style project management" },
  { ndpiId: 566, name: "Jira", category: "Productivity", risk: "LOW", icon: "ClipboardList", color: "#0052CC", description: "Atlassian issue tracking" },
  { ndpiId: 567, name: "Confluence", category: "Productivity", risk: "LOW", icon: "BookOpen", color: "#0052CC", description: "Atlassian wiki/documentation" },
  { ndpiId: 568, name: "Asana", category: "Productivity", risk: "LOW", icon: "CheckSquare", color: "#F06A6A", description: "Work management platform" },
  { ndpiId: 569, name: "Notion", category: "Productivity", risk: "LOW", icon: "NotebookPen", color: "#000000", description: "All-in-one workspace" },
  { ndpiId: 570, name: "Salesforce", category: "Productivity", risk: "LOW", icon: "Cloud", color: "#00A1E0", description: "CRM cloud platform" },
  { ndpiId: 571, name: "SAP", category: "Productivity", risk: "LOW", icon: "Database", color: "#0FAAFF", description: "Enterprise resource planning" },
  { ndpiId: 572, name: "Monday.com", category: "Productivity", risk: "LOW", icon: "LayoutGrid", color: "#FF3D57", description: "Work operating system" },
  { ndpiId: 573, name: "ClickUp", category: "Productivity", risk: "LOW", icon: "Target", color: "#7B68EE", description: "All-in-one productivity tool" },
  { ndpiId: 574, name: "Zoom Workplace", category: "Productivity", risk: "LOW", icon: "Video", color: "#2D8CFF", description: "Zoom unified communications" },
  { ndpiId: 575, name: "Webex", category: "Productivity", risk: "LOW", icon: "Video", color: "#07C160", description: "Cisco Webex Meetings" },

  // ═══════════════════════════════════════════════════════════
  // Development
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 225, name: "Git", category: "Development", risk: "LOW", icon: "GitBranch", color: "#F05032", description: "Distributed version control system" },
  { ndpiId: 226, name: "GitHub", category: "Development", risk: "LOW", icon: "Github", color: "#24292E", description: "GitHub code hosting platform" },
  { ndpiId: 227, name: "GitLab", category: "Development", risk: "LOW", icon: "GitBranch", color: "#FC6D26", description: "DevOps lifecycle platform" },
  { ndpiId: 228, name: "Docker", category: "Development", risk: "LOW", icon: "Container", color: "#2496ED", description: "Container runtime platform" },
  { ndpiId: 229, name: "Kubernetes", category: "Development", risk: "LOW", icon: "Network", color: "#326CE5", description: "Container orchestration platform" },
  { ndpiId: 230, name: "Jenkins", category: "Development", risk: "LOW", icon: "Settings", color: "#D24939", description: "CI/CD automation server" },
  { ndpiId: 231, name: "npm", category: "Development", risk: "LOW", icon: "Package", color: "#CB3837", description: "Node.js package registry" },
  { ndpiId: 232, name: "Maven", category: "Development", risk: "LOW", icon: "Package", color: "#C71A36", description: "Java build automation tool" },
  { ndpiId: 576, name: "Bitbucket", category: "Development", risk: "LOW", icon: "GitBranch", color: "#0052CC", description: "Atlassian Git code hosting" },
  { ndpiId: 577, name: "VS Code Server", category: "Development", risk: "LOW", icon: "Code", color: "#007ACC", description: "Visual Studio Code remote server" },
  { ndpiId: 578, name: "PyPI", category: "Development", risk: "LOW", icon: "Package", color: "#3775A9", description: "Python Package Index" },
  { ndpiId: 579, name: "Terraform", category: "Development", risk: "LOW", icon: "Blocks", color: "#7B42BC", description: "Infrastructure as Code tool" },
  { ndpiId: 580, name: "Ansible", category: "Development", risk: "LOW", icon: "Terminal", color: "#EE0000", description: "Configuration management tool" },
  { ndpiId: 581, name: "Vagrant", category: "Development", risk: "LOW", icon: "Box", color: "#1868F2", description: "Development environment manager" },
  { ndpiId: 582, name: "Gradle", category: "Development", risk: "LOW", icon: "Package", color: "#02303A", description: "Build automation for JVM projects" },

  // ═══════════════════════════════════════════════════════════
  // Cloud Services
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 583, name: "AWS", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#FF9900", description: "Amazon Web Services" },
  { ndpiId: 584, name: "Azure", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#0078D4", description: "Microsoft Azure Cloud" },
  { ndpiId: 585, name: "Google Cloud", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#4285F4", description: "Google Cloud Platform" },
  { ndpiId: 586, name: "DigitalOcean", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#0080FF", description: "Cloud infrastructure provider" },
  { ndpiId: 587, name: "Heroku", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#430098", description: "Platform as a Service" },
  { ndpiId: 588, name: "Cloudflare", category: "Cloud Services", risk: "LOW", icon: "Shield", color: "#F38020", description: "CDN and security platform" },
  { ndpiId: 589, name: "Akamai", category: "Cloud Services", risk: "LOW", icon: "Globe", color: "#009BDE", description: "CDN and cloud services" },
  { ndpiId: 590, name: "Fastly", category: "Cloud Services", risk: "LOW", icon: "Zap", color: "#FF282D", description: "Edge cloud platform" },
  { ndpiId: 591, name: "Oracle Cloud", category: "Cloud Services", risk: "LOW", icon: "Database", color: "#F80000", description: "Oracle Cloud Infrastructure" },
  { ndpiId: 592, name: "IBM Cloud", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#054ADA", description: "IBM Cloud platform" },
  { ndpiId: 593, name: "Alibaba Cloud", category: "Cloud Services", risk: "MEDIUM", icon: "Cloud", color: "#FF6A00", description: "Alibaba cloud services" },
  { ndpiId: 594, name: "Vultr", category: "Cloud Services", risk: "LOW", icon: "Server", color: "#007BFC", description: "Cloud compute provider" },
  { ndpiId: 595, name: "Linode", category: "Cloud Services", risk: "LOW", icon: "Server", color: "#00A95C", description: "Cloud hosting by Akamai" },

  // ═══════════════════════════════════════════════════════════
  // IoT / Sensors
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 100, name: "MQTT", category: "IoT", risk: "LOW", icon: "Radio", color: "#660066", description: "Message Queuing Telemetry Transport" },
  { ndpiId: 101, name: "CoAP", category: "IoT", risk: "LOW", icon: "Radio", color: "#4080D0", description: "Constrained Application Protocol" },
  { ndpiId: 102, name: "Modbus", category: "IoT", risk: "LOW", icon: "Cpu", color: "#009FDA", description: "Industrial communication protocol" },
  { ndpiId: 103, name: "BACnet", category: "IoT", risk: "LOW", icon: "Building", color: "#005B9E", description: "Building automation protocol" },
  { ndpiId: 104, name: "Zigbee", category: "IoT", risk: "LOW", icon: "Wifi", color: "#E4002B", description: "Low-power wireless mesh protocol" },
  { ndpiId: 105, name: "Z-Wave", category: "IoT", risk: "LOW", icon: "Wifi", color: "#005BA8", description: "Wireless home automation protocol" },
  { ndpiId: 596, name: "HomeKit", category: "IoT", risk: "LOW", icon: "Home", color: "#007AFF", description: "Apple smart home framework" },
  { ndpiId: 597, name: "Google Home", category: "IoT", risk: "LOW", icon: "Home", color: "#4285F4", description: "Google smart home platform" },
  { ndpiId: 598, name: "Amazon Alexa", category: "IoT", risk: "LOW", icon: "Mic", color: "#00CAFF", description: "Amazon voice assistant service" },
  { ndpiId: 599, name: "Samsung SmartThings", category: "IoT", risk: "LOW", icon: "Home", color: "#05A8F0", description: "Samsung IoT platform" },
  { ndpiId: 600, name: "OPC UA", category: "IoT", risk: "LOW", icon: "Cpu", color: "#1287B1", description: "Industrial data communication standard" },
  { ndpiId: 601, name: "LoRaWAN", category: "IoT", risk: "LOW", icon: "Radio", color: "#00AA00", description: "Long-range IoT network protocol" },

  // ═══════════════════════════════════════════════════════════
  // Ad Networks
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 106, name: "Google Ads", category: "Ad Networks", risk: "MEDIUM", icon: "Megaphone", color: "#4285F4", description: "Google advertising platform" },
  { ndpiId: 107, name: "Facebook Ads", category: "Ad Networks", risk: "MEDIUM", icon: "Megaphone", color: "#1877F2", description: "Meta advertising platform" },
  { ndpiId: 108, name: "Taboola", category: "Ad Networks", risk: "MEDIUM", icon: "Layout", color: "#0052CC", description: "Content discovery and ad network" },
  { ndpiId: 109, name: "Outbrain", category: "Ad Networks", risk: "MEDIUM", icon: "Layout", color: "#F76B1C", description: "Content recommendation platform" },
  { ndpiId: 110, name: "Google Analytics", category: "Ad Networks", risk: "LOW", icon: "BarChart3", color: "#E37400", description: "Google web analytics service" },
  { ndpiId: 602, name: "Amazon Ads", category: "Ad Networks", risk: "MEDIUM", icon: "Megaphone", color: "#FF9900", description: "Amazon advertising platform" },
  { ndpiId: 603, name: "Microsoft Ads", category: "Ad Networks", risk: "MEDIUM", icon: "Megaphone", color: "#00BCF2", description: "Microsoft advertising platform" },
  { ndpiId: 604, name: "DoubleClick", category: "Ad Networks", risk: "MEDIUM", icon: "Layout", color: "#4285F4", description: "Google ad serving platform" },
  { ndpiId: 605, name: "MediaVine", category: "Ad Networks", risk: "LOW", icon: "Layout", color: "#5A3DAA", description: "Premium ad management" },
  { ndpiId: 606, name: "Criteo", category: "Ad Networks", risk: "MEDIUM", icon: "BarChart3", color: "#1A3C6B", description: "Personalized retargeting" },

  // ═══════════════════════════════════════════════════════════
  // Malware / Botnet
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 111, name: "Botnet C&C", category: "Malware", risk: "CRITICAL", icon: "Bug", color: "#FF0000", description: "Botnet command and control traffic" },
  { ndpiId: 112, name: "Phishing", category: "Malware", risk: "CRITICAL", icon: "Fish", color: "#CC0000", description: "Phishing attack traffic" },
  { ndpiId: 113, name: "Spam", category: "Malware", risk: "HIGH", icon: "MailWarning", color: "#FF6600", description: "Spam email traffic detected" },
  { ndpiId: 114, name: "DGA", category: "Malware", risk: "CRITICAL", icon: "AlertTriangle", color: "#FF0000", description: "Domain Generation Algorithm detected" },
  { ndpiId: 115, name: "Cryptomining", category: "Malware", risk: "HIGH", icon: "Coins", color: "#FF9900", description: "Cryptocurrency mining traffic" },
  { ndpiId: 116, name: "C2", category: "Malware", risk: "CRITICAL", icon: "Skull", color: "#FF0000", description: "Command and control communication" },
  { ndpiId: 607, name: "Ransomware", category: "Malware", risk: "CRITICAL", icon: "Lock", color: "#CC0000", description: "Ransomware communication detected" },
  { ndpiId: 608, name: "Trojan", category: "Malware", risk: "CRITICAL", icon: "Bug", color: "#990000", description: "Trojan horse communication" },
  { ndpiId: 609, name: "Worm", category: "Malware", risk: "CRITICAL", icon: "Bug", color: "#880000", description: "Self-replicating malware detected" },
  { ndpiId: 610, name: "Spyware", category: "Malware", risk: "CRITICAL", icon: "Eye", color: "#660099", description: "Spyware data exfiltration" },

  // ═══════════════════════════════════════════════════════════
  // System / Network Protocols
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 5, name: "DNS", category: "System", risk: "LOW", icon: "Globe", color: "#6366F1", description: "Domain Name System" },
  { ndpiId: 7, name: "HTTP", category: "System", risk: "LOW", icon: "Globe", color: "#3B82F6", description: "Hypertext Transfer Protocol" },
  { ndpiId: 91, name: "HTTPS/TLS", category: "System", risk: "LOW", icon: "Lock", color: "#10B981", description: "Transport Layer Security (HTTPS)" },
  { ndpiId: 188, name: "QUIC", category: "System", risk: "LOW", icon: "Zap", color: "#F59E0B", description: "Google QUIC transport protocol (HTTP/3)" },
  { ndpiId: 92, name: "SSH", category: "System", risk: "LOW", icon: "Terminal", color: "#84CC16", description: "Secure Shell remote access" },
  { ndpiId: 3, name: "FTP", category: "System", risk: "MEDIUM", icon: "Upload", color: "#6366F1", description: "File Transfer Protocol" },
  { ndpiId: 14, name: "SMTP", category: "System", risk: "LOW", icon: "Mail", color: "#F97316", description: "Simple Mail Transfer Protocol" },
  { ndpiId: 15, name: "POP3", category: "System", risk: "LOW", icon: "Mail", color: "#A855F7", description: "Post Office Protocol v3" },
  { ndpiId: 16, name: "IMAP", category: "System", risk: "LOW", icon: "Mail", color: "#EC4899", description: "Internet Message Access Protocol" },
  { ndpiId: 229, name: "DHCP", category: "System", risk: "LOW", icon: "Server", color: "#8B5CF6", description: "Dynamic Host Configuration Protocol" },
  { ndpiId: 227, name: "NTP", category: "System", risk: "LOW", icon: "Clock", color: "#64748B", description: "Network Time Protocol" },
  { ndpiId: 228, name: "SNMP", category: "System", risk: "MEDIUM", icon: "Activity", color: "#0EA5E9", description: "Simple Network Management Protocol" },
  { ndpiId: 230, name: "ICMP", category: "System", risk: "LOW", icon: "Wifi", color: "#64748B", description: "Internet Control Message Protocol" },
  { ndpiId: 231, name: "SSDP", category: "System", risk: "LOW", icon: "Search", color: "#94A3B8", description: "Simple Service Discovery Protocol" },
  { ndpiId: 232, name: "mDNS", category: "System", risk: "LOW", icon: "Search", color: "#A78BFA", description: "Multicast DNS" },
  { ndpiId: 96, name: "RTP Sys", category: "System", risk: "LOW", icon: "AudioLines", color: "#2ECC71", description: "Real-time Transport Protocol" },
  { ndpiId: 98, name: "RTSP", category: "System", risk: "LOW", icon: "Video", color: "#1E88E5", description: "Real-Time Streaming Protocol" },
  { ndpiId: 95, name: "SIP Sys", category: "System", risk: "LOW", icon: "Phone", color: "#4A90D9", description: "Session Initiation Protocol" },
  { ndpiId: 99, name: "LDAP", category: "System", risk: "LOW", icon: "Directory", color: "#2563EB", description: "Lightweight Directory Access Protocol" },
  { ndpiId: 611, name: "STUN", category: "System", risk: "LOW", icon: "ArrowRightLeft", color: "#F59E0B", description: "Session Traversal Utilities for NAT" },
  { ndpiId: 612, name: "TURN", category: "System", risk: "LOW", icon: "RefreshCw", color: "#10B981", description: "Traversal Using Relays around NAT" },
  { ndpiId: 613, name: "IGMP", category: "System", risk: "LOW", icon: "Users", color: "#6B7280", description: "Internet Group Management Protocol" },
  { ndpiId: 614, name: "ARP", category: "System", risk: "LOW", icon: "Network", color: "#374151", description: "Address Resolution Protocol" },
  { ndpiId: 615, name: "Multicast DNS (mDNS)", category: "System", risk: "LOW", icon: "Search", color: "#A78BFA", description: "Link-local multicast name resolution" },
  { ndpiId: 616, name: "MDNS Responder", category: "System", risk: "LOW", icon: "Server", color: "#818CF8", description: "Bonjour/Avahi mDNS responder" },

  // ═══════════════════════════════════════════════════════════
  // Shopping
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 617, name: "eBay", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#E53238", description: "Online auction and shopping" },
  { ndpiId: 618, name: "Alibaba", category: "Shopping", risk: "MEDIUM", icon: "ShoppingCart", color: "#FF6A00", description: "B2B e-commerce platform" },
  { ndpiId: 619, name: "Amazon Shopping", category: "Shopping", risk: "LOW", icon: "ShoppingCart", color: "#FF9900", description: "Amazon online marketplace" },
  { ndpiId: 620, name: "Shopify", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#96BF48", description: "E-commerce platform" },
  { ndpiId: 621, name: "Etsy", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#F1641E", description: "Handmade goods marketplace" },
  { ndpiId: 622, name: "Walmart", category: "Shopping", risk: "LOW", icon: "ShoppingCart", color: "#0071DC", description: "Walmart online shopping" },
  { ndpiId: 623, name: "Flipkart", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#2874F0", description: "Indian e-commerce platform" },
  { ndpiId: 624, name: "Rakuten", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#BF0000", description: "Japanese e-commerce platform" },

  // ═══════════════════════════════════════════════════════════
  // System Updates / Services
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 625, name: "Apple Services", category: "System", risk: "LOW", icon: "Smartphone", color: "#555555", description: "Apple services (iCloud, App Store, etc.)" },
  { ndpiId: 626, name: "Windows Update", category: "System", risk: "LOW", icon: "RefreshCw", color: "#0078D4", description: "Microsoft Windows update service" },
  { ndpiId: 627, name: "Apple iCloud", category: "System", risk: "LOW", icon: "Cloud", color: "#A2AAAD", description: "Apple cloud storage and sync" },
  { ndpiId: 628, name: "Google Play", category: "System", risk: "LOW", icon: "Smartphone", color: "#34A853", description: "Google Play Store" },
  { ndpiId: 629, name: "Microsoft Store", category: "System", risk: "LOW", icon: "ShoppingBag", color: "#0078D4", description: "Microsoft application store" },
  { ndpiId: 630, name: "Canonical Ubuntu", category: "System", risk: "LOW", icon: "Download", color: "#E95420", description: "Ubuntu package updates" },

  // ═══════════════════════════════════════════════════════════
  // Email (additional)
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 631, name: "Yahoo Mail", category: "Messaging", risk: "LOW", icon: "Mail", color: "#6001D2", description: "Yahoo email service" },
  { ndpiId: 632, name: "ProtonMail", category: "Messaging", risk: "LOW", icon: "Shield", color: "#6D4AFF", description: "Encrypted email service" },
  { ndpiId: 633, name: "Zoho Mail", category: "Messaging", risk: "LOW", icon: "Mail", color: "#D4382C", description: "Zoho business email" },
  { ndpiId: 634, name: "Mailchimp", category: "Messaging", risk: "LOW", icon: "Mail", color: "#FFE01B", description: "Email marketing platform" },

  // ═══════════════════════════════════════════════════════════
  // Web / Browsers
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 635, name: "Google Chrome", category: "System", risk: "LOW", icon: "Globe", color: "#4285F4", description: "Chrome browser sync and services" },
  { ndpiId: 636, name: "Mozilla Firefox", category: "System", risk: "LOW", icon: "Globe", color: "#FF7139", description: "Firefox browser sync and services" },
  { ndpiId: 637, name: "Safari", category: "System", risk: "LOW", icon: "Globe", color: "#006CFF", description: "Apple Safari and iCloud sync" },
  { ndpiId: 638, name: "Edge", category: "System", risk: "LOW", icon: "Globe", color: "#0078D7", description: "Microsoft Edge browser sync" },
  { ndpiId: 639, name: "Opera", category: "System", risk: "LOW", icon: "Globe", color: "#FF1B2D", description: "Opera browser and VPN" },
  { ndpiId: 640, name: "Brave", category: "System", risk: "LOW", icon: "Shield", color: "#FB542B", description: "Brave browser sync" },

  // ═══════════════════════════════════════════════════════════
  // Education
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 641, name: "Google Classroom", category: "Education", risk: "LOW", icon: "GraduationCap", color: "#0F9D58", description: "Google classroom management" },
  { ndpiId: 642, name: "Coursera", category: "Education", risk: "LOW", icon: "BookOpen", color: "#0056D2", description: "Online learning platform" },
  { ndpiId: 643, name: "Udemy", category: "Education", risk: "LOW", icon: "BookOpen", color: "#A435F0", description: "Online course marketplace" },
  { ndpiId: 644, name: "Khan Academy", category: "Education", risk: "LOW", icon: "GraduationCap", color: "#14BF96", description: "Free online education platform" },
  { ndpiId: 645, name: "edX", category: "Education", risk: "LOW", icon: "BookOpen", color: "#02262B", description: "MOOC platform" },
  { ndpiId: 646, name: "Zoom Education", category: "Education", risk: "LOW", icon: "Video", color: "#2D8CFF", description: "Zoom for education" },

  // ═══════════════════════════════════════════════════════════
  // Finance / Banking
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 647, name: "PayPal", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#003087", description: "Online payment platform" },
  { ndpiId: 648, name: "Stripe", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#635BFF", description: "Online payment processing" },
  { ndpiId: 649, name: "Square", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#006AFF", description: "Payment processing platform" },
  { ndpiId: 650, name: "Venmo", category: "Finance", risk: "MEDIUM", icon: "Wallet", color: "#3D95CE", description: "Peer-to-peer payment service" },
  { ndpiId: 651, name: "Coinbase", category: "Finance", risk: "MEDIUM", icon: "Coins", color: "#0052FF", description: "Cryptocurrency exchange" },
  { ndpiId: 652, name: "Binance", category: "Finance", risk: "MEDIUM", icon: "Coins", color: "#F0B90B", description: "Cryptocurrency exchange" },
  { ndpiId: 653, name: "Google Pay", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#4285F4", description: "Google payment service" },
  { ndpiId: 654, name: "Apple Pay", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#000000", description: "Apple payment service" },

  // ═══════════════════════════════════════════════════════════
  // Maps / Navigation
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 655, name: "Google Maps", category: "Maps", risk: "LOW", icon: "Map", color: "#34A853", description: "Google Maps navigation" },
  { ndpiId: 656, name: "Waze", category: "Maps", risk: "LOW", icon: "Navigation", color: "#05C8F7", description: "Community-based navigation" },
  { ndpiId: 657, name: "Apple Maps", category: "Maps", risk: "LOW", icon: "Map", color: "#30D158", description: "Apple Maps navigation" },
  { ndpiId: 658, name: "OpenStreetMap", category: "Maps", risk: "LOW", icon: "Map", color: "#7EBC6F", description: "Collaborative mapping platform" },

  // ═══════════════════════════════════════════════════════════
  // DNS / CDN Services
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 659, name: "Cloudflare DNS", category: "System", risk: "LOW", icon: "Globe", color: "#F38020", description: "Cloudflare 1.1.1.1 DNS" },
  { ndpiId: 660, name: "Google DNS", category: "System", risk: "LOW", icon: "Globe", color: "#4285F4", description: "Google 8.8.8.8 DNS" },
  { ndpiId: 661, name: "OpenDNS", category: "System", risk: "LOW", icon: "Globe", color: "#F7941D", description: "Cisco OpenDNS service" },
  { ndpiId: 662, name: "Quad9 DNS", category: "System", risk: "LOW", icon: "Shield", color: "#00B272", description: "Quad9 security DNS" },

  // ═══════════════════════════════════════════════════════════
  // Adult / Content Filtering
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 663, name: "PornHub", category: "Adult", risk: "MEDIUM", icon: "EyeOff", color: "#F09199", description: "Adult content website" },
  { ndpiId: 664, name: "XVideos", category: "Adult", risk: "MEDIUM", icon: "EyeOff", color: "#E6A100", description: "Adult video platform" },
  { ndpiId: 665, name: "OnlyFans", category: "Adult", risk: "MEDIUM", icon: "EyeOff", color: "#00AFF0", description: "Subscription content platform" },

  // ═══════════════════════════════════════════════════════════
  // Streaming TV / IPTV
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 666, name: "IPTV", category: "Media", risk: "LOW", icon: "Tv", color: "#FF4444", description: "Internet Protocol Television" },
  { ndpiId: 667, name: "Pluto TV", category: "Media", risk: "LOW", icon: "Tv", color: "#006BFF", description: "Free ad-supported streaming TV" },
  { ndpiId: 668, name: "Tubi", category: "Media", risk: "LOW", icon: "Tv", color: "#FF0000", description: "Free ad-supported streaming" },
  { ndpiId: 669, name: "Crave", category: "Media", risk: "LOW", icon: "Film", color: "#9B1C31", description: "Canadian streaming service" },

  // ═══════════════════════════════════════════════════════════
  // Other / Miscellaneous
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 670, name: "Wikipedia", category: "Information", risk: "LOW", icon: "BookOpen", color: "#000000", description: "Free online encyclopedia" },
  { ndpiId: 671, name: "Stack Overflow", category: "Information", risk: "LOW", icon: "Code", color: "#F48024", description: "Developer Q&A platform" },
  { ndpiId: 672, name: "Reddit API", category: "Social Media", risk: "LOW", icon: "MessageSquare", color: "#FF4500", description: "Reddit API access" },
  { ndpiId: 673, name: "Medium", category: "Information", risk: "LOW", icon: "FileText", color: "#000000", description: "Online publishing platform" },
  { ndpiId: 674, name: "WordPress", category: "Information", risk: "LOW", icon: "PenTool", color: "#21759B", description: "WordPress CMS sites" },
  { ndpiId: 675, name: "Wix", category: "Information", risk: "LOW", icon: "Globe", color: "#0C6EFC", description: "Website builder platform" },
  { ndpiId: 676, name: "Substack", category: "Information", risk: "LOW", icon: "Mail", color: "#FF6719", description: "Newsletter publishing platform" },
  { ndpiId: 677, name: "Discord Bots", category: "Messaging", risk: "LOW", icon: "Bot", color: "#5865F2", description: "Discord bot API traffic" },
  { ndpiId: 678, name: "Slack API", category: "Messaging", risk: "LOW", icon: "Webhook", color: "#4A154B", description: "Slack app integration traffic" },
  { ndpiId: 679, name: "Spotify Ads", category: "Ad Networks", risk: "LOW", icon: "Music", color: "#1DB954", description: "Spotify advertising" },
  { ndpiId: 680, name: "WHOIS", category: "System", risk: "LOW", icon: "Search", color: "#8B5CF6", description: "WHOIS domain lookup protocol" },
  { ndpiId: 681, name: "Syslog", category: "System", risk: "LOW", icon: "FileText", color: "#64748B", description: "System logging protocol" },
  { ndpiId: 682, name: "NetFlow", category: "System", risk: "LOW", icon: "Activity", color: "#0EA5E9", description: "Cisco NetFlow export protocol" },
  { ndpiId: 683, name: "sFlow", category: "System", risk: "LOW", icon: "Activity", color: "#14B8A6", description: "sFlow network monitoring protocol" },
  { ndpiId: 684, name: "IPFIX", category: "System", risk: "LOW", icon: "Activity", color: "#8B5CF6", description: "IP Flow Information Export" },
  { ndpiId: 685, name: "mDNS Service", category: "System", risk: "LOW", icon: "Server", color: "#A78BFA", description: "Bonjour/mDNS service discovery" },
  { ndpiId: 686, name: "uPnP", category: "System", risk: "MEDIUM", icon: "Settings", color: "#F97316", description: "Universal Plug and Play" },
  { ndpiId: 687, name: "NAT-PMP", category: "System", risk: "LOW", icon: "ArrowRightLeft", color: "#22C55E", description: "NAT Port Mapping Protocol" },
  { ndpiId: 688, name: "PCP", category: "System", risk: "LOW", icon: "ArrowRightLeft", color: "#6366F1", description: "Port Control Protocol" },
  { ndpiId: 689, name: "Multicast", category: "System", risk: "LOW", icon: "Users", color: "#6B7280", description: "IP Multicast traffic" },
  { ndpiId: 690, name: "Broadcast", category: "System", risk: "LOW", icon: "Radio", color: "#94A3B8", description: "Network broadcast traffic" },

  // ═══════════════════════════════════════════════════════════
  // Additional Media / Streaming (nDPI v5.1)
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 691, name: "HLS", category: "Media", risk: "LOW", icon: "Play", color: "#E44D26", description: "HTTP Live Streaming protocol" },
  { ndpiId: 692, name: "MPEG-DASH", category: "Media", risk: "LOW", icon: "Film", color: "#0072CE", description: "Dynamic Adaptive Streaming over HTTP" },
  { ndpiId: 693, name: "Silverlight", category: "Media", risk: "LOW", icon: "PlayCircle", color: "#7FBA00", description: "Microsoft Silverlight streaming" },
  { ndpiId: 694, name: "Adobe HDS", category: "Media", risk: "LOW", icon: "Film", color: "#FF0000", description: "Adobe HTTP Dynamic Streaming" },
  { ndpiId: 695, name: "Smooth Streaming", category: "Media", risk: "LOW", icon: "Play", color: "#0078D7", description: "Microsoft Smooth Streaming" },
  { ndpiId: 696, name: "WebM", category: "Media", risk: "LOW", icon: "Video", color: "#34A853", description: "WebM video format streaming" },
  { ndpiId: 697, name: "Avi", category: "Media", risk: "LOW", icon: "Film", color: "#6B8E23", description: "AVI video streaming" },
  { ndpiId: 698, name: "Flash Video", category: "Media", risk: "MEDIUM", icon: "Film", color: "#FF6600", description: "Adobe Flash video streaming" },
  { ndpiId: 699, name: "DLNA", category: "Media", risk: "LOW", icon: "Tv", color: "#0066CC", description: "Digital Living Network Alliance" },
  { ndpiId: 700, name: "Roku", category: "Media", risk: "LOW", icon: "Tv", color: "#6B3FA0", description: "Roku streaming platform" },
  { ndpiId: 701, name: "Apple Media", category: "Media", risk: "LOW", icon: "Play", color: "#A2AAAD", description: "Apple Media Services streaming" },
  { ndpiId: 702, name: "Funimation", category: "Media", risk: "LOW", icon: "Film", color: "#5B2E91", description: "Anime streaming service" },
  { ndpiId: 703, name: "VRV", category: "Media", risk: "LOW", icon: "Film", color: "#0047AB", description: "Curated anime streaming bundle" },
  { ndpiId: 704, name: "DAZN", category: "Media", risk: "LOW", icon: "Tv", color: "#F9B000", description: "Sports live streaming service" },
  { ndpiId: 705, name: "YouTube Kids", category: "Media", risk: "LOW", icon: "Youtube", color: "#FF0000", description: "YouTube child-safe content app" },
  { ndpiId: 706, name: "Showtime", category: "Media", risk: "LOW", icon: "Film", color: "#990000", description: "Showtime streaming service" },
  { ndpiId: 707, name: "Starz", category: "Media", risk: "LOW", icon: "Star", color: "#B20000", description: "Starz streaming service" },

  // ═══════════════════════════════════════════════════════════
  // Additional Streaming Audio
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 708, name: "Shoutcast", category: "Streaming Audio", risk: "LOW", icon: "Radio", color: "#FF6600", description: "Internet radio streaming protocol" },
  { ndpiId: 709, name: "Icecast", category: "Streaming Audio", risk: "LOW", icon: "Radio", color: "#0072CE", description: "Open source streaming media server" },
  { ndpiId: 710, name: "Internet Radio", category: "Streaming Audio", risk: "LOW", icon: "Radio", color: "#8B5CF6", description: "Generic internet radio streams" },
  { ndpiId: 711, name: "Amazon Audible", category: "Streaming Audio", risk: "LOW", icon: "Headphones", color: "#FF8900", description: "Amazon audiobook service" },
  { ndpiId: 712, name: "Podcast", category: "Streaming Audio", risk: "LOW", icon: "Mic", color: "#8B5CF6", description: "Podcast RSS feed streaming" },
  { ndpiId: 713, name: "Last.fm", category: "Streaming Audio", risk: "LOW", icon: "Music", color: "#D51007", description: "Music scrobbling and streaming" },

  // ═══════════════════════════════════════════════════════════
  // Additional Social Media
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 714, name: "Flickr", category: "Social Media", risk: "LOW", icon: "Camera", color: "#FF0084", description: "Yahoo photo sharing service" },
  { ndpiId: 715, name: "Foursquare", category: "Social Media", risk: "LOW", icon: "MapPin", color: "#F94877", description: "Location-based social network" },
  { ndpiId: 716, name: "Meetup", category: "Social Media", risk: "LOW", icon: "Users", color: "#E23744", description: "Social networking for offline events" },
  { ndpiId: 717, name: "Quora", category: "Social Media", risk: "LOW", icon: "MessageCircle", color: "#B92B27", description: "Q&A social platform" },
  { ndpiId: 718, name: "Nextdoor", category: "Social Media", risk: "LOW", icon: "Home", color: "#00B551", description: "Neighborhood social network" },
  { ndpiId: 719, name: "Parler", category: "Social Media", risk: "MEDIUM", icon: "MessageSquare", color: "#BE1E2D", description: "Unmoderated social media platform" },
  { ndpiId: 720, name: "Gab", category: "Social Media", risk: "MEDIUM", icon: "MessageSquare", color: "#21CF7A", description: "Alt-tech social network" },
  { ndpiId: 721, name: "Clubhouse", category: "Social Media", risk: "LOW", icon: "Mic", color: "#6515DD", description: "Audio-based social networking" },
  { ndpiId: 722, name: "Discord Social", category: "Social Media", risk: "LOW", icon: "Headphones", color: "#5865F2", description: "Discord social features" },
  { ndpiId: 723, name: "Yelp", category: "Social Media", risk: "LOW", icon: "Star", color: "#FF1A1A", description: "Local business review platform" },

  // ═══════════════════════════════════════════════════════════
  // Additional Messaging / Communication
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 724, name: "Google Chat", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#34A853", description: "Google Workspace chat" },
  { ndpiId: 725, name: "ICQ", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#FF6600", description: "Classic instant messenger" },
  { ndpiId: 726, name: "AIM", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#336699", description: "AOL Instant Messenger" },
  { ndpiId: 727, name: "Yahoo Messenger", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#6001D2", description: "Yahoo instant messaging" },
  { ndpiId: 728, name: "IRC", category: "Messaging", risk: "LOW", icon: "Hash", color: "#4B8BBE", description: "Internet Relay Chat" },
  { ndpiId: 729, name: "Jabber/XMPP", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#3B7A57", description: "Extensible Messaging and Presence Protocol" },
  { ndpiId: 730, name: "Google Allo", category: "Messaging", risk: "LOW", icon: "MessageCircle", color: "#4285F4", description: "Google Allo messaging (deprecated)" },
  { ndpiId: 731, name: "Google Duo", category: "Messaging", risk: "LOW", icon: "Video", color: "#4285F4", description: "Google Duo video calling" },
  { ndpiId: 732, name: "Microsoft Lync", category: "Messaging", risk: "LOW", icon: "Users", color: "#0078D4", description: "Microsoft enterprise messaging" },
  { ndpiId: 733, name: "Zoho Cliq", category: "Messaging", risk: "LOW", icon: "MessageSquare", color: "#D4382C", description: "Zoho team messaging" },
  { ndpiId: 734, name: "RingCentral", category: "Messaging", risk: "LOW", icon: "Phone", color: "#0A2463", description: "Cloud communications platform" },

  // ═══════════════════════════════════════════════════════════
  // Additional VoIP / Communication
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 735, name: "H.323", category: "VoIP", risk: "LOW", icon: "Phone", color: "#005BAC", description: "H.323 VoIP protocol suite" },
  { ndpiId: 736, name: "MGCP", category: "VoIP", risk: "LOW", icon: "Phone", color: "#2E8B57", description: "Media Gateway Control Protocol" },
  { ndpiId: 737, name: "IAX2", category: "VoIP", risk: "LOW", icon: "Phone", color: "#CC0000", description: "Inter-Asterisk eXchange protocol" },
  { ndpiId: 738, name: "TeamSpeak", category: "VoIP", risk: "LOW", icon: "Headphones", color: "#4E72B0", description: "TeamSpeak voice chat" },
  { ndpiId: 739, name: "Mumble", category: "VoIP", risk: "LOW", icon: "Mic", color: "#3D8B37", description: "Mumble open source voice chat" },
  { ndpiId: 740, name: "Ventrilo", category: "VoIP", risk: "LOW", icon: "Headphones", color: "#7B9EB5", description: "Ventrilo voice communication" },
  { ndpiId: 741, name: "FreeSWITCH", category: "VoIP", risk: "LOW", icon: "Phone", color: "#8BC34A", description: "Open-source telephony platform" },

  // ═══════════════════════════════════════════════════════════
  // Additional P2P / File Sharing
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 742, name: "Direct Connect", category: "P2P", risk: "HIGH", icon: "Download", color: "#3E8E41", description: "Direct Connect P2P file sharing" },
  { ndpiId: 743, name: "Soulseek", category: "P2P", risk: "MEDIUM", icon: "Download", color: "#FF6600", description: "Soulseek music sharing P2P" },
  { ndpiId: 744, name: "DC++", category: "P2P", risk: "HIGH", icon: "Download", color: "#3E8E41", description: "DC++ Direct Connect client" },
  { ndpiId: 745, name: "Kad", category: "P2P", risk: "HIGH", icon: "Share2", color: "#4A90D9", description: "Kad peer-to-peer DHT network" },
  { ndpiId: 746, name: "PPLive", category: "P2P", risk: "HIGH", icon: "Play", color: "#FF6600", description: "P2P live streaming platform" },
  { ndpiId: 747, name: "PPStream", category: "P2P", risk: "HIGH", icon: "Play", color: "#FF9900", description: "Chinese P2P streaming media" },
  { ndpiId: 748, name: "SopCast", category: "P2P", risk: "HIGH", icon: "Radio", color: "#FF0000", description: "P2P TV broadcasting system" },
  { ndpiId: 749, name: "TVants", category: "P2P", risk: "MEDIUM", icon: "Tv", color: "#FF6600", description: "P2P streaming TV application" },
  { ndpiId: 750, name: "iMule", category: "P2P", risk: "HIGH", icon: "Download", color: "#7B2D8E", description: "Anonymous file sharing via I2P" },
  { ndpiId: 751, name: "RapidShare", category: "P2P", risk: "MEDIUM", icon: "Download", color: "#005BAC", description: "One-click file hosting service" },
  { ndpiId: 752, name: "Put.io", category: "P2P", risk: "MEDIUM", icon: "Cloud", color: "#FF6600", description: "Cloud-based BitTorrent client" },

  // ═══════════════════════════════════════════════════════════
  // Additional Gaming
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 753, name: "World of Warcraft", category: "Gaming", risk: "LOW", icon: "Swords", color: "#F28C28", description: "Blizzard MMORPG" },
  { ndpiId: 754, name: "Half-Life 2", category: "Gaming", risk: "LOW", icon: "Crosshair", color: "#F59E0B", description: "Valve FPS game" },
  { ndpiId: 755, name: "EVE Online", category: "Gaming", risk: "LOW", icon: "Globe", color: "#8B4513", description: "Sci-fi MMORPG by CCP Games" },
  { ndpiId: 756, name: "Warcraft III", category: "Gaming", risk: "LOW", icon: "Swords", color: "#00A651", description: "Blizzard RTS game" },
  { ndpiId: 757, name: "RuneScape", category: "Gaming", risk: "LOW", icon: "Swords", color: "#FF9900", description: "Browser-based MMORPG" },
  { ndpiId: 758, name: "Starcraft II", category: "Gaming", risk: "LOW", icon: "Target", color: "#0070DD", description: "Blizzard real-time strategy" },
  { ndpiId: 759, name: "Overwatch", category: "Gaming", risk: "LOW", icon: "Target", color: "#FA9C1E", description: "Blizzard team-based shooter" },
  { ndpiId: 760, name: "Diablo III", category: "Gaming", risk: "LOW", icon: "Skull", color: "#C41F3B", description: "Blizzard action RPG" },
  { ndpiId: 761, name: "CS:GO", category: "Gaming", risk: "LOW", icon: "Crosshair", color: "#DE9B35", description: "Counter-Strike: Global Offensive" },
  { ndpiId: 762, name: "Apex Legends", category: "Gaming", risk: "LOW", icon: "Target", color: "#CD3333", description: "Respawn battle royale game" },
  { ndpiId: 763, name: "Call of Duty", category: "Gaming", risk: "LOW", icon: "Crosshair", color: "#2D2D2D", description: "Activision FPS franchise" },
  { ndpiId: 764, name: "FIFA Online", category: "Gaming", risk: "LOW", icon: "Soccer", color: "#0070D1", description: "EA Sports FIFA online" },
  { ndpiId: 765, name: "Hearthstone", category: "Gaming", risk: "LOW", icon: "Sparkles", color: "#009DE0", description: "Blizzard digital card game" },
  { ndpiId: 766, name: "Among Us", category: "Gaming", risk: "LOW", icon: "Users", color: "#FF4500", description: "Social deduction multiplayer game" },
  { ndpiId: 767, name: "Genshin Impact", category: "Gaming", risk: "LOW", icon: "Sparkles", color: "#63B3ED", description: "HoYoverse action RPG" },

  // ═══════════════════════════════════════════════════════════
  // Additional VPN / Proxy / Tunneling
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 768, name: "Hotspot Shield", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#EF3E42", description: "VPN proxy service" },
  { ndpiId: 769, name: "TunnelBear", category: "VPN", risk: "LOW", icon: "Shield", color: "#6FB937", description: "Consumer VPN provider" },
  { ndpiId: 770, name: "IPVanish", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#F7B125", description: "VPN service provider" },
  { ndpiId: 771, name: "VyprVPN", category: "VPN", risk: "MEDIUM", icon: "Shield", color: "#7CB342", description: "Golden Frog VPN service" },
  { ndpiId: 772, name: "Private Internet Access", category: "VPN", risk: "LOW", icon: "Shield", color: "#2ECC71", description: "PIA VPN service" },
  { ndpiId: 773, name: "Mullvad VPN", category: "VPN", risk: "LOW", icon: "Shield", color: "#2997FF", description: "Swedish privacy-focused VPN" },
  { ndpiId: 774, name: "Windscribe", category: "VPN", risk: "LOW", icon: "Shield", color: "#70C1B3", description: "VPN desktop app and browser extension" },
  { ndpiId: 775, name: "Stunnel", category: "VPN", risk: "LOW", icon: "Lock", color: "#D70015", description: "TLS tunneling proxy" },
  { ndpiId: 776, name: "SSH Tunnel", category: "VPN", risk: "MEDIUM", icon: "Terminal", color: "#84CC16", description: "SSH-based tunneling" },
  { ndpiId: 777, name: "HTTP Proxy", category: "VPN", risk: "MEDIUM", icon: "Globe", color: "#64748B", description: "HTTP/HTTPS proxy traffic" },
  { ndpiId: 778, name: "SOCKS Proxy", category: "VPN", risk: "MEDIUM", icon: "Globe", color: "#475569", description: "SOCKS4/SOCKS5 proxy traffic" },
  { ndpiId: 779, name: "Ultrasurf", category: "Security", risk: "HIGH", icon: "EyeOff", color: "#2196F3", description: "Internet censorship circumvention" },
  { ndpiId: 780, name: "Psiphon", category: "Security", risk: "HIGH", icon: "EyeOff", color: "#C1272D", description: "Open-source circumvention tool" },
  { ndpiId: 781, name: "Lantern", category: "Security", risk: "HIGH", icon: "EyeOff", color: "#FF8C00", description: "Internet freedom circumvention" },

  // ═══════════════════════════════════════════════════════════
  // Additional Remote Access
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 782, name: "PCAnywhere", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#0066CC", description: "Symantec remote access software" },
  { ndpiId: 783, name: "GoToMyPC", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#00965E", description: "LogMeIn remote desktop" },
  { ndpiId: 784, name: "Remote Desktop Gateway", category: "Remote Access", risk: "MEDIUM", icon: "Monitor", color: "#0078D7", description: "Microsoft RD Gateway" },
  { ndpiId: 785, name: "NoMachine", category: "Remote Access", risk: "LOW", icon: "Monitor", color: "#009BDE", description: "NoMachine remote desktop" },
  { ndpiId: 786, name: "Chrome Remote Desktop", category: "Remote Access", risk: "LOW", icon: "Monitor", color: "#4285F4", description: "Google Chrome remote desktop" },

  // ═══════════════════════════════════════════════════════════
  // Additional Productivity
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 787, name: "Basecamp", category: "Productivity", risk: "LOW", icon: "Mountain", color: "#1D2D35", description: "Project management by 37signals" },
  { ndpiId: 788, name: "HubSpot", category: "Productivity", risk: "LOW", icon: "Target", color: "#FF7A59", description: "Inbound marketing platform" },
  { ndpiId: 789, name: "Zoho CRM", category: "Productivity", risk: "LOW", icon: "Database", color: "#D4382C", description: "Zoho customer relationship management" },
  { ndpiId: 790, name: "Freshdesk", category: "Productivity", risk: "LOW", icon: "Headphones", color: "#0086C9", description: "Freshworks customer support" },
  { ndpiId: 791, name: "Zendesk", category: "Productivity", risk: "LOW", icon: "MessageCircle", color: "#03363D", description: "Customer service and support" },
  { ndpiId: 792, name: "ServiceNow", category: "Productivity", risk: "LOW", icon: "Settings", color: "#81B5A1", description: "Enterprise IT service management" },
  { ndpiId: 793, name: "Workday", category: "Productivity", risk: "LOW", icon: "Briefcase", color: "#FFC120", description: "Enterprise HR and finance" },
  { ndpiId: 794, name: "Oracle NetSuite", category: "Productivity", risk: "LOW", icon: "Database", color: "#FF6600", description: "Cloud ERP business suite" },
  { ndpiId: 795, name: "Microsoft Dynamics", category: "Productivity", risk: "LOW", icon: "Settings", color: "#0078D4", description: "Microsoft ERP/CRM suite" },
  { ndpiId: 796, name: "GoToMeeting", category: "Productivity", risk: "LOW", icon: "Video", color: "#00965E", description: "LogMeIn online meetings" },
  { ndpiId: 797, name: "BlueJeans", category: "Productivity", risk: "LOW", icon: "Video", color: "#00549E", description: "Verizon enterprise video conferencing" },

  // ═══════════════════════════════════════════════════════════
  // Additional Development / IT
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 798, name: "Stack Overflow", category: "Development", risk: "LOW", icon: "Code", color: "#F48024", description: "Developer Q&A community" },
  { ndpiId: 799, name: "Jenkins CI", category: "Development", risk: "LOW", icon: "Settings", color: "#D24939", description: "Jenkins continuous integration" },
  { ndpiId: 800, name: "CircleCI", category: "Development", risk: "LOW", icon: "RefreshCw", color: "#343434", description: "Continuous integration and delivery" },
  { ndpiId: 801, name: "Travis CI", category: "Development", risk: "LOW", icon: "RefreshCw", color: "#37A5CC", description: "Hosted continuous integration" },
  { ndpiId: 802, name: "GitHub Actions", category: "Development", risk: "LOW", icon: "Play", color: "#2088FF", description: "GitHub CI/CD automation" },
  { ndpiId: 803, name: "GitLab CI", category: "Development", risk: "LOW", icon: "RefreshCw", color: "#FC6D26", description: "GitLab built-in CI/CD" },
  { ndpiId: 804, name: "Artifactory", category: "Development", risk: "LOW", icon: "Package", color: "#0095D6", description: "JFrog artifact repository manager" },
  { ndpiId: 805, name: "Nexus Repository", category: "Development", risk: "LOW", icon: "Database", color: "#00B4D8", description: "Sonatype Nexus repository manager" },
  { ndpiId: 806, name: "RubyGems", category: "Development", risk: "LOW", icon: "Package", color: "#CC342D", description: "Ruby package manager" },
  { ndpiId: 807, name: "NuGet", category: "Development", risk: "LOW", icon: "Package", color: "#004880", description: "Microsoft .NET package manager" },
  { ndpiId: 808, name: "Chocolatey", category: "Development", risk: "LOW", icon: "Package", color: "#80B5E3", description: "Windows package manager" },
  { ndpiId: 809, name: "Helm", category: "Development", risk: "LOW", icon: "Sailboat", color: "#0F1689", description: "Kubernetes package manager" },
  { ndpiId: 810, name: "Prometheus", category: "Development", risk: "LOW", icon: "Activity", color: "#E6522C", description: "Monitoring and alerting toolkit" },
  { ndpiId: 811, name: "Grafana", category: "Development", risk: "LOW", icon: "BarChart3", color: "#F46800", description: "Observability and visualization" },
  { ndpiId: 812, name: "ELK Stack", category: "Development", risk: "LOW", icon: "Search", color: "#FEC514", description: "Elasticsearch, Logstash, Kibana" },
  { ndpiId: 813, name: "Jaeger", category: "Development", risk: "LOW", icon: "Activity", color: "#60D0E4", description: "Distributed tracing system" },
  { ndpiId: 814, name: "Istio", category: "Development", risk: "LOW", icon: "Network", color: "#466BB0", description: "Service mesh platform" },
  { ndpiId: 815, name: "Consul", category: "Development", risk: "LOW", icon: "Server", color: "#F24C53", description: "HashiCorp service discovery" },
  { ndpiId: 816, name: "Vault", category: "Development", risk: "LOW", icon: "Lock", color: "#FFEC6E", description: "HashiCorp secrets management" },
  { ndpiId: 817, name: "Docker Hub", category: "Development", risk: "LOW", icon: "Container", color: "#2496ED", description: "Docker container registry" },
  { ndpiId: 818, name: "npm Registry", category: "Development", risk: "LOW", icon: "Package", color: "#CB3837", description: "Node.js package repository" },
  { ndpiId: 819, name: "Crates.io", category: "Development", risk: "LOW", icon: "Package", color: "#000000", description: "Rust package registry" },
  { ndpiId: 820, name: "CPAN", category: "Development", risk: "LOW", icon: "Package", color: "#0078C5", description: "Comprehensive Perl Archive Network" },

  // ═══════════════════════════════════════════════════════════
  // Additional Cloud Services / CDN
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 821, name: "S3", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#FF9900", description: "Amazon Simple Storage Service" },
  { ndpiId: 822, name: "Azure Blob", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#0078D4", description: "Azure Blob Storage" },
  { ndpiId: 823, name: "GCS", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#4285F4", description: "Google Cloud Storage" },
  { ndpiId: 824, name: "CloudFront", category: "Cloud Services", risk: "LOW", icon: "Globe", color: "#FF9900", description: "Amazon CDN service" },
  { ndpiId: 825, name: "Azure CDN", category: "Cloud Services", risk: "LOW", icon: "Globe", color: "#0078D4", description: "Azure Content Delivery Network" },
  { ndpiId: 826, name: "Google CDN", category: "Cloud Services", risk: "LOW", icon: "Globe", color: "#4285F4", description: "Google Cloud CDN" },
  { ndpiId: 827, name: "Firebase", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#FFCA28", description: "Google mobile and web platform" },
  { ndpiId: 828, name: "Supabase", category: "Cloud Services", risk: "LOW", icon: "Database", color: "#3ECF8E", description: "Open source Firebase alternative" },
  { ndpiId: 829, name: "Vercel", category: "Cloud Services", risk: "LOW", icon: "Triangle", color: "#000000", description: "Frontend deployment platform" },
  { ndpiId: 830, name: "Netlify", category: "Cloud Services", risk: "LOW", icon: "Globe", color: "#00C7B7", description: "Jamstack deployment platform" },
  { ndpiId: 831, name: "Redis Cloud", category: "Cloud Services", risk: "LOW", icon: "Database", color: "#DC382D", description: "Redis Labs cloud database" },
  { ndpiId: 832, name: "MongoDB Atlas", category: "Cloud Services", risk: "LOW", icon: "Database", color: "#47A248", description: "MongoDB cloud database service" },
  { ndpiId: 833, name: "PlanetScale", category: "Cloud Services", risk: "LOW", icon: "Database", color: "#000000", description: "Serverless MySQL platform" },
  { ndpiId: 834, name: "Render", category: "Cloud Services", risk: "LOW", icon: "Cloud", color: "#46E3B7", description: "Cloud application hosting" },

  // ═══════════════════════════════════════════════════════════
  // Additional IoT / OT / Industrial
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 835, name: "DNP3", category: "IoT", risk: "MEDIUM", icon: "Cpu", color: "#FF6600", description: "Distributed Network Protocol for SCADA" },
  { ndpiId: 836, name: "IEC 61850", category: "IoT", risk: "MEDIUM", icon: "Cpu", color: "#0066CC", description: "Power utility communication protocol" },
  { ndpiId: 837, name: "IEEE C37.118", category: "IoT", risk: "MEDIUM", icon: "Cpu", color: "#8B4513", description: "Synchrophasor data transfer" },
  { ndpiId: 838, name: "Siemens S7", category: "IoT", risk: "MEDIUM", icon: "Cpu", color: "#009999", description: "Siemens S7 PLC communication" },
  { ndpiId: 839, name: "Profinet", category: "IoT", risk: "MEDIUM", icon: "Network", color: "#FF9900", description: "Industrial Ethernet protocol" },
  { ndpiId: 840, name: "EtherCAT", category: "IoT", risk: "LOW", icon: "Cpu", color: "#CC0000", description: "Ethernet for Control Automation Technology" },
  { ndpiId: 841, name: "KNX", category: "IoT", risk: "LOW", icon: "Building", color: "#00A550", description: "Building automation standard" },
  { ndpiId: 842, name: "EnOcean", category: "IoT", risk: "LOW", icon: "Radio", color: "#0072CE", description: "Energy harvesting wireless protocol" },
  { ndpiId: 843, name: "Thread", category: "IoT", risk: "LOW", icon: "Wifi", color: "#7B2D8E", description: "Thread mesh networking protocol" },
  { ndpiId: 844, name: "Matter", category: "IoT", risk: "LOW", icon: "Home", color: "#7B61FF", description: "Smart home connectivity standard" },
  { ndpiId: 845, name: "Philips Hue", category: "IoT", risk: "LOW", icon: "Lightbulb", color: "#FFB900", description: "Philips Hue smart lighting" },
  { ndpiId: 846, name: "Ring (Amazon)", category: "IoT", risk: "LOW", icon: "Bell", color: "#00A8E1", description: "Amazon Ring smart home security" },
  { ndpiId: 847, name: "Nest (Google)", category: "IoT", risk: "LOW", icon: "Home", color: "#00ACD7", description: "Google Nest smart devices" },
  { ndpiId: 848, name: "Samsung Hub", category: "IoT", risk: "LOW", icon: "Home", color: "#1428A0", description: "Samsung SmartThings Hub" },
  { ndpiId: 849, name: "Sonos", category: "IoT", risk: "LOW", icon: "Speaker", color: "#000000", description: "Sonos wireless speaker system" },
  { ndpiId: 850, name: "TP-Link Tapo", category: "IoT", risk: "LOW", icon: "Wifi", color: "#00B4D8", description: "TP-Link smart home devices" },

  // ═══════════════════════════════════════════════════════════
  // Additional Advertising / Analytics
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 851, name: "Facebook Pixel", category: "Ad Networks", risk: "MEDIUM", icon: "Activity", color: "#1877F2", description: "Facebook conversion tracking pixel" },
  { ndpiId: 852, name: "Google Tag Manager", category: "Ad Networks", risk: "LOW", icon: "Settings", color: "#4285F4", description: "Google tag management" },
  { ndpiId: 853, name: "Hotjar", category: "Ad Networks", risk: "LOW", icon: "Eye", color: "#F76B1C", description: "Website heatmaps and analytics" },
  { ndpiId: 854, name: "Mixpanel", category: "Ad Networks", risk: "LOW", icon: "BarChart3", color: "#5A4FCF", description: "Product analytics platform" },
  { ndpiId: 855, name: "Segment", category: "Ad Networks", risk: "LOW", icon: "Activity", color: "#53D28C", description: "Customer data platform" },
  { ndpiId: 856, name: "Amplitude", category: "Ad Networks", risk: "LOW", icon: "BarChart3", color: "#415FFF", description: "Product analytics and BI" },
  { ndpiId: 857, name: "AdRoll", category: "Ad Networks", risk: "MEDIUM", icon: "Megaphone", color: "#0CC8FF", description: "Retargeting and display ads" },
  { ndpiId: 858, name: "Quantcast", category: "Ad Networks", risk: "MEDIUM", icon: "BarChart3", color: "#000000", description: "Audience measurement and targeting" },
  { ndpiId: 859, name: "Moat", category: "Ad Networks", risk: "LOW", icon: "Eye", color: "#F4645F", description: "Digital ad attention analytics" },

  // ═══════════════════════════════════════════════════════════
  // Additional Malware / Threat Detection
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 860, name: "Adware", category: "Malware", risk: "HIGH", icon: "AlertTriangle", color: "#FF9900", description: "Advertising-supported malware" },
  { ndpiId: 861, name: "Rootkit", category: "Malware", risk: "CRITICAL", icon: "Skull", color: "#8B0000", description: "Rootkit malware communication" },
  { ndpiId: 862, name: "Keylogger", category: "Malware", risk: "CRITICAL", icon: "Keyboard", color: "#DC143C", description: "Keylogger data exfiltration" },
  { ndpiId: 863, name: "Exploit Kit", category: "Malware", risk: "CRITICAL", icon: "Bug", color: "#B22222", description: "Exploit kit payload delivery" },
  { ndpiId: 864, name: "Port Scan", category: "Malware", risk: "HIGH", icon: "Search", color: "#FF4500", description: "Network port scanning activity" },
  { ndpiId: 865, name: "Brute Force", category: "Malware", risk: "CRITICAL", icon: "Lock", color: "#FF0000", description: "Brute force attack traffic" },
  { ndpiId: 866, name: "DNS Tunneling", category: "Malware", risk: "CRITICAL", icon: "Globe", color: "#8B008B", description: "DNS-based data exfiltration" },
  { ndpiId: 867, name: "ICMP Tunnel", category: "Malware", risk: "HIGH", icon: "Wifi", color: "#006400", description: "ICMP-based covert tunnel" },
  { ndpiId: 868, name: "Miner Pool", category: "Malware", risk: "HIGH", icon: "Coins", color: "#FF6347", description: "Cryptocurrency mining pool" },
  { ndpiId: 869, name: "Coinhive", category: "Malware", risk: "HIGH", icon: "Coins", color: "#FFD700", description: "Browser-based cryptominer" },
  { ndpiId: 870, name: "Darknet", category: "Malware", risk: "CRITICAL", icon: "EyeOff", color: "#1A1A2E", description: "Dark web marketplace traffic" },

  // ═══════════════════════════════════════════════════════════
  // Additional System / Network Protocols
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 871, name: "IPP", category: "System", risk: "LOW", icon: "Printer", color: "#0066CC", description: "Internet Printing Protocol" },
  { ndpiId: 872, name: "LPD", category: "System", risk: "LOW", icon: "Printer", color: "#666666", description: "Line Printer Daemon Protocol" },
  { ndpiId: 873, name: "SMBv1", category: "System", risk: "HIGH", icon: "Folder", color: "#0078D4", description: "Server Message Block v1 (insecure)" },
  { ndpiId: 874, name: "SMBv2", category: "System", risk: "MEDIUM", icon: "Folder", color: "#0078D4", description: "Server Message Block v2/v3" },
  { ndpiId: 875, name: "NetBIOS", category: "System", risk: "LOW", icon: "Network", color: "#4CAF50", description: "NetBIOS name service" },
  { ndpiId: 876, name: "Kerberos", category: "System", risk: "LOW", icon: "Shield", color: "#326CE5", description: "Kerberos authentication protocol" },
  { ndpiId: 877, name: "RADIUS", category: "System", risk: "MEDIUM", icon: "Server", color: "#005BAC", description: "Remote Authentication Dial-In Service" },
  { ndpiId: 878, name: "TACACS+", category: "System", risk: "MEDIUM", icon: "Server", color: "#0066CC", description: "Terminal Access Controller Access Control" },
  { ndpiId: 879, name: "PPTP Control", category: "System", risk: "MEDIUM", icon: "Shield", color: "#0066CC", description: "PPTP tunnel control" },
  { ndpiId: 880, name: "GRE", category: "System", risk: "LOW", icon: "Network", color: "#64748B", description: "Generic Routing Encapsulation" },
  { ndpiId: 881, name: "ESP", category: "System", risk: "LOW", icon: "Lock", color: "#2ECC71", description: "IPsec Encapsulating Security Payload" },
  { ndpiId: 882, name: "AH", category: "System", risk: "LOW", icon: "Lock", color: "#3498DB", description: "IPsec Authentication Header" },
  { ndpiId: 883, name: "VRRP", category: "System", risk: "LOW", icon: "Server", color: "#CC0000", description: "Virtual Router Redundancy Protocol" },
  { ndpiId: 884, name: "HSRP", category: "System", risk: "LOW", icon: "Server", color: "#0066CC", description: "Cisco Hot Standby Router Protocol" },
  { ndpiId: 885, name: "OSPF", category: "System", risk: "LOW", icon: "Network", color: "#FF8C00", description: "Open Shortest Path First" },
  { ndpiId: 886, name: "BGP", category: "System", risk: "MEDIUM", icon: "Globe", color: "#FF6600", description: "Border Gateway Protocol" },
  { ndpiId: 887, name: "EIGRP", category: "System", risk: "LOW", icon: "Network", color: "#FF9900", description: "Enhanced Interior Gateway Routing" },
  { ndpiId: 888, name: "RIP", category: "System", risk: "LOW", icon: "Network", color: "#6B8E23", description: "Routing Information Protocol" },
  { ndpiId: 889, name: "LACP", category: "System", risk: "LOW", icon: "Network", color: "#0066CC", description: "Link Aggregation Control Protocol" },
  { ndpiId: 890, name: "STP", category: "System", risk: "LOW", icon: "Network", color: "#FF6600", description: "Spanning Tree Protocol" },
  { ndpiId: 891, name: "CDP", category: "System", risk: "LOW", icon: "Network", color: "#0066CC", description: "Cisco Discovery Protocol" },
  { ndpiId: 892, name: "LLDP", category: "System", risk: "LOW", icon: "Network", color: "#009900", description: "Link Layer Discovery Protocol" },
  { ndpiId: 893, name: "802.1X", category: "System", risk: "LOW", icon: "Shield", color: "#0066CC", description: "Port-based network access control" },
  { ndpiId: 894, name: "WPA", category: "System", risk: "MEDIUM", icon: "Wifi", color: "#0066CC", description: "Wi-Fi Protected Access" },
  { ndpiId: 895, name: "WEP", category: "System", risk: "HIGH", icon: "Wifi", color: "#CC0000", description: "Wired Equivalent Privacy (insecure)" },
  { ndpiId: 896, name: "EAP", category: "System", risk: "LOW", icon: "Shield", color: "#0078D4", description: "Extensible Authentication Protocol" },
  { ndpiId: 897, name: "CAPWAP", category: "System", risk: "LOW", icon: "Wifi", color: "#0066CC", description: "Control and Provisioning of Wireless APs" },
  { ndpiId: 898, name: "WHOIS", category: "System", risk: "LOW", icon: "Search", color: "#8B5CF6", description: "WHOIS domain registration protocol" },
  { ndpiId: 899, name: "Syslog (TLS)", category: "System", risk: "LOW", icon: "FileText", color: "#64748B", description: "Encrypted syslog transport" },
  { ndpiId: 900, name: "Netconf", category: "System", risk: "LOW", icon: "Settings", color: "#009933", description: "Network Configuration Protocol" },
  { ndpiId: 901, name: "gRPC", category: "System", risk: "LOW", icon: "Network", color: "#244C5A", description: "Google Remote Procedure Call" },
  { ndpiId: 902, name: "WebSocket", category: "System", risk: "LOW", icon: "Globe", color: "#0088CC", description: "WebSocket persistent connection" },
  { ndpiId: 903, name: "gNMI", category: "System", risk: "LOW", icon: "Settings", color: "#00897B", description: "gRPC Network Management Interface" },
  { ndpiId: 904, name: "OpenMetrics", category: "System", risk: "LOW", icon: "Activity", color: "#E6522C", description: "Prometheus metrics exposition format" },

  // ═══════════════════════════════════════════════════════════
  // Additional Email Protocols
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 905, name: "SMTPS", category: "Messaging", risk: "LOW", icon: "Mail", color: "#F97316", description: "SMTP over TLS" },
  { ndpiId: 906, name: "POP3S", category: "Messaging", risk: "LOW", icon: "Mail", color: "#A855F7", description: "POP3 over TLS" },
  { ndpiId: 907, name: "IMAPS", category: "Messaging", risk: "LOW", icon: "Mail", color: "#EC4899", description: "IMAP over TLS" },
  { ndpiId: 908, name: "Exchange ActiveSync", category: "Messaging", risk: "LOW", icon: "Mail", color: "#0078D4", description: "Microsoft Exchange mobile sync" },
  { ndpiId: 909, name: "MAPI", category: "Messaging", risk: "LOW", icon: "Mail", color: "#0078D4", description: "Messaging Application Programming Interface" },

  // ═══════════════════════════════════════════════════════════
  // Additional Education
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 910, name: "Moodle", category: "Education", risk: "LOW", icon: "GraduationCap", color: "#F7931E", description: "Open source learning platform" },
  { ndpiId: 911, name: "Blackboard", category: "Education", risk: "LOW", icon: "BookOpen", color: "#4A154B", description: "Blackboard Learn LMS" },
  { ndpiId: 912, name: "Canvas LMS", category: "Education", risk: "LOW", icon: "GraduationCap", color: "#E63A27", description: "Instructure Canvas LMS" },
  { ndpiId: 913, name: "Sakai", category: "Education", risk: "LOW", icon: "BookOpen", color: "#283747", description: "Sakai collaborative learning" },
  { ndpiId: 914, name: "Zoom Education+", category: "Education", risk: "LOW", icon: "Video", color: "#2D8CFF", description: "Zoom for Education features" },
  { ndpiId: 915, name: "Quizlet", category: "Education", risk: "LOW", icon: "BookOpen", color: "#4255FF", description: "Study and flashcard platform" },
  { ndpiId: 916, name: "Duolingo", category: "Education", risk: "LOW", icon: "GraduationCap", color: "#58CC02", description: "Language learning platform" },

  // ═══════════════════════════════════════════════════════════
  // Additional Finance / Banking
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 917, name: "Western Union", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#FFDD00", description: "International money transfer" },
  { ndpiId: 918, name: "MoneyGram", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#FF6600", description: "Global money transfer service" },
  { ndpiId: 919, name: "TransferWise", category: "Finance", risk: "LOW", icon: "CreditCard", color: "#9FE870", description: "Wise international money transfer" },
  { ndpiId: 920, name: "Payoneer", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#FF5500", description: "Online payment platform" },
  { ndpiId: 921, name: "Square POS", category: "Finance", risk: "MEDIUM", icon: "CreditCard", color: "#006AFF", description: "Square point of sale" },
  { ndpiId: 922, name: "QuickBooks", category: "Finance", risk: "LOW", icon: "FileText", color: "#2CA01C", description: "Intuit accounting software" },
  { ndpiId: 923, name: "FreshBooks", category: "Finance", risk: "LOW", icon: "FileText", color: "#1FBBE6", description: "Online invoicing software" },
  { ndpiId: 924, name: "Robinhood", category: "Finance", risk: "MEDIUM", icon: "TrendingUp", color: "#00C805", description: "Commission-free trading platform" },
  { ndpiId: 925, name: "E*TRADE", category: "Finance", risk: "MEDIUM", icon: "TrendingUp", color: "#0595DB", description: "Online brokerage platform" },
  { ndpiId: 926, name: "Kraken", category: "Finance", risk: "MEDIUM", icon: "Coins", color: "#7B61FF", description: "Cryptocurrency exchange" },

  // ═══════════════════════════════════════════════════════════
  // Additional Maps / Navigation
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 927, name: "HERE Maps", category: "Maps", risk: "LOW", icon: "Map", color: "#00AEEF", description: "HERE mapping and navigation" },
  { ndpiId: 928, name: "Mapbox", category: "Maps", risk: "LOW", icon: "Map", color: "#000000", description: "Mapbox mapping platform" },
  { ndpiId: 929, name: "TomTom", category: "Maps", risk: "LOW", icon: "Navigation", color: "#D50A17", description: "TomTom navigation services" },
  { ndpiId: 930, name: "Bing Maps", category: "Maps", risk: "LOW", icon: "Map", color: "#00809D", description: "Microsoft Bing Maps" },

  // ═══════════════════════════════════════════════════════════
  // Additional Shopping / E-Commerce
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 931, name: "Target", category: "Shopping", risk: "LOW", icon: "ShoppingCart", color: "#CC0000", description: "Target online shopping" },
  { ndpiId: 932, name: "Best Buy", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#0046BE", description: "Best Buy online store" },
  { ndpiId: 933, name: "Costco", category: "Shopping", risk: "LOW", icon: "ShoppingCart", color: "#E31837", description: "Costco online shopping" },
  { ndpiId: 934, name: "IKEA", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#0058A3", description: "IKEA online store" },
  { ndpiId: 935, name: "Taobao", category: "Shopping", risk: "MEDIUM", icon: "ShoppingCart", color: "#FF5000", description: "Chinese e-commerce by Alibaba" },
  { ndpiId: 936, name: "JD.com", category: "Shopping", risk: "MEDIUM", icon: "ShoppingBag", color: "#E2231A", description: "Chinese e-commerce platform" },
  { ndpiId: 937, name: "MercadoLibre", category: "Shopping", risk: "MEDIUM", icon: "ShoppingBag", color: "#FFE600", description: "Latin American e-commerce" },
  { ndpiId: 938, name: "WooCommerce", category: "Shopping", risk: "LOW", icon: "ShoppingBag", color: "#96588A", description: "WordPress e-commerce plugin" },

  // ═══════════════════════════════════════════════════════════
  // Additional Adult / Content
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 939, name: "OnlyFans Traffic", category: "Adult", risk: "MEDIUM", icon: "EyeOff", color: "#00AFF0", description: "OnlyFans content platform traffic" },
  { ndpiId: 940, name: "Adult Ads", category: "Adult", risk: "MEDIUM", icon: "EyeOff", color: "#FF6600", description: "Adult advertising networks" },

  // ═══════════════════════════════════════════════════════════
  // Additional Information / Reference
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 941, name: "IMDb", category: "Information", risk: "LOW", icon: "Film", color: "#F5C518", description: "Internet Movie Database" },
  { ndpiId: 942, name: "GitHub Pages", category: "Information", risk: "LOW", icon: "Globe", color: "#24292E", description: "GitHub static site hosting" },
  { ndpiId: 943, name: "Medium", category: "Information", risk: "LOW", icon: "FileText", color: "#000000", description: "Medium publishing platform" },
  { ndpiId: 944, name: "Dev.to", category: "Information", risk: "LOW", icon: "Code", color: "#0A0A0A", description: "Developer community articles" },
  { ndpiId: 945, name: "Hacker News", category: "Information", risk: "LOW", icon: "MessageSquare", color: "#FF6600", description: "Y Combinator tech news" },
  { ndpiId: 946, name: "Product Hunt", category: "Information", risk: "LOW", icon: "Rocket", color: "#DA552F", description: "Product discovery platform" },
  { ndpiId: 947, name: "GitBook", category: "Information", risk: "LOW", icon: "BookOpen", color: "#3884FF", description: "Technical documentation hosting" },

  // ═══════════════════════════════════════════════════════════
  // Additional Database / Storage Protocols
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 948, name: "PostgreSQL", category: "System", risk: "LOW", icon: "Database", color: "#336791", description: "PostgreSQL database protocol" },
  { ndpiId: 949, name: "MySQL", category: "System", risk: "LOW", icon: "Database", color: "#4479A1", description: "MySQL database protocol" },
  { ndpiId: 950, name: "MongoDB Wire", category: "System", risk: "LOW", icon: "Database", color: "#47A248", description: "MongoDB wire protocol" },
  { ndpiId: 951, name: "Redis", category: "System", risk: "LOW", icon: "Database", color: "#DC382D", description: "Redis database protocol" },
  { ndpiId: 952, name: "Cassandra", category: "System", risk: "LOW", icon: "Database", color: "#1287B1", description: "Apache Cassandra database" },
  { ndpiId: 953, name: "CouchDB", category: "System", risk: "LOW", icon: "Database", color: "#E42528", description: "Apache CouchDB database" },
  { ndpiId: 954, name: "AMQP", category: "System", risk: "LOW", icon: "Network", color: "#FF6600", description: "Advanced Message Queuing Protocol" },
  { ndpiId: 955, name: "Kafka", category: "System", risk: "LOW", icon: "Activity", color: "#231F20", description: "Apache Kafka message streaming" },
  { ndpiId: 956, name: "RabbitMQ", category: "System", risk: "LOW", icon: "Network", color: "#FF6600", description: "RabbitMQ AMQP broker" },
  { ndpiId: 957, name: "ActiveMQ", category: "System", risk: "LOW", icon: "Network", color: "#D42E12", description: "Apache ActiveMQ message broker" },
  { ndpiId: 958, name: "ZeroMQ", category: "System", risk: "LOW", icon: "Network", color: "#FF0000", description: "ZeroMQ messaging library" },
  { ndpiId: 959, name: "NATS", category: "System", risk: "LOW", icon: "Network", color: "#27AAE1", description: "NATS messaging system" },

  // ═══════════════════════════════════════════════════════════
  // Additional Security / Monitoring
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 960, name: "Sophos", category: "Security", risk: "LOW", icon: "Shield", color: "#1B6F3F", description: "Sophos security products" },
  { ndpiId: 961, name: "Palo Alto", category: "Security", risk: "LOW", icon: "Shield", color: "#FA582D", description: "Palo Alto Networks firewalls" },
  { ndpiId: 962, name: "Fortinet", category: "Security", risk: "LOW", icon: "Shield", color: "#EE3124", description: "Fortinet security solutions" },
  { ndpiId: 963, name: "Cisco Umbrella", category: "Security", risk: "LOW", icon: "Globe", color: "#049FD9", description: "Cisco DNS security" },
  { ndpiId: 964, name: "CrowdStrike", category: "Security", risk: "LOW", icon: "Shield", color: "#FF0000", description: "Endpoint threat detection" },
  { ndpiId: 965, name: "Splunk", category: "Security", risk: "LOW", icon: "Activity", color: "#65A637", description: "Security information and event management" },
  { ndpiId: 966, name: "Snort", category: "Security", risk: "LOW", icon: "Shield", color: "#E8513D", description: "Open source intrusion prevention" },
  { ndpiId: 967, name: "Suricata", category: "Security", risk: "LOW", icon: "Shield", color: "#6CA356", description: "Open source IDS/IPS engine" },

  // ═══════════════════════════════════════════════════════════
  // Download Managers / Software Updates
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 968, name: "APT (Debian)", category: "System", risk: "LOW", icon: "Download", color: "#A80030", description: "Debian package manager" },
  { ndpiId: 969, name: "YUM/DNF", category: "System", risk: "LOW", icon: "Download", color: "#3C6EB4", description: "Red Hat package manager" },
  { ndpiId: 970, name: "Pacman", category: "System", risk: "LOW", icon: "Download", color: "#1793D1", description: "Arch Linux package manager" },
  { ndpiId: 971, name: "Portage", category: "System", risk: "LOW", icon: "Download", color: "#54487A", description: "Gentoo package manager" },
  { ndpiId: 972, name: "Chocolatey Update", category: "System", risk: "LOW", icon: "Download", color: "#80B5E3", description: "Windows Chocolatey updates" },
  { ndpiId: 973, name: "Ninite", category: "System", risk: "LOW", icon: "Download", color: "#48B04B", description: "Software installer service" },

  // ═══════════════════════════════════════════════════════════
  // Streaming Services (Additional)
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 974, name: "Funimation Now", category: "Media", risk: "LOW", icon: "Film", color: "#5B2E91", description: "Funimation anime streaming" },
  { ndpiId: 975, name: "HBO Go", category: "Media", risk: "LOW", icon: "Film", color: "#B833FF", description: "HBO Go streaming service" },
  { ndpiId: 976, name: "Starz Play", category: "Media", risk: "LOW", icon: "Star", color: "#B20000", description: "Starz Play streaming" },
  { ndpiId: 977, name: "YouTube Gaming", category: "Media", risk: "LOW", icon: "Gamepad", color: "#FF0000", description: "YouTube gaming streams" },

  // ═══════════════════════════════════════════════════════════
  // Chinese / Regional Services
  // ═══════════════════════════════════════════════════════════
  { ndpiId: 978, name: "Baidu", category: "Social Media", risk: "MEDIUM", icon: "Globe", color: "#2932E1", description: "Chinese search engine and services" },
  { ndpiId: 979, name: "QQ", category: "Messaging", risk: "MEDIUM", icon: "MessageCircle", color: "#12B7F5", description: "Tencent QQ instant messenger" },
  { ndpiId: 980, name: "Qzone", category: "Social Media", risk: "MEDIUM", icon: "Users", color: "#FECE00", description: "Tencent social networking" },
  { ndpiId: 981, name: "Douyin", category: "Media", risk: "LOW", icon: "Clapperboard", color: "#161823", description: "Chinese TikTok (Douyin)" },
];

// ─── Build category index for fast lookups ───────────────────
const CATEGORIES: Record<string, { apps: NdpiApp[]; totalBytes: number }> = {};
for (const app of NDPI_APPS) {
  if (!CATEGORIES[app.category]) {
    CATEGORIES[app.category] = { apps: [], totalBytes: 0 };
  }
  CATEGORIES[app.category].apps.push(app);
}

// ─── Mock Subscriber Data ────────────────────────────────────

interface MockSubscriber {
  ipAddress: string;
  subscriberId?: string;
  subscriberName?: string;
  planName?: string;
}

const MOCK_SUBSCRIBERS: MockSubscriber[] = [
  { ipAddress: "192.168.1.10", subscriberId: "SUB-001", subscriberName: "Rajesh Kumar", planName: "Fiber 100 Mbps" },
  { ipAddress: "192.168.1.15", subscriberId: "SUB-002", subscriberName: "Priya Sharma", planName: "Fiber 200 Mbps" },
  { ipAddress: "192.168.1.23", subscriberId: "SUB-003", subscriberName: "Amit Patel", planName: "Fiber 50 Mbps" },
  { ipAddress: "192.168.1.31", subscriberId: "SUB-004", subscriberName: "Sneha Gupta", planName: "Fiber 100 Mbps" },
  { ipAddress: "192.168.1.45", subscriberId: "SUB-005", subscriberName: "Vikram Singh", planName: "Fiber 500 Mbps" },
  { ipAddress: "192.168.1.52", subscriberId: "SUB-006", subscriberName: "Neha Verma", planName: "Fiber 100 Mbps" },
  { ipAddress: "192.168.1.67", subscriberId: "SUB-007", subscriberName: "Arjun Mehta", planName: "Fiber 200 Mbps" },
  { ipAddress: "192.168.1.78", subscriberId: "SUB-008", subscriberName: "Kavita Joshi", planName: "Fiber 50 Mbps" },
  { ipAddress: "192.168.1.89", subscriberId: "SUB-009", subscriberName: "Rohan Das", planName: "Fiber 100 Mbps" },
  { ipAddress: "192.168.1.101", subscriberId: "SUB-010", subscriberName: "Anita Reddy", planName: "Fiber 200 Mbps" },
  { ipAddress: "10.0.0.5", subscriberId: "SUB-011", subscriberName: "Suresh Nair", planName: "Business 1 Gbps" },
  { ipAddress: "10.0.0.12", subscriberId: "SUB-012", subscriberName: "TechCorp Solutions", planName: "Business 1 Gbps" },
  { ipAddress: "10.0.0.23", subscriberId: "SUB-013", subscriberName: "CloudNet ISP Office", planName: "Business 500 Mbps" },
  { ipAddress: "10.0.0.34", subscriberId: "SUB-014", subscriberName: "Deepak Chopra", planName: "Fiber 500 Mbps" },
  { ipAddress: "10.0.0.45", subscriberId: "SUB-015", subscriberName: "Meera Iyer", planName: "Fiber 100 Mbps" },
  { ipAddress: "10.0.0.56", subscriberId: "SUB-016", subscriberName: "Sunil Rao", planName: "Fiber 200 Mbps" },
  { ipAddress: "10.0.0.67", subscriberId: "SUB-017", subscriberName: "Pooja Malhotra", planName: "Fiber 100 Mbps" },
  { ipAddress: "10.0.0.78", subscriberId: "SUB-018", subscriberName: "NetStar Cyber Cafe", planName: "Business 1 Gbps" },
];

// ─── Utility Functions ───────────────────────────────────────

// Deterministic pseudo-random based on seed for consistent-but-varying data
function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Get time-based variation factor so data looks alive
function timeVariation(base: number, seed: number, range: number = 0.15): number {
  const now = Date.now();
  const minuteBucket = Math.floor(now / 60000); // changes every minute
  const variation = seededRandom(seed + minuteBucket) * range * 2 - range;
  return Math.round(base * (1 + variation));
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

// ─── Seed Function ───────────────────────────────────────────
// Bulk-inserts all NDPI_APPS into the NdpiApp Prisma table

async function seedDatabase() {
  try {
    console.log(`[ndpi-service] Seeding database with ${NDPI_APPS.length} protocols...`);
    let created = 0;
    let skipped = 0;
    for (const app of NDPI_APPS) {
      try {
        await db.ndpiApp.upsert({
          where: { ndpiId: app.ndpiId },
          create: {
            name: app.name,
            ndpiId: app.ndpiId,
            category: app.category,
            risk: app.risk,
            icon: app.icon,
            color: app.color,
            description: app.description,
            isEnabled: true,
          },
          update: {
            name: app.name,
            category: app.category,
            risk: app.risk,
            icon: app.icon,
            color: app.color,
            description: app.description,
          },
        });
        created++;
      } catch {
        skipped++;
      }
    }
    console.log(`[ndpi-service] Seed complete: ${created} upserted, ${skipped} skipped`);
  } catch (err: any) {
    console.error(`[ndpi-service] Seed error: ${err.message}`);
  }
}

// ─── Route Handler ───────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // ── Health Check ────────────────────────────────────────
    if (path === "/health" && method === "GET") {
      return jsonResponse({
        status: "ok",
        service: "ndpi-service",
        version: "2.0.0",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        ndpiVersion: "5.1.0",
        protocolsSupported: NDPI_APPS.length,
        categoriesSupported: Object.keys(CATEGORIES).length,
        daemonOnline: true,
      });
    }

    // ── Application Catalog ─────────────────────────────────
    if (path === "/api/apps" && method === "GET") {
      return jsonResponse(NDPI_APPS);
    }

    // ── Full Protocol Catalog ───────────────────────────────
    if (path === "/api/catalog" && method === "GET") {
      // Group all protocols by category, include metadata
      const catalog = Object.keys(CATEGORIES).map((catName) => {
        const cat = CATEGORIES[catName];
        return {
          category: catName,
          protocolCount: cat.apps.length,
          riskLevels: {
            LOW: cat.apps.filter((a) => a.risk === "LOW").length,
            MEDIUM: cat.apps.filter((a) => a.risk === "MEDIUM").length,
            HIGH: cat.apps.filter((a) => a.risk === "HIGH").length,
            CRITICAL: cat.apps.filter((a) => a.risk === "CRITICAL").length,
          },
          protocols: cat.apps.map((a) => ({
            ndpiId: a.ndpiId,
            name: a.name,
            risk: a.risk,
            icon: a.icon,
            color: a.color,
            description: a.description,
          })),
        };
      }).sort((a, b) => b.protocolCount - a.protocolCount);

      return jsonResponse({
        totalProtocols: NDPI_APPS.length,
        totalCategories: catalog.length,
        ndpiVersion: "5.1.0",
        generatedAt: new Date().toISOString(),
        catalog,
      });
    }

    // ── Categories ──────────────────────────────────────────
    if (path === "/api/categories" && method === "GET") {
      // Generate traffic bytes per category for realistic stats
      const categoryList = Object.keys(CATEGORIES).map((catName) => {
        const cat = CATEGORIES[catName];
        let totalBytes = 0;
        for (const app of cat.apps) {
          // Assign base traffic based on category importance
          let base = 1000000000; // 1GB default
          if (catName === "Media") base = 80000000000;
          else if (catName === "Streaming Audio") base = 15000000000;
          else if (catName === "Social Media") base = 25000000000;
          else if (catName === "Messaging") base = 20000000000;
          else if (catName === "VoIP") base = 8000000000;
          else if (catName === "P2P") base = 12000000000;
          else if (catName === "Gaming") base = 10000000000;
          else if (catName === "VPN") base = 5000000000;
          else if (catName === "Remote Access") base = 3000000000;
          else if (catName === "System") base = 60000000000;
          else if (catName === "Malware") base = 500000000;
          else if (catName === "Productivity") base = 15000000000;
          else if (catName === "Development") base = 5000000000;
          else if (catName === "Cloud Services") base = 20000000000;
          else if (catName === "IoT") base = 2000000000;
          else if (catName === "Ad Networks") base = 3000000000;
          else if (catName === "Shopping") base = 8000000000;
          else if (catName === "Finance") base = 2000000000;
          else if (catName === "Education") base = 3000000000;
          totalBytes += timeVariation(Math.round(base / cat.apps.length), app.ndpiId);
        }
        return {
          name: catName,
          appCount: cat.apps.length,
          totalBytes,
          riskLevels: {
            LOW: cat.apps.filter((a) => a.risk === "LOW").length,
            MEDIUM: cat.apps.filter((a) => a.risk === "MEDIUM").length,
            HIGH: cat.apps.filter((a) => a.risk === "HIGH").length,
            CRITICAL: cat.apps.filter((a) => a.risk === "CRITICAL").length,
          },
          apps: cat.apps.map((a) => ({
            ndpiId: a.ndpiId,
            name: a.name,
            risk: a.risk,
            icon: a.icon,
            color: a.color,
            description: a.description,
          })),
        };
      });

      // Sort by totalBytes descending
      categoryList.sort((a, b) => b.totalBytes - a.totalBytes);

      return jsonResponse({
        categories: categoryList,
        totalCategories: categoryList.length,
        totalApps: NDPI_APPS.length,
      });
    }

    // ── Aggregated Statistics ───────────────────────────────
    if (path === "/api/stats" && method === "GET") {
      const now = Date.now();
      const hour = new Date().getHours();

      // Generate top apps with realistic traffic distribution
      const appTraffic: { ndpiId: number; name: string; downloadBytes: number; uploadBytes: number }[] = [
        { ndpiId: 124, name: "YouTube", downloadBytes: 45000000000, uploadBytes: 2500000000 },
        { ndpiId: 133, name: "Netflix", downloadBytes: 38000000000, uploadBytes: 1200000000 },
        { ndpiId: 91, name: "TLS", downloadBytes: 32000000000, uploadBytes: 18000000000 },
        { ndpiId: 188, name: "QUIC", downloadBytes: 22000000000, uploadBytes: 8500000000 },
        { ndpiId: 37, name: "BitTorrent", downloadBytes: 15000000000, uploadBytes: 12000000000 },
        { ndpiId: 119, name: "Facebook", downloadBytes: 12000000000, uploadBytes: 3500000000 },
        { ndpiId: 142, name: "WhatsApp", downloadBytes: 8000000000, uploadBytes: 6000000000 },
        { ndpiId: 7, name: "HTTP", downloadBytes: 9000000000, uploadBytes: 4500000000 },
        { ndpiId: 5, name: "DNS", downloadBytes: 2000000000, uploadBytes: 3500000000 },
        { ndpiId: 49, name: "TikTok", downloadBytes: 10000000000, uploadBytes: 1500000000 },
        { ndpiId: 156, name: "Spotify", downloadBytes: 6000000000, uploadBytes: 800000000 },
        { ndpiId: 185, name: "Telegram", downloadBytes: 4500000000, uploadBytes: 2200000000 },
        { ndpiId: 58, name: "Discord", downloadBytes: 4000000000, uploadBytes: 1800000000 },
        { ndpiId: 189, name: "Zoom", downloadBytes: 5500000000, uploadBytes: 3200000000 },
        { ndpiId: 120, name: "Twitter", downloadBytes: 3500000000, uploadBytes: 1200000000 },
      ];

      const topApps = appTraffic.map((app, i) => ({
        ndpiId: app.ndpiId,
        name: app.name,
        downloadBytes: timeVariation(app.downloadBytes, i * 7),
        uploadBytes: timeVariation(app.uploadBytes, i * 13),
      }));

      // Calculate totals
      const totalBytes = topApps.reduce((s, a) => s + a.downloadBytes + a.uploadBytes, 0);
      const totalPackets = timeVariation(875000000, 999, 0.1);
      const totalFlows = timeVariation(3200000, 888, 0.1);

      topApps.forEach((a) => {
        (a as any).totalBytes = a.downloadBytes + a.uploadBytes;
        (a as any).percentage = parseFloat(((a.totalBytes / totalBytes) * 100).toFixed(1));
      });

      // Traffic by category
      const categories: Record<string, number> = {};
      for (const app of topApps) {
        const cat = NDPI_APPS.find((a) => a.ndpiId === app.ndpiId)?.category || "Other";
        categories[cat] = (categories[cat] || 0) + (app as any).totalBytes;
      }
      // Add untracked traffic
      categories["Other"] = timeVariation(5000000000, 777);
      categories["System"] = (categories["System"] || 0) + timeVariation(3000000000, 555);

      // Current bandwidth
      const baseDownload = 285;
      const baseUpload = 95;
      const downloadMbps = parseFloat((baseDownload + seededRandom(Math.floor(now / 10000)) * 80).toFixed(1));
      const uploadMbps = parseFloat((baseUpload + seededRandom(Math.floor(now / 10000) + 1) * 40).toFixed(1));

      // Hourly traffic (last 24 hours)
      const hourlyTraffic = [];
      for (let h = 0; h < 24; h++) {
        // Simulate traffic pattern: peak in evening (18-22), low at night (2-6)
        let hourFactor: number;
        if (h >= 2 && h <= 6) hourFactor = 0.2 + seededRandom(h) * 0.15;
        else if (h >= 7 && h <= 9) hourFactor = 0.5 + seededRandom(h + 100) * 0.2;
        else if (h >= 10 && h <= 17) hourFactor = 0.6 + seededRandom(h + 200) * 0.25;
        else if (h >= 18 && h <= 22) hourFactor = 0.85 + seededRandom(h + 300) * 0.3;
        else hourFactor = 0.35 + seededRandom(h + 400) * 0.2;

        const hourlyDl = Math.round((totalBytes / 24) * hourFactor * (0.9 + seededRandom(h + now / 3600000) * 0.2));
        const hourlyUl = Math.round(hourlyDl * (0.25 + seededRandom(h + 500) * 0.15));
        hourlyTraffic.push({ hour: h, downloadBytes: hourlyDl, uploadBytes: hourlyUl });
      }

      return jsonResponse({
        totalBytes: timeVariation(totalBytes, 42),
        totalPackets,
        totalFlows,
        activeApps: topApps.length + timeVariation(12, 33, 0.05),
        topApps,
        trafficByCategory: categories,
        bandwidthCurrent: { downloadMbps, uploadMbps },
        hourlyTraffic,
        capturedAt: new Date().toISOString(),
      });
    }

    // ── Subscribers List ────────────────────────────────────
    if (path === "/api/subscribers" && method === "GET") {
      const subscribers = MOCK_SUBSCRIBERS.map((sub, i) => {
        // Generate top 3-8 apps per subscriber with realistic distribution
        const appCount = 3 + Math.floor(seededRandom(i * 17) * 6);
        const selectedApps: { ndpiId: number; name: string; totalBytes: number; percentage: number }[] = [];

        // Weighted app selection based on plan
        let weights = NDPI_APPS.map((app) => {
          let w = 1;
          if (sub.planName?.includes("50")) w *= 0.6; // 50 Mbps users use less data
          if (sub.planName?.includes("1 Gbps")) w *= 2; // Business users use more
          if (app.category === "Gaming") w *= (sub.planName?.includes("1 Gbps") ? 1.5 : 0.5);
          if (app.category === "Media") w *= 2;
          if (app.category === "P2P") w *= 0.7;
          return w;
        });

        // Pick top apps
        const usedIndices = new Set<number>();
        for (let j = 0; j < appCount; j++) {
          let bestIdx = 0, bestW = 0;
          for (let k = 0; k < weights.length; k++) {
            if (!usedIndices.has(k) && weights[k] > bestW) {
              bestW = weights[k];
              bestIdx = k;
            }
          }
          usedIndices.add(bestIdx);
          selectedApps.push({
            ndpiId: NDPI_APPS[bestIdx].ndpiId,
            name: NDPI_APPS[bestIdx].name,
            totalBytes: 0,
            percentage: 0,
          });
        }

        // Assign byte values
        const baseTraffic = sub.planName?.includes("1 Gbps") ? 50000000000 : sub.planName?.includes("500") ? 20000000000 : sub.planName?.includes("200") ? 12000000000 : sub.planName?.includes("100") ? 8000000000 : 4000000000;
        let remaining = timeVariation(baseTraffic, i * 31);
        let assignedTotal = 0;

        selectedApps.forEach((app, j) => {
          if (j === selectedApps.length - 1) {
            app.totalBytes = remaining;
          } else {
            const share = j === 0 ? 0.35 : (0.05 + seededRandom(i * 7 + j * 13) * 0.2);
            app.totalBytes = Math.round(remaining * share);
            remaining -= app.totalBytes;
          }
          assignedTotal += app.totalBytes;
        });

        selectedApps.forEach((app) => {
          app.percentage = parseFloat(((app.totalBytes / assignedTotal) * 100).toFixed(1));
        });

        selectedApps.sort((a, b) => b.totalBytes - a.totalBytes);

        return {
          ipAddress: sub.ipAddress,
          subscriberId: sub.subscriberId,
          subscriberName: sub.subscriberName,
          planName: sub.planName,
          totalBytes: assignedTotal,
          topApps: selectedApps,
        };
      });

      return jsonResponse(subscribers);
    }

    // ── Subscriber Detail by IP ─────────────────────────────
    const subscriberMatch = path.match(/^\/api\/subscribers\/(.+)$/);
    if (subscriberMatch && method === "GET") {
      const ip = decodeURIComponent(subscriberMatch[1]);
      const sub = MOCK_SUBSCRIBERS.find((s) => s.ipAddress === ip);

      if (!sub) {
        return jsonResponse({ error: "Subscriber not found", ipAddress: ip }, 404);
      }

      // Generate detailed app breakdown for this subscriber
      const appCount = 5 + Math.floor(seededRandom(ip.length * 7) * 6);
      const selectedIndices: number[] = [];
      const allIndices = NDPI_APPS.map((_, i) => i);
      // Shuffle
      for (let i = allIndices.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(allIndices[i] + allIndices[i - 1]) * (i + 1));
        [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
      }
      for (let i = 0; i < Math.min(appCount, allIndices.length); i++) {
        selectedIndices.push(allIndices[i]);
      }

      const baseTraffic = sub.planName?.includes("1 Gbps") ? 50000000000 : sub.planName?.includes("500") ? 20000000000 : sub.planName?.includes("200") ? 12000000000 : sub.planName?.includes("100") ? 8000000000 : 4000000000;
      const totalBase = timeVariation(baseTraffic, ip.charCodeAt(0) * 31);

      let remaining = totalBase;
      const apps = selectedIndices.map((idx, j) => {
        const app = NDPI_APPS[idx];
        const dl = j === 0
          ? Math.round(remaining * 0.7)
          : Math.round((remaining * (0.4 + seededRandom(idx * 11 + j * 7) * 0.3)));
        const ul = Math.round(dl * (0.1 + seededRandom(idx * 13 + j * 3) * 0.5));
        const tb = dl + ul;
        remaining -= tb;
        const pkts = Math.round(tb / (800 + seededRandom(idx * 17) * 1200));
        const flows = Math.round(pkts / (20 + Math.floor(seededRandom(idx * 19) * 80)));

        return {
          ndpiId: app.ndpiId,
          name: app.name,
          category: app.category,
          downloadBytes: dl,
          uploadBytes: ul,
          totalBytes: tb,
          packets: pkts,
          flows,
          percentage: 0,
        };
      });

      const actualTotal = apps.reduce((s, a) => s + a.totalBytes, 0);
      apps.forEach((a) => {
        a.percentage = parseFloat(((a.totalBytes / actualTotal) * 100).toFixed(1));
      });
      apps.sort((a, b) => b.totalBytes - a.totalBytes);

      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - 30);
      const periodEnd = new Date();

      return jsonResponse({
        ipAddress: ip,
        subscriber: {
          id: sub.subscriberId,
          name: sub.subscriberName,
          planName: sub.planName,
        },
        apps,
        totalBytes: actualTotal,
        totalPackets: apps.reduce((s, a) => s + a.packets, 0),
        totalFlows: apps.reduce((s, a) => s + a.flows, 0),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }

    // ── QoS Rules (Database CRUD) ───────────────────────────

    // GET /api/rules — List all rules
    if (path === "/api/rules" && method === "GET") {
      const rules = await db.ndpiAppRule.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        include: { app: true },
      });
      return jsonResponse({ rules, count: rules.length });
    }

    // POST /api/rules — Create a new rule (supports category-based rules)
    if (path === "/api/rules" && method === "POST") {
      const body = await req.json();

      // Resolve category to ndpiIds if category is provided
      let resolvedNdpiIds: number[] = body.appNdpiIds || [];
      let primaryNdpiId = body.appNdpiId || 0;

      if (body.category) {
        const categoryName = body.category;
        const categoryApps = NDPI_APPS.filter(
          (app) => app.category.toLowerCase() === categoryName.toLowerCase()
        );

        if (categoryApps.length === 0) {
          return jsonResponse({ error: `Category "${categoryName}" not found. Available: ${Object.keys(CATEGORIES).join(", ")}` }, 400);
        }

        resolvedNdpiIds = categoryApps.map((app) => app.ndpiId);
        primaryNdpiId = categoryApps[0].ndpiId;

        // Merge with any manually specified ndpiIds
        if (body.appNdpiIds && Array.isArray(body.appNdpiIds)) {
          for (const id of body.appNdpiIds) {
            if (!resolvedNdpiIds.includes(id)) {
              resolvedNdpiIds.push(id);
            }
          }
        }
      }

      const rule = await db.ndpiAppRule.create({
        data: {
          name: body.name,
          description: body.description || "",
          appNdpiId: primaryNdpiId,
          appNdpiIds: JSON.stringify(resolvedNdpiIds),
          action: body.action || "BLOCK",
          scope: body.scope || "GLOBAL",
          targetPlanId: body.targetPlanId || null,
          targetSubscriberId: body.targetSubscriberId || null,
          targetIpRange: body.targetIpRange || "",
          rateLimitMbps: body.rateLimitMbps || 0,
          priority: body.priority || 100,
          enabled: body.enabled !== undefined ? body.enabled : true,
        },
        include: { app: true },
      });

      return jsonResponse({
        rule,
        message: body.category
          ? `Rule created for category "${body.category}" with ${resolvedNdpiIds.length} apps`
          : "Rule created successfully",
        matchedApps: body.category ? resolvedNdpiIds.length : undefined,
      }, 201);
    }

    // PUT /api/rules/:id — Update a rule
    const ruleUpdateMatch = path.match(/^\/api\/rules\/([^/]+)$/);
    if (ruleUpdateMatch && method === "PUT") {
      const ruleId = ruleUpdateMatch[1];
      const body = await req.json();

      // Check rule exists
      const existing = await db.ndpiAppRule.findUnique({ where: { id: ruleId } });
      if (!existing) {
        return jsonResponse({ error: "Rule not found" }, 404);
      }

      const updateData: any = { updatedAt: new Date() };
      const allowedFields = [
        "name", "description", "appNdpiId", "appNdpiIds", "action", "scope",
        "targetPlanId", "targetSubscriberId", "targetIpRange", "rateLimitMbps",
        "priority", "enabled", "hitCount", "lastHitAt", "nftHandle", "nftComment",
      ];
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          updateData[field] = field === "appNdpiIds" ? JSON.stringify(body[field]) : body[field];
        }
      }

      const rule = await db.ndpiAppRule.update({
        where: { id: ruleId },
        data: updateData,
        include: { app: true },
      });

      return jsonResponse({ rule, message: "Rule updated successfully" });
    }

    // DELETE /api/rules/:id — Delete a rule
    const ruleDeleteMatch = path.match(/^\/api\/rules\/([^/]+)$/);
    if (ruleDeleteMatch && method === "DELETE") {
      const ruleId = ruleDeleteMatch[1];

      const existing = await db.ndpiAppRule.findUnique({ where: { id: ruleId } });
      if (!existing) {
        return jsonResponse({ error: "Rule not found" }, 404);
      }

      await db.ndpiAppRule.delete({ where: { id: ruleId } });

      return jsonResponse({ message: "Rule deleted successfully", deletedId: ruleId });
    }

    // ── Seed Endpoint ───────────────────────────────────────
    if (path === "/api/seed" && method === "POST") {
      await seedDatabase();
      const totalApps = await db.ndpiApp.count();
      return jsonResponse({
        message: "Database seeded successfully",
        totalApps,
        categories: Object.keys(CATEGORIES).length,
      });
    }

    // ── 404 Not Found ───────────────────────────────────────
    return jsonResponse({ error: "Not found", path }, 404);

  } catch (err: any) {
    console.error("[ndpi-service] Error:", err);
    return jsonResponse(
      { error: "Internal server error", message: err.message },
      500
    );
  }
}

// ─── Start Server ────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch: handleRequest,
});

console.log(`[ndpi-service] nDPI Application Awareness Service running on port ${PORT}`);
console.log(`[ndpi-service] Health: http://0.0.0.0:${PORT}/health`);
console.log(`[ndpi-service] Apps:   http://0.0.0.0:${PORT}/api/apps (${NDPI_APPS.length} protocols)`);
console.log(`[ndpi-service] Categories: http://0.0.0.0:${PORT}/api/categories (${Object.keys(CATEGORIES).length} categories)`);
console.log(`[ndpi-service] Stats:  http://0.0.0.0:${PORT}/api/stats`);
console.log(`[ndpi-service] Subscribers: http://0.0.0.0:${PORT}/api/subscribers`);
console.log(`[ndpi-service] Rules:  http://0.0.0.0:${PORT}/api/rules`);
console.log(`[ndpi-service] Seed:   POST http://0.0.0.0:${PORT}/api/seed`);

// Auto-seed on startup
seedDatabase().then(() => {
  console.log(`[ndpi-service] Auto-seed completed`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[ndpi-service] Shutting down...");
  db.$disconnect();
  server.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[ndpi-service] Shutting down...");
  db.$disconnect();
  server.stop();
  process.exit(0);
});
