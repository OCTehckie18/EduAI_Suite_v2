import React from "react";
import { cn } from "../utils/cn";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
  variant?: "default" | "dark" | "gold" | "blue";
  padding?: "sm" | "md" | "lg" | "none";
}

const paddingMap = {
  none: "",
  sm:   "p-4",
  md:   "p-5",
  lg:   "p-6",
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  interactive = false,
  variant = "default",
  padding = "md",
  ...props
}) => {
  const base = "glass-card";
  const variantClass =
    variant === "dark" ? "glass-card-dark" :
    variant === "gold" ? "bg-gradient-to-br from-[#d0ae61]/10 to-[#ddb867]/5 border-[#d0ae61]/25" :
    variant === "blue" ? "bg-gradient-to-br from-[#264796]/10 to-[#3460c4]/5 border-[#264796]/20" :
    "";

  return (
    <div
      className={cn(
        base,
        variantClass,
        paddingMap[padding],
        interactive && "card-interactive",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
