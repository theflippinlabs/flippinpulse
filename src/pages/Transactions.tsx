import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowUpRight, ArrowDownRight, Coins, Download, Search } from "lucide-react";

const TX_LABELS: Record<string, { label: string; color: string }> = {
  EARN_MISSION: { label: "Mission", color: "text-success" },
  EARN_VOICE: { label: "Vocal", color: "text-primary" },
  EARN_EVENT: { label: "Événement", color: "text-accent" },
  ADMIN_GRANT: { label: "Grant admin", color: "text-warning" },
  ADMIN_REVOKE: { label: "Revoke admin", color: "text-destructive" },
  SPEND_SHOP: { label: "Achat boutique", color: "text-destructive" },
  REFUND: { label: "Remboursement", color: "text-success" },
};

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: transactions } = useQuery({
    queryKey: ["pulse-transactions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pulse_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const filtered = transactions?.filter((tx) => {
    if (filterType !== "all" && tx.type !== filterType) return false;
    if (search && !tx.discord_id.includes(search) && !(tx.reason ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportCSV = () => {
    if (!filtered) return;
    const headers = "Date,Discord ID,Type,Montant,Solde après,Raison,Référence\n";
    const rows = filtered.map((tx) =>
      `${new Date(tx.created_at).toLocaleString("fr-FR")},${tx.discord_id},${tx.type},${tx.amount},${tx.balance_after},${tx.reason ?? ""},${tx.ref_id ?? ""}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pulse_transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout title="Transactions" subtitle="Ledger Pulse Token (PULSE) · Community Token">
      {/* Filters */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="h-10 pl-10 pr-4 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring w-64" />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="all">Tous les types</option>
            {Object.entries(TX_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <button onClick={exportCSV} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-muted transition-colors">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="glass rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Date</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Discord ID</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Type</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">Montant</th>
              <th className="text-right py-3 px-4 text-muted-foreground font-medium">Solde après</th>
              <th className="text-left py-3 px-4 text-muted-foreground font-medium">Raison</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((tx) => {
              const meta = TX_LABELS[tx.type] || { label: tx.type, color: "text-muted-foreground" };
              const isCredit = tx.amount > 0;
              return (
                <tr key={tx.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                    {new Date(tx.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{tx.discord_id}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono font-bold flex items-center justify-end gap-1 ${isCredit ? "text-success" : "text-destructive"}`}>
                      {isCredit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {isCredit ? "+" : ""}{tx.amount}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-foreground">{tx.balance_after}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">{tx.reason ?? "—"}</td>
                </tr>
              );
            })}
            {(!filtered || filtered.length === 0) && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted-foreground text-sm">
                  <Coins className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  Aucune transaction enregistrée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
