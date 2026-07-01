"use client";

import { useEffect, useRef, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { createHyperliquidClients } from "@/lib/hyperliquid-client";
import { useWallet } from "@/hooks/use-wallet";
import type { AssetContext } from "@/types";

/**
 * Market data feed using Hyperliquid SDK
 * - InfoClient for REST API (initial fetch)
 * - SubscriptionClient for WebSocket real-time updates (SDK handles reconnection)
 */
export function useMarketData() {
  const { hyperliquidWallet } = useWallet();
  const { setTokens, setAllMids, setAssetContexts, tokens } = useAppStore();
  const wsRef = useRef<{
    allMidsSub?: { unsubscribe: () => void };
    assetCtxsSub?: { unsubscribe: () => void };
  }>({});

  // Create SDK clients from wallet - memoized to prevent re-creation on every render
  const clients = useMemo(
    () => (hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null),
    [hyperliquidWallet]
  );

  // Fetch token metadata (universe) once on mount
  useEffect(() => {
    if (!clients) return;

    let alive = true;

    clients.info.meta().then((meta) => {
      if (alive) setTokens(meta.universe);
    }).catch(console.error);

    return () => { alive = false; };
  }, [clients, setTokens]);

  // WebSocket subscriptions for real-time data
  useEffect(() => {
    if (!clients) {
      // Clear subscriptions if no clients
      wsRef.current.allMidsSub?.unsubscribe();
      wsRef.current.assetCtxsSub?.unsubscribe();
      wsRef.current = {};
      return;
    }

    let alive = true;

    async function connect() {
      if (!clients || !alive) return;
      try {
        // Subscribe to all mids (mid prices)
        const allMidsSub = await clients.subscription.allMids((data) => {
          if (!alive) return;
          // data shape: { mids: Record<string, string>, dex: string }
          setAllMids(data.mids);
        });

        // Subscribe to asset contexts (funding, OI, mark price, etc.)
        const assetCtxsSub = await clients.subscription.assetCtxs((data) => {
          if (!alive) return;
          // data shape: { ctxs: PerpAssetCtx[], dex: string }
          const ctxMap: Record<string, AssetContext> = {};
          const currentTokens = useAppStore.getState().tokens;
          data.ctxs.forEach((ctx, idx) => {
            const token = currentTokens[idx];
            if (token) ctxMap[token.name] = ctx as unknown as AssetContext;
          });
          if (Object.keys(ctxMap).length > 0) {
            setAssetContexts(ctxMap);
          }
        });

        wsRef.current = { allMidsSub, assetCtxsSub };
        console.log("[MarketData] WebSocket connected successfully");
      } catch (err) {
        console.error("[MarketData] WebSocket connection failed:", err);
        // SDK handles reconnection automatically via ReconnectingWebSocket
      }
    }

    connect();

    // REST fallback polling for mids (every 5s) in case WS drops
    const pollInterval = setInterval(() => {
      if (!clients || !alive) return;
      clients.info.allMids().then(setAllMids).catch(console.error);
    }, 5_000);

    return () => {
      alive = false;
      clearInterval(pollInterval);
      wsRef.current.allMidsSub?.unsubscribe();
      wsRef.current.assetCtxsSub?.unsubscribe();
    };
  }, [clients, setAllMids, setAssetContexts]);

  return { tokens };
}

/**
 * User data feed using Hyperliquid SDK
 * - InfoClient for REST API (initial fetch + periodic refresh)
 * - SubscriptionClient for WebSocket user events (fills, cancels, etc.)
 */
export function useUserData(address: string | null) {
  const {
    setOpenPositions,
    setOpenOrders,
    setAccountInfo,
    tokens,
  } = useAppStore();
  const { hyperliquidWallet } = useWallet();
  const wsRef = useRef<{ userEventsSub?: { unsubscribe: () => void } }>({});

  // Memoize clients to prevent re-creation on every render
  const clients = useMemo(
    () => (hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null),
    [hyperliquidWallet]
  );

  useEffect(() => {
    if (!address || !clients) {
      // Clear user data when disconnected
      setOpenPositions([]);
      setOpenOrders([]);
      setAccountInfo(null);
      wsRef.current.userEventsSub?.unsubscribe();
      wsRef.current = {};
      return;
    }

    let alive = true;

    async function fetchAll() {
      if (!address || !alive || !clients) return;
      try {
        const [state, orders, spotState] = await Promise.all([
          clients.info.clearinghouseState({ user: address }),
          clients.info.frontendOpenOrders({ user: address }),
          clients.info.spotClearinghouseState({ user: address }),
        ]);

        // Calculate total spot balance (USDC only - this is what can be used as margin)
        let spotUSDC = 0;
        if (spotState?.balances) {
          const usdcBalance = spotState.balances.find(b => b.coin === "USDC" || b.coin === "USDC.e");
          if (usdcBalance) {
            spotUSDC = parseFloat(usdcBalance.total);
          }
        }

        // Use accountValue, not totalRawUsd — that's the actual equity figure
        const perpAccountValue = parseFloat(state.marginSummary.accountValue);
        const totalAccountValue = spotUSDC;

        // Real unrealized PnL = sum of each open position's unrealizedPnl
        const totalUnrealizedPnl = state.assetPositions.reduce(
          (sum, p) => sum + parseFloat(p.position.unrealizedPnl ?? "0"),
          0
        );

        setAccountInfo({
          accountValue: String(totalAccountValue),
          spotTotal: String(spotUSDC),
          crossMarginSummary: {
            totalMarginUsed: state.crossMarginSummary.totalMarginUsed,
            totalNtlPos: state.crossMarginSummary.totalNtlPos,
            totalRawUsd: state.crossMarginSummary.totalRawUsd,
          },
          marginSummary: {
            totalMarginUsed: state.marginSummary.totalMarginUsed,
            totalNtlPos: state.marginSummary.totalNtlPos,
            totalUnrealizedPnl: String(totalUnrealizedPnl),
            totalRawUsd: state.marginSummary.totalRawUsd,
          },
          withdrawable: state.withdrawable,
        });

        // Only include positions with non-zero size
        const positions = state.assetPositions
          .filter((p) => parseFloat(p.position.szi) !== 0)
          .map((p) => ({
            ...p.position,
            side: (parseFloat(p.position.szi) > 0 ? "B" : "A") as "A" | "B",
            liquidationPx: p.position.liquidationPx ?? "0",
            cumulativeFunding: {
              closed: p.position.cumFunding?.sinceChange ?? "0",
              allTime: p.position.cumFunding?.allTime ?? "0",
            },
            maxTradeSzs: [],
          }));

        setOpenPositions(positions);
        setOpenOrders(orders);
      } catch (err) {
        console.error("User data fetch failed:", err);
      }
    }

    // Initial fetch, then poll every 5s as fallback
    fetchAll();
    const interval = setInterval(fetchAll, 5_000);

    // WebSocket for instant updates on user events (fills, cancels, liquidations)
    async function connectUserWs() {
      if (!clients || !address || !alive) return;
      try {
        const userEventsSub = await clients.subscription.userEvents(
          { user: address },
          (data) => {
            // Any user event triggers a full refresh
            if (alive) fetchAll();
          }
        );
        wsRef.current.userEventsSub = userEventsSub;
        console.log("[UserData] WebSocket connected successfully");
      } catch (err) {
        console.error("[UserData] WebSocket connection failed:", err);
        // SDK handles reconnection automatically
      }
    }

    connectUserWs();

    return () => {
      alive = false;
      clearInterval(interval);
      wsRef.current.userEventsSub?.unsubscribe();
    };
  }, [address, clients, tokens, setOpenPositions, setOpenOrders, setAccountInfo]);
}