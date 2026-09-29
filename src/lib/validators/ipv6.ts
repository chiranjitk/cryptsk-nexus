// Shared IPv6 validation utilities for the ISP platform

const IPV6_REGEX = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;
const IPV6_CIDR_REGEX = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|::)\/\d{1,3}$/;
const DUID_REGEX = /^([0-9a-fA-F]{1,2}:){4,}[0-9a-fA-F]{1,2}$/;

export function isValidIPv6(address: string, allowEmpty = true): boolean {
  if (!address || address.trim() === '') return allowEmpty;
  return IPV6_REGEX.test(address.trim());
}

export function isValidIPv6CIDR(cidr: string): boolean {
  if (!cidr || cidr.trim() === "") return true;
  if (!IPV6_CIDR_REGEX.test(cidr.trim())) return false;
  const prefixLength = parseInt(cidr.split("/")[1]);
  return prefixLength >= 1 && prefixLength <= 128;
}

export function isValidIPv6Prefix(prefix: string): boolean {
  if (!prefix || prefix.trim() === "") return true;
  return isValidIPv6CIDR(prefix);
}

export function isValidDUID(duid: string): boolean {
  if (!duid || duid.trim() === "") return true;
  return DUID_REGEX.test(duid.trim());
}

export function isValidIPv6PrefixLength(length: number): boolean {
  return [48, 56, 60, 64, 80, 96, 112, 120, 128].includes(length);
}

export function isValidAssignmentMode(mode: string): boolean {
  return ["SLAAC", "DHCPV6", "STATIC", "PD_ONLY"].includes(mode);
}
