import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Package, Trash2, Edit2, Save, X, Coins } from "lucide-react";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

const CATEGORIES = [
  { value: "role", label: "Rôle" },
  { value: "perk", label: "Perk" },
  { value: "ticket", label: "Ticket" },
  { value: "cosmetic", label: "Cosmétique" },
  { value: "irl", label: "IRL / Produit" },
] as const;

const categoryBadge: Record<string, string> = {
  role: "bg-accent/10 text-accent border-accent/20",
  perk: "bg-primary/10 text-primary border-primary/20",
  ticket: "bg-warning/10 text-warning border-warning/20",
  cosmetic: "bg-success/10 text-success border-success/20",
  irl: "bg-destructive/10 text-destructive border-destructive/20",
};

type ShopItemForm = {
  name: string;
  description: string;
  category: string;
  price_pulse: number;
  stock_total: string;
  max_per_user: number;
  cooldown_hours: number;
  is_active: boolean;
  is_limited_drop: boolean;
  available_from: string;
  available_until: string;
  auto_apply: boolean;
  image_url: string;
  metadata_json: string;
};

const emptyForm: ShopItemForm = {
  name: "",
  description: "",
  category: "perk",
  price_pulse: 50,
  stock_total: "",
  max_per_user: 1,
  cooldown_hours: 0,
  is_active: true,
  is_limited_drop: false,
  available_from: "",
  available_until: "",
  auto_apply: true,
  image_url: "",
  metadata_json: "{}",
};

