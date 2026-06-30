"use client";

/**
 * Hyperliquid Agent Wallet Utilities
 *
 * The official Hyperliquid platform uses an "agent wallet" pattern:
 * 1. Generate a local keypair (stored encrypted in localStorage)
 * 2. Have the user's browser wallet approve the agent ONCE
 *    (withdrawal approval via `approveAgent`, chainId matches Arbitrum)
 * 3. All subsequent L1 actions (orders, cancels, leverage) are signed
 *    locally by the agent — no MetaChain mismatch errors because
 *    local accounts don't enforce chainId-matching.
 */

import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Account } from "viem";

const AGENT_KEY_STORAGE = "hl_agent_key";

/** Generate a fresh local keypair (agent wallet) */
export function createAgentWallet(): { privateKey: string; account: Account } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { privateKey, account };
}

/** Save agent private key (encrypt with user's signature in production) */
export function saveAgentKey(privateKey: string): void {
  localStorage.setItem(AGENT_KEY_STORAGE, privateKey);
}

/** Load agent private key from localStorage */
export function loadAgentKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AGENT_KEY_STORAGE);
}

/** Get or create agent wallet (creates if doesn't exist) */
export function getOrCreateAgentWallet(): { privateKey: string; account: Account } {
  const existing = loadAgentKey();
  if (existing) {
    const account = privateKeyToAccount(existing as `0x${string}`);
    return { privateKey: existing, account };
  }
  const wallet = createAgentWallet();
  saveAgentKey(wallet.privateKey);
  return wallet;
}

/** Clear agent key (call on logout / disconnect) */
export function clearAgentKey(): void {
  localStorage.removeItem(AGENT_KEY_STORAGE);
}

/** Check if agent key exists */
export function hasAgentKey(): boolean {
  return loadAgentKey() !== null;
}
