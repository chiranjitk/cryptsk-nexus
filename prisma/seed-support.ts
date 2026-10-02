// ═══════════════════════════════════════════════════════════════
// Seed demo data for SUPPORT (Technicians + Complaints) — idempotent:
//   • Technicians: always UPSERTed by fixed emails/userIds (never
//     deleted, so complaints referencing them keep working).
//   • Complaints: skipped when [DEMO]-tagged complaints already
//     exist (FORCE=1 to wipe demo complaints + reseed).
// Run: bun run db:seed-support
//
// Creates:
//   • 7 field technicians (+ User accounts, role TECHNICIAN):
//     3 available / 2 busy / 1 offline / 1 on-leave, ratings 4.2–4.9
//   • 11 complaints linked to REAL subscribers (CMP-YYYYMMDD-XXXX
//     ticket numbers, P1–P4 priorities, SLA per priority, mixed
//     OPEN/ASSIGNED/IN_PROGRESS/RESOLVED/CLOSED, assigned to the
//     seeded technicians)
//   • 3 discussion comments (by the admin user)
// ═══════════════════════════════════════════════════════════════
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const db = new PrismaClient();

// process is read via globalThis so this file type-checks clean under scoped
// tsconfigs with "types": [] (project doctrine) as well as with node types.
type ProcLike = { env?: Record<string, string | undefined>; exit?: (code?: number) => void };
const proc = (globalThis as { process?: ProcLike }).process;
const FORCE = proc?.env?.FORCE === "1";
const DEMO_TAG = "[DEMO]";
const TECH_PASSWORD = "Tech@2026";

type ComplaintTypeValue =
  | "NO_INTERNET" | "SLOW_SPEED" | "CABLE_CUT" | "WIFI_ISSUE" | "PLAN_CHANGE"
  | "BILLING_QUERY" | "VOIP_ISSUE" | "IPTV_ISSUE" | "NEW_CONNECTION" | "OTHER";
type ComplaintPriorityValue = "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM" | "P4_LOW";
type ComplaintStatusValue = "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600000);
}

// SLA hours mirror the page's PRIORITY_SLA map exactly
const PRIORITY_SLA: Record<ComplaintPriorityValue, number> = {
  P1_CRITICAL: 4,
  P2_HIGH: 8,
  P3_MEDIUM: 24,
  P4_LOW: 48,
};

// ─── Technicians: 3 available / 2 busy / 1 offline / 1 on-leave ──
interface TechSpec {
  email: string;
  name: string;
  phone: string;
  status: "available" | "busy" | "offline" | "on-leave";
  skills: string[];
  currentLocation: string;
  rating: number;
  totalResolved: number;
  avgResolutionTime: number; // minutes
  daysOff: string[];
  monthlySalary: number;
  basicSalary: number;
  certifications: Array<{ name: string; issuer: string; validUntil: string; certificateNumber: string }> | null;
}

const TECHS: TechSpec[] = [
  { email: "tech.arjun@cryptsk.com",  name: "Arjun Nair",      phone: "9800021001", status: "available", skills: ["Fiber Splicing", "ONT Setup"],          currentLocation: "Salt Lake Sector V",  rating: 4.9, totalResolved: 342, avgResolutionTime: 95,  daysOff: ["sunday"],  monthlySalary: 31000, basicSalary: 20000, certifications: [{ name: "FTTH Splicing Level-3", issuer: "STL Academy", validUntil: "2026-12-31", certificateNumber: "STL-FTTH-88231" }] },
  { email: "tech.vikram@cryptsk.com", name: "Vikram Singh",    phone: "9800021002", status: "available", skills: ["Router Config", "Network Debugging"],   currentLocation: "New Town Action Area", rating: 4.7, totalResolved: 287, avgResolutionTime: 120, daysOff: ["tuesday"], monthlySalary: 28000, basicSalary: 18000, certifications: null },
  { email: "tech.sana@cryptsk.com",   name: "Sana Sheikh",     phone: "9800021003", status: "available", skills: ["WiFi Setup", "Customer Service"],       currentLocation: "Dum Dum Cantonment",   rating: 4.8, totalResolved: 264, avgResolutionTime: 85,  daysOff: ["monday"],  monthlySalary: 26000, basicSalary: 17000, certifications: null },
  { email: "tech.manoj@cryptsk.com",  name: "Manoj Tiwari",    phone: "9800021004", status: "busy",      skills: ["Cable Laying", "Fiber Splicing"],       currentLocation: "Howrah Maidan",        rating: 4.5, totalResolved: 198, avgResolutionTime: 150, daysOff: ["sunday"],  monthlySalary: 24000, basicSalary: 16000, certifications: null },
  { email: "tech.deepa@cryptsk.com",  name: "Deepa Krishnan",  phone: "9800021005", status: "busy",      skills: ["Switch Config", "Router Config"],       currentLocation: "Salt Lake CK Block",   rating: 4.6, totalResolved: 176, avgResolutionTime: 110, daysOff: ["saturday"], monthlySalary: 27000, basicSalary: 17500, certifications: null },
  { email: "tech.imran@cryptsk.com",  name: "Imran Qureshi",   phone: "9800021006", status: "offline",   skills: ["ONT Setup", "WiFi Setup"],              currentLocation: "Barasat Court Road",   rating: 4.3, totalResolved: 143, avgResolutionTime: 130, daysOff: ["friday"],  monthlySalary: 22000, basicSalary: 15000, certifications: null },
  { email: "tech.rakesh@cryptsk.com", name: "Rakesh Yadav",    phone: "9800021007", status: "on-leave",  skills: ["Router Config", "Customer Service"],    currentLocation: "New Town Sector 2",    rating: 4.2, totalResolved: 121, avgResolutionTime: 140, daysOff: ["sunday"],  monthlySalary: 21000, basicSalary: 14500, certifications: null },
];

