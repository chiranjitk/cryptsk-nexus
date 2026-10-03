/**
 * Invoice template merge-field engine.
 *
 * Template types: USER | PARTNER | CUSTOM
 * ("Partner" is this product's term for zone-level / partner billing.)
 *
 * Tokens use {CamelCase} syntax and are replaced case-sensitively.
 * Unknown tokens render as an empty string so drafts never leak raw braces.
 */

export type MergeFieldType = "text" | "money" | "date" | "block";

export interface MergeFieldDef {
  token: string;
  label: string;
  type: MergeFieldType;
}

export interface MergeFieldGroup {
  group: string;
  fields: MergeFieldDef[];
}

export const MERGE_FIELD_GROUPS: MergeFieldGroup[] = [
  {
    group: "Customer",
    fields: [
      { token: "Name", label: "Customer name", type: "text" },
      { token: "Username", label: "Login / account id", type: "text" },
      { token: "Address", label: "Billing address", type: "text" },
      { token: "City", label: "City", type: "text" },
      { token: "State", label: "State", type: "text" },
      { token: "Zip", label: "Postal code", type: "text" },
      { token: "Phone", label: "Phone", type: "text" },
      { token: "Email", label: "Email", type: "text" },
    ],
  },
  {
    group: "Invoice",
    fields: [
      { token: "InvoiceNo", label: "Invoice number", type: "text" },
      { token: "InvoiceDate", label: "Invoice date", type: "date" },
      { token: "DueDate", label: "Due date", type: "date" },
      { token: "BillingPeriod", label: "Billing period", type: "text" },
      { token: "Status", label: "Invoice status", type: "text" },
      { token: "InvoiceType", label: "Invoice type (USER / PARTNER / CUSTOM)", type: "text" },
      { token: "PlanName", label: "Plan name", type: "text" },
      { token: "PlanValidity", label: "Plan validity", type: "text" },
      { token: "DataTransfer", label: "Data transfer quota", type: "text" },
      { token: "ExpireDate", label: "Service expiry date", type: "date" },
      { token: "IPAddress", label: "IP address", type: "text" },
      { token: "MACAddress", label: "MAC address", type: "text" },
    ],
  },
  {
    group: "Amounts",
    fields: [
      { token: "SubTotal", label: "Sub total", type: "money" },
      { token: "Discount", label: "Discount", type: "money" },
      { token: "TaxPercent", label: "Tax percent", type: "text" },
      { token: "TaxAmount", label: "Tax amount", type: "money" },
      { token: "GrandTotal", label: "Grand total", type: "money" },
      { token: "AmountPaid", label: "Amount paid", type: "money" },
      { token: "BalanceDue", label: "Balance due", type: "money" },
      { token: "AmountInWords", label: "Grand total in words", type: "text" },
      { token: "TaxInWords", label: "Tax amount in words", type: "text" },
    ],
  },
  {
    group: "Payments",
    fields: [
      { token: "PaymentMode", label: "Last payment mode", type: "text" },
      { token: "PaymentDate", label: "Last payment date", type: "date" },
      { token: "PaymentRef", label: "Last payment reference", type: "text" },
    ],
  },
  {
    group: "ISP Branding",
    fields: [
      { token: "IspName", label: "ISP name", type: "text" },
      { token: "IspAddress", label: "ISP address", type: "text" },
      { token: "IspPhone", label: "ISP phone", type: "text" },
      { token: "IspEmail", label: "ISP email", type: "text" },
      { token: "IspWebsite", label: "ISP website", type: "text" },
      { token: "IspGstIn", label: "ISP GSTIN", type: "text" },
      { token: "IspLogoBlock", label: "Logo image or monogram (HTML)", type: "block" },
      { token: "IspSignature", label: "Authorised signatory", type: "text" },
    ],
  },
  {
    group: "Blocks",
    fields: [
      { token: "LineItemsTable", label: "Line items table (HTML)", type: "block" },
      { token: "PaymentHistory", label: "Payment history table (HTML)", type: "block" },
      { token: "TaxSummaryTable", label: "Tax summary table (HTML)", type: "block" },
    ],
  },
];

