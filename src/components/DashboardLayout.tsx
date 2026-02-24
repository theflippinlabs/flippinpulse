import { ReactNode } from "react";
import { DashboardSidebar } from "./DashboardSidebar";

interface DashboardLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <main className="min-h-screen lg:ml-64 pt-14 lg:pt-0">
        <header className="border-b border-border px-4 sm:px-8 py-4 sm:py-6">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </header>
        <div className="p-4 sm:p-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
