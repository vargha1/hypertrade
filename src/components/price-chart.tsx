"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type SeriesType,
  type Time,
  CrosshairMode,
  ColorType,
} from "lightweight-charts";
import { useAppStore } from "@/stores/app-store";
import { formatPrice } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

const HL_WS_URL = "wss://api.hyperliquid.xyz/ws";
const HL_API = "https://api.hyperliquid.xyz/info";

interface CandleSnapshot {
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

const INTERVALS = [
  { label: "1m", value: "1m" },
  { label: "5m", value: "5m" },
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "4h", value: "4h" },
  { label: "1d", value: "1d" },
];

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

function parseCandles(data: CandleSnapshot[]) {
  const candles: CandlestickData<Time>[] = [];
  const volumes: HistogramData<Time>[] = [];
  for (const c of data) {
    const time = Math.floor(c.t / 1000) as Time;
    const open = parseFloat(c.o);
    const close = parseFloat(c.c);
    const vol = parseFloat(c.v);
    candles.push({
      time,
      open,
      high: parseFloat(c.h),
      low: parseFloat(c.l),
      close,
    });
    volumes.push({
      time,
      value: vol,
      color: close >= open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    });
  }
  return { candles, volumes };
}

async function fetchCandleData(
  coin: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<CandleSnapshot[]> {
  const res = await fetch(HL_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function PriceChart() {
  const { selectedCoin, allMids, assetContexts, openPositions, openOrders } =
    useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const priceLinesRef = useRef<
    ReturnType<ISeriesApi<SeriesType>["createPriceLine"]>[]
  >([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  // ── Candle state tracking (for infinite scroll merge) ──
  const allCandlesRef = useRef<Map<Time, CandlestickData<Time>>>(new Map());
  const allVolumesRef = useRef<Map<Time, HistogramData<Time>>>(new Map());
  const isLoadingMoreRef = useRef(false);
  const loadMoreDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [interval, setInterval] = useState("1h");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // OHLC crosshair data
  const [hoverOHLV, setHoverOHLV] = useState<{
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  } | null>(null);

  const mid = parseFloat(allMids[selectedCoin] ?? "0");
  const ctx = assetContexts[selectedCoin];
  const prevDay = ctx?.prevDayPx ?? mid;
  const change =
    prevDay && prevDay !== mid ? ((mid - prevDay) / prevDay) * 100 : 0;
  const changeUp = change >= 0;

  const currentPosition = openPositions.find(
    (p) => p.coin === selectedCoin && parseFloat(p.szi) !== 0
  );
  const entryPx = currentPosition ? parseFloat(currentPosition.entryPx) : 0;

  const pendingOrders = openOrders.filter(
    (o) => o.coin === selectedCoin && !o.triggerCondition
  );

  // ─── Helper: merge candles into map and push to series ──────────────────
  const mergeAndSetCandles = useCallback(
    (
      newCandles: CandlestickData<Time>[],
      newVolumes: HistogramData<Time>[]
    ) => {
      for (const c of newCandles) allCandlesRef.current.set(c.time, c);
      for (const v of newVolumes) allVolumesRef.current.set(v.time, v);

      const sortedCandles = Array.from(allCandlesRef.current.values()).sort(
        (a, b) => (Number(a.time) - Number(b.time))
      );
      const sortedVolumes = Array.from(allVolumesRef.current.values()).sort(
        (a, b) => (Number(a.time) - Number(b.time))
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (seriesRef.current as any)?.setData(sortedCandles);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (volumeSeriesRef.current as any)?.setData(sortedVolumes);
    },
    []
  );

  // ─── Create chart once ──────────────────────────────────────────────────
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
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        minBarSpacing: 1,
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22C55E",
      downColor: "#EF4444",
      borderUpColor: "#22C55E",
      borderDownColor: "#EF4444",
      wickUpColor: "#22C55E",
      wickDownColor: "#EF4444",
    });
    seriesRef.current = candleSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeriesRef.current = volSeries;
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // ─── OHLC crosshair handler ──────────────────────────────────────────
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverOHLV(null);
        return;
      }

      const candleData = param.seriesData.get(candleSeries) as
        | CandlestickData<Time>
        | undefined;
      const volData = param.seriesData.get(volSeries) as
        | HistogramData<Time>
        | undefined;

      if (candleData) {
        setHoverOHLV({
          o: candleData.open,
          h: candleData.high,
          l: candleData.low,
          c: candleData.close,
          v: volData?.value ?? 0,
        });
      }
    });

    // ─── Resize observer ──────────────────────────────────────────────────
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
      volumeSeriesRef.current = null;
    };
  }, []);

  // ─── Load initial candles ────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !volumeSeriesRef.current) return;
    setLoading(true);
    setLoadError(null);
    isLoadingMoreRef.current = false;

    // Clear old data
    allCandlesRef.current.clear();
    allVolumesRef.current.clear();

    const now = Date.now();
    const ms = INTERVAL_MS[interval] ?? 3_600_000;
    const startTime = now - ms * 500;

    fetchCandleData(selectedCoin, interval, startTime, now)
      .then((data) => {
        if (!seriesRef.current) return;
        const { candles, volumes } = parseCandles(data);

        // Store all candles in the tracking map
        for (const c of candles) allCandlesRef.current.set(c.time, c);
        for (const v of volumes) allVolumesRef.current.set(v.time, v);

        const sortedCandles = Array.from(allCandlesRef.current.values()).sort(
          (a, b) => (Number(a.time) - Number(b.time))
        );
        const sortedVolumes = Array.from(allVolumesRef.current.values()).sort(
          (a, b) => (Number(a.time) - Number(b.time))
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (seriesRef.current as any).setData(sortedCandles);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (volumeSeriesRef.current as any).setData(sortedVolumes);

        chartRef.current?.timeScale().fitContent();
        chartRef.current?.timeScale().scrollToRealTime();
        setLoading(false);
      })
      .catch((err: Error) => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [selectedCoin, interval, retryKey]);

  // ─── Infinite scroll: load older candles when scrolling left ──────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !seriesRef.current) return;

    const handleVisibleRange = () => {
      if (isLoadingMoreRef.current) return;

      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      if (!visibleRange) return;

      // Only trigger when user scrolls close to the left edge
      if (visibleRange.from > 30) return;

      // Debounce: don't fire more than once per second
      if (loadMoreDebounceRef.current) return;

      const earliestTime = Array.from(allCandlesRef.current.keys()).sort(
        (a, b) => Number(a) - Number(b)
      )[0];
      if (!earliestTime) return;

      isLoadingMoreRef.current = true;
      loadMoreDebounceRef.current = setTimeout(() => {
        loadMoreDebounceRef.current = null;
      }, 1000);

      const ms = INTERVAL_MS[interval] ?? 3_600_000;
      const earliestMs = Number(earliestTime) * 1000;
      const olderStart = earliestMs - ms * 250;
      const olderEnd = earliestMs - 1;

      fetchCandleData(selectedCoin, interval, olderStart, olderEnd)
        .then((data) => {
          if (data.length === 0 || !seriesRef.current) {
            isLoadingMoreRef.current = false;
            return;
          }

          const { candles, volumes } = parseCandles(data);

          // Merge into existing data (keyed by time, so duplicates overwrite)
          for (const c of candles) allCandlesRef.current.set(c.time, c);
          for (const v of volumes) allVolumesRef.current.set(v.time, v);

          const sortedCandles = Array.from(allCandlesRef.current.values()).sort(
            (a, b) => (Number(a.time) - Number(b.time))
          );
          const sortedVolumes = Array.from(allVolumesRef.current.values()).sort(
            (a, b) => (Number(a.time) - Number(b.time))
          );

          // Use setData with full merged array — preserves scroll position
          // because lightweight-charts keeps the visible range stable
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (seriesRef.current as any).setData(sortedCandles);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (volumeSeriesRef.current as any).setData(sortedVolumes);

          isLoadingMoreRef.current = false;
        })
        .catch(() => {
          isLoadingMoreRef.current = false;
        });
    };

    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);
    return () => {
      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      if (loadMoreDebounceRef.current) {
        clearTimeout(loadMoreDebounceRef.current);
        loadMoreDebounceRef.current = null;
      }
    };
  }, [selectedCoin, interval]);

  // ─── Live WebSocket candle updates ────────────────────────────────────────
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
            const time = Math.floor(candle.t / 1000) as Time;
            const open = parseFloat(candle.o);
            const close = parseFloat(candle.c);
            const vol = parseFloat(candle.v);

            const candleData: CandlestickData<Time> = {
              time,
              open,
              high: parseFloat(candle.h),
              low: parseFloat(candle.l),
              close,
            };
            const volData: HistogramData<Time> = {
              time,
              value: vol,
              color:
                close >= open
                  ? "rgba(34,197,94,0.3)"
                  : "rgba(239,68,68,0.3)",
            };

            // Update tracking maps
            allCandlesRef.current.set(time, candleData);
            allVolumesRef.current.set(time, volData);

            // Use update() for live candles — no scroll jump
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (seriesRef.current as any).update(candleData);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (volumeSeriesRef.current as any).update(volData);
          }
        } catch {
          /* ignore parse errors */
        }
      };

      ws.onerror = () => ws.close();
      ws.onclose = () => {
        if (!alive) return;
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };
    }

    connect();

    // Fallback poll every 5s
    pollIntervalRef.current = window.setInterval(() => {
      if (!seriesRef.current || !alive) return;
      const now = Date.now();
      const ms = INTERVAL_MS[interval] ?? 3_600_000;
      fetchCandleData(selectedCoin, interval, now - ms * 2, now)
        .then((data) => {
          if (data.length > 0 && seriesRef.current) {
            const last = data[data.length - 1];
            const time = Math.floor(last.t / 1000) as Time;
            const open = parseFloat(last.o);
            const close = parseFloat(last.c);
            const vol = parseFloat(last.v);

            const candleData: CandlestickData<Time> = {
              time,
              open,
              high: parseFloat(last.h),
              low: parseFloat(last.l),
              close,
            };
            const volData: HistogramData<Time> = {
              time,
              value: vol,
              color:
                close >= open
                  ? "rgba(34,197,94,0.3)"
                  : "rgba(239,68,68,0.3)",
            };

            allCandlesRef.current.set(time, candleData);
            allVolumesRef.current.set(time, volData);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (seriesRef.current as any).update(candleData);
            if (volumeSeriesRef.current) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (volumeSeriesRef.current as any).update(volData);
            }
          }
        })
        .catch(() => {});
    }, 5000);

    return () => {
      alive = false;
      if (reconnectTimerRef.current)
        window.clearTimeout(reconnectTimerRef.current);
      if (pollIntervalRef.current)
        window.clearInterval(pollIntervalRef.current);
      wsRef.current?.close();
    };
  }, [selectedCoin, interval]);

  // ─── Price lines: position entry + limit orders ──────────────────────────
  const updatePriceLines = useCallback(() => {
    if (!seriesRef.current) return;
    const series = seriesRef.current;

    // Remove old price lines
    for (const line of priceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = [];

    const newLines: ReturnType<
      ISeriesApi<SeriesType>["createPriceLine"]
    >[] = [];

    if (entryPx > 0) {
      const isLong = parseFloat(currentPosition?.szi ?? "0") > 0;
      const line = series.createPriceLine({
        price: entryPx,
        color: isLong ? "#22C55E" : "#EF4444",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `Entry ${isLong ? "▲" : "▼"}`,
      });
      newLines.push(line);
    }

    for (const order of pendingOrders) {
      const px = parseFloat(order.limitPx);
      if (px <= 0) continue;
      const isBuy = order.side === "B";
      const line = series.createPriceLine({
        price: px,
        color: isBuy ? "#22C55E" : "#EF4444",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `${isBuy ? "Buy" : "Sell"} ${parseFloat(order.sz).toFixed(2)}`,
      });
      newLines.push(line);
    }

    priceLinesRef.current = newLines;
  }, [entryPx, currentPosition, pendingOrders]);

  useEffect(() => {
    updatePriceLines();
  }, [updatePriceLines]);

  const ohlc = hoverOHLV;

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

          {/* OHLC overlay */}
          <div className="flex items-center gap-2 text-[10px] tabular-nums font-mono">
            {ohlc ? (
              <>
                <span className="text-[#475569]">O</span>
                <span className="text-[#94A3B8]">{formatPrice(ohlc.o)}</span>
                <span className="text-[#475569]">H</span>
                <span className="text-[#94A3B8]">{formatPrice(ohlc.h)}</span>
                <span className="text-[#475569]">L</span>
                <span className="text-[#94A3B8]">{formatPrice(ohlc.l)}</span>
                <span className="text-[#475569]">C</span>
                <span
                  className={
                    ohlc.c >= ohlc.o ? "text-[#22C55E]" : "text-[#EF4444]"
                  }
                >
                  {formatPrice(ohlc.c)}
                </span>
                <span className="text-[#475569]">Vol</span>
                <span className="text-[#94A3B8]">
                  {ohlc.v >= 1_000_000
                    ? `${(ohlc.v / 1_000_000).toFixed(2)}M`
                    : ohlc.v >= 1_000
                    ? `${(ohlc.v / 1_000).toFixed(1)}K`
                    : ohlc.v.toFixed(0)}
                </span>
              </>
            ) : (
              <span className="text-[#475569]">Hover chart for OHLC</span>
            )}
          </div>

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
                <span className="text-[#94A3B8]">
                  ${formatPrice(ctx.markPx)}
                </span>
              </span>
              <span>
                Funding:{" "}
                <span
                  className={
                    ctx.fundingRate >= 0
                      ? "text-[#22C55E]"
                      : "text-[#EF4444]"
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