export const MERGE_TOKENS: string[] = MERGE_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.token));

/* ────────────────────────── formatters ────────────────────────── */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o > 0 ? " " + ONES[o] : "");
}

/** Converts a number to Indian-format words (Crore / Lakh / Thousand + Paise). */
export function numberToIndianWords(input: number): string {
  const negative = input < 0;
  const abs = Math.abs(input);
  let whole = Math.floor(abs);
  const paise = Math.round((abs - whole) * 100);
  const parts: string[] = [];
  if (whole >= 10000000) {
    const crore = Math.floor(whole / 10000000);
    whole %= 10000000;
    parts.push(numberToIndianWords(crore).replace(/ Only$/, "") + " Crore");
  }
  if (whole >= 100000) {
    const lakh = Math.floor(whole / 100000);
    whole %= 100000;
    parts.push(twoDigits(lakh) + " Lakh");
  }
  if (whole >= 1000) {
    const thousand = Math.floor(whole / 1000);
    whole %= 1000;
    parts.push(twoDigits(thousand) + " Thousand");
  }
  if (whole >= 100) {
    const hundred = Math.floor(whole / 100);
    whole %= 100;
    parts.push(ONES[hundred] + " Hundred");
  }
  if (whole > 0) parts.push(parts.length ? "and " + twoDigits(whole) : twoDigits(whole));
  let words = parts.length ? parts.join(" ") : "Zero";
  if (negative) words = "Minus " + words;
  if (paise > 0) words += " and " + twoDigits(paise) + " Paise";
  return words + " Only";
}

