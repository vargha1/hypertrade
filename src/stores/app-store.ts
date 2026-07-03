import { create } from "zustand";
import type { WalletState, UserOpenPosition, UserOpenOrder, UserAccount, TokenInfo, AssetContext, UserFill } from "@/types";

interface AppState {
  // Wallet
  wallet: WalletState;
  setWallet: (wallet: WalletState) => void;
  disconnect: () => void;

  // Market data
  tokens: TokenInfo[];
  setTokens: (tokens: TokenInfo[]) => void;
  allMids: Record<string, string>;
  setAllMids: (mids: Record<string, string>) => void;
  assetContexts: Record<string, AssetContext>;
  setAssetContexts: (ctx: Record<string, AssetContext>) => void;

  // User data
  openPositions: UserOpenPosition[];
  setOpenPositions: (positions: UserOpenPosition[]) => void;
  openOrders: UserOpenOrder[];
  setOpenOrders: (orders: UserOpenOrder[]) => void;
  accountInfo: UserAccount | null;
  setAccountInfo: (info: UserAccount | null) => void;
  tradeHistory: UserFill[];
  setTradeHistory: (fills: UserFill[]) => void;

  // Selected market
  selectedCoin: string;
  setSelectedCoin: (coin: string) => void;

  // UI
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Wallet
  wallet: { address: null, isConnected: false, chainId: null },
  setWallet: (wallet) => set({ wallet }),
  disconnect: () =>
    set({
      wallet: { address: null, isConnected: false, chainId: null },
      openPositions: [],
      openOrders: [],
      accountInfo: null,
      tradeHistory: [],
    }),

  // Market data
  tokens: [],
  setTokens: (tokens) => set({ tokens }),
  allMids: {},
  setAllMids: (allMids) => set({ allMids }),
  assetContexts: {},
  setAssetContexts: (assetContexts) => set({ assetContexts }),

  // User data
  openPositions: [],
  setOpenPositions: (openPositions) => set({ openPositions }),
  openOrders: [],
  setOpenOrders: (openOrders) => set({ openOrders }),
  accountInfo: null,
  setAccountInfo: (accountInfo) => set({ accountInfo }),
  tradeHistory: [],
  setTradeHistory: (tradeHistory) => set({ tradeHistory }),

  // Selected market
  selectedCoin: "BTC",
  setSelectedCoin: (selectedCoin) => set({ selectedCoin }),

  // UI
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  toast: null,
  showToast: (message, type = "info") => {
    set({ toast: { message, type } });
    setTimeout(() => set({ toast: null }), 4000);
  },
  clearToast: () => set({ toast: null }),
}));
