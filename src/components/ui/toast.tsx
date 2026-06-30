"use client";
import { useAppStore } from "@/stores/app-store";

export function Toast() {
  const { toast, clearToast } = useAppStore();
  if (!toast) return null;

  const colors = {
    success: "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]",
    error: "border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]",
    info: "border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]",
  };

  const icons = {
    success: (
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl max-w-sm",
        "animate-in slide-in-from-bottom-4 duration-300",
        colors[toast.type],
      ].join(" ")}
    >
      {icons[toast.type]}
      <p className="text-sm font-medium flex-1">{toast.message}</p>
      <button
        onClick={clearToast}
        className="p-0.5 rounded hover:opacity-70 transition-opacity cursor-pointer"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
