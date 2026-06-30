"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type SeriesType,
  type Time,
  CrosshairMode,
  ColorType,
} from "lightweight-charts";
import { useAppStore } from "@/stores/app-store";
import { formatPrice } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const HL_WS_URL = "wss://api.hyperliquid.xyz/ws";

interface CandleSnapshot {
  t: number; // open time (ms)
  T: number; // close time (ms)
  s: string; // symbol
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
}

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const HL_API = "https://api.hyperliquid.xyz/info";

async function fetchCandles(
  coin: string,
  interval: string
): Promise<CandlestickData<Time>[]> {
  const intervalMs: Record<string, number> = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
  };
  const now = Date.now();
  const ms = intervalMs[interval] ?? 3_600_000;
  const startTime = now - ms * 500;

  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime: now },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data = (await res.json()) as CandleSnapshot[];
  return data.map((c) => ({
    time: Math.floor(c.t / 1000) as Time,
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
  }));
}

export function PriceChart() {
  const { selectedCoin, allMids, assetContexts } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCandleTimeRef = useRef<number>(0);
  const pollIntervalRef = useRef<number | null>(null);

  const [interval, setInterval] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");
  const ctx = assetContexts[selectedCoin];
  const prevDay = ctx?.prevDayPx ?? mid;
  const change =
    prevDay && prevDay !== mid ? ((mid - prevDay) / prevDay) * 100 : 0;
  const changeUp = change >= 0;

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0F172A" },
        textColor: "#94A3B8",
        fontFamily: "Inter, ui-sans-serif, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1E293B" },
        horzLines: { color: "#1E293B" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#334155", labelBackgroundColor: "#222735" },
        horzLine: { color: "#334155", labelBackgroundColor: "#222735" },
      },
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderUpColor: "#22C55E",
      borderDownColor: "#EF4444",
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.resize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load initial candles
  useEffect(() => {
    if (!seriesRef.current) return;
    setLoading(true);
    setLoadError(null);

    fetchCandles(selectedCoin, interval)
      .then((candles) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (seriesRef.current as any).setData(candles);
        chartRef.current?.timeScale().fitContent();
        if (candles.length > 0) {
          lastCandleTimeRef.current = candles[candles.length - 1].time as number;
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [selectedCoin, interval, retryKey]);

  // Live WebSocket candle updates
  useEffect(() => {
    if (!selectedCoin || !interval) return;
    let alive = true;

    function connect() {
      const ws = new WebSocket(HL_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            method: "subscribe",
            subscription: { type: "candle", coin: selectedCoin, interval },
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            channel: string;
            data: CandleSnapshot | CandleSnapshot[];
          };
          if (msg.channel === "candle" && seriesRef.current) {
            const candle = Array.isArray(msg.data) ? msg.data[0] : msg.data;
            const candleTime = Math.floor(candle.t / 1000);

            if (candleTime >= lastCandleTimeRef.current) {
              const newCandle: CandlestickData<Time> = {
                time: candleTime as Time,
                open: parseFloat(candle.o),
                high: parseFloat(candle.h),
                low: parseFloat(candle.l),
                close: parseFloat(candle.c),
              };

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (seriesRef.current as any).update(newCandle);
              lastCandleTimeRef.current = candleTime;
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!alive) return;
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    // Fallback: poll for new candles every 5s
    pollIntervalRef.current = window.setInterval(() => {
      if (!seriesRef.current) return;
      fetchCandles(selectedCoin, interval)
        .then((candles) => {
          if (candles.length > 0) {
            const last = candles[candles.length - 1];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (seriesRef.current as any).update(last);
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      alive = false;
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      if (pollIntervalRef.current) window.clearInterval(pollIntervalRef.current);
      wsRef.current?.close();
    };
  }, [selectedCoin, interval]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#334155] flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-[#F8FAFC]">{selectedCoin}/USD</span>
          {mid > 0 && (
            <>
              <span className="font-mono tabular-nums font-semibold text-[#F8FAFC]">
                ${formatPrice(mid)}
              </span>
              <span
                className={`text-sm tabular-nums font-medium ${
                  changeUp ? "text-[#22C55E]" : "text-[#EF4444]"
                }`}
              >
                {changeUp ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            </>
          )}
          {ctx && (
            <div className="hidden lg:flex items-center gap-4 text-xs text-[#475569]">
              <span>
                24h Vol:{" "}
                <span className="text-[#94A3B8]">
                  ${(ctx.dayNtlVlm / 1_000_000).toFixed(1)}M
                </span>
              </span>
              <span>
                Mark:{" "}
                <span className="text-[#94A3B8]">${formatPrice(ctx.markPx)}</span>
              </span>
              <span>
                Funding:{" "}
                <span
                  className={
                    ctx.fundingRate >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                  }
                >
                  {ctx.fundingRate >= 0 ? "+" : ""}
                  {(ctx.fundingRate * 100).toFixed(4)}%
                </span>
              </span>
              <span>
                OI:{" "}
                <span className="text-[#94A3B8]">
                  ${((ctx.openInterest * mid) / 1_000_000).toFixed(1)}M
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Interval selector */}
        <div className="flex items-center gap-0.5 rounded-lg bg-[#1E293B] p-0.5">
          {INTERVALS.map((iv) => (
            <button
              key={iv.value}
              onClick={() => setInterval(iv.value)}
              className={[
                "px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer",
                interval === iv.value
                  ? "bg-[#F59E0B] text-[#0F172A]"
                  : "text-[#475569] hover:text-[#94A3B8]",
              ].join(" ")}
              aria-pressed={interval === iv.value}
            >
              {iv.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0F172A]/70 z-10">
            <Spinner size={28} />
          </div>
        )}

        {loadError && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
            <svg
              className="w-8 h-8 text-[#EF4444]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-[#94A3B8]">Failed to load chart</p>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="text-xs text-[#F59E0B] hover:underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}