import { createHyperliquidClients } from "@/lib/hyperliquid-client";
import { useWallet } from "@/hooks/use-wallet";
import { useEffect, useMemo, useRef, useState } from "react";

interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

interface BookState {
  bids: BookLevel[];
  asks: BookLevel[];
  ts: number;
}

/**
 * Order book (L2) using Hyperliquid SDK SubscriptionClient
 * SDK handles reconnection automatically via ReconnectingWebSocket
 */
export function useOrderBook(coin: string) {
  const { hyperliquidWallet } = useWallet();
  const [book, setBook] = useState<BookState>({ bids: [], asks: [], ts: 0 });
  const subRef = useRef<{ sub?: { unsubscribe: () => void } }>({});
  const currentCoin = useRef(coin);

  useEffect(() => {
    currentCoin.current = coin;
  }, [coin]);

  // Memoize clients to prevent re-creation on every render
  const clients = useMemo(
    () => (hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null),
    [hyperliquidWallet]
  );

  useEffect(() => {
    if (!coin || !clients) {
      subRef.current.sub?.unsubscribe();
      subRef.current = {};
      return;
    }

    let alive = true;

    async function connect() {
      if (!clients || !alive) return;
      try {
        const sub = await clients.subscription.l2Book(
          { coin },
          (data) => {
            if (!alive) return;
            if (data.coin === currentCoin.current) {
              setBook({
                bids: data.levels[0] ?? [],
                asks: data.levels[1] ?? [],
                ts: data.time,
              });
            }
          }
        );
        subRef.current = { sub };
        console.log(`[OrderBook] WebSocket connected for ${coin}`);
      } catch (err) {
        console.error(`[OrderBook] WebSocket connection failed for ${coin}:`, err);
        // SDK handles reconnection automatically
      }
    }

    connect();

    return () => {
      alive = false;
      subRef.current.sub?.unsubscribe();
      subRef.current = {};
    };
  }, [coin, clients]);

  return book;
}

/**
 * Recent trades using Hyperliquid SDK SubscriptionClient
 * SDK handles reconnection automatically via ReconnectingWebSocket
 */
export function useTrades(coin: string) {
  const { hyperliquidWallet } = useWallet();
  const [trades, setTrades] = useState<
    Array<{
      coin: string;
      side: string;
      px: string;
      sz: string;
      time: number;
      tid: number;
    }>
  >([]);
  const subRef = useRef<{ sub?: { unsubscribe: () => void } }>({});

  // Memoize clients to prevent re-creation on every render
  const clients = useMemo(
    () => (hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null),
    [hyperliquidWallet]
  );

  useEffect(() => {
    if (!coin || !clients) {
      subRef.current.sub?.unsubscribe();
      subRef.current = {};
      return;
    }

    let alive = true;

    async function connect() {
      if (!clients || !alive) return;
      try {
        const sub = await clients.subscription.trades(
          { coin },
          (data) => {
            if (!alive) return;
            setTrades((prev) => [...data, ...prev].slice(0, 50));
          }
        );
        subRef.current = { sub };
        console.log(`[Trades] WebSocket connected for ${coin}`);
      } catch (err) {
        console.error(`[Trades] WebSocket connection failed for ${coin}:`, err);
        // SDK handles reconnection automatically
      }
    }

    connect();

    return () => {
      alive = false;
      subRef.current.sub?.unsubscribe();
      subRef.current = {};
    };
  }, [coin, clients]);

  return trades;
}