"use client";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[#F59E0B] text-[#0F172A] hover:bg-[#FBBF24] active:bg-[#D97706] font-semibold",
  secondary:
    "bg-[#222735] text-[#F8FAFC] hover:bg-[#283044] border border-[#334155] active:bg-[#1E293B]",
  ghost:
    "bg-transparent text-[#94A3B8] hover:bg-[#222735] hover:text-[#F8FAFC] active:bg-[#283044]",
  danger:
    "bg-[#EF4444] text-white hover:bg-[#DC2626] active:bg-[#B91C1C] font-semibold",
  success:
    "bg-[#22C55E] text-[#0F172A] hover:bg-[#16A34A] active:bg-[#15803D] font-semibold",
};

const sizeClasses: Record<Size, string> = {
  xs: "px-2 py-1 text-xs rounded",
  sm: "px-3 py-1.5 text-sm rounded-lg",
  md: "px-4 py-2 text-sm rounded-lg",
  lg: "px-6 py-3 text-base rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading = false,
      fullWidth = false,
      disabled,
      className = "",
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          "inline-flex items-center justify-center gap-2 transition-colors duration-150 cursor-pointer select-none",
          "disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-[#F59E0B] focus-visible:outline-offset-2",
          variantClasses[variant],
          sizeClasses[size],
          fullWidth ? "w-full" : "",
          className,
        ].join(" ")}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
