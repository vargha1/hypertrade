"use client";
import { type InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  suffix?: string;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, suffix, prefix, className = "", id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[#94A3B8]">
            {label}
            {props.required && <span className="text-[#EF4444] ml-0.5">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-sm text-[#94A3B8] select-none">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              "w-full rounded-lg border border-[#334155] bg-[#0F172A] text-[#F8FAFC] text-sm",
              "px-3 py-2 placeholder-[#475569] transition-colors",
              "hover:border-[#475569] focus:border-[#F59E0B] focus:outline-none focus:ring-1 focus:ring-[#F59E0B]",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "tabular-nums",
              error ? "border-[#EF4444] focus:border-[#EF4444] focus:ring-[#EF4444]" : "",
              prefix ? "pl-8" : "",
              suffix ? "pr-16" : "",
              className,
            ].join(" ")}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-sm text-[#94A3B8] select-none font-medium">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        {!error && helper && <p className="text-xs text-[#475569]">{helper}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