// ─── Complaints: 3 OPEN / 1 ASSIGNED / 2 IN_PROGRESS / 3 RESOLVED / 2 CLOSED ──
interface ComplaintSpec {
  hoursAgo: number;
  type: ComplaintTypeValue;
  priority: ComplaintPriorityValue;
  status: ComplaintStatusValue;
  techIdx: number | null; // index into TECHS
  subIdx: number;         // index into real subscribers (rotated)
  description: string;
  resolvedHoursAfter?: number; // RESOLVED/CLOSED only
  rating?: number;
  feedback?: string;
  ai?: { category: string; severity: string; cause: string; guide: string };
}

const COMPLAINTS: ComplaintSpec[] = [
  { hoursAgo: 6,  type: "NO_INTERNET",   priority: "P1_CRITICAL", status: "IN_PROGRESS", techIdx: 0, subIdx: 0,  description: "Fibre link down since morning — ONU has LOS red light, no sync at all.", ai: { category: "Connectivity", severity: "CRITICAL", cause: "LOS on ONU — likely fibre bend/cut between splitter and premises.", guide: "Check ONU RX power, trace splitter leg, re-splice if attenuation > 28 dBm." } },
  { hoursAgo: 3,  type: "SLOW_SPEED",    priority: "P2_HIGH",     status: "OPEN",        techIdx: null, subIdx: 3,  description: "Getting only 12 Mbps of the 100 Mbps plan on wired connection during evenings." } ,
  { hoursAgo: 26, type: "NO_INTERNET",   priority: "P1_CRITICAL", status: "RESOLVED",    techIdx: 1, subIdx: 6,  description: "Complete outage for two hours, router shows internet LED off.", resolvedHoursAfter: 3, rating: 5, feedback: "Fixed within SLA, technician called before arriving." },
  { hoursAgo: 10, type: "CABLE_CUT",     priority: "P2_HIGH",     status: "ASSIGNED",    techIdx: 3, subIdx: 9,  description: "Metro construction work cut the drop cable outside the building gate." },
  { hoursAgo: 30, type: "WIFI_ISSUE",    priority: "P3_MEDIUM",   status: "IN_PROGRESS", techIdx: 2, subIdx: 1,  description: "WiFi keeps dropping on 2.4 GHz every few minutes; 5 GHz not visible at all." },
  { hoursAgo: 52, type: "BILLING_QUERY", priority: "P4_LOW",      status: "OPEN",        techIdx: null, subIdx: 4,  description: "Invoice for this month shows GST amount higher than last month — please explain." },
  { hoursAgo: 74, type: "IPTV_ISSUE",    priority: "P3_MEDIUM",   status: "RESOLVED",    techIdx: 4, subIdx: 2,  description: "IPTV set-top box stuck on 'Authorising' screen after last night's storm.", resolvedHoursAfter: 9, rating: 4, feedback: "Rebooted ONT and STB, channel list refreshed. Slight delay but fine." },
  { hoursAgo: 96, type: "SLOW_SPEED",    priority: "P3_MEDIUM",   status: "CLOSED",      techIdx: 1, subIdx: 5,  description: "Speed dips to 20 Mbps after 9 PM every day for the past week.", resolvedHoursAfter: 22, rating: 5, feedback: "Congestion was on the uplink, ISP shifted our load. All good now." },
  { hoursAgo: 120, type: "PLAN_CHANGE",  priority: "P4_LOW",      status: "CLOSED",      techIdx: null, subIdx: 7, description: "Requested upgrade from 100 Mbps to 250 Mbps plan from next cycle.", resolvedHoursAfter: 6, rating: 5, feedback: "Plan change confirmed on call, activation date shared on WhatsApp." },
  { hoursAgo: 48, type: "NO_INTERNET",   priority: "P2_HIGH",     status: "RESOLVED",    techIdx: 2, subIdx: 10, description: "No internet after local power cut; PPPoE not re-connecting automatically.", resolvedHoursAfter: 5, rating: 4, feedback: "Technician reset the ONT remotely and re-provisioned credentials." },
  { hoursAgo: 14, type: "NEW_CONNECTION", priority: "P3_MEDIUM",  status: "OPEN",        techIdx: null, subIdx: 8, description: "Shifted flat within the same area — need the existing connection moved to the new address." },
];

