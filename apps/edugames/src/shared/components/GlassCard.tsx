import React from "react";
import { cn } from "../utils/cn";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
  variant?: "default" | "gold" | "blue";
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
    variant === "gold" ? "bg-gradient-to-br from-brand-gold/10 to-brand-gold-light/5 border-brand-gold/25" :
    variant === "blue" ? "bg-gradient-to-br from-brand-blue/10 to-brand-blue-light/5 border-brand-blue/20" :
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
