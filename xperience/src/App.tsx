import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { AuthGuard } from "@/components/AuthGuard";

// Lazy-loaded pages for optimal performance
const Login = lazy(() => import("@/pages/Login"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ContentGenerator = lazy(() => import("@/pages/ContentGenerator"));
const ReplyGenerator = lazy(() => import("@/pages/ReplyGenerator"));
const Trends = lazy(() => import("@/pages/Trends"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Scheduler = lazy(() => import("@/pages/Scheduler"));
const Accounts = lazy(() => import("@/pages/Accounts"));
const Settings = lazy(() => import("@/pages/Settings"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
            <Route path="/content" element={<AuthGuard><ContentGenerator /></AuthGuard>} />
            <Route path="/replies" element={<AuthGuard><ReplyGenerator /></AuthGuard>} />
            <Route path="/trends" element={<AuthGuard><Trends /></AuthGuard>} />
            <Route path="/analytics" element={<AuthGuard><Analytics /></AuthGuard>} />
            <Route path="/scheduler" element={<AuthGuard><Scheduler /></AuthGuard>} />
            <Route path="/accounts" element={<AuthGuard><Accounts /></AuthGuard>} />
            <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        <Toaster richColors position="top-right" expand={false} />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
