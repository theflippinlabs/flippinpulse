import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Save, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type SettingsMap = Record<string, Record<string, unknown>>;

export default function Configuration() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["all-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("settings").select("*");
      const map: SettingsMap = {};
      data?.forEach((s) => {
        map[s.key] = s.value_json as Record<string, unknown>;
      });
      return map;
    },
  });

  const { data: rolesConfig } = useQuery({
    queryKey: ["roles-config"],
    queryFn: async () => {
      const { data } = await supabase.from("roles_config").select("*").order("sort_order");
      return data || [];
    },
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Record<string, unknown> }) => {
      const { error } = await supabase.from("settings").update({ value_json: value as unknown as import("@/integrations/supabase/types").Json }).eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-settings"] });
      toast.success("Configuration sauvegardée !");
    },
    onError: () => toast.error("Erreur lors de la sauvegarde"),
  });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editJson, setEditJson] = useState("");

  const startEdit = (key: string) => {
    setEditingKey(key);
    setEditJson(JSON.stringify(settings?.[key] ?? {}, null, 2));
  };

  const saveEdit = () => {
    if (!editingKey) return;
    try {
      const parsed = JSON.parse(editJson);
      updateSetting.mutate({ key: editingKey, value: parsed });
      setEditingKey(null);
    } catch {
      toast.error("JSON invalide");
    }
  };

  const configSections = [
    { key: "points_config", label: "Barème des points", description: "Points attribués pour chaque type d'action" },
    { key: "anti_spam", label: "Anti-spam", description: "Protection contre le farming de points" },
    { key: "decay", label: "Decay (perte d'inactivité)", description: "Perte de points en cas d'inactivité prolongée" },
    { key: "pulse_hour", label: "Pulse Hour", description: "Événement multiplicateur de points récurrent" },
    { key: "flash_missions", label: "Flash Missions", description: "Missions surprises automatiques" },
  ];

  if (isLoading) {
    return (
      <DashboardLayout title="Configuration" subtitle="Paramètres du système">
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Chargement...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Configuration" subtitle="Paramètres du système Pulse Engine">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {configSections.map((section) => (
          <div key={section.key} className="glass rounded-xl border border-border p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-foreground">{section.label}</h3>
                <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
              </div>
              {editingKey === section.key ? (
                <button onClick={saveEdit} className="px-3 py-1.5 gradient-primary rounded-lg text-primary-foreground text-xs font-medium flex items-center gap-1">
                  <Save className="w-3 h-3" /> Sauver
                </button>
              ) : (
                <button onClick={() => startEdit(section.key)} className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg text-xs font-medium hover:bg-muted transition-colors">
                  Modifier
                </button>
              )}
            </div>
            {editingKey === section.key ? (
              <textarea
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
                className="w-full h-40 bg-background border border-border rounded-lg p-3 text-foreground font-mono text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            ) : (
              <pre className="text-xs font-mono text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-auto max-h-40">
                {JSON.stringify(settings?.[section.key] ?? {}, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Roles Config */}
      <div className="glass rounded-xl border border-border p-6 animate-slide-up">
        <h3 className="font-semibold text-foreground mb-4">Rôles dynamiques</h3>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Rang</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Seuil (points)</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Discord Role ID</th>
                <th className="text-left py-3 px-4 text-muted-foreground font-medium">Couleur</th>
              </tr>
            </thead>
            <tbody>
              {rolesConfig?.map((role) => (
                <tr key={role.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-foreground">{role.rank_name}</td>
                  <td className="py-3 px-4 font-mono text-primary">{role.threshold}</td>
                  <td className="py-3 px-4 font-mono text-muted-foreground text-xs">{role.discord_role_id || "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: role.color || "#9ca3af" }} />
                      <span className="font-mono text-xs text-muted-foreground">{role.color}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
