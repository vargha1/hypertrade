"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useAppStore } from "@/stores/app-store";
import { useWallet } from "@/hooks/use-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatUSD, pct24h } from "@/lib/utils";
import { createHyperliquidClients } from "@/lib/hyperliquid-client";
import type { OrderSide, OrderType, LeverageType } from "@/types";

const LEVERAGE_PRESETS = [1, 2, 5, 10, 20, 50];
const MARKET_SLIPPAGE = 0.03;

interface OrderFormProps {
  priceOverride?: string;
}

export function OrderForm({ priceOverride }: OrderFormProps) {
  const { selectedCoin, allMids, accountInfo, tokens, showToast } =
    useAppStore();
  const { wallet, hyperliquidWallet } = useWallet();

  const [side, setSide] = useState<OrderSide>("buy");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [leverageType, setLeverageType] = useState<LeverageType>("cross");
  const [leverage, setLeverage] = useState(10);
  const [price, setPrice] = useState(priceOverride ?? "");
  const [size, setSize] = useState("");
  const [sizeInUSD, setSizeInUSD] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leverageUpdating, setLeverageUpdating] = useState(false);

  // Create SDK clients when wallet is connected
  const clients = useMemo(() => {
    return hyperliquidWallet ? createHyperliquidClients(hyperliquidWallet) : null;
  }, [hyperliquidWallet]);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");
  const token = tokens.find((t) => t.name === selectedCoin);
  const maxLev = token?.maxLeverage ?? 50;

  // Compute asset index (position in universe array — required by the API)
  const assetIndex = tokens.findIndex((t) => t.name === selectedCoin);

  // Total available balance = perp withdrawable + spot balances
  const perpWithdrawable = parseFloat(accountInfo?.withdrawable ?? "0");
  const spotTotal = parseFloat(accountInfo?.spotTotal ?? "0");
  const availableBalance = perpWithdrawable + spotTotal;

  // Current position for this asset (if any)
  const currentPosition = useAppStore.getState().openPositions.find(
    (p) => p.coin === selectedCoin
  );
  const currentSzi = currentPosition
    ? parseFloat(currentPosition.szi)
    : 0;
  const isLong = currentSzi > 0;
  const isShort = currentSzi < 0;

  const filledPrice =
    orderType === "market" ? mid : parseFloat(price || "0");
  const filledSize = parseFloat(size || "0");
  const notional = sizeInUSD
    ? filledSize
    : filledSize * (filledPrice || mid);
  const marginRequired =
    notional > 0 && leverage > 0 ? notional / leverage : 0;

  // Calculate max position size based on available balance and leverage
  const maxPositionSize = availableBalance * leverage;

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (orderType === "limit" && (!price || parseFloat(price) <= 0))
      errs.price = "Enter a valid limit price";
    if (!size || parseFloat(size) <= 0)
      errs.size = "Enter a valid size";
    if (marginRequired > availableBalance && wallet.isConnected)
      errs.size = `Insufficient balance (need ${formatUSD(marginRequired)})`;
    if (assetIndex === -1)
      errs.size = "Unknown asset — market data still loading";
    if (notional > maxPositionSize && wallet.isConnected)
      errs.size = `Position exceeds max size (${formatUSD(maxPositionSize)})`;
    
    // TP/SL validation
    if (tpPrice && parseFloat(tpPrice) <= 0) errs.tpPrice = "TP price must be positive";
    if (slPrice && parseFloat(slPrice) <= 0) errs.slPrice = "SL price must be positive";
    if (tpPrice && slPrice && side === "buy") {
      const tp = parseFloat(tpPrice);
      const sl = parseFloat(slPrice);
      if (tp <= sl) errs.tpPrice = "TP must be above SL for long positions";
    }
    if (tpPrice && slPrice && side === "sell") {
      const tp = parseFloat(tpPrice);
      const sl = parseFloat(slPrice);
      if (tp >= sl) errs.tpPrice = "TP must be below SL for short positions";
    }
    return errs;
  }

  // Update leverage when user changes it in UI
  const handleLeverageChange = useCallback(
    async (newLeverage: number) => {
      if (
        !wallet.isConnected ||
        !wallet.address ||
        !clients ||
        assetIndex === -1 ||
        newLeverage === leverage
      ) {
        setLeverage(newLeverage);
        return;
      }

      setLeverageUpdating(true);
      setLeverage(newLeverage);

      try {
        await clients.exchangeAgent.updateLeverage({
          asset: assetIndex,
          isCross: leverageType === "cross",
          leverage: newLeverage,
        });
        showToast(`Leverage updated to ${newLeverage}×`, "success");
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message.includes("user rejected") ||
              err.message.includes("User denied")
              ? "Transaction rejected"
              : err.message
            : "Failed to update leverage";
        showToast(msg, "error");
        // Revert on failure
        setLeverage(leverage);
      } finally {
        setLeverageUpdating(false);
      }
    },
    [
      wallet,
      clients,
      assetIndex,
      leverageType,
      leverage,
      showToast,
    ]
  );

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    if (!wallet.isConnected || !wallet.address) {
      showToast("Connect your wallet to trade", "error");
      return;
    }

    if (!clients) {
      showToast("Wallet client not ready", "error");
      return;
    }

    // Check if wallet is on Arbitrum One
    if (wallet.chainId !== 42161) {
      showToast("Please switch to Arbitrum One network", "error");
      return;
    }

    // Check if user has an L2 account (deposited funds)
    const perpWithdrawable = parseFloat(accountInfo?.withdrawable ?? "0");
    const spotTotal = parseFloat(accountInfo?.spotTotal ?? "0");
    if (perpWithdrawable === 0 && spotTotal === 0) {
      showToast("No Hyperliquid L2 account found. Please deposit USDC first.", "error");
      return;
    }

    setLoading(true);
    try {
      // 1. Ensure leverage is set on-chain before placing the order.
      //    This is a no-op if leverage hasn't changed, but ensures the
      //    position margin mode matches the user's selection.
      await clients.exchangeAgent.updateLeverage({
        asset: assetIndex,
        isCross: leverageType === "cross",
        leverage,
      });

      // 2. Resolve the size in asset units
      const sizeUnits = sizeInUSD
        ? filledSize / (filledPrice || mid)
        : filledSize;

      // Round size to token's szDecimals precision
      const szDecimals = token?.szDecimals ?? 4;
      const roundedSize = Number(sizeUnits.toFixed(szDecimals));

      // 3. Resolve the limit price:
      //    - Limit orders: user's entered price
      //    - Market orders: slipped mid-price (IOC, so it fills immediately)
      const isBuy = side === "buy";
      const limitPx =
        orderType === "limit"
          ? filledPrice
          : isBuy
          ? mid * (1 + MARKET_SLIPPAGE)
          : mid * (1 - MARKET_SLIPPAGE);

      await clients.exchangeAgent.order({
        orders: [
          {
            a: assetIndex,
            b: isBuy,
            p: limitPx.toFixed(8).replace(/\.?0+$/, ""),
            s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
            r: reduceOnly,
            t: { limit: { tif: orderType === "market" ? "Ioc" : "Gtc" } },
          },
        ],
        grouping: "na",
      });

      // 4. Submit TP/SL trigger orders if specified
      if (tpPrice && parseFloat(tpPrice) > 0) {
        const tpTriggerPx = parseFloat(tpPrice).toFixed(8).replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isBuy, // opposite side to close
              p: tpTriggerPx,
              s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
              r: true, // reduce only
              t: { trigger: { triggerPx: tpTriggerPx, isMarket: true, tpsl: "tp" } },
            },
          ],
          grouping: "na",
        });
      }

      if (slPrice && parseFloat(slPrice) > 0) {
        const slTriggerPx = parseFloat(slPrice).toFixed(8).replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isBuy, // opposite side to close
              p: slTriggerPx,
              s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
              r: true, // reduce only
              t: { trigger: { triggerPx: slTriggerPx, isMarket: true, tpsl: "sl" } },
            },
          ],
          grouping: "na",
        });
      }

      showToast(
        `${side.toUpperCase()} ${roundedSize.toFixed(token?.szDecimals ?? 4)} ${
          selectedCoin
        } @ ${
          orderType === "market"
            ? "market"
            : `$${formatPrice(filledPrice)}`
        } submitted`,
        "success"
      );
      setSize("");
      if (orderType !== "limit") setPrice("");
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message
          : "Order failed";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const fillPct = useCallback(
    (pct: number) => {
      if (!availableBalance || availableBalance <= 0) return;
      const maxUsd = maxPositionSize * pct;
      if (sizeInUSD) {
        setSize(maxUsd.toFixed(2));
      } else {
        const p =
          orderType === "market"
            ? mid
            : parseFloat(price || String(mid));
        if (p > 0) setSize((maxUsd / p).toFixed(token?.szDecimals ?? 4));
      }
    },
    [availableBalance, maxPositionSize, sizeInUSD, price, mid, orderType, token]
  );

  // Auto-fill price from priceOverride prop when it changes
  useEffect(() => {
    if (priceOverride && orderType === "limit") {
      setPrice(priceOverride);
    }
  }, [priceOverride, orderType]);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Buy / Sell tabs */}
      <div className="grid grid-cols-2 rounded-xl overflow-hidden border border-[#334155]">
        {(["buy", "sell"] as OrderSide[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={[
              "py-2.5 text-sm font-semibold capitalize transition-colors cursor-pointer",
              side === s
                ? s === "buy"
                  ? "bg-[#22C55E] text-[#0F172A]"
                  : "bg-[#EF4444] text-white"
                : "text-[#475569] hover:text-[#94A3B8] bg-[#1E293B]",
            ].join(" ")}
            aria-pressed={side === s}
          >
            {s === "buy" ? "Long / Buy" : "Short / Sell"}
          </button>
        ))}
      </div>

      {/* Order type */}
      <div className="flex items-center gap-1 rounded-lg bg-[#1E293B] p-1">
        {(["limit", "market"] as OrderType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setOrderType(t);
              if (t === "market") setPrice("");
            }}
            className={[
              "flex-1 py-1.5 text-xs font-medium capitalize rounded transition-colors cursor-pointer",
              orderType === t
                ? "bg-[#272F42] text-[#F8FAFC]"
                : "text-[#475569] hover:text-[#94A3B8]",
            ].join(" ")}
            aria-pressed={orderType === t}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Leverage type */}
      <div className="flex items-center gap-1 rounded-lg bg-[#1E293B] p-1">
        {(["cross", "isolated"] as LeverageType[]).map((l) => (
          <button
            key={l}
            onClick={() => setLeverageType(l)}
            className={[
              "flex-1 py-1.5 text-xs font-medium capitalize rounded transition-colors cursor-pointer",
              leverageType === l
                ? "bg-[#272F42] text-[#F8FAFC]"
                : "text-[#475569] hover:text-[#94A3B8]",
            ].join(" ")}
            aria-pressed={leverageType === l}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Leverage slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[#475569]">Leverage</span>
          <span className="font-bold text-[#F59E0B]">{leverage}×</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxLev}
          value={leverage}
          onChange={(e) => handleLeverageChange(parseInt(e.target.value))}
          className="w-full accent-[#F59E0B] cursor-pointer"
          aria-label="Leverage multiplier"
          disabled={leverageUpdating}
        />
        <div className="flex gap-1">
          {LEVERAGE_PRESETS.filter((p) => p <= maxLev).map((p) => (
            <button
              key={p}
              onClick={() => handleLeverageChange(p)}
              className={[
                "flex-1 py-1 text-[10px] rounded font-medium transition-colors cursor-pointer",
                leverage === p
                  ? "bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40"
                  : "bg-[#1E293B] text-[#475569] hover:text-[#94A3B8] border border-transparent",
              ].join(" ")}
              disabled={leverageUpdating}
            >
              {p}×
            </button>
          ))}
        </div>
        {leverageUpdating && (
          <p className="text-xs text-[#F59E0B]">Updating leverage…</p>
        )}
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div className="space-y-1">
          <Input
            label="Limit Price"
            type="number"
            placeholder={mid > 0 ? formatPrice(mid) : "0"}
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setErrors((prev) => ({ ...prev, price: "" }));
            }}
            suffix="USD"
            error={errors.price}
          />
          <button
            className="text-[10px] text-[#F59E0B] hover:underline cursor-pointer"
            onClick={() => setPrice(formatPrice(mid))}
          >
            Use mark price
          </button>
        </div>
      )}

      {/* Market order info */}
      {orderType === "market" && mid > 0 && (
        <div className="rounded-lg bg-[#1E293B] border border-[#334155] px-3 py-2 text-xs text-[#475569]">
          Market order — fills at{" "}
          <span className="text-[#94A3B8] font-medium">
            ${formatPrice(
              side === "buy"
                ? mid * (1 + MARKET_SLIPPAGE)
                : mid * (1 - MARKET_SLIPPAGE)
            )}
          </span>{" "}
          ({(MARKET_SLIPPAGE * 100).toFixed(0)}% slippage guard, IOC)
        </div>
      )}

      {/* Size */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-[#94A3B8]">Size</label>
          <button
            className="text-[10px] text-[#475569] hover:text-[#94A3B8] cursor-pointer"
            onClick={() => setSizeInUSD((v) => !v)}
          >
            Switch to {sizeInUSD ? selectedCoin : "USD"}
          </button>
        </div>
        <div className="relative">
          <input
            type="number"
            placeholder="0"
            value={size}
            min={0}
            step="any"
            onChange={(e) => {
              setSize(e.target.value);
              setErrors((prev) => ({ ...prev, size: "" }));
            }}
            className={[
              "w-full rounded-lg border bg-[#0F172A] text-[#F8FAFC] text-sm px-3 py-2 pr-16 tabular-nums",
              "placeholder-[#475569] transition-colors focus:outline-none focus:ring-1",
              errors.size
                ? "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]"
                : "border-[#334155] hover:border-[#475569] focus:border-[#F59E0B] focus:ring-[#F59E0B]",
            ].join(" ")}
            aria-label="Order size"
            aria-invalid={!!errors.size}
            aria-describedby={errors.size ? "size-error" : undefined}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8] font-medium select-none">
            {sizeInUSD ? "USD" : selectedCoin}
          </span>
        </div>
        {errors.size && (
          <p id="size-error" className="text-xs text-[#EF4444]">
            {errors.size}
          </p>
        )}
      </div>

      {/* % fill shortcuts — based on max position size, not balance */}
      <div className="grid grid-cols-4 gap-1">
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            onClick={() => fillPct(pct / 100)}
            className="py-1 text-[10px] rounded bg-[#1E293B] text-[#475569] hover:bg-[#272F42] hover:text-[#94A3B8] transition-colors cursor-pointer border border-[#334155]"
          >
            {pct}%
          </button>
        ))}
      </div>

      {/* Order summary */}
      <div className="rounded-xl bg-[#1E293B] border border-[#334155] divide-y divide-[#334155] text-xs">
        {(
          [
            ["Notional", notional > 0 ? formatUSD(notional) : "—"],
            ["Margin Required", marginRequired > 0 ? formatUSD(marginRequired) : "—"],
            ["Max Position", maxPositionSize > 0 ? formatUSD(maxPositionSize) : "—"],
            ["Available", wallet.isConnected ? formatUSD(availableBalance) : "—"],
            [
              "Est. Liq. (cross)",
              notional > 0 && filledPrice > 0 && leverage > 0
                ? `$${formatPrice(
                    side === "buy"
                      ? filledPrice * (1 - 0.8 / leverage)
                      : filledPrice * (1 + 0.8 / leverage)
                  )}`
                : "—",
            ],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between px-3 py-2">
            <span className="text-[#475569]">{label}</span>
            <span className="text-[#94A3B8] tabular-nums">{value}</span>
          </div>
        ))}
      </div>

      {/* TP/SL Inputs */}
      <div className="space-y-2 border-t border-[#334155] pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#94A3B8]">Take Profit</label>
            <Input
              type="number"
              placeholder={mid > 0 ? formatPrice(mid * (side === "buy" ? 1.1 : 0.9)) : "0"}
              value={tpPrice}
              onChange={(e) => setTpPrice(e.target.value)}
              suffix="USD"
              step="0.01"
              error={errors.tpPrice}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#94A3B8]">Stop Loss</label>
            <Input
              type="number"
              placeholder={mid > 0 ? formatPrice(mid * (side === "buy" ? 0.9 : 1.1)) : "0"}
              value={slPrice}
              onChange={(e) => setSlPrice(e.target.value)}
              suffix="USD"
              step="0.01"
              error={errors.slPrice}
            />
          </div>
        </div>
        <p className="text-[10px] text-[#475569]">
          TP/SL will be submitted as trigger orders with the main order.
        </p>
      </div>

      {/* Current position indicator */}
      {currentSzi !== 0 && (
        <div className="rounded-lg bg-[#1E293B] border border-[#334155] p-2 text-xs">
          <div className="flex justify-between text-xs">
            <span className="text-[#475569]">Current Position</span>
            <span
              className={`font-medium ${isLong ? "text-[#22C55E]" : "text-[#EF4444]"}`}
            >
              {isLong ? "Long" : "Short"} {Math.abs(currentSzi).toFixed(4)} {
                selectedCoin
              }
            </span>
          </div>
          {currentPosition && (
            <div className="flex justify-between text-xs mt-1">
              <span className="text-[#475569]">Entry</span>
              <span className="text-[#94A3B8]">
                ${formatPrice(parseFloat(currentPosition.entryPx))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Submit */}
      <Button
        variant={side === "buy" ? "success" : "danger"}
        size="lg"
        fullWidth
        loading={loading}
        onClick={handleSubmit}
        className="mt-1"
      >
        {side === "buy" ? "Buy / Long" : "Sell / Short"} {selectedCoin}
      </Button>

      {!wallet.isConnected && (
        <p className="text-center text-xs text-[#475569]">
          Connect wallet to trade
        </p>
      )}
    </div>
  );
}