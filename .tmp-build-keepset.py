#!/usr/bin/env python3
"""Walk transitive imports from root files. Output keep set to stdout."""
import os
import re
import sys

PROJ = "/home/z/my-project"
SRC = os.path.join(PROJ, "src")

# Regex to match: from "@/<path>" or from '@/<path>' or from `@/<path>`
DQ = '"'
SQ = "'"
BT = '`'
IMPORT_RE = re.compile(r'from\s+[' + re.escape(DQ + SQ + BT) + r']@/([^' + re.escape(DQ + SQ + BT) + r']+)[' + re.escape(DQ + SQ + BT) + r']')

# Skip comment lines
COMMENT_RE = re.compile(r'^\s*(//|\*|/\*)')


def resolve(rel: str):
    """Resolve @/<rel> to absolute path with extension."""
    candidates = []
    for ext in (".ts", ".tsx", ".css", ".js", ".jsx"):
        candidates.append(os.path.join(SRC, rel + ext))
    # index.{ts,tsx}
    for ix in ("index.ts", "index.tsx", "index.js"):
        candidates.append(os.path.join(SRC, rel, ix))
    for c in candidates:
        if os.path.isfile(c):
            return c
    return None


def main(roots):
    keep = set()
    seen = set()
    queue = list(roots)
    for r in roots:
        keep.add(r)
    while queue:
        f = queue.pop(0)
        if f in seen:
            continue
        seen.add(f)
        if not os.path.isfile(f):
            continue
        try:
            with open(f, "r", encoding="utf-8", errors="ignore") as fh:
                content = fh.read()
        except Exception:
            continue
        # find all from "@/..." occurrences, ignoring comment lines
        for line in content.splitlines():
            if COMMENT_RE.match(line):
                continue
            # strip inline comments — naive: cut at //
            if "//" in line and "from" in line:
                # only cut if // is after the from clause
                idx_from = line.find("from")
                idx_comment = line.find("//")
                if idx_comment > idx_from and idx_from >= 0:
                    line = line[:idx_comment]
            for m in IMPORT_RE.finditer(line):
                rel = m.group(1)
                resolved = resolve(rel)
                if resolved and resolved not in keep:
                    keep.add(resolved)
                    queue.append(resolved)
    for f in sorted(keep):
        print(f)


if __name__ == "__main__":
    roots = []
    for line in open("/tmp/roots.txt"):
        line = line.strip()
        if line:
            roots.append(line)
    main(roots)
