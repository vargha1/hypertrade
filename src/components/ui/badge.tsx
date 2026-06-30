import { type HTMLAttributes } from "react";

type BadgeVariant = "default" | "success" | "danger" | "warning" | "accent" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-[#272F42] text-[#94A3B8]",
  success: "bg-[#22C55E]/15 text-[#22C55E]",
  danger: "bg-[#EF4444]/15 text-[#EF4444]",
  warning: "bg-[#F59E0B]/15 text-[#F59E0B]",
  accent: "bg-[#8B5CF6]/15 text-[#8B5CF6]",
  outline: "border border-[#334155] text-[#94A3B8] bg-transparent",
};

export function Badge({ variant = "default", className = "", children, ...props }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        variantClasses[variant],
        className,
      ].join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