/** Formats an amount with Indian digit grouping, e.g. ₹1,23,456.78 */
export function formatMoneyIN(amount: number | string | null | undefined, symbol = "\u20B9"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : (amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const neg = safe < 0;
  const abs = Math.abs(safe);
  const [intPart, decPart] = abs.toFixed(2).split(".");
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return `${neg ? "-" : ""}${symbol}${grouped}.${decPart}`;
}

/** Formats a date as DD-MMM-YYYY (e.g. 05-Feb-2026). */
export function formatDateIN(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

/** Escapes a value for safe interpolation into HTML. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ────────────────────────── sample data types ────────────────────────── */

export interface MergeLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface MergePayment {
  date: string;
  mode: string;
  reference: string;
  amount: number;
}

export interface MergeInvoiceData {
  invoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  billingPeriod: string;
  status: string;
  invoiceType: string;
  customer: {
    name: string;
    username: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    email: string;
  };
  plan: {
    name: string;
    validity: string;
    dataTransfer: string;
    expireDate: string;
    ipAddress: string;
    macAddress: string;
  };
  amounts: {
    subTotal: number;
    discount: number;
    taxPercent: number;
    taxAmount: number;
    grandTotal: number;
    amountPaid: number;
    balanceDue: number;
    symbol: string;
  };
  lineItems: MergeLineItem[];
  payments: MergePayment[];
  notes?: string;
}

export interface MergeIspData {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  logoUrl: string;
  signatureName: string;
}

/* ────────────────────────── block renderers ────────────────────────── */

export function renderLineItemsTable(items: MergeLineItem[], symbol = "\u20B9"): string {
  const rows = items.length
    ? items
    : [{ description: "Service charges", quantity: 1, unitPrice: 0, amount: 0 }];
  const body = rows
    .map(
      (it) =>
        `<tr>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;">${esc(it.description)}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${it.quantity}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatMoneyIN(it.unitPrice, symbol)}</td>` +
        `<td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatMoneyIN(it.amount, symbol)}</td>` +
        `</tr>`,
    )
    .join("");
  const th = (t: string, align = "left") =>
    `<th style="padding:9px 12px;background:#f1f5f9;border-bottom:2px solid #cbd5e1;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#475569;text-align:${align};">${t}</th>`;
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:13px;color:#111827;">` +
    `<thead><tr>${th("Description")}${th("Qty", "center")}${th("Unit Price", "right")}${th("Amount", "right")}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

export function renderPaymentHistory(payments: MergePayment[], symbol = "\u20B9"): string {
  if (!payments.length) {
    return `<div style="font-size:12px;color:#94a3b8;padding:6px 0;">No payments recorded.</div>`;
  }
  const body = payments
    .map(
      (p) =>
        `<tr>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${formatDateIN(p.date)}</td>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${esc(p.mode)}</td>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;">${esc(p.reference)}</td>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;color:#059669;">${formatMoneyIN(p.amount, symbol)}</td>` +
        `</tr>`,
    )
    .join("");
  const th = (t: string, align = "left") =>
    `<th style="padding:7px 12px;background:#f9fafb;border-bottom:2px solid #e5e7eb;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#6b7280;text-align:${align};">${t}</th>`;
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:12px;color:#111827;">` +
    `<thead><tr>${th("Date")}${th("Mode")}${th("Reference")}${th("Amount", "right")}</tr></thead>` +
    `<tbody>${body}</tbody></table>`
  );
}

export function renderTaxSummaryTable(a: MergeInvoiceData["amounts"], symbol = "\u20B9"): string {
  const taxable = Math.max(0, a.subTotal - a.discount);
  const row = (label: string, value: string, bold = false) =>
    `<tr>` +
    `<td style="padding:5px 10px;border-bottom:1px solid #eef2f7;${bold ? "font-weight:600;" : ""}">${label}</td>` +
    `<td style="padding:5px 10px;border-bottom:1px solid #eef2f7;text-align:right;${bold ? "font-weight:600;" : ""}">${value}</td>` +
    `</tr>`;
  let rowsHtml = row("Taxable Value", formatMoneyIN(taxable, symbol));
  if (a.taxPercent > 0) {
    const half = a.taxPercent / 2;
    const halfAmt = +(taxable * (half / 100)).toFixed(2);
    rowsHtml += row(`CGST @ ${half}%`, formatMoneyIN(halfAmt, symbol));
    rowsHtml += row(`SGST @ ${half}%`, formatMoneyIN(a.taxAmount - halfAmt, symbol));
  } else {
    rowsHtml += row("Tax", formatMoneyIN(a.taxAmount, symbol));
  }
  return (
    `<table style="width:100%;border-collapse:collapse;font-size:12px;color:#334155;">` +
    rowsHtml +
    `</table>`
  );
}

/* ────────────────────────── merge map + renderer ────────────────────────── */

export function buildMergeMap(inv: MergeInvoiceData, isp: MergeIspData): Record<string, string> {
  const symbol = inv.amounts.symbol || "\u20B9";
  const a = inv.amounts;
  const lastPayment = inv.payments.length ? inv.payments[inv.payments.length - 1] : null;
  return {
    // Customer
    Name: esc(inv.customer.name),
    Username: esc(inv.customer.username),
    Address: esc(inv.customer.address),
    City: esc(inv.customer.city),
    State: esc(inv.customer.state),
    Zip: esc(inv.customer.zip),
    Phone: esc(inv.customer.phone),
    Email: esc(inv.customer.email),
    // Invoice
    InvoiceNo: esc(inv.invoiceNo),
    InvoiceDate: formatDateIN(inv.invoiceDate),
    DueDate: formatDateIN(inv.dueDate),
    BillingPeriod: esc(inv.billingPeriod),
    Status: esc(inv.status),
    InvoiceType: esc(inv.invoiceType),
    PlanName: esc(inv.plan.name),
    PlanValidity: esc(inv.plan.validity),
    DataTransfer: esc(inv.plan.dataTransfer),
    ExpireDate: formatDateIN(inv.plan.expireDate),
    IPAddress: esc(inv.plan.ipAddress),
    MACAddress: esc(inv.plan.macAddress),
    // Amounts
    SubTotal: formatMoneyIN(a.subTotal, symbol),
    Discount: formatMoneyIN(a.discount, symbol),
    TaxPercent: `${a.taxPercent}%`,
    TaxAmount: formatMoneyIN(a.taxAmount, symbol),
    GrandTotal: formatMoneyIN(a.grandTotal, symbol),
    AmountPaid: formatMoneyIN(a.amountPaid, symbol),
    BalanceDue: formatMoneyIN(a.balanceDue, symbol),
    AmountInWords: esc(numberToIndianWords(a.grandTotal)),
    TaxInWords: esc(numberToIndianWords(a.taxAmount)),
    // Payments
    PaymentMode: lastPayment ? esc(lastPayment.mode) : "-",
    PaymentDate: lastPayment ? formatDateIN(lastPayment.date) : "-",
    PaymentRef: lastPayment ? esc(lastPayment.reference) : "-",
    // ISP branding
    IspName: esc(isp.name),
    IspAddress: esc(isp.address),
    IspPhone: esc(isp.phone),
    IspEmail: esc(isp.email),
    IspWebsite: esc(isp.website),
    IspGstIn: esc(isp.gstin),
    IspSignature: esc(isp.signatureName || "Authorised Signatory"),
    IspLogoBlock: isp.logoUrl
      ? `<img src="${esc(isp.logoUrl)}" alt="ISP logo" style="max-height:56px;max-width:180px;object-fit:contain;margin-bottom:6px;"/>`
      : `<div style="height:52px;width:52px;border-radius:12px;background:#059669;color:#ffffff;font-weight:700;font-size:26px;display:flex;align-items:center;justify-content:center;margin-bottom:6px;">${esc((isp.name || "I").charAt(0).toUpperCase())}</div>`,
    // Blocks
    LineItemsTable: renderLineItemsTable(inv.lineItems, symbol),
    PaymentHistory: renderPaymentHistory(inv.payments, symbol),
    TaxSummaryTable: renderTaxSummaryTable(a, symbol),
  };
}

/** Replaces every {Token} with its mapped value; unknown tokens become "". */
export function renderTemplate(bodyHtml: string, map: Record<string, string>): string {
  return bodyHtml.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, token: string) =>
    Object.prototype.hasOwnProperty.call(map, token) ? map[token] : "",
  );
}