async function main() {
  console.log("── seed-support: starting ──");

  // ─── Admin (for resolvedBy + comments) ────────────────────────
  const admin = await db.user.findUnique({ where: { email: "admin@cryptsk.com" } }) ??
    await db.user.findFirst({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } });
  if (!admin) {
    console.log("Admin user missing — run main seed first. Aborting.");
    await db.$disconnect();
    return;
  }

  // ─── Real areas (names for technician coverage tags) ──────────
  const areas = await db.area.findMany({ select: { name: true }, orderBy: { code: "asc" }, take: 4 });
  const areaNames = areas.map((a) => a.name);

  // ─── Technicians (always upserted — never deleted) ────────────
  const hashed = await hash(TECH_PASSWORD, 12);
  const techIds: Array<{ id: string; name: string }> = [];
  for (const [i, spec] of TECHS.entries()) {
    const user = await db.user.upsert({
      where: { email: spec.email },
      update: { name: spec.name, phone: spec.phone, role: "TECHNICIAN", status: "ACTIVE" },
      create: {
        email: spec.email,
        name: spec.name,
        password: hashed,
        phone: spec.phone,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });
    const tech = await db.technician.upsert({
      where: { userId: user.id },
      update: {
        name: spec.name,
        phone: spec.phone,
        email: spec.email,
        skills: JSON.stringify(spec.skills),
        areas: JSON.stringify(areaNames.length > 0 ? [areaNames[i % areaNames.length], areaNames[(i + 1) % areaNames.length]] : []),
        status: spec.status,
        currentLocation: spec.currentLocation,
        rating: spec.rating,
        totalResolved: spec.totalResolved,
        avgResolutionTime: spec.avgResolutionTime,
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
        daysOff: JSON.stringify(spec.daysOff),
        monthlySalary: spec.monthlySalary,
        bankAccountName: spec.name,
        bankAccountNumber: `5010${String(234500 + i * 7).padStart(6, "0")}912`,
        bankIfscCode: "HDFC0001234",
        paymentMode: "BANK_TRANSFER",
        compensation: JSON.stringify({ basicSalary: spec.basicSalary, hra: Math.round(spec.basicSalary * 0.4), da: 3000, allowance: 2000, deduction: 1800 }),
        certifications: spec.certifications ? JSON.stringify(spec.certifications) : "[]",
      },
      create: {
        userId: user.id,
        name: spec.name,
        phone: spec.phone,
        email: spec.email,
        skills: JSON.stringify(spec.skills),
        areas: JSON.stringify(areaNames.length > 0 ? [areaNames[i % areaNames.length], areaNames[(i + 1) % areaNames.length]] : []),
        status: spec.status,
        currentLocation: spec.currentLocation,
        rating: spec.rating,
        totalResolved: spec.totalResolved,
        avgResolutionTime: spec.avgResolutionTime,
        workingHoursStart: "09:00",
        workingHoursEnd: "18:00",
        daysOff: JSON.stringify(spec.daysOff),
        monthlySalary: spec.monthlySalary,
        bankAccountName: spec.name,
        bankAccountNumber: `5010${String(234500 + i * 7).padStart(6, "0")}912`,
        bankIfscCode: "HDFC0001234",
        paymentMode: "BANK_TRANSFER",
        compensation: JSON.stringify({ basicSalary: spec.basicSalary, hra: Math.round(spec.basicSalary * 0.4), da: 3000, allowance: 2000, deduction: 1800 }),
        certifications: spec.certifications ? JSON.stringify(spec.certifications) : "[]",
      },
      select: { id: true, name: true },
    });
    techIds.push(tech);
  }
  const statusSpread = TECHS.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  console.log(`  technicians ready: ${techIds.length} (${JSON.stringify(statusSpread)})`);

  // ─── Complaints (skip when demo complaints exist) ─────────────
  const existingDemo = await db.complaint.count({ where: { description: { contains: DEMO_TAG } } });
  if (existingDemo > 0 && !FORCE) {
    console.log(`Found ${existingDemo} demo complaints — skipping complaints (FORCE=1 to reseed).`);
    await db.$disconnect();
    return;
  }
  if (existingDemo > 0 && FORCE) {
    console.log(`FORCE=1 — wiping ${existingDemo} demo complaints (comments cascade)...`);
    await db.complaint.deleteMany({ where: { description: { contains: DEMO_TAG } } });
  }

  const subs = await db.subscriber.findMany({
    select: { id: true, code: true, name: true, areaId: true },
    orderBy: { code: "asc" },
  });
  if (subs.length < 6) {
    console.log(`Need ≥6 subscribers to attach complaints (found ${subs.length}) — run main seed first. Aborting.`);
    await db.$disconnect();
    return;
  }

  // Ticket numbers in the API's exact format: CMP-YYYYMMDD-XXXX
  // (high 95xx series so they never collide with same-day API counters)
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tickets: Array<{ id: string; ticketNumber: string; status: string }> = [];

  for (const [i, spec] of COMPLAINTS.entries()) {
    const sub = subs[spec.subIdx % subs.length];
    const createdAt = hoursAgo(spec.hoursAgo);
    const slaHours = PRIORITY_SLA[spec.priority];
    const slaDeadline = new Date(createdAt.getTime() + slaHours * 3600000);
    const isDone = spec.status === "RESOLVED" || spec.status === "CLOSED";
    const resolvedAt = isDone && spec.resolvedHoursAfter
      ? new Date(createdAt.getTime() + spec.resolvedHoursAfter * 3600000)
      : null;
    const ticketNumber = `CMP-${dateStr}-${String(9501 + i).padStart(4, "0")}`;

    const complaint = await db.complaint.upsert({
      where: { ticketNumber },
      update: {},
      create: {
        ticketNumber,
        subscriberId: sub.id,
        areaId: sub.areaId ?? null,
        type: spec.type,
        priority: spec.priority,
        description: `${spec.description} ${DEMO_TAG}`.trim(),
        assignedToId: spec.techIdx !== null ? techIds[spec.techIdx].id : null,
        status: spec.status,
        slaHours,
        slaDeadline,
        resolutionNotes: resolvedAt ? "Issue verified fixed on site; subscriber confirmed working before closing." : "",
        resolvedAt,
        resolvedById: resolvedAt ? admin.id : null,
        customerRating: spec.rating ?? null,
        customerFeedback: spec.feedback ?? "",
        aiCategory: spec.ai?.category ?? "",
        aiSeverity: spec.ai?.severity ?? "",
        aiProbableCause: spec.ai?.cause ?? "",
        aiResolutionGuide: spec.ai?.guide ?? "",
        createdAt,
        updatedAt: resolvedAt ?? createdAt,
      },
      select: { id: true, ticketNumber: true, status: true },
    });
    tickets.push(complaint);
  }
  const complaintSpread = tickets.reduce<Record<string, number>>((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  console.log(`  complaints created: ${tickets.length} (${JSON.stringify(complaintSpread)})`);

  // ─── Discussion comments on a few tickets ─────────────────────
  const assignedTicket = tickets.find((t) => t.status === "ASSIGNED");
  const progressTicket = tickets.find((t) => t.status === "IN_PROGRESS");
  const closedTicket = tickets.find((t) => t.status === "CLOSED");
  const comments: Array<{ ticket: { id: string; ticketNumber: string } | undefined; message: string }> = [
    { ticket: assignedTicket, message: "Dispatched to Manoj Tiwari — cable-laying crew rerouted for the metro work zone." },
    { ticket: progressTicket, message: "Subscriber confirmed LOS; splicing kit booked for today's second slot." },
    { ticket: closedTicket, message: "Uplink congestion cleared after load rebalance; closing after 24h stability." },
  ];
  let commentCount = 0;
  for (const c of comments) {
    if (!c.ticket) continue;
    await db.complaintComment.create({
      data: { complaintId: c.ticket.id, userId: admin.id, message: c.message, createdAt: hoursAgo(1) },
    });
    commentCount += 1;
  }
  console.log(`  comments created: ${commentCount}`);
  console.log(`── seed-support: done (${techIds.length} technicians, ${tickets.length} complaints) ──`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ seed-support failed:", e);
  await db.$disconnect();
  proc?.exit(1);
});
