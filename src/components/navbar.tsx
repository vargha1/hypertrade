"use client";

import { WalletButton } from "@/components/wallet-button";
import { useAppStore } from "@/stores/app-store";

type Tab = "trade" | "markets" | "portfolio";

interface NavbarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "trade",
    label: "Trade",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    id: "markets",
    label: "Markets",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "portfolio",
    label: "Portfolio",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export function Navbar({ activeTab, onTabChange }: NavbarProps) {
  const { openPositions } = useAppStore();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6 h-14 border-b border-[#334155] bg-[#0F172A]/95 backdrop-blur-sm">
      {/* Logo */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#F59E0B] flex items-center justify-center">
            <svg className="w-4 h-4 text-[#0F172A]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-bold text-[#F8FAFC] text-base tracking-tight">
            Hyper<span className="text-[#F59E0B]">Trade</span>
          </span>
        </div>

        {/* Nav tabs — desktop */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={[
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer relative",
                activeTab === tab.id
                  ? "text-[#F8FAFC] bg-[#222735]"
                  : "text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#1E293B]",
              ].join(" ")}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "portfolio" && openPositions.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#F59E0B] rounded-full text-[9px] text-[#0F172A] font-bold flex items-center justify-center">
                  {openPositions.length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Network badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#222735] border border-[#334155]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-xs text-[#94A3B8] font-medium">Arbitrum</span>
        </div>
        <WalletButton />
      </div>

      {/* Mobile nav tabs */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden flex border-t border-[#334155] bg-[#0F172A] z-30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={[
              "flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors cursor-pointer",
              activeTab === tab.id ? "text-[#F59E0B]" : "text-[#94A3B8]",
            ].join(" ")}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </header>
  );
}
