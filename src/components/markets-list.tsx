"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { formatPrice, formatUSD, pct24h, pnlClass } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

interface MarketsListProps {
  onSelectCoin?: (coin: string) => void;
}

export function MarketsList({ onSelectCoin }: MarketsListProps) {
  const { tokens, allMids, assetContexts, selectedCoin, setSelectedCoin } = useAppStore();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "price" | "change" | "volume" | "oi">("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = useMemo(() => {
    return tokens
      .map((token) => {
        const mid = parseFloat(allMids[token.name] ?? "0");
        const ctx = assetContexts[token.name];
        const prev = ctx?.prevDayPx ?? mid;
        const change = pct24h(mid, prev);
        const volume = ctx?.dayNtlVlm ?? 0;
        const oi = ctx?.openInterest ?? 0;
        const funding = ctx?.fundingRate ?? 0;
        return { name: token.name, mid, change, volume, oi, funding, maxLev: token.maxLeverage };
      })
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
  }, [tokens, allMids, assetContexts, search]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.name.localeCompare(b.name);
      else if (sortKey === "price") diff = a.mid - b.mid;
      else if (sortKey === "change") diff = a.change - b.change;
      else if (sortKey === "volume") diff = a.volume - b.volume;
      else if (sortKey === "oi") diff = a.oi - b.oi;
      return sortDir === "desc" ? -diff : diff;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleSelect(coin: string) {
    setSelectedCoin(coin);
    onSelectCoin?.(coin);
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) => (
    <span className="ml-1 text-[#475569]">
      {sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
    </span>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-4 border-b border-[#334155]">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search markets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#0F172A] border border-[#334155] rounded-lg text-sm text-[#F8FAFC] placeholder-[#475569] focus:outline-none focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" role="grid" aria-label="Markets">
          <thead className="sticky top-0 bg-[#0F172A] z-10">
            <tr className="text-left text-xs text-[#475569] font-medium border-b border-[#334155]">
              {(
                [
                  { label: "Market", k: "name" },
                  { label: "Price", k: "price" },
                  { label: "24h %", k: "change" },
                  { label: "Volume", k: "volume" },
                  { label: "OI", k: "oi" },
                ] as const
              ).map(({ label, k }) => (
                <th
                  key={k}
                  className="px-4 py-2.5 cursor-pointer hover:text-[#94A3B8] select-none text-right first:text-left whitespace-nowrap"
                  onClick={() => handleSort(k)}
                  scope="col"
                  aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  {label}
                  <SortIcon k={k} />
                </th>
              ))}
              <th className="px-4 py-2.5 text-right whitespace-nowrap" scope="col">Funding</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center text-[#475569] text-sm">
                  {tokens.length === 0 ? (
                    <div className="flex flex-col items-center gap-2">
                      <Spinner />
                      <span>Loading markets…</span>
                    </div>
                  ) : (
                    "No markets match your search."
                  )}
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              const isSelected = row.name === selectedCoin;
              const changeClass = pnlClass(row.change);
              const fundingClass = row.funding >= 0 ? "text-[#22C55E]" : "text-[#EF4444]";
              return (
                <tr
                  key={row.name}
                  onClick={() => handleSelect(row.name)}
                  className={[
                    "border-b border-[#1E293B] cursor-pointer transition-colors",
                    isSelected
                      ? "bg-[#F59E0B]/5 border-l-2 border-l-[#F59E0B]"
                      : "hover:bg-[#1E293B]",
                  ].join(" ")}
                  role="row"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && handleSelect(row.name)}
                >
                  {/* Market name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[#222735] flex items-center justify-center text-xs font-bold text-[#F59E0B]">
                        {row.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-[#F8FAFC]">{row.name}</p>
                        <p className="text-[10px] text-[#475569]">Up to {row.maxLev}×</p>
                      </div>
                    </div>
                  </td>
                  {/* Price */}
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[#F8FAFC]">
                    ${row.mid > 0 ? formatPrice(row.mid) : "—"}
                  </td>
                  {/* 24h change */}
                  <td className={`px-4 py-3 text-right tabular-nums font-medium ${changeClass}`}>
                    {row.mid > 0
                      ? `${row.change >= 0 ? "+" : ""}${row.change.toFixed(2)}%`
                      : "—"}
                  </td>
                  {/* Volume */}
                  <td className="px-4 py-3 text-right tabular-nums text-[#94A3B8]">
                    {row.volume > 0 ? formatUSD(row.volume) : "—"}
                  </td>
                  {/* OI */}
                  <td className="px-4 py-3 text-right tabular-nums text-[#94A3B8]">
                    {row.oi > 0 ? formatUSD(row.oi * row.mid) : "—"}
                  </td>
                  {/* Funding */}
                  <td className={`px-4 py-3 text-right tabular-nums text-xs ${fundingClass}`}>
                    {row.funding !== 0
                      ? `${row.funding >= 0 ? "+" : ""}${(row.funding * 100).toFixed(4)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      <div className="px-4 py-2 border-t border-[#334155] text-xs text-[#475569]">
        {sorted.length} of {tokens.length} markets
      </div>
    </div>
  );
}
