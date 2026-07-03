"use client";

import { useMemo, useState } from "react";
import { useOrderBook, useTrades } from "@/hooks/use-orderbook";
import { useAppStore } from "@/stores/app-store";
import { formatPrice, formatNumber } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

function BookRow({
  side,
  px,
  sz,
  total,
  maxTotal,
  onClick,
}: {
  side: "bid" | "ask";
  px: string;
  sz: string;
  total: number;
  maxTotal: number;
  onClick: (price: string) => void;
}) {
  const pct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const priceNum = parseFloat(px);
  const sizeNum = parseFloat(sz);
  return (
    <button
      onClick={() => onClick(px)}
      className="relative w-full flex items-center justify-between px-2 sm:px-3 py-[3px] hover:bg-[#222735] transition-colors cursor-pointer text-xs sm:text-sm tabular-nums"
      aria-label={`${side} ${sizeNum.toFixed(4)} at ${formatPrice(priceNum)}`}
    >
      {/* Depth bar */}
      <span
        className={`absolute inset-y-0 ${side === "bid" ? "right-0" : "left-0"} ${side === "bid" ? "bg-[#22C55E]/10" : "bg-[#EF4444]/10"}`}
        style={{ width: `${pct}%` }}
        aria-hidden="true"
      />
      <span className={side === "bid" ? "text-[#22C55E] font-medium" : "text-[#EF4444] font-medium"}>
        {formatPrice(priceNum)}
      </span>
      <span className="text-[#94A3B8] hidden xs:inline-flex">{formatNumber(sizeNum, 4)}</span>
      <span className="text-[#475569] hidden sm:inline-flex">{total.toFixed(2)}</span>
    </button>
  );
}

function CompactBookRow({
  side,
  px,
  sz,
  onClick,
}: {
  side: "bid" | "ask";
  px: string;
  sz: string;
  onClick: (price: string) => void;
}) {
  const priceNum = parseFloat(px);
  const sizeNum = parseFloat(sz);
  return (
    <button
      onClick={() => onClick(px)}
      className="relative w-full flex items-center justify-between px-2 py-1 hover:bg-[#222735] transition-colors cursor-pointer text-xs tabular-nums"
      aria-label={`${side} ${sizeNum.toFixed(4)} at ${formatPrice(priceNum)}`}
    >
      <span className={side === "bid" ? "text-[#22C55E] font-medium" : "text-[#EF4444] font-medium"}>
        {formatPrice(priceNum)}
      </span>
      <span className="text-[#94A3B8]">{formatNumber(sizeNum, 4)}</span>
    </button>
  );
}

export function OrderBook({ onPriceSelect }: { onPriceSelect?: (price: string) => void }) {
  const { selectedCoin, allMids } = useAppStore();
  const book = useOrderBook(selectedCoin);
  const trades = useTrades(selectedCoin);
  const [showCompact, setShowCompact] = useState(false);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");

  const asks = useMemo(() => {
    const top = book.asks.slice(0, 15);
    let cum = 0;
    return top
      .map((a) => { cum += parseFloat(a.sz); return { ...a, total: cum }; })
      .reverse();
  }, [book.asks]);

  const bids = useMemo(() => {
    const top = book.bids.slice(0, 15);
    let cum = 0;
    return top.map((b) => { cum += parseFloat(b.sz); return { ...b, total: cum }; });
  }, [book.bids]);

  const maxTotal = Math.max(
    asks.at(-1)?.total ?? 0,
    bids.at(-1)?.total ?? 0
  );

  const hasData = asks.length > 0 || bids.length > 0;

  const handlePrice = (price: string) => onPriceSelect?.(price);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#334155] flex-wrap gap-2">
        <span className="text-xs font-semibold text-[#F8FAFC]">Order Book</span>
        <div className="flex gap-2 text-[10px] text-[#475569] font-medium uppercase hidden sm:flex">
          <span className="w-24">Price</span>
          <span className="w-20">Size</span>
          <span className="w-16">Total</span>
        </div>
        <button
          onClick={() => setShowCompact(!showCompact)}
          className="text-[10px] text-[#475569] hover:text-[#94A3B8] px-2 py-1 rounded bg-[#1E293B] border border-[#334155] cursor-pointer transition-colors hidden md:flex"
        >
          {showCompact ? "Full" : "Compact"}
        </button>
      </div>

      {!hasData ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={20} />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {/* Asks (sells) — reversed so highest is on top */}
          <div className="flex-1 flex flex-col-reverse overflow-hidden min-h-0">
            {asks.map((a) => (
              showCompact ? (
                <CompactBookRow key={a.px + a.sz} side="ask" px={a.px} sz={a.sz} onClick={handlePrice} />
              ) : (
                <BookRow
                  key={a.px + a.sz}
                  side="ask"
                  px={a.px}
                  sz={a.sz}
                  total={a.total}
                  maxTotal={maxTotal}
                  onClick={handlePrice}
                />
              )
            ))}
          </div>

          {/* Spread */}
          <div className="flex items-center justify-between px-3 py-1.5 border-y border-[#334155] bg-[#1E293B] flex-shrink-0">
            <span className="text-sm font-bold tabular-nums text-[#F8FAFC]">
              {mid > 0 ? `$${formatPrice(mid)}` : "—"}
            </span>
            {asks[asks.length - 1] && bids[0] && (
              <span className="text-xs text-[#475569]">
                Spread:{" "}
                <span className="text-[#94A3B8]">
                  {(parseFloat(asks[asks.length - 1].px) - parseFloat(bids[0].px)).toFixed(2)}
                </span>
              </span>
            )}
          </div>

          {/* Bids (buys) */}
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {bids.map((b) => (
              showCompact ? (
                <CompactBookRow key={b.px + b.sz} side="bid" px={b.px} sz={b.sz} onClick={handlePrice} />
              ) : (
                <BookRow
                  key={b.px + b.sz}
                  side="bid"
                  px={b.px}
                  sz={b.sz}
                  total={b.total}
                  maxTotal={maxTotal}
                  onClick={handlePrice}
                />
              )
            ))}
          </div>
        </div>
      )}

      {/* Recent Trades - Responsive panel */}
      <div className="border-t border-[#334155] flex-shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#334155]">
          <span className="text-xs font-semibold text-[#F8FAFC]">Recent Trades</span>
          <span className="text-[10px] text-[#475569] hidden sm:inline">Last 30</span>
        </div>
        <div className="h-40 sm:h-48 overflow-auto">
          {trades.slice(0, 30).map((t) => (
            <div
              key={t.tid}
              className="flex items-center justify-between px-3 py-[3px] text-xs sm:text-sm tabular-nums hover:bg-[#1E293B] cursor-pointer transition-colors"
              onClick={() => onPriceSelect?.(t.px)}
            >
              <span className={`${t.side === "B" ? "text-[#22C55E]" : "text-[#EF4444]"} font-medium`}>
                {formatPrice(parseFloat(t.px))}
              </span>
              <span className="text-[#94A3B8] hidden xs:inline-flex px-2">
                {formatNumber(parseFloat(t.sz), 4)}
              </span>
              <span className="text-[#475569] hidden sm:inline-flex">
                {new Date(t.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          ))}
          {trades.length === 0 && (
            <div className="flex items-center justify-center py-6 text-xs text-[#475569]">
              Waiting for trades…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}