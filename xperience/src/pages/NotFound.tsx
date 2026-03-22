import { Link } from "react-router-dom";
import { Zap, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md animate-fade-in">
        <div className="w-16 h-16 gradient-brand rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Zap className="w-9 h-9 text-white" />
        </div>
        <h1 className="text-7xl font-black text-gradient-brand mb-4">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-2">Page Not Found</h2>
        <p className="text-muted-foreground text-sm mb-8">
          This page doesn't exist. Maybe the algorithm buried it.
        </p>
        <Button asChild className="gradient-x text-white border-0 gap-2">
          <Link to="/">
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
