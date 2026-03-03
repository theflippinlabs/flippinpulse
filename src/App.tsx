import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { AuthGuard } from "@/components/AuthGuard";
import Login from "@/pages/Login";
import Overview from "@/pages/Overview";
import Configuration from "@/pages/Configuration";
import Missions from "@/pages/Missions";
import Boutique from "@/pages/Boutique";
import Transactions from "@/pages/Transactions";
import Commandes from "@/pages/Commandes";
import MiniJeux from "@/pages/MiniJeux";
import Utilisateurs from "@/pages/Utilisateurs";
import Logs from "@/pages/Logs";
import NotFound from "@/pages/NotFound";
import { Toaster as ShadToaster } from "@/components/ui/toaster";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<AuthGuard><Overview /></AuthGuard>} />
            <Route path="/configuration" element={<AuthGuard><Configuration /></AuthGuard>} />
            <Route path="/missions" element={<AuthGuard><Missions /></AuthGuard>} />
            <Route path="/boutique" element={<AuthGuard><Boutique /></AuthGuard>} />
            <Route path="/transactions" element={<AuthGuard><Transactions /></AuthGuard>} />
            <Route path="/commandes" element={<AuthGuard><Commandes /></AuthGuard>} />
            <Route path="/mini-jeux" element={<AuthGuard><MiniJeux /></AuthGuard>} />
            <Route path="/utilisateurs" element={<AuthGuard><Utilisateurs /></AuthGuard>} />
            <Route path="/logs" element={<AuthGuard><Logs /></AuthGuard>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster richColors position="top-right" />
          <ShadToaster />
        </BrowserRouter>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
