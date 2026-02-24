import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ScrollText, AlertTriangle, Shield } from "lucide-react";
import { useState } from "react";

export default function Logs() {
  const [tab, setTab] = useState<"audit" | "errors">("audit");

  const { data: auditLogs } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  return (
    <DashboardLayout title="Logs" subtitle="Historique des actions et erreurs">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setTab("audit")}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === "audit" ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
          }`}
        >
          <Shield className="w-4 h-4" /> Audit
        </button>
        <button
          onClick={() => setTab("errors")}
          className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            tab === "errors" ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Erreurs
        </button>
      </div>

      {tab === "audit" && (
        <div className="glass rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Action</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Admin</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Cible</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Détails</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs?.map((log) => (
                <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                    {new Date(log.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                    {log.admin_discord_id || "system"}
                  </td>
                  <td className="py-3 px-4 text-xs font-mono text-muted-foreground">
                    {log.target_discord_id || "—"}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">
                    {log.payload_json ? JSON.stringify(log.payload_json) : "—"}
                  </td>
                </tr>
              ))}
              {(!auditLogs || auditLogs.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground text-sm">
                    <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    Aucun log enregistré
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "errors" && (
        <div className="glass rounded-xl border border-border p-8 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-30" />
          <p className="text-sm text-muted-foreground">Les erreurs du bot apparaîtront ici</p>
          <p className="text-xs text-muted-foreground mt-1">Connectez le bot Discord pour activer le suivi</p>
        </div>
      )}
    </DashboardLayout>
  );
}