/* ────────────────────────── sample data (preview) ────────────────────────── */

export function sampleInvoiceData(): MergeInvoiceData {
  const subTotal = 2048;
  const discount = 100;
  const taxPercent = 18;
  const taxable = subTotal - discount;
  const taxAmount = +(taxable * (taxPercent / 100)).toFixed(2);
  const grandTotal = +(taxable + taxAmount).toFixed(2);
  return {
    invoiceNo: "INV-2026-000101",
    invoiceDate: "2026-02-05",
    dueDate: "2026-02-20",
    billingPeriod: "01-Feb-2026 - 28-Feb-2026",
    status: "SENT",
    invoiceType: "USER",
    customer: {
      name: "Ravi Kumar",
      username: "ravi.kumar",
      address: "12, MG Road, Indiranagar",
      city: "Bengaluru",
      state: "Karnataka",
      zip: "560038",
      phone: "+91 98450 12345",
      email: "ravi.kumar@example.com",
    },
    plan: {
      name: "Fiber 150 Mbps",
      validity: "30 days",
      dataTransfer: "Unlimited (FUP 3.3 TB)",
      expireDate: "2026-02-28",
      ipAddress: "103.21.58.10",
      macAddress: "A4:B1:C2:D3:E4:F5",
    },
    amounts: {
      subTotal,
      discount,
      taxPercent,
      taxAmount,
      grandTotal,
      amountPaid: 0,
      balanceDue: grandTotal,
      symbol: "\u20B9",
    },
    lineItems: [
      { description: "Fiber 150 Mbps — Monthly subscription (01-Feb-2026 to 28-Feb-2026)", quantity: 1, unitPrice: 1199, amount: 1199 },
      { description: "OTT Add-on Pack (streaming bundle)", quantity: 1, unitPrice: 149, amount: 149 },
      { description: "Static IP (103.21.58.10)", quantity: 1, unitPrice: 200, amount: 200 },
      { description: "Installation & cabling (one time)", quantity: 1, unitPrice: 500, amount: 500 },
    ],
    payments: [
      { date: "2026-01-03", mode: "Razorpay", reference: "pay_JQzLmN01", amount: 1180 },
    ],
    notes: "Gateway charges included. For support call +91 80 4000 1234.",
  };
}

