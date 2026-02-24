import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Target, Zap, Calendar, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function Missions() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    type: "daily",
    reward_points: 10,
    end_at: "",
  });

  const { data: missions } = useQuery({
    queryKey: ["missions"],
    queryFn: async () => {
      const { data } = await supabase.from("missions").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: completions } = useQuery({
    queryKey: ["mission-completions"],
    queryFn: async () => {
      const { data } = await supabase.from("mission_completions").select("mission_id, status");
      return data || [];
    },
  });

  const createMission = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("missions").insert({
        title: form.title,
        description: form.description,
        type: form.type,
        reward_points: form.reward_points,
        end_at: form.end_at || new Date(Date.now() + 86400000).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      setShowForm(false);
      setForm({ title: "", description: "", type: "daily", reward_points: 10, end_at: "" });
      toast.success("Mission créée !");
    },
    onError: () => toast.error("Erreur lors de la création"),
  });

  const deleteMission = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("missions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      toast.success("Mission supprimée");
    },
  });

  const typeIcon = {
    daily: <Calendar className="w-4 h-4" />,
    weekly: <Target className="w-4 h-4" />,
    flash: <Zap className="w-4 h-4" />,
  };

  const typeBadge = {
    daily: "bg-primary/10 text-primary border-primary/20",
    weekly: "bg-accent/10 text-accent border-accent/20",
    flash: "bg-warning/10 text-warning border-warning/20",
  };

  const getCompletionCount = (missionId: string) =>
    completions?.filter((c) => c.mission_id === missionId && c.status === "completed").length || 0;

  return (
    <DashboardLayout title="Missions" subtitle="Créez et gérez les missions du serveur">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{missions?.length || 0} missions au total</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 gradient-primary rounded-lg text-primary-foreground text-sm font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> Nouvelle mission
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="glass rounded-xl border border-primary/20 p-6 mb-6 animate-slide-up">
          <h3 className="font-semibold text-foreground mb-4">Créer une mission</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Titre</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ex: Poster un message dans #general"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="flash">Flash</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full h-20 px-3 py-2 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Décrivez la mission..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Points de récompense</label>
              <input
                type="number"
                value={form.reward_points}
                onChange={(e) => setForm({ ...form, reward_points: parseInt(e.target.value) || 0 })}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Date de fin</label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                className="w-full h-10 px-3 bg-input border border-border rounded-lg text-foreground text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm">
              Annuler
            </button>
            <button
              onClick={() => createMission.mutate()}
              disabled={!form.title || !form.description}
              className="px-4 py-2 gradient-primary rounded-lg text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Créer
            </button>
          </div>
        </div>
      )}

      {/* Missions List */}
      <div className="space-y-3">
        {missions?.map((mission) => (
          <div key={mission.id} className="glass rounded-xl border border-border p-5 hover:border-primary/20 transition-colors animate-slide-up">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className={`px-3 py-1 rounded-full border text-xs font-medium flex items-center gap-1.5 ${typeBadge[mission.type as keyof typeof typeBadge] || typeBadge.daily}`}>
                  {typeIcon[mission.type as keyof typeof typeIcon] || typeIcon.daily}
                  {mission.type === "daily" ? "Quotidienne" : mission.type === "weekly" ? "Hebdo" : "Flash"}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{mission.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{mission.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="font-mono text-primary font-medium">+{mission.reward_points} pts</span>
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {getCompletionCount(mission.id)} complétées
                    </span>
                    <span className={mission.is_active ? "text-success" : "text-destructive"}>
                      {mission.is_active ? "● Active" : "● Inactive"}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => deleteMission.mutate(mission.id)}
                className="p-2 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {(!missions || missions.length === 0) && (
          <div className="text-center py-16 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune mission</p>
            <p className="text-xs mt-1">Créez votre première mission ci-dessus</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
