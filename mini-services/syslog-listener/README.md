# syslog-listener

Cryptsk Nexus **Monitoring & Diagnostics** mini-service: a UDP syslog listener that
ingests RFC3164 / RFC5424 lines from network devices (NAS, OLT, switches, firewalls —
anything that can send syslog) and batch-inserts them into the platform's
`syslog_entries` table (PostgreSQL 18, via the project Prisma client).

## What it does

- Listens on **UDP `0.0.0.0:30514`**.
- Parses the `<PRI>` prefix into `facility` / `severity`, then best-effort extracts
  timestamp, `host`, `tag` and message (RFC3164 and RFC5424 layouts). Parsing is
  **tolerant and never throws** — anything it cannot parse stays verbatim in `message`.
- The real UDP sender IP is stored in `source_ip`.
- Buffers incoming messages and flushes to the DB **every 2 seconds or 50 messages**,
  whichever comes first (`syslog-listener: stored N messages` on each flush).
- Failed flushes are re-queued (bounded) so transient DB hiccups don't drop logs.
- Handles `SIGINT`/`SIGTERM` with a graceful final flush.

## Run

```bash
cd mini-services/syslog-listener
bun run dev        # DATABASE_URL is pinned in package.json; bun --hot = auto restart
```

Log output goes to stdout (run detached, e.g. redirect to /tmp/syslog-listener.log).

## Quick test

```bash
echo -n "<34>Oct 11 22:14:15 myhost sshd[123]: Accepted password for user from 10.0.0.5" \
  | nc -u -w1 127.0.0.1 30514
```

(`PRI 34` → facility 4 / severity 2 = crit. If `nc` is unavailable, any 3-line bun
UDP send script works: `dgram.createSocket("udp4").send(buf, 30514, "127.0.0.1")`.)

Verify it landed — either via the API or straight from Prisma:

```bash
bun -e 'import { db } from "/home/z/my-project/src/lib/db";
db.syslogEntry.findFirst({ orderBy: { receivedAt: "desc" } }).then(async r => { console.log(r); await db.$disconnect(); })'
```

or `GET /api/monitoring/syslog?hours=1` in the main app (RBAC: `monitoring.list`).

## Point devices at it

Network devices / rsyslog / syslog-ng forwards can ship to `<host>:30514/udp`.
The main app also offers an HTTP ingest: `POST /api/monitoring/syslog` with
`Content-Type: text/plain` and raw syslog lines as the body.
