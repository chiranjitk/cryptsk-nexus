#!/usr/bin/env python3
"""
Adapt StaySuite captive portal API routes to CRYPTSK Nexus.

Transforms applied (in order):
  1. Replace db model accesses for renamed CRYPTSK models
  2. Replace SQL table identifiers in raw SQL strings
  3. Replace `propertyId` -> `partnerId` everywhere (variables/keys/JSON)
  4. Replace `db.property` -> `db.partner`
  5. Replace `Property` (model name) -> `Partner` (only in Prisma calls)
  6. Strip all `tenantId` references (destructuring, keys in object literals,
     shorthand in `where:` clauses, raw SQL WHERE/AND clauses)
  7. Fix audit import path: `from '@/lib/audit'` -> `from '@/lib/audit/middleware'`
  8. Fix `captivePortal:` -> `CaptivePortal:` in Prisma `include`/`select`
  9. Remove `property:` include blocks (CRYPTSK PortalMapping has no partner relation)
"""
import re
import sys
import os

ROOT = '/home/z/my-project/src/app/api'
TARGETS = [
    'wifi/portal',
    'wifi/portal-whitelist',
    'wifi/walled-garden',
    'captive-redirect/metrics',
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def strip_tenant_id_destructuring(content: str) -> str:
    """Remove `const { tenantId, userId, ... } = session;` lines."""
    # Match `const { ... tenantId ... } = X;` (one-line)
    content = re.sub(
        r'const\s*\{[^}]*\btenantId\b[^}]*\}\s*=\s*[^;]+;[ \t]*\n',
        '',
        content,
    )
    # Match `const tenantId = X;`
    content = re.sub(r'const\s+tenantId\s*=\s*[^;]+;[ \t]*\n', '', content)
    # Match `const effectiveTenantId = X;`
    content = re.sub(r'const\s+effectiveTenantId\s*=\s*[^;]+;[ \t]*\n', '', content)
    return content


def strip_tenant_id_keys(content: str) -> str:
    """Remove `tenantId: value,` and `tenantId,` shorthand from object literals."""
    # Remove `tenantId: <value>,` (multiline-aware across object literals)
    # We match greedily up to the next `,` or `}` or newline.
    content = re.sub(
        r'\btenantId\s*:\s*[^,}\n]+,?[ \t]*\n',
        '',
        content,
    )
    # Remove inline `tenantId: <value>,` (no newline)
    content = re.sub(r'\btenantId\s*:\s*[^,}\n]+,?', '', content)
    # Remove standalone `tenantId,` lines (shorthand)
    content = re.sub(r'^[ \t]*tenantId,[ \t]*\n', '', content, flags=re.MULTILINE)
    return content


def strip_tenant_id_in_where(content: str) -> str:
    """Remove `tenantId` shorthand inside `where: { ... }` clauses."""
    # Pattern: `where: { id: X, tenantId }` -> `where: { id: X }`
    # We remove `, tenantId` and `tenantId,` inside object literals.
    content = re.sub(r',\s*tenantId\b', '', content)
    content = re.sub(r'\btenantId\s*,\s*', '', content)
    return content


def strip_tenant_id_in_raw_sql(content: str) -> str:
    """Remove tenantId references in raw SQL strings."""
    # Remove `AND (X."tenantId" = ${tenantId}::uuid)` (whole line)
    content = re.sub(
        r'^[ \t]*AND\s*\(?\w+\."tenantId"\s*=\s*\$\{tenantId\}::uuid\)?[ \t]*\n',
        '',
        content,
        flags=re.MULTILINE,
    )
    # Remove `AND X."tenantId" = Y."tenantId"` (whole line)
    content = re.sub(
        r'^[ \t]*AND\s*\w+\."tenantId"\s*=\s*\w+\."tenantId"[ \t]*\n',
        '',
        content,
        flags=re.MULTILINE,
    )
    # Replace `WHERE X."tenantId" = ${tenantId}::uuid` -> `WHERE 1=1`
    content = re.sub(
        r'WHERE\s+\w+\."tenantId"\s*=\s*\$\{tenantId\}::uuid',
        'WHERE 1=1',
        content,
        flags=re.IGNORECASE,
    )
    # Replace `WHERE "tenantId" = ${tenantId}::uuid` -> `WHERE 1=1`
    content = re.sub(
        r'WHERE\s+"tenantId"\s*=\s*\$\{tenantId\}::uuid',
        'WHERE 1=1',
        content,
        flags=re.IGNORECASE,
    )
    # Remove `JOIN "Tenant" t ON t.id = X."tenantId"`
    content = re.sub(
        r'\s*JOIN\s+"Tenant"\s+t\s+ON\s+t\.id\s*=\s*\w+\."tenantId"',
        '',
        content,
        flags=re.IGNORECASE,
    )
    return content


def fix_session_refs(content: str) -> str:
    """Replace `session.tenantId` and `user.tenantId` with 'default'."""
    content = re.sub(r'session\.tenantId', "'default'", content)
    content = re.sub(r'user\.tenantId', "'default'", content)
    # portal.tenantId / pm.tenantId — set to undefined so `if (X.tenantId)` becomes falsy
    content = re.sub(r'portal\.tenantId', 'undefined', content)
    return content


def remove_property_includes(content: str) -> str:
    """
    Remove `property: { select: { ... } },` from `include: { ... }` clauses.
    StaySuite's PortalMapping has a property relation; CRYPTSK's does not.
    """
    # Match `property: { ... },` (multi-line, balanced one level deep)
    # Use a non-greedy approach to find the closing `},` after `property: {`.
    pattern = re.compile(
        r'\n[ \t]*property\s*:\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\},?',
        re.DOTALL,
    )
    content = pattern.sub('', content)
    return content


def fix_captive_portal_relation_case(content: str) -> str:
    """
    CRYPTSK uses Capitalized relation field names.
    In Prisma `include`/`select` clauses:
      `captivePortal:` -> `CaptivePortal:`
      `portalMappings:` -> `PortalMapping:`
      `authMethods:` -> `PortalAuthentication:`
      `portalPages:` -> `PortalPage:`
      `designHistory:` -> `designHistory:` (already camelCase, ok)
      `records:` -> `records:` (already camelCase, ok)
    """
    # Only inside include/select blocks. For safety, just do global replace
    # of these specific patterns where they're keys (followed by `:`).
    content = re.sub(r'\bcaptivePortal\s*:', 'CaptivePortal:', content)
    content = re.sub(r'\bportalMappings\s*:', 'PortalMapping:', content)
    content = re.sub(r'\bauthMethods\s*:', 'PortalAuthentication:', content)
    content = re.sub(r'\bportalPages\s*:', 'PortalPage:', content)
    return content


def fix_audit_import(content: str) -> str:
    """`from '@/lib/audit'` -> `from '@/lib/audit/middleware'`."""
    return content.replace(
        "from '@/lib/audit'",
        "from '@/lib/audit/middleware'",
    )


def apply_all(content: str) -> str:
    content = fix_audit_import(content)
    # Model access renames (specific to dns-records / dns-zones / dns-redirects / templates)
    # Apply globally — these names are unique and won't conflict
    content = re.sub(r'\bdb\.dnsZone\b', 'db.portalDnsZone', content)
    content = re.sub(r'\bdb\.dnsRedirectRule\b', 'db.portalDnsRedirect', content)
    content = re.sub(r'\bdb\.portalTemplate\b', 'db.portalDesignTemplate', content)
    # dnsRecord rename ONLY inside dns-records routes (handled by caller flag)
    # Table names in raw SQL
    content = content.replace('"DnsRedirectRule"', '"PortalDnsRedirect"')
    content = content.replace('"DnsZone"', '"PortalDnsZone"')
    content = content.replace('"DnsRecord"', '"PortalDnsRecord"')
    # db.property -> db.partner
    content = re.sub(r'\bdb\.property\b', 'db.partner', content)
    # propertyId -> partnerId (everywhere)
    content = re.sub(r'\bpropertyId\b', 'partnerId', content)
    content = re.sub(r'\bpropertyName\b', 'partnerName', content)
    content = re.sub(r'\bpropertyFilter\b', 'partnerFilter', content)
    # `Property` model name (only in Prisma calls / type annotations)
    # Use a context-aware replace: `Property>` `Property)` `Property,` `Property}` `Property[` `Property|`
    content = re.sub(r'\bProperty(?=[\s>),\]\}|])', 'Partner', content)
    # tenantId handling
    content = strip_tenant_id_destructuring(content)
    content = strip_tenant_id_keys(content)
    content = strip_tenant_id_in_where(content)
    content = strip_tenant_id_in_raw_sql(content)
    content = fix_session_refs(content)
    # Relation field casing in include/select
    content = fix_captive_portal_relation_case(content)
    # Remove property include blocks
    content = remove_property_includes(content)
    return content


def main():
    for sub in TARGETS:
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for dirpath, _, files in os.walk(base):
            for f in files:
                if f != 'route.ts':
                    continue
                path = os.path.join(dirpath, f)
                with open(path, 'r') as fh:
                    content = fh.read()
                # Special case: dns-records route needs db.dnsRecord rename
                is_dns_records = 'dns-records' in path
                original = content
                content = apply_all(content)
                if is_dns_records:
                    content = re.sub(r'\bdb\.dnsRecord\b', 'db.portalDnsRecord', content)
                with open(path, 'w') as fh:
                    fh.write(content)
                if content != original:
                    print(f'  adapted: {path}')


if __name__ == '__main__':
    main()
