import { type ReactNode } from "react";
import { Sidebar } from "./Sidebar";

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AppLayout({ title, subtitle, actions, children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="min-h-screen lg:ml-64 pt-14 lg:pt-0">
        <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>
        <div className="p-4 sm:p-8 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
