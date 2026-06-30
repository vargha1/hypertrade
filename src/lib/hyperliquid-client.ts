"use client";

/**
 * Hyperliquid SDK Client Factory — Agent Wallet Pattern
 *
 * Creates separate clients for:
 * - Browser wallet (MetaMask): on-chain actions (deposit, withdraw, approveAgent, usdClassTransfer)
 *   Uses wallet client's signTypedData with chainId 42161 (Arbitrum)
 * - Agent wallet (local keypair): L1 trading actions (order, cancel, updateLeverage, TP/SL)
 *   Uses viem signTypedData with privateKey (local signing, no chainId enforcement)
 */

import { HttpTransport, InfoClient, ExchangeClient, SubscriptionClient, WebSocketTransport } from "@nktkas/hyperliquid";
import type { Hex } from "viem";
import { signTypedData } from "viem/accounts";
import type { HyperliquidWallet } from "@/hooks/use-wallet";

export interface HyperliquidClients {
  info: InfoClient;
  /** On-chain client — uses browser wallet (Arbitrum chainId 42161) */
  exchange: ExchangeClient;
  /** L1 trading client — uses agent wallet (Hyperliquid L1 chainId 1337) */
  exchangeAgent: ExchangeClient;
  subscription: SubscriptionClient;
}

// Singleton transports - created once and reused
let httpTransportSingleton: HttpTransport | null = null;
let wsTransportSingleton: WebSocketTransport | null = null;

function getHttpTransport(): HttpTransport {
  if (!httpTransportSingleton) {
    httpTransportSingleton = new HttpTransport({ isTestnet: false });
  }
  return httpTransportSingleton;
}

function getWsTransport(): WebSocketTransport {
  if (!wsTransportSingleton) {
    wsTransportSingleton = new WebSocketTransport({
      isTestnet: false,
      resubscribe: true,
      keepAlive: { interval: 30_000, timeout: 10_000 },
    });
  }
  return wsTransportSingleton;
}

/**
 * Creates all Hyperliquid clients using the agent wallet pattern.
 *
 * Browser wallet (MetaMask): deposits, withdrawals, transfers, approveAgent
 * Agent wallet (local): L1 trading — orders, cancels, leverage, TP/SL
 */
export function createHyperliquidClients(
  wallet: HyperliquidWallet | null
): HyperliquidClients | null {
  if (!wallet) return null;

  const httpTransport = getHttpTransport();
  const wsTransport = getWsTransport();

  // Get agent private key from localStorage
  let agentPrivateKey: Hex | null = null;
  if (typeof window !== "undefined") {
    agentPrivateKey = localStorage.getItem("hl_agent_key") as Hex | null;
  }

  // Agent wallet SDK adapter — local signing with privateKey (no chainId check)
  const agentSdkWallet = {
    signTypedData: async (params: { domain: any; types: any; primaryType: string; message: any }) => {
      if (!agentPrivateKey) {
        throw new Error("Agent private key not found. Please reconnect wallet.");
      }
      const sig = await signTypedData({
        privateKey: agentPrivateKey,
        domain: params.domain,
        types: params.types,
        primaryType: params.primaryType,
        message: params.message,
      });
      return sig;
    },
    getAddresses: async () => [wallet.agentAccount.address],
    getChainId: async () => 42161,
  };

  return {
    info: new InfoClient({ transport: httpTransport }),
    // Browser wallet for on-chain actions (deposit, withdraw, approveAgent, usdClassTransfer)
    exchange: new ExchangeClient({
      transport: httpTransport,
      wallet: {
        signTypedData: async (params: { domain: any; types: any; primaryType: string; message: any }) => {
          const sig = await wallet.browserWalletClient.signTypedData({
            ...params,
            account: wallet.browserAccount,
          });
          return sig;
        },
        getAddresses: async () => [wallet.browserAccount.address],
        getChainId: async () => 42161,
      } as any,
    }),
    // Agent wallet for L1 trading (orders, cancels, leverage, TP/SL)
    exchangeAgent: new ExchangeClient({
      transport: httpTransport,
      wallet: agentSdkWallet as any,
    }),
    subscription: new SubscriptionClient({ transport: wsTransport }),
  };
}

/**
 * Close all singleton transports (call on app shutdown/logout)
 */
export function closeHyperliquidTransports() {
  wsTransportSingleton?.close();
  wsTransportSingleton = null;
  httpTransportSingleton = null;
}