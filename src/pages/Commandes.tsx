import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Package, Check, X, Truck, Clock } from "lucide-react";
import { toast } from "sonner";

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING: { label: "En attente", color: "bg-warning/10 text-warning border-warning/20", icon: <Clock className="w-3 h-3" /> },
  APPROVED: { label: "Approuvée", color: "bg-primary/10 text-primary border-primary/20", icon: <Check className="w-3 h-3" /> },
  REJECTED: { label: "Refusée", color: "bg-destructive/10 text-destructive border-destructive/20", icon: <X className="w-3 h-3" /> },
  FULFILLED: { label: "Livrée", color: "bg-success/10 text-success border-success/20", icon: <Truck className="w-3 h-3" /> },
};

export default function Commandes() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, shop_items(name, category)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("orders")
        .update({ status: status as "PENDING" | "APPROVED" | "REJECTED" | "FULFILLED" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success("Statut mis à jour !");
    },
    onError: () => toast.error("Erreur"),
  });

  const filtered = orders?.filter((o) => filterStatus === "all" || o.status === filterStatus);

  return (
    <DashboardLayout title="Commandes" subtitle="Fulfillment des achats manuels">
      {/* Filters */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilterStatus("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === "all" ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
          Toutes
        </button>
        {Object.entries(STATUS_META).map(([k, v]) => (
          <button key={k} onClick={() => setFilterStatus(k)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === k ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div className="space-y-3">
        {filtered?.map((order) => {
          const meta = STATUS_META[order.status] || STATUS_META.PENDING;
          const itemName = (order.shop_items as { name: string; category: string } | null)?.name ?? "Item inconnu";
          return (
            <div key={order.id} className="glass rounded-xl border border-border p-5 animate-slide-up">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium flex items-center gap-1 ${meta.color}`}>
                      {meta.icon} {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(order.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  <h4 className="font-semibold text-foreground">{itemName}</h4>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span className="font-mono">User: {order.discord_id}</span>
                    <span className="font-mono text-warning">{order.pulse_spent} PULSE</span>
                  </div>
                  {order.notes && <p className="text-xs text-muted-foreground mt-2 italic">"{order.notes}"</p>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {order.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => updateStatus.mutate({ id: order.id, status: "APPROVED" })}
                        className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Approuver
                      </button>
                      <button
                        onClick={() => updateStatus.mutate({ id: order.id, status: "REJECTED" })}
                        className="px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs font-medium hover:bg-destructive/20 transition-colors flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Refuser
                      </button>
                    </>
                  )}
                  {order.status === "APPROVED" && (
                    <button
                      onClick={() => updateStatus.mutate({ id: order.id, status: "FULFILLED" })}
                      className="px-3 py-1.5 bg-success/10 text-success rounded-lg text-xs font-medium hover:bg-success/20 transition-colors flex items-center gap-1"
                    >
                      <Truck className="w-3 h-3" /> Marquer livré
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {(!filtered || filtered.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune commande</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
