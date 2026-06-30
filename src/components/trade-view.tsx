"use client";

import { useState } from "react";
import { PriceChart } from "@/components/price-chart";
import { OrderBook } from "@/components/order-book";
import { OrderForm } from "@/components/order-form";
import { MarketsList } from "@/components/markets-list";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { useAppStore } from "@/stores/app-store";

type PanelTab = "chart" | "book";

export function TradeView() {
  const { selectedCoin } = useAppStore();
  const [panelTab, setPanelTab] = useState<PanelTab>("chart");
  const [orderPrice, setOrderPrice] = useState<string>("");

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Main 3-column layout ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Market list (hidden on mobile) */}
        <aside className="hidden xl:flex flex-col w-72 border-r border-[#334155] flex-shrink-0 overflow-y-auto max-h-full">
          <MarketsList />
        </aside>

        {/* Centre — Chart + Orderbook tabs */}
        <main className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Mobile market selector */}
          <div className="xl:hidden flex items-center gap-2 px-4 py-2 border-b border-[#334155]">
            <MobileCoinPicker />
          </div>

          {/* Chart / Orderbook toggle — mobile & tablet */}
          <div className="flex border-b border-[#334155] lg:hidden">
            {(["chart", "book"] as PanelTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setPanelTab(t)}
                className={[
                  "flex-1 py-2 text-sm font-medium capitalize transition-colors cursor-pointer border-b-2",
                  panelTab === t
                    ? "text-[#F59E0B] border-[#F59E0B]"
                    : "text-[#475569] border-transparent hover:text-[#94A3B8]",
                ].join(" ")}
              >
                {t === "chart" ? "Chart" : "Order Book"}
              </button>
            ))}
          </div>

          {/* Desktop: chart takes most space, book is hidden here (shown in right panel) */}
          <div className="flex flex-1 overflow-auto">
            <div
              className={[
                "flex-1 overflow-auto",
                panelTab === "book" ? "hidden lg:flex" : "flex",
                "flex-col",
              ].join(" ")}
            >
              <PriceChart />
            </div>
            <div
              className={[
                "lg:hidden",
                panelTab === "book" ? "flex" : "hidden",
                "flex-col flex-1 overflow-auto",
              ].join(" ")}
            >
              <OrderBook onPriceSelect={setOrderPrice} />
            </div>
          </div>

          {/* Bottom — Portfolio panel */}
          <div className="hidden lg:flex flex-col h-72 border-t border-[#334155] overflow-hidden flex-shrink-0">
            <PortfolioPanel />
          </div>
        </main>

        {/* Right — Order book + Order form */}
        <aside className="hidden lg:flex flex-col w-80 xl:w-96 border-l border-[#334155] flex-shrink-0 overflow-y-auto max-h-full">
          {/* Order form */}
          <div className="flex-shrink-0 border-b border-[#334155] overflow-y-auto max-h-[60vh]">
            <OrderForm priceOverride={orderPrice} />
          </div>
          {/* Order book */}
          <div className="flex-1 overflow-y-auto">
            <OrderBook onPriceSelect={setOrderPrice} />
          </div>
        </aside>
      </div>

      {/* Mobile: order form + portfolio in bottom drawer via tabs */}
      <div className="lg:hidden border-t border-[#334155] overflow-y-auto max-h-[50vh]">
        <MobileBottomPanel priceOverride={orderPrice} />
      </div>
    </div>
  );
}

// ─── Mobile coin picker ────────────────────────────────────────────────────
function MobileCoinPicker() {
  const { tokens, selectedCoin, setSelectedCoin, allMids, assetContexts } = useAppStore();
  const [open, setOpen] = useState(false);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");
  const ctx = assetContexts[selectedCoin];
  const prev = ctx?.prevDayPx ?? mid;
  const change = prev ? ((mid - prev) / prev) * 100 : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] cursor-pointer"
      >
        <span className="font-bold text-[#F8FAFC]">{selectedCoin}-PERP</span>
        {mid > 0 && (
          <span className={`text-xs ${change >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"}`}>
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
        )}
        <svg className="w-4 h-4 text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[#1E293B] border-t border-[#334155] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#1E293B] px-4 pt-4 pb-2 border-b border-[#334155]">
              <h3 className="font-semibold text-[#F8FAFC] mb-3">Select Market</h3>
              <div className="pb-2">
                <MarketsList
                  onSelectCoin={(coin) => { setSelectedCoin(coin); setOpen(false); }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mobile bottom panel ───────────────────────────────────────────────────
function MobileBottomPanel({ priceOverride }: { priceOverride: string }) {
  const [tab, setTab] = useState<"order" | "portfolio">("order");
  return (
    <div>
      <div className="flex border-b border-[#334155]">
        {[
          { id: "order", label: "Order" },
          { id: "portfolio", label: "Portfolio" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as "order" | "portfolio")}
            className={[
              "flex-1 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2",
              tab === t.id
                ? "text-[#F59E0B] border-[#F59E0B]"
                : "text-[#475569] border-transparent",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {tab === "order" ? (
          <OrderForm priceOverride={priceOverride} />
        ) : (
          <PortfolioPanel />
        )}
      </div>
    </div>
  );
}