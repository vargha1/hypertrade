"use client";

import { JSX, useState, useRef, useCallback, useEffect } from "react";
import { PriceChart } from "@/components/price-chart";
import { OrderBook } from "@/components/order-book";
import { OrderForm } from "@/components/order-form";
import { MarketsList } from "@/components/markets-list";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { useAppStore } from "@/stores/app-store";

type PanelTab = "chart" | "book";
type MobileTab = "order" | "portfolio" | "book";

// ─── UseResize hook ─────────────────────────────────────────────────────────
function useResize(
  initial: number,
  min: number,
  max: number,
  direction: "horizontal" | "vertical"
) {
  const [size, setSize] = useState(initial);
  const dragRef = useRef<{ start: number; startSize: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        start: direction === "horizontal" ? e.clientX : e.clientY,
        startSize: size,
      };
    },
    [size, direction]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return;
      const delta =
        direction === "horizontal"
          ? dragRef.current.start - e.clientX
          : dragRef.current.start - e.clientY;
      const newSize = Math.min(
        max,
        Math.max(min, dragRef.current.startSize + delta)
      );
      setSize(newSize);
    },
    [min, max, direction]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  return { size, onPointerDown, onPointerMove, onPointerUp };
}

// ─── Main Trade View ────────────────────────────────────────────────────────
export function TradeView() {
  const { selectedCoin } = useAppStore();
  const [panelTab, setPanelTab] = useState<PanelTab>("chart");
  const [mobileTab, setMobileTab] = useState<MobileTab>("order");
  const [orderPrice, setOrderPrice] = useState<string>("");

  // Right sidebar resize (order form + order book width)
  const rightPanel = useResize(320, 240, 500, "horizontal");

  // Bottom panel resize (portfolio height)
  const bottomPanel = useResize(260, 120, 480, "vertical");

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* ─── Main layout ─── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* Left — Market list (xl+ only) */}
        <aside className="hidden xl:flex flex-col w-64 2xl:w-72 border-r border-[#334155] flex-shrink-0 overflow-y-auto max-h-full">
          <MarketsList />
        </aside>

        {/* Centre — Chart + Portfolio */}
        <main className="flex flex-col flex-1 overflow-hidden min-w-0">
          {/* Mobile/Tablet coin picker */}
          <div className="xl:hidden flex items-center gap-2 px-3 py-2 border-b border-[#334155]">
            <MobileCoinPicker />
            <button
              onClick={() =>
                setPanelTab(panelTab === "book" ? "chart" : "book")
              }
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer bg-[#1E293B] border border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] lg:hidden"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 6h18M3 12h18M3 18h18"
                />
              </svg>
              <span className="sm:inline hidden">Book</span>
            </button>
          </div>

          {/* Chart/Book toggle tabs — mobile only */}
          <div className="flex border-b border-[#334155] md:hidden">
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

          {/* Chart + OrderBook inline (md only, before lg sidebar kicks in) */}
          <div className="flex flex-1 overflow-auto min-h-0">
            {/* Chart */}
            <div
              className={[
                "flex-1 overflow-auto flex-col min-h-0",
                panelTab === "book" ? "hidden md:flex" : "flex",
              ].join(" ")}
            >
              <PriceChart />
            </div>
            {/* Mobile/Small tablet inline orderbook */}
            <div
              className={[
                "md:hidden lg:hidden",
                panelTab === "book" ? "flex" : "hidden",
                "flex-col flex-1 overflow-auto min-h-0",
              ].join(" ")}
            >
              <OrderBook onPriceSelect={setOrderPrice} />
            </div>
          </div>

          {/* Horizontal resize handle — chart/portfolio boundary */}
          <div
            className="hidden md:flex h-1.5 flex-shrink-0 cursor-row-resize items-center justify-center group hover:bg-[#F59E0B]/10 transition-colors"
            onPointerDown={bottomPanel.onPointerDown}
            onPointerMove={bottomPanel.onPointerMove}
            onPointerUp={bottomPanel.onPointerUp}
          >
            <div className="w-10 h-0.5 rounded-full bg-[#334155] group-hover:bg-[#F59E0B] transition-colors" />
          </div>

          {/* Bottom — Portfolio panel (md+) — resizable height */}
          <div
            className="hidden md:flex flex-col border-t border-[#334155] overflow-hidden flex-shrink-0"
            style={{ height: bottomPanel.size }}
          >
            <PortfolioPanel />
          </div>
        </main>

        {/* Vertical resize handle — centre/right boundary */}
        <div
          className="hidden lg:flex w-1.5 flex-shrink-0 cursor-col-resize items-center justify-center group hover:bg-[#F59E0B]/10 transition-colors"
          onPointerDown={rightPanel.onPointerDown}
          onPointerMove={rightPanel.onPointerMove}
          onPointerUp={rightPanel.onPointerUp}
        >
          <div className="h-10 w-0.5 rounded-full bg-[#334155] group-hover:bg-[#F59E0B] transition-colors" />
        </div>

        {/* Right — Order form + Order book (lg+), resizable width */}
        <aside
          className="hidden lg:flex flex-col border-l border-[#334155] flex-shrink-0 overflow-hidden max-h-full"
          style={{ width: rightPanel.size }}
        >
          {/* Order form */}
          <div className="flex-shrink-0 border-b border-[#334155] overflow-y-auto max-h-[60vh]">
            <OrderForm priceOverride={orderPrice} />
          </div>
          {/* Order book */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <OrderBook onPriceSelect={setOrderPrice} />
          </div>
        </aside>
      </div>

      {/* ─── Mobile bottom drawer (below lg) ─── */}
      <div className="lg:hidden border-t border-[#334155] overflow-hidden flex flex-col max-h-[50vh]">
        <MobileBottomPanel
          mobileTab={mobileTab}
          setMobileTab={setMobileTab}
          priceOverride={orderPrice}
          onPriceSelect={setOrderPrice}
        />
      </div>
    </div>
  );
}

