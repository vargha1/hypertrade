/** Format a number as USD with compact notation */
export function formatUSD(value: number | string, decimals = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "$0.00";
  if (Math.abs(n) >= 1_000_000_000)
    return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000)
    return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)
    return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(decimals)}`;
}

/** Format a number with given decimals */
export function formatNumber(value: number | string, decimals = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "0";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a price — automatically picks the right decimal places */
export function formatPrice(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "0";
  if (n >= 10_000) return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (n >= 1_000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 100) return n.toFixed(3);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

/** Format a percentage */
export function formatPct(value: number | string, decimals = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "0.00%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

/** Shorten a wallet address */
export function shortenAddress(address: string, chars = 4): string {
  if (!address) return "";
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/** Returns css class for positive/negative value */
export function pnlClass(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n) || n === 0) return "text-[#94A3B8]";
  return n > 0 ? "text-[#22C55E]" : "text-[#EF4444]";
}

/** Convert funding rate to APR % */
export function fundingToAPR(fundingRate: number): string {
  const apr = fundingRate * 24 * 365 * 100;
  return `${apr >= 0 ? "+" : ""}${apr.toFixed(2)}%`;
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Compute 24h price change */
export function pct24h(mid: number, prevDay: number): number {
  if (!prevDay) return 0;
  return ((mid - prevDay) / prevDay) * 100;
}
