import { ReactNode } from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  variant?: "default" | "primary" | "accent" | "success" | "warning";
}

const variantStyles = {
  default: "border-border",
  primary: "border-primary/20 glow-primary",
  accent: "border-accent/20 glow-accent",
  success: "border-success/20",
  warning: "border-warning/20",
};

const iconVariantStyles = {
  default: "bg-muted text-muted-foreground",
  primary: "gradient-primary text-primary-foreground",
  accent: "gradient-accent text-accent-foreground",
  success: "gradient-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
};

export function StatCard({ title, value, subtitle, icon, trend, variant = "default" }: StatCardProps) {
  return (
    <div className={`glass rounded-xl p-4 sm:p-6 border animate-slide-up ${variantStyles[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1 sm:space-y-2 min-w-0">
          <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-xl sm:text-3xl font-bold text-foreground tracking-tight">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          {trend && (
            <p className={`text-xs font-mono ${trend.positive ? "text-success" : "text-destructive"}`}>
              {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
        <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center shrink-0 ${iconVariantStyles[variant]}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