// ─── Mobile coin picker ─────────────────────────────────────────────────────
function MobileCoinPicker() {
  const {
    tokens,
    selectedCoin,
    setSelectedCoin,
    allMids,
    assetContexts,
  } = useAppStore();
  const [open, setOpen] = useState(false);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");
  const ctx = assetContexts[selectedCoin];
  const prev = ctx?.prevDayPx ?? mid;
  const change = prev ? ((mid - prev) / prev) * 100 : 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-[#1E293B] border border-[#334155] cursor-pointer"
      >
        <span className="font-bold text-[#F8FAFC] text-sm sm:text-base">
          {selectedCoin}-PERP
        </span>
        {mid > 0 && (
          <span
            className={`text-[10px] sm:text-xs ${
              change >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        )}
        <svg
          className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#475569]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[#1E293B] border-t border-[#334155] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-[#1E293B] px-4 pt-4 pb-2 border-b border-[#334155]">
              <h3 className="font-semibold text-[#F8FAFC] mb-3">
                Select Market
              </h3>
              <div className="pb-2">
                <MarketsList
                  onSelectCoin={(coin) => {
                    setSelectedCoin(coin);
                    setOpen(false);
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Mobile bottom panel ────────────────────────────────────────────────────
function MobileBottomPanel({
  mobileTab,
  setMobileTab,
  priceOverride,
  onPriceSelect,
}: {
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;
  priceOverride: string;
  onPriceSelect: (price: string) => void;
}) {
  const tabs: { id: MobileTab; label: string; icon: JSX.Element }[] = [
    {
      id: "order",
      label: "Order",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4v16m8-8H4"
          />
        </svg>
      ),
    },
    {
      id: "book",
      label: "Book",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 6h18M3 12h18M3 18h18"
          />
        </svg>
      ),
    },
    {
      id: "portfolio",
      label: "Portfolio",
      icon: (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* Tab bar */}
      <div className="flex border-b border-[#334155] flex-shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setMobileTab(t.id)}
            className={[
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors cursor-pointer border-b-2",
              mobileTab === t.id
                ? "text-[#F59E0B] border-[#F59E0B]"
                : "text-[#475569] border-transparent hover:text-[#94A3B8]",
            ].join(" ")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {mobileTab === "order" && <OrderForm priceOverride={priceOverride} />}
        {mobileTab === "book" && (
          <OrderBook onPriceSelect={onPriceSelect} />
        )}
        {mobileTab === "portfolio" && <PortfolioPanel />}
      </div>
    </div>
  );
}