export default function Boutique() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ShopItemForm>(emptyForm);
  const [filterCat, setFilterCat] = useState<string>("all");

  const { data: items } = useQuery({
    queryKey: ["shop-items"],
    queryFn: async () => {
      const { data } = await supabase.from("shop_items").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const upsertItem = useMutation({
    mutationFn: async () => {
      let metaJson: Json = {};
      try { metaJson = JSON.parse(form.metadata_json) as Json; } catch { /* keep empty */ }

      const payload = {
        name: form.name,
        description: form.description,
        category: form.category as "role" | "perk" | "ticket" | "cosmetic" | "irl",
        price_pulse: form.price_pulse,
        stock_total: form.stock_total ? parseInt(form.stock_total) : null,
        stock_remaining: form.stock_total ? parseInt(form.stock_total) : null,
        max_per_user: form.max_per_user,
        cooldown_hours: form.cooldown_hours,
        is_active: form.is_active,
        is_limited_drop: form.is_limited_drop,
        available_from: form.available_from || null,
        available_until: form.available_until || null,
        auto_apply: form.auto_apply,
        image_url: form.image_url || null,
        metadata_json: metaJson,
      };

      if (editId) {
        const { error } = await supabase.from("shop_items").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shop_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-items"] });
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm);
      toast.success(editId ? "Item modifié !" : "Item créé !");
    },
    onError: () => toast.error("Erreur lors de la sauvegarde"),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shop_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-items"] });
      toast.success("Item supprimé");
    },
  });

  const startEdit = (item: NonNullable<typeof items>[0]) => {
    setEditId(item.id);
    setForm({
      name: item.name,
      description: item.description,
      category: item.category,
      price_pulse: item.price_pulse,
      stock_total: item.stock_total?.toString() ?? "",
      max_per_user: item.max_per_user ?? 1,
      cooldown_hours: item.cooldown_hours ?? 0,
      is_active: item.is_active,
      is_limited_drop: item.is_limited_drop,
      available_from: item.available_from ?? "",
      available_until: item.available_until ?? "",
      auto_apply: item.auto_apply,
      image_url: item.image_url ?? "",
      metadata_json: JSON.stringify(item.metadata_json ?? {}, null, 2),
    });
    setShowForm(true);
  };

  const filtered = items?.filter((i) => filterCat === "all" || i.category === filterCat);

  return (
    <DashboardLayout title="Boutique" subtitle="Pulse Token (PULSE) · Community Token interne">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFilterCat("all")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCat === "all" ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
            Tous
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.value} onClick={() => setFilterCat(c.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCat === c.value ? "gradient-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              {c.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm); }}
          className="px-4 py-2 gradient-primary rounded-lg text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Nouvel item
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass rounded-xl border border-primary/20 p-6 mb-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">{editId ? "Modifier l'item" : "Créer un item"}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nom</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Nom de l'item" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Prix (PULSE)</label>
              <input type="number" value={form.price_pulse} onChange={(e) => setForm({ ...form, price_pulse: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full h-16 px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Stock total (vide = illimité)</label>
              <input value={form.stock_total} onChange={(e) => setForm({ ...form, stock_total: e.target.value })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" placeholder="∞" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Max par utilisateur</label>
              <input type="number" value={form.max_per_user} onChange={(e) => setForm({ ...form, max_per_user: parseInt(e.target.value) || 1 })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cooldown (heures)</label>
              <input type="number" value={form.cooldown_hours} onChange={(e) => setForm({ ...form, cooldown_hours: parseInt(e.target.value) || 0 })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex items-center gap-6 md:col-span-3">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" /> Actif
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.auto_apply} onChange={(e) => setForm({ ...form, auto_apply: e.target.checked })} className="rounded" /> Application auto
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={form.is_limited_drop} onChange={(e) => setForm({ ...form, is_limited_drop: e.target.checked })} className="rounded" /> Limited Drop
              </label>
            </div>
            {form.is_limited_drop && (
              <>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Disponible à partir de</label>
                  <input type="datetime-local" value={form.available_from} onChange={(e) => setForm({ ...form, available_from: e.target.value })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Disponible jusqu'à</label>
                  <input type="datetime-local" value={form.available_until} onChange={(e) => setForm({ ...form, available_until: e.target.value })} className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </>
            )}
            <div className="md:col-span-3">
              <label className="text-xs font-medium text-muted-foreground">Métadonnées JSON (ex: discord_role_id, duration_hours...)</label>
              <textarea value={form.metadata_json} onChange={(e) => setForm({ ...form, metadata_json: e.target.value })} className="w-full h-20 px-3 py-2 bg-input border border-border rounded-lg text-foreground font-mono text-xs mt-1 focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm">Annuler</button>
            <button onClick={() => upsertItem.mutate()} disabled={!form.name} className="px-4 py-2 gradient-primary rounded-lg text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2">
              <Save className="w-4 h-4" /> {editId ? "Modifier" : "Créer"}
            </button>
          </div>
        </div>
      )}

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered?.map((item) => (
          <div key={item.id} className="glass rounded-xl border border-border p-5 hover:border-primary/20 transition-colors animate-slide-up">
            <div className="flex items-start justify-between mb-3">
              <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${categoryBadge[item.category] || categoryBadge.perk}`}>
                {CATEGORIES.find((c) => c.value === item.category)?.label}
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => startEdit(item)} className="p-1.5 rounded text-muted-foreground hover:text-primary transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => deleteItem.mutate(item.id)} className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <h4 className="font-semibold text-foreground mb-1">{item.name}</h4>
            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{item.description}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-warning" />
                <span className="font-bold text-warning font-mono">{item.price_pulse}</span>
                <span className="text-xs text-muted-foreground">PULSE</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.stock_total != null ? (
                  <span className="font-mono">{item.stock_remaining}/{item.stock_total}</span>
                ) : (
                  <span>∞</span>
                )}
                <span className={item.is_active ? "text-success" : "text-destructive"}>
                  {item.is_active ? "●" : "○"}
                </span>
              </div>
            </div>
            {item.is_limited_drop && (
              <div className="mt-2 px-2 py-1 rounded bg-warning/10 text-warning text-xs font-medium">
                ⚡ Limited Drop
              </div>
            )}
          </div>
        ))}
        {(!filtered || filtered.length === 0) && (
          <div className="col-span-full text-center py-16 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucun item dans la boutique</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