export function sampleIspData(): MergeIspData {
  return {
    name: "CryptSK Nexus Broadband",
    address: "Plot 7, Tech Park Road, Bengaluru 560103",
    phone: "+91 80 4000 1234",
    email: "billing@cryptsknexus.in",
    website: "www.cryptsknexus.in",
    gstin: "29ABCDE1234F1Z5",
    logoUrl:
      "data:image/svg+xml;utf8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2256%22%20height=%2256%22%3E%3Crect%20width=%2256%22%20height=%2256%22%20rx=%2212%22%20fill=%22%23059669%22/%3E%3Ctext%20x=%2228%22%20y=%2238%22%20font-size=%2228%22%20fill=%22white%22%20text-anchor=%22middle%22%20font-family=%22Arial%22%3EC%3C/text%3E%3C/svg%3E",
    signatureName: "Authorised Signatory",
  };
}

/* ────────────────────────── starter templates ────────────────────────── */

interface TemplateOpts {
  title: string;
  accent: string;
  headerBg: string;
  headerText: string;
  footerNote: string;
}

function docTemplate(o: TemplateOpts): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>{InvoiceNo}</title></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
  <div style="background:${o.headerBg};padding:24px 28px;color:${o.headerText};">
    <table style="width:100%;border-collapse:collapse;"><tr>
      <td style="vertical-align:middle;">
        {IspLogoBlock}
        <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">{IspName}</div>
        <div style="font-size:12px;opacity:.85;">{IspAddress}</div>
        <div style="font-size:12px;opacity:.85;">{IspPhone} &middot; {IspEmail} &middot; {IspWebsite}</div>
        <div style="font-size:12px;opacity:.85;">GSTIN: {IspGstIn}</div>
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="display:inline-block;padding:6px 14px;border-radius:999px;background:${o.accent};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:1.2px;">${o.title}</div>
        <div style="margin-top:10px;font-size:12px;opacity:.9;">Status: <b>{Status}</b></div>
        <div style="font-size:12px;opacity:.9;">Type: <b>{InvoiceType}</b></div>
      </td>
    </tr></table>
  </div>
  <div style="height:4px;background:${o.accent};"></div>
  <div style="padding:24px 28px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      <tr>
        <td style="vertical-align:top;width:50%;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Bill To</div>
          <div style="font-size:15px;font-weight:700;">{Name}</div>
          <div style="font-size:12px;color:#475569;line-height:1.5;">{Username}<br/>{Address}<br/>{City}, {State} {Zip}<br/>{Phone} &middot; {Email}</div>
        </td>
        <td style="vertical-align:top;">
          <table style="border-collapse:collapse;font-size:12px;">
            <tr><td style="padding:3px 10px;color:#64748b;">Invoice No</td><td style="padding:3px 0;font-weight:700;">{InvoiceNo}</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">Invoice Date</td><td style="padding:3px 0;">{InvoiceDate}</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">Due Date</td><td style="padding:3px 0;">{DueDate}</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">Billing Period</td><td style="padding:3px 0;">{BillingPeriod}</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">Plan</td><td style="padding:3px 0;">{PlanName} ({PlanValidity})</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">Data / Expiry</td><td style="padding:3px 0;">{DataTransfer} &middot; till {ExpireDate}</td></tr>
            <tr><td style="padding:3px 10px;color:#64748b;">IP / MAC</td><td style="padding:3px 0;">{IPAddress} &middot; {MACAddress}</td></tr>
          </table>
        </td>
      </tr>
    </table>
    {LineItemsTable}
    <table style="width:100%;border-collapse:collapse;margin-top:14px;">
      <tr>
        <td style="width:52%;vertical-align:top;padding-right:16px;">
          <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Tax Summary</div>
          {TaxSummaryTable}
          <div style="margin-top:14px;font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;">Amount in Words</div>
          <div style="font-size:12px;color:#334155;border:1px dashed #cbd5e1;border-radius:8px;padding:8px 10px;margin-top:4px;">{AmountInWords}</div>
        </td>
        <td style="vertical-align:top;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tr><td style="padding:6px 2px;color:#64748b;">Sub Total</td><td style="padding:6px 2px;text-align:right;">{SubTotal}</td></tr>
            <tr><td style="padding:6px 2px;color:#64748b;">Discount</td><td style="padding:6px 2px;text-align:right;">-{Discount}</td></tr>
            <tr><td style="padding:6px 2px;color:#64748b;">Tax ({TaxPercent})</td><td style="padding:6px 2px;text-align:right;">{TaxAmount}</td></tr>
            <tr>
              <td style="padding:10px 2px;font-weight:700;font-size:15px;border-top:2px solid ${o.accent};">Grand Total</td>
              <td style="padding:10px 2px;text-align:right;font-weight:700;font-size:15px;border-top:2px solid ${o.accent};">{GrandTotal}</td>
            </tr>
            <tr><td style="padding:6px 2px;color:#64748b;">Amount Paid</td><td style="padding:6px 2px;text-align:right;color:#059669;">{AmountPaid}</td></tr>
            <tr><td style="padding:6px 2px;font-weight:700;color:#b91c1c;">Balance Due</td><td style="padding:6px 2px;text-align:right;font-weight:700;color:#b91c1c;">{BalanceDue}</td></tr>
          </table>
          <div style="font-size:12px;color:#334155;border:1px dashed #cbd5e1;border-radius:8px;padding:8px 10px;margin-top:6px;">Tax in words: {TaxInWords}</div>
        </td>
      </tr>
    </table>
    <div style="margin-top:18px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Payment History</div>
      {PaymentHistory}
    </div>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;font-size:11px;color:#64748b;">
    <table style="width:100%;"><tr>
      <td style="font-size:11px;line-height:1.6;">
        ${o.footerNote}<br/>
        Last payment: {PaymentMode} on {PaymentDate} (Ref {PaymentRef})
      </td>
      <td style="text-align:right;vertical-align:bottom;">
        <div style="display:inline-block;text-align:center;">
          <div style="height:40px;"></div>
          <div style="border-top:1px solid #94a3b8;padding-top:4px;font-size:11px;color:#475569;">{IspSignature} &middot; {IspName}</div>
        </div>
      </td>
    </tr></table>
  </div>
</div>
</body>
</html>`;
}

/** Default professional service invoice template (USER). */
export const DEFAULT_TEMPLATE_HTML: string = docTemplate({
  title: "TAX INVOICE",
  accent: "#059669",
  headerBg: "#0f172a",
  headerText: "#f8fafc",
  footerNote:
    "This is a system generated invoice. Please pay by the due date and quote the invoice number with your payment.",
});

/** Partner (zone) billing statement template. */
export const PARTNER_TEMPLATE_HTML: string = docTemplate({
  title: "PARTNER BILLING STATEMENT",
  accent: "#d97706",
  headerBg: "#1c1917",
  headerText: "#fafaf9",
  footerNote:
    "Partner settlement statement generated automatically. Discrepancies must be reported within 7 days of issue.",
});

/** Minimal custom invoice template. */
export const MINIMAL_CUSTOM_TEMPLATE_HTML: string = docTemplate({
  title: "INVOICE",
  accent: "#0f766e",
  headerBg: "#ffffff",
  headerText: "#111827",
  footerNote: "Thank you for your business.",
});
