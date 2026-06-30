"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { TradeView } from "@/components/trade-view";
import { MarketsList } from "@/components/markets-list";
import { PortfolioPanel } from "@/components/portfolio-panel";
import { DepositWithdrawModal } from "@/components/deposit-withdraw-modal";
import { Button } from "@/components/ui/button";
import { useMarketData, useUserData } from "@/hooks/use-market-data";
import { useAppStore } from "@/stores/app-store";

type Tab = "trade" | "markets" | "portfolio";

export default function Home() {
  const { wallet } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("trade");
  const [depositOpen, setDepositOpen] = useState(false);

  // Start live market data feed
  useMarketData();
  // Start user data feed when wallet is connected
  useUserData(wallet.address);

  return (
    <>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Floating Deposit / Withdraw button */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-20">
        <Button
          variant="primary"
          size="sm"
          onClick={() => setDepositOpen(true)}
          className="shadow-lg shadow-[#F59E0B]/20"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <span className="hidden sm:inline">Deposit / Withdraw</span>
          <span className="sm:hidden">Fund</span>
        </Button>
      </div>

      {/* Tab content — add bottom padding on mobile so the tab bar doesn't cover content */}
      <div className="pb-16 md:pb-0">
        {activeTab === "trade" && <TradeView />}

        {activeTab === "markets" && (
          <div className="h-[calc(100vh-3.5rem)] overflow-hidden">
            <MarketsList onSelectCoin={() => setActiveTab("trade")} />
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="h-[calc(100vh-3.5rem)] overflow-auto">
            <PortfolioPanel />
          </div>
        )}
      </div>

      <DepositWithdrawModal
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
      />
    </>
  );
}
