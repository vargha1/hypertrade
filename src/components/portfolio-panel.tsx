"use client";

import { useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { useWallet } from "@/hooks/use-wallet";
import { formatUSD, formatPrice, pnlClass } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { createHyperliquidClients } from "@/lib/hyperliquid-client";
import type { UserOpenOrder, UserOpenPosition } from "@/types";

type Tab = "positions" | "orders" | "history";

export function PortfolioPanel() {
  const {
    openPositions,
    openOrders,
    accountInfo,
    allMids,
    tokens,
    showToast,
    setOpenPositions,
    setOpenOrders,
    tradeHistory,
  } = useAppStore();
  const { wallet, hyperliquidWallet } = useWallet();
  const [tab, setTab] = useState<Tab>("positions");
  const [closing, setClosing] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<number | null>(null);

  // Edit order state
  const [editingOrder, setEditingOrder] = useState<UserOpenOrder | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editTpPrice, setEditTpPrice] = useState("");
  const [editSlPrice, setEditSlPrice] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // Edit position state
  const [editingPosition, setEditingPosition] = useState<UserOpenPosition | null>(null);
  const [posTpPrice, setPosTpPrice] = useState("");
  const [posSlPrice, setPosSlPrice] = useState("");
  const [posLoading, setPosLoading] = useState(false);

  // Create SDK clients
  const clients = hyperliquidWallet
    ? createHyperliquidClients(hyperliquidWallet)
    : null;

  const totalPnl = openPositions.reduce(
    (sum, p) => sum + parseFloat(p.unrealizedPnl),
    0
  );
  const totalValue = parseFloat(accountInfo?.accountValue ?? "0");
  const totalMargin = parseFloat(
    accountInfo?.crossMarginSummary?.totalMarginUsed ?? "0"
  );

  // ─── Open edit modal ────────────────────────────────────────────────────
  function openEditModal(order: UserOpenOrder) {
    setEditingOrder(order);
    setEditPrice(formatPrice(parseFloat(order.limitPx)));
    setEditSize(order.sz);
    setEditTpPrice("");
    setEditSlPrice("");
  }

  // ─── Submit edit (cancel old + place new) ────────────────────────────────
  async function handleSubmitEdit() {
    if (!editingOrder || !clients || !wallet.address) return;

    const assetIndex = tokens.findIndex((t) => t.name === editingOrder.coin);
    const token = tokens.find((t) => t.name === editingOrder.coin);
    if (assetIndex === -1) {
      showToast(`Unknown asset: ${editingOrder.coin}`, "error");
      return;
    }

    const price = parseFloat(editPrice);
    const size = parseFloat(editSize);
    if (price <= 0 || size <= 0) {
      showToast("Enter valid price and size", "error");
      return;
    }

    setEditLoading(true);
    try {
      // 1. Cancel old order
      await clients.exchangeAgent.cancel({
        cancels: [{ a: assetIndex, o: editingOrder.oid }],
      });

      // 2. Place new order with updated params
      const isBuy = editingOrder.side === "B";
      const szDecimals = token?.szDecimals ?? 4;
      const roundedSize = Number(size.toFixed(szDecimals));

      await clients.exchangeAgent.order({
        orders: [
          {
            a: assetIndex,
            b: isBuy,
            p: price.toFixed(2).replace(/\.?0+$/, ""),
            s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
            r: editingOrder.reduceOnly,
            t: { limit: { tif: "Gtc" } },
          },
        ],
        grouping: "na",
      });

      // 3. Submit TP/SL trigger orders if specified
      if (editTpPrice && parseFloat(editTpPrice) > 0) {
        const tpTriggerPx = parseFloat(editTpPrice)
          .toFixed(8)
          .replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isBuy,
              p: tpTriggerPx,
              s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
              r: true,
              t: {
                trigger: {
                  triggerPx: tpTriggerPx,
                  isMarket: true,
                  tpsl: "tp",
                },
              },
            },
          ],
          grouping: "na",
        });
      }

      if (editSlPrice && parseFloat(editSlPrice) > 0) {
        const slTriggerPx = parseFloat(editSlPrice)
          .toFixed(8)
          .replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isBuy,
              p: slTriggerPx,
              s: roundedSize.toFixed(szDecimals).replace(/\.?0+$/, ""),
              r: true,
              t: {
                trigger: {
                  triggerPx: slTriggerPx,
                  isMarket: true,
                  tpsl: "sl",
                },
              },
            },
          ],
          grouping: "na",
        });
      }

      showToast(
        `Order updated: ${isBuy ? "Buy" : "Sell"} ${roundedSize} ${editingOrder.coin} @ $${formatPrice(price)}`,
        "success"
      );

      // Update UI
      setOpenOrders(
        openOrders.map((o) =>
          o.oid === editingOrder.oid
            ? { ...o, limitPx: String(price), sz: String(roundedSize) }
            : o
        )
      );
      setEditingOrder(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message.slice(0, 160)
          : "Failed to edit order";
      showToast(msg, "error");
    } finally {
      setEditLoading(false);
    }
  }

  // ─── Edit position: add/update TP/SL ───────────────────────────────────
  function openEditPositionModal(position: UserOpenPosition) {
    setEditingPosition(position);
    setPosTpPrice("");
    setPosSlPrice("");
  }

  async function handleSubmitEditPosition() {
    if (!editingPosition || !clients || !wallet.address) return;

    const assetIndex = tokens.findIndex((t) => t.name === editingPosition.coin);
    const token = tokens.find((t) => t.name === editingPosition.coin);
    if (assetIndex === -1) {
      showToast(`Unknown asset: ${editingPosition.coin}`, "error");
      return;
    }

    const size = Math.abs(parseFloat(editingPosition.szi));
    const isLong = parseFloat(editingPosition.szi) > 0;

    setPosLoading(true);
    try {
      // Submit TP trigger order if specified
      if (posTpPrice && parseFloat(posTpPrice) > 0) {
        const tpTriggerPx = parseFloat(posTpPrice)
          .toFixed(8)
          .replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isLong,
              p: tpTriggerPx,
              s: Number(size.toFixed(token?.szDecimals ?? 4)).toString(),
              r: true,
              t: {
                trigger: {
                  triggerPx: tpTriggerPx,
                  isMarket: true,
                  tpsl: "tp",
                },
              },
            },
          ],
          grouping: "na",
        });
      }

      // Submit SL trigger order if specified
      if (posSlPrice && parseFloat(posSlPrice) > 0) {
        const slTriggerPx = parseFloat(posSlPrice)
          .toFixed(8)
          .replace(/\.?0+$/, "");
        await clients.exchangeAgent.order({
          orders: [
            {
              a: assetIndex,
              b: !isLong,
              p: slTriggerPx,
              s: Number(size.toFixed(token?.szDecimals ?? 4)).toString(),
              r: true,
              t: {
                trigger: {
                  triggerPx: slTriggerPx,
                  isMarket: true,
                  tpsl: "sl",
                },
              },
            },
          ],
          grouping: "na",
        });
      }

      showToast(
        `TP/SL updated for ${editingPosition.coin}-PERP`,
        "success"
      );
      setEditingPosition(null);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message.slice(0, 160)
          : "Failed to set TP/SL";
      showToast(msg, "error");
    } finally {
      setPosLoading(false);
    }
  }

  async function handleClosePosition(coin: string, szi: string) {
    if (!wallet.address || !clients) return;

    const assetIndex = tokens.findIndex((t) => t.name === coin);
    const token = tokens.find((t) => t.name === coin);
    if (assetIndex === -1) {
      showToast(`Unknown asset: ${coin}`, "error");
      return;
    }

    const markPx = parseFloat(allMids[coin] ?? "0");
    if (markPx <= 0) {
      showToast("Mark price unavailable — try again", "error");
      return;
    }

    setClosing(coin);
    try {
      const isLong = parseFloat(szi) > 0;
      const limitPx = isLong ? markPx * 0.97 : markPx * 1.03;

      await clients.exchangeAgent.order({
        orders: [
          {
            a: assetIndex,
            b: !isLong,
            p: limitPx.toFixed(2).replace(/\.?0+$/, ""),
            s: Number(
              Math.abs(parseFloat(szi)).toFixed(token?.szDecimals ?? 4)
            ).toString(),
            r: true,
            t: { limit: { tif: "Ioc" } },
          },
        ],
        grouping: "na",
      });

      showToast(`Close order for ${coin}-PERP submitted`, "success");
      setOpenPositions(openPositions.filter((p) => p.coin !== coin));
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message
          : "Failed to close position";
      showToast(msg, "error");
    } finally {
      setClosing(null);
    }
  }

  async function handleCancelOrder(oid: number, coin: string) {
    if (!wallet.address || !clients) return;

    const assetIndex = tokens.findIndex((t) => t.name === coin);
    if (assetIndex === -1) {
      showToast(`Unknown asset: ${coin}`, "error");
      return;
    }

    setCancelling(oid);
    try {
      await clients.exchangeAgent.cancel({
        cancels: [{ a: assetIndex, o: oid }],
      });
      showToast("Order cancelled", "success");
      setOpenOrders(openOrders.filter((o) => o.oid !== oid));
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.includes("user rejected") ||
            err.message.includes("User denied")
            ? "Transaction rejected"
            : err.message
          : "Failed to cancel order";
      showToast(msg, "error");
    } finally {
      setCancelling(null);
    }
  }

  if (!wallet.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#1E293B] flex items-center justify-center">
          <svg
            className="w-7 h-7 text-[#475569]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-medium text-[#F8FAFC]">
            Connect your wallet
          </p>
          <p className="text-xs text-[#475569] mt-1">
            to view your positions and orders
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Account summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-[#334155]">
        {[
          {
            label: "Account Value",
            value: formatUSD(totalValue),
            pnl: null,
          },
          {
            label: "Unrealized PnL",
            value: formatUSD(totalPnl),
            sub:
              totalValue > 0
                ? `${((totalPnl / totalValue) * 100).toFixed(2)}%`
                : null,
            pnl: totalPnl,
          },
          {
            label: "Margin Used",
            value: formatUSD(totalMargin),
            sub:
              totalValue > 0
                ? `${((totalMargin / totalValue) * 100).toFixed(1)}%`
                : null,
            pnl: null,
          },
          {
            label: "Withdrawable",
            value: formatUSD(
              parseFloat(accountInfo?.withdrawable ?? "0")
            ),
            pnl: null,
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl bg-[#1E293B] border border-[#334155] px-4 py-3"
          >
            <p className="text-xs text-[#475569] mb-1">{card.label}</p>
            <p
              className={[
                "text-base font-bold tabular-nums",
                card.pnl !== null ? pnlClass(card.pnl) : "text-[#F8FAFC]",
              ].join(" ")}
            >
              {card.value}
            </p>
            {"sub" in card && card.sub && (
              <p
                className={`text-xs tabular-nums ${
                  card.pnl !== null ? pnlClass(card.pnl) : "text-[#475569]"
                }`}
              >
                {card.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#334155]">
        {(["positions", "orders", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-5 py-2.5 text-sm font-medium capitalize transition-colors cursor-pointer border-b-2",
              tab === t
                ? "text-[#F59E0B] border-[#F59E0B]"
                : "text-[#475569] hover:text-[#94A3B8] border-transparent",
            ].join(" ")}
            aria-selected={tab === t}
            role="tab"
          >
            {t}
            {t === "positions" && openPositions.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-[10px] font-bold">
                {openPositions.length}
              </span>
            )}
            {t === "orders" && openOrders.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-[#8B5CF6]/15 text-[#8B5CF6] text-[10px] font-bold">
                {openOrders.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto" role="tabpanel">
        {/* ── Positions ── */}
        {tab === "positions" && (
          <>
            {openPositions.length === 0 ? (
              <EmptyState label="No open positions" />
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs min-w-[700px]"
                  aria-label="Open positions"
                >
                  <thead>
                    <tr className="text-[#475569] text-left border-b border-[#334155]">
                      {[
                        "Market",
                        "Side",
                        "Size",
                        "Entry",
                        "Mark",
                        "Liq.",
                        "Margin",
                        "PnL",
                        "ROE",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 font-medium whitespace-nowrap"
                          scope="col"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map((pos) => {
                      const markPx = parseFloat(allMids[pos.coin] ?? "0");
                      const pnlNum = parseFloat(pos.unrealizedPnl);
                      const roe = parseFloat(pos.returnOnEquity) * 100;
                      const isLong = pos.side === "B";
                      return (
<tr
                      key={pos.coin}
                      className="border-b border-[#1E293B] hover:bg-[#1E293B] transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-[#F8FAFC]">
                        {pos.coin}-PERP
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isLong ? "success" : "danger"}>
                          {isLong ? "Long" : "Short"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#F8FAFC]">
                        {Math.abs(parseFloat(pos.szi)).toFixed(4)}{" "}
                        <span className="text-[#475569]">{pos.coin}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#94A3B8]">
                        ${formatPrice(parseFloat(pos.entryPx))}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#F8FAFC]">
                        {markPx > 0 ? `$${formatPrice(markPx)}` : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#EF4444]">
                        {parseFloat(pos.liquidationPx) > 0
                          ? `$${formatPrice(parseFloat(pos.liquidationPx))}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[#94A3B8]">
                        {formatUSD(parseFloat(pos.marginUsed))}
                      </td>
                      <td
                        className={`px-4 py-3 tabular-nums font-semibold ${pnlClass(pnlNum)}`}
                      >
                        {pnlNum >= 0 ? "+" : ""}
                        {formatUSD(pnlNum)}
                      </td>
                      <td
                        className={`px-4 py-3 tabular-nums text-xs ${pnlClass(roe)}`}
                      >
                        {roe >= 0 ? "+" : ""}
                        {roe.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openEditPositionModal(pos)}
                            className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
                            aria-label={`Edit TP/SL for ${pos.coin} position`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="xs"
                            loading={closing === pos.coin}
                            onClick={() =>
                              handleClosePosition(pos.coin, pos.szi)
                            }
                            aria-label={`Close ${pos.coin} position`}
                          >
                            Close
                          </Button>
                        </div>
                      </td>
                    </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Open Orders ── */}
        {tab === "orders" && (
          <>
            {openOrders.length === 0 ? (
              <EmptyState label="No open orders" />
            ) : (
              <div className="overflow-x-auto">
                <table
                  className="w-full text-xs min-w-[650px]"
                  aria-label="Open orders"
                >
                  <thead>
                    <tr className="text-[#475569] text-left border-b border-[#334155]">
                      {[
                        "Market",
                        "Type",
                        "Side",
                        "Size",
                        "Filled",
                        "Price",
                        "Time",
                        "",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 font-medium whitespace-nowrap"
                          scope="col"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openOrders.map((order) => {
                      const isBuy = order.side === "B";
                      const origSz = parseFloat(order.origSz);
                      const remSz = parseFloat(order.sz);
                      const filledPct =
                        origSz > 0 ? ((origSz - remSz) / origSz) * 100 : 0;
                      return (
                        <tr
                          key={order.oid}
                          className="border-b border-[#1E293B] hover:bg-[#1E293B] transition-colors"
                        >
                          <td className="px-4 py-3 font-semibold text-[#F8FAFC]">
                            {order.coin}-PERP
                          </td>
                          <td className="px-4 py-3 text-[#94A3B8] capitalize">
                            {order.orderType}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={isBuy ? "success" : "danger"}>
                              {isBuy ? "Buy" : "Sell"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-[#F8FAFC]">
                            {remSz.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-[#334155] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#F59E0B]"
                                  style={{ width: `${filledPct}%` }}
                                />
                              </div>
                              <span className="text-[#475569]">
                                {filledPct.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-[#94A3B8]">
                            ${formatPrice(parseFloat(order.limitPx))}
                          </td>
                          <td className="px-4 py-3 text-[#475569]">
                            {new Date(order.timestamp).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => openEditModal(order)}
                                className="text-[#F59E0B] hover:text-[#F59E0B] hover:bg-[#F59E0B]/10"
                                aria-label={`Edit order ${order.oid}`}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                loading={cancelling === order.oid}
                                onClick={() =>
                                  handleCancelOrder(order.oid, order.coin)
                                }
                                className="text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10"
                                aria-label={`Cancel order ${order.oid}`}
                              >
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── History ── */}
        {tab === "history" && (
          <div className="flex-1 overflow-auto">
            {tradeHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
                <svg
                  className="w-10 h-10 text-[#334155]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-[#475569]">No trade history yet</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0F172A]">
                  <tr className="text-[#475569] text-left">
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Coin</th>
                    <th className="px-3 py-2 font-medium">Side</th>
                    <th className="px-3 py-2 font-medium text-right">Size</th>
                    <th className="px-3 py-2 font-medium text-right">Price</th>
                    <th className="px-3 py-2 font-medium text-right">PnL</th>
                    <th className="px-3 py-2 font-medium text-right">Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B]">
                  {tradeHistory.map((fill, i) => {
                    const isBuy = fill.side === "B";
                    const pnl = parseFloat(fill.closedPnl);
                    const fee = parseFloat(fill.fee);
                    const px = parseFloat(fill.px);
                    const sz = parseFloat(fill.sz);
                    const ts = new Date(fill.time);
                    return (
                      <tr
                        key={`${fill.hash}-${i}`}
                        className="hover:bg-[#1E293B] transition-colors"
                      >
                        <td className="px-3 py-1.5 text-[#94A3B8] whitespace-nowrap">
                          {ts.toLocaleDateString()} {ts.toLocaleTimeString()}
                        </td>
                        <td className="px-3 py-1.5 text-[#F8FAFC] font-medium">
                          {fill.coin}
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={
                              isBuy ? "text-[#22C55E]" : "text-[#EF4444]"
                            }
                          >
                            {isBuy ? "Buy" : "Sell"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#94A3B8] tabular-nums">
                          {sz.toFixed(4)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#94A3B8] tabular-nums">
                          ${formatPrice(px)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                            pnl > 0
                              ? "text-[#22C55E]"
                              : pnl < 0
                              ? "text-[#EF4444]"
                              : "text-[#475569]"
                          }`}
                        >
                          {pnl !== 0 ? formatUSD(pnl) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#EF4444] tabular-nums">
                          {fee !== 0 ? `-${formatUSD(fee)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ─── Edit Order Modal ─── */}
      {editingOrder && (
        <Modal
          open={!!editingOrder}
          onClose={() => setEditingOrder(null)}
          title={`Edit Order — ${editingOrder.coin}-PERP`}
        >
          <div className="space-y-4">
            {/* Order info */}
            <div className="flex items-center gap-3 rounded-lg bg-[#0F172A] border border-[#334155] p-3 text-xs">
              <Badge
                variant={editingOrder.side === "B" ? "success" : "danger"}
              >
                {editingOrder.side === "B" ? "Buy" : "Sell"}
              </Badge>
              <span className="text-[#94A3B8]">
                {editingOrder.orderType} ·{" "}
                {editingOrder.reduceOnly ? "Reduce Only" : "Open"}
              </span>
            </div>

            {/* Price */}
            <Input
              label="Price"
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              suffix="USD"
              step="0.01"
            />

            {/* Size */}
            <Input
              label="Size"
              type="number"
              value={editSize}
              onChange={(e) => setEditSize(e.target.value)}
              suffix={editingOrder.coin}
              step="any"
            />

            {/* TP/SL */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Take Profit"
                type="number"
                value={editTpPrice}
                onChange={(e) => setEditTpPrice(e.target.value)}
                placeholder="Optional"
                suffix="USD"
                step="0.01"
              />
              <Input
                label="Stop Loss"
                type="number"
                value={editSlPrice}
                onChange={(e) => setEditSlPrice(e.target.value)}
                placeholder="Optional"
                suffix="USD"
                step="0.01"
              />
            </div>

            {/* Preview */}
            {parseFloat(editPrice) > 0 && parseFloat(editSize) > 0 && (
              <div className="rounded-lg bg-[#0F172A] border border-[#334155] divide-y divide-[#334155] text-xs">
                {[
                  [
                    "Notional",
                    formatUSD(
                      parseFloat(editPrice) * parseFloat(editSize)
                    ),
                  ],
                  [
                    "New Price",
                    `$${formatPrice(parseFloat(editPrice))}`,
                  ],
                  [
                    "Current Price",
                    `$${formatPrice(
                      parseFloat(allMids[editingOrder.coin] ?? "0")
                    )}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex justify-between px-3 py-2"
                  >
                    <span className="text-[#475569]">{label}</span>
                    <span className="text-[#94A3B8] tabular-nums">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-[#475569]">
              This cancels the existing order and places a new one with the
              updated parameters.
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => setEditingOrder(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={editLoading}
                onClick={handleSubmitEdit}
              >
                Update Order
              </Button>
            </div>
          </div>
        </Modal>
      )}

            {/* ─── Edit Position Modal (TP/SL) ─── */}
      {editingPosition && (
        <Modal
          open={!!editingPosition}
          onClose={() => setEditingPosition(null)}
          title={`Edit Position — ${editingPosition.coin}-PERP`}
        >
          <div className="space-y-4">
            {/* Position info */}
            <div className="flex items-center gap-3 rounded-lg bg-[#0F172A] border border-[#334155] p-3 text-xs">
              <Badge
                variant={parseFloat(editingPosition.szi) > 0 ? "success" : "danger"}
              >
                {parseFloat(editingPosition.szi) > 0 ? "Long" : "Short"}
              </Badge>
              <span className="text-[#94A3B8]">
                {Math.abs(parseFloat(editingPosition.szi)).toFixed(4)} {editingPosition.coin} · Entry ${formatPrice(
                  parseFloat(editingPosition.entryPx)
                )}
              </span>
            </div>
            {/* Current mark price */}
            {(() => {
              const markPx = parseFloat(
                allMids[editingPosition.coin] ?? "0"
              );
              return (
                <div className="text-xs text-[#475569]">
                  Mark: ${formatPrice(markPx)} · Liq: ${formatPrice(
                    parseFloat(editingPosition.liquidationPx)
                  )}
                </div>
              );
            })()}
            {/* TP/SL */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Take Profit"
                type="number"
                value={posTpPrice}
                onChange={(e) => setPosTpPrice(e.target.value)}
                placeholder="Optional"
                suffix="USD"
                step="0.01"
              />
              <Input
                label="Stop Loss"
                type="number"
                value={posSlPrice}
                onChange={(e) => setPosSlPrice(e.target.value)}
                placeholder="Optional"
                suffix="USD"
                step="0.01"
              />
            </div>
            <p className="text-[10px] text-[#475569]">
              TP/SL trigger orders will be placed as reduce-only market orders
            </p>
            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="lg"
                fullWidth
                onClick={() => setEditingPosition(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                loading={posLoading}
                onClick={handleSubmitEditPosition}
              >
                Set TP/SL
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
      <svg
        className="w-8 h-8 text-[#334155]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
        />
      </svg>
      <p className="text-sm text-[#475569]">{label}</p>
    </div>
  );
}
