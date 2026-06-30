export interface TokenInfo {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated?: boolean;
}

export interface Meta {
  universe: TokenInfo[];
}

export interface AssetContext {
  fundingRate: number;
  openInterest: number;
  prevDayPx: number;
  dayNtlVlm: number;
  premium: number;
  oraclePx: number;
  markPx: number;
  midPx: number;
  impactPxs: [number, number];
}

export interface AllMids {
  [coin: string]: string;
}

export interface UserOpenPosition {
  coin: string;
  cumulativeFunding?: { closed: string; allTime: string };
  entryPx: string;
  leverage: { type: string; value: number; rawUsd?: string };
  liquidationPx: string;
  marginUsed: string;
  maxTradeSzs?: string[];
  positionValue: string;
  szi: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  side: "A" | "B";
}

export interface UserOpenOrder {
  coin: string;
  limitPx: string;
  oid: number;
  orderType: string;
  origSz: string;
  sz: string;
  side: "A" | "B";
  timestamp: number;
  reduceOnly: boolean;
  triggerCondition?: string;
  triggerPx?: string;
}

export interface OrderStatus {
  filled: { totalSz: string; totalNtl: string; fees: string; avgPx: string };
  order: {
    coin: string;
    limitPx: string;
    oid: number;
    orderType: string;
    origSz: string;
    sz: string;
    side: "A" | "B";
    timestamp: number;
    reduceOnly: boolean;
  };
  status: "open" | "filled" | "open_awaiting_cancel" | "canceled" | "margin_canceled";
}

export interface UserAccount {
  accountValue: string;
  spotTotal: string;
  crossMarginSummary: {
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    totalMarginUsed: string;
    totalNtlPos: string;
    totalUnrealizedPnl: string;
    totalRawUsd: string;
  };
  withdrawable: string;
}

export interface SpotBalance {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
}

export interface SpotClearinghouseState {
  balances: SpotBalance[];
  tokenToAvailableAfterMaintenance: [number, string][];
}

export interface CandleSnapshot {
  t: number;
  T: number;
  s: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

export interface BookLevel {
  px: string;
  sz: string;
  n: number;
}

export interface BookResponse {
  coin: string;
  levels: [BookLevel[], BookLevel[]]; // [bids, asks]
  time: number;
}

export interface WalletState {
  address: string | null;
  isConnected: boolean;
  chainId: number | null;
}

export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type LeverageType = "cross" | "isolated";
