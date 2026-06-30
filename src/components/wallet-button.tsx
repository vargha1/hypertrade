"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/use-wallet";
import { useAppStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { shortenAddress } from "@/lib/utils";

export function WalletButton() {
  const { wallet, connect, disconnect, switchToArbitrum, approveAgent, hyperliquidWallet } = useWallet();
  const isArbitrum = wallet.chainId === 42161;
  const { showToast, accountInfo } = useAppStore();
  const [connecting, setConnecting] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      await connect();
      showToast("Wallet connected!", "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection failed";
      showToast(message, "error");
      setShowModal(true);
    } finally {
      setConnecting(false);
    }
  };

  if (!wallet.isConnected) {
    return (
      <>
        <Button variant="primary" size="sm" onClick={handleConnect} loading={connecting}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h7m4 0v-4m0 0l-2 2m2-2l2 2M21 12H15" />
          </svg>
          Connect Wallet
        </Button>

        <Modal open={showModal} onClose={() => setShowModal(false)} title="No wallet detected">
          <div className="space-y-4">
            <p className="text-sm text-[#94A3B8]">
              To trade on Hyperliquid you need a browser wallet. Install one of the
              following:
            </p>
            <div className="flex flex-col gap-2">
              {[
                { name: "MetaMask", url: "https://metamask.io/download/" },
                { name: "Rabby Wallet", url: "https://rabby.io/" },
                { name: "Coinbase Wallet", url: "https://www.coinbase.com/wallet/downloads" },
              ].map((w) => (
                <a
                  key={w.name}
                  href={w.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#334155] bg-[#222735] hover:bg-[#283044] transition-colors text-sm text-[#F8FAFC]"
                >
                  <svg className="w-4 h-4 text-[#F59E0B]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" />
                  </svg>
                  {w.name}
                  <svg className="w-3.5 h-3.5 ml-auto text-[#475569]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#334155] bg-[#222735] hover:bg-[#283044] transition-colors cursor-pointer text-sm"
        aria-label="Wallet menu"
        aria-expanded={showMenu}
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full ${isArbitrum ? "bg-[#22C55E]" : "bg-[#F59E0B]"}`} />
        <span className="text-[#F8FAFC] font-medium">{shortenAddress(wallet.address!)}</span>
        {accountInfo && (
          <span className="text-[#94A3B8] text-xs hidden sm:inline">
            ${parseFloat(accountInfo.accountValue).toFixed(2)}
          </span>
        )}
        <svg className="w-4 h-4 text-[#94A3B8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-xl border border-[#334155] bg-[#1E293B] shadow-2xl overflow-hidden">
            {/* Address */}
            <div className="px-4 py-3 border-b border-[#334155]">
              <p className="text-xs text-[#94A3B8]">Connected as</p>
              <p className="text-sm font-mono text-[#F8FAFC] mt-0.5">{shortenAddress(wallet.address!, 6)}</p>
              {!isArbitrum && (
                <p className="text-xs text-[#F59E0B] mt-1">⚠ Wrong network</p>
              )}
            </div>

{/* Menu items */}
            <div className="p-1.5 space-y-0.5">
              {!isArbitrum && (
                <button
                  onClick={async () => { await switchToArbitrum(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#F59E0B] hover:bg-[#F59E0B]/10 cursor-pointer transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Switch to Arbitrum
                </button>
              )}
              {!hyperliquidWallet?.isAgentApproved && (
                <button
                  onClick={async () => {
                    try {
                      setShowMenu(false);
                      await approveAgent();
                      showToast("Agent approved!", "success");
                    } catch (err: unknown) {
                      const message = err instanceof Error ? err.message : "Failed to approve agent";
                      showToast(message, "error");
                    }
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#F59E0B] hover:bg-[#F59E0B]/10 cursor-pointer transition-colors font-medium"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Approve Trading Agent
                </button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(wallet.address!);
                  showToast("Address copied!", "success");
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#272F42] cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy address
              </button>
              <a
                href={`https://arbiscan.io/address/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#272F42] cursor-pointer transition-colors"
                onClick={() => setShowMenu(false)}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View on Arbiscan
              </a>
              <div className="border-t border-[#334155] my-1" />
              <button
                onClick={() => { disconnect(); setShowMenu(false); showToast("Disconnected", "info"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
