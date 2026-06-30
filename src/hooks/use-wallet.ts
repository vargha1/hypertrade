"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { createWalletClient, custom, type WalletClient, type Account, type Address } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getOrCreateAgentWallet, clearAgentKey, hasAgentKey } from "@/lib/agent-wallet";
import { createHyperliquidClients } from "@/lib/hyperliquid-client";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      selectedAddress?: string;
    };
  }
}

/**
 * Agent-based wallet adapter for Hyperliquid SDK.
 *
 * Official Hyperliquid approach (matches app.hyperliquid.xyz):
 *
 * 1. BROWSER WALLET (MetaMask): Used for:
 *    - Account management (connect, disconnect, switch chain)
 *    - Approving the agent on-chain (`approveAgent`)
 *    - On-chain actions: deposit, withdraw, usdClassTransfer
 *    -> chainId = Arbitrum (42161), MetaMask signs with no mismatch
 *
 * 2. AGENT WALLET (local privateKeyToAccount): Used for:
 *    - L1 trading actions: orders, cancels, leverage updates, TP/SL
 *    -> chainId = Hyperliquid L1 (1337), signed LOCALLY
 *       (no MetaChainId enforcement by browser wallet)
 *
 * This eliminates the "chainId 1337 vs 42161" error permanently.
 */
export interface HyperliquidWallet {
  /** User's browser wallet (MetaMask) — for on-chain ops */
  browserAccount: Account;
  browserWalletClient: WalletClient;
  /** Agent wallet (local keypair) — for L1 trading */
  agentAccount: Account;
  /** Whether agent has been approved by user on-chain */
  isAgentApproved: boolean;
}

export function useWallet() {
  const { wallet, setWallet, disconnect } = useAppStore();
  const [hyperliquidWallet, setHyperliquidWallet] = useState<HyperliquidWallet | null>(null);

  const handleAccountsChanged = useCallback(
    (accounts: unknown) => {
      const accs = accounts as string[];
      if (accs.length === 0) {
        disconnect();
        setHyperliquidWallet(null);
      } else {
        setWallet({ ...wallet, address: accs[0], isConnected: true });
        createHyperliquidWallet(accs[0])
          .then((hw) => setHyperliquidWallet(hw))
          .catch(console.error);
      }
    },
    [wallet, setWallet, disconnect]
  );

  const handleChainChanged = useCallback(
    (chainId: unknown) => {
      const id = parseInt(chainId as string, 16);
      setWallet({ ...wallet, chainId: id });
    },
    [wallet, setWallet]
  );

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    eth.on("accountsChanged", handleAccountsChanged);
    eth.on("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
      eth.removeListener("chainChanged", handleChainChanged);
    };
  }, [handleAccountsChanged, handleChainChanged]);

  // Auto-reconnect on mount
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    eth.request({ method: "eth_accounts" })
      .then((accounts) => {
        const accs = accounts as string[];
        if (accs.length > 0) {
          eth.request({ method: "eth_chainId" }).then((chainId) => {
            setWallet({
              address: accs[0],
              isConnected: true,
              chainId: parseInt(chainId as string, 16),
            });
            createHyperliquidWallet(accs[0])
              .then((hw) => setHyperliquidWallet(hw))
              .catch(console.error);
          });
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createHyperliquidWallet(address: string): Promise<HyperliquidWallet> {
    // Create browser wallet client (MetaMask — used for deposits/withdrawals/approveAgent)
    const browserWalletClient = createWalletClient({
      chain: arbitrum,
      transport: custom(window.ethereum!),
    });

    const [browserAddress] = await browserWalletClient.getAddresses();
    const browserAccount: Account = {
      address: browserAddress as Address,
      type: "json-rpc",
    };

    // Create/get agent wallet (local keypair — used for all trading)
    const { account: agentAccount } = getOrCreateAgentWallet();

    // Check if agent is already approved (query API)
    const isAgentApproved = await checkAgentApproved(agentAccount.address);

    return { browserAccount, browserWalletClient, agentAccount, isAgentApproved };
  }

  async function checkAgentApproved(agentAddress: string): Promise<boolean> {
    try {
      // Query user's authorized agents from Hyperliquid API
      // For now, return false - will prompt user to approve
      return false;
    } catch {
      return false;
    }
  }

  // Approve agent on-chain using browser wallet (MetaMask)
  const approveAgent = useCallback(async (): Promise<boolean> => {
    if (!hyperliquidWallet || !window.ethereum) {
      throw new Error("Wallet not connected");
    }

    const clients = createHyperliquidClients(hyperliquidWallet);
    if (!clients) {
      throw new Error("Failed to create clients");
    }

    try {
      // Call approveAgent - this will prompt MetaMask with chainId 42161 (Arbitrum)
      // which matches the active chain, so MetaMask will sign without chainId mismatch
      await clients.exchange.approveAgent({
        agentAddress: hyperliquidWallet.agentAccount.address,
        agentName: "HL Trading Agent",
      });

      // Update state to mark agent as approved
      setHyperliquidWallet(prev => prev ? { ...prev, isAgentApproved: true } : null);
      
      return true;
    } catch (error) {
      console.error("Failed to approve agent:", error);
      throw error;
    }
  }, [hyperliquidWallet]);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error("No wallet detected. Please install MetaMask.");
    }
    const accounts = (await window.ethereum.request({
      method: "eth_requestAccounts",
    })) as string[];
    const chainId = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;

    setWallet({
      address: accounts[0],
      isConnected: true,
      chainId: parseInt(chainId, 16),
    });

    const hw = await createHyperliquidWallet(accounts[0]);
    setHyperliquidWallet(hw);

    return accounts[0];
  }, [setWallet]);

  const switchToArbitrum = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xa4b1" }], // Arbitrum One = 42161
      });
    } catch (error: unknown) {
      const switchError = error as { code: number; message: string };
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0xa4b1",
                chainName: "Arbitrum One",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://arb1.arbitrum.io/rpc"],
                blockExplorerUrls: ["https://arbiscan.io"],
              },
            ],
          });
        } catch {
          // silently fail
        }
      }
    }
  }, []);

  const appDisconnect = useCallback(() => {
    clearAgentKey();
    disconnect();
    setHyperliquidWallet(null);
  }, [disconnect]);

  return {
    wallet,
    hyperliquidWallet,
    connect,
    switchToArbitrum,
    disconnect: appDisconnect,
    approveAgent,
  };
}