import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Rocket,
  Swords,
  Brain,
  Gift,
  Keyboard,
  Gamepad2,
  Trophy,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GameConfig {
  game_key: string;
  config_json: Record<string, unknown>;
  is_enabled: boolean;
  updated_at: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  choices_json: string[];
  correct_index: number;
  difficulty: string;
  category: string;
  is_active: boolean;
}

interface GameSession {
  id: string;
  game_key: string;
  channel_id: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  state_json: Record<string, unknown>;
}

const gameIcons: Record<string, typeof Rocket> = {
  crash: Rocket,
  duel: Swords,
  quiz: Brain,
  treasure_drop: Gift,
  typing_race: Keyboard,
};

const gameLabels: Record<string, string> = {
  crash: "Crash (Rocket)",
  duel: "Duel (Coinflip/Dice)",
  quiz: "Quiz Blitz",
  treasure_drop: "Treasure Drop",
  typing_race: "Typing Race",
};

const configLabels: Record<string, string> = {
  min_bet: "Mise minimum",
  max_bet: "Mise maximum",
  fee_percent: "Commission (%)",
  cooldown_seconds: "Cooldown (sec)",
  max_sessions_per_channel: "Sessions max / channel",
  crash_min: "Crash min (×)",
  crash_max: "Crash max (×)",
  timeout_seconds: "Timeout (sec)",
  modes: "Modes",
  questions_per_round: "Questions / round",
  time_per_question_seconds: "Temps / question (sec)",
  rewards: "Récompenses (top 3)",
  min_reward: "Récompense min",
  max_reward: "Récompense max",
  drops_per_day_min: "Drops min / jour",
  drops_per_day_max: "Drops max / jour",
  max_claims_per_user_per_day: "Claims max / user / jour",
  channels_whitelist: "Channels whitelist",
  fixed_reward: "Récompense fixe",
  max_players: "Joueurs max",
  join_timeout_seconds: "Timeout rejoindre (sec)",
};

export default function MiniJeux() {
  const [games, setGames] = useState<GameConfig[]>([]);
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [editingGame, setEditingGame] = useState<string | null>(null);
  const [editConfig, setEditConfig] = useState<Record<string, unknown>>({});
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [qForm, setQForm] = useState({
    question: "",
    choices: ["", "", "", ""],
    correct_index: 0,
    difficulty: "medium",
    category: "general",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchGames();
    fetchSessions();
    fetchQuestions();
  }, []);

  const fetchGames = async () => {
    const { data } = await supabase.from("games_config").select("*").order("game_key");
    if (data) setGames(data as unknown as GameConfig[]);
  };

  const fetchSessions = async () => {
    const { data } = await supabase
      .from("game_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setSessions(data as unknown as GameSession[]);
  };

  const fetchQuestions = async () => {
    const { data } = await supabase.from("quiz_questions").select("*").order("created_at", { ascending: false });
    if (data) setQuestions(data as unknown as QuizQuestion[]);
  };

  const toggleGame = async (gameKey: string, enabled: boolean) => {
    await supabase.from("games_config").update({ is_enabled: enabled }).eq("game_key", gameKey);
    fetchGames();
    toast({ title: enabled ? "Jeu activé" : "Jeu désactivé" });
  };

  const startEdit = (game: GameConfig) => {
    setEditingGame(game.game_key);
    setEditConfig({ ...game.config_json });
  };

  const saveConfig = async (gameKey: string) => {
    await supabase.from("games_config").update({ config_json: editConfig as any }).eq("game_key", gameKey);
    setEditingGame(null);
    fetchGames();
    toast({ title: "Configuration sauvegardée" });
  };

  const resetQuizForm = () => {
    setQForm({ question: "", choices: ["", "", "", ""], correct_index: 0, difficulty: "medium", category: "general" });
    setEditingQuestion(null);
    setShowQuizForm(false);
  };

  const saveQuestion = async () => {
    if (!qForm.question.trim() || qForm.choices.some((c) => !c.trim())) {
      toast({ title: "Erreur", description: "Remplissez tous les champs", variant: "destructive" });
      return;
    }
    const payload = {
      question: qForm.question,
      choices_json: qForm.choices,
      correct_index: qForm.correct_index,
      difficulty: qForm.difficulty,
      category: qForm.category,
    };
    if (editingQuestion) {
      await supabase.from("quiz_questions").update(payload).eq("id", editingQuestion.id);
    } else {
      await supabase.from("quiz_questions").insert(payload);
    }
    resetQuizForm();
    fetchQuestions();
    toast({ title: editingQuestion ? "Question modifiée" : "Question ajoutée" });
  };

  const deleteQuestion = async (id: string) => {
    await supabase.from("quiz_questions").delete().eq("id", id);
    fetchQuestions();
    toast({ title: "Question supprimée" });
  };

  const editQuestion = (q: QuizQuestion) => {
    setEditingQuestion(q);
    setQForm({
      question: q.question,
      choices: [...(q.choices_json as string[])],
      correct_index: q.correct_index,
      difficulty: q.difficulty,
      category: q.category,
    });
    setShowQuizForm(true);
  };

  const totalSessions = sessions.length;
  const activeSessions = sessions.filter((s) => s.status === "active" || s.status === "waiting").length;
  const completedSessions = sessions.filter((s) => s.status === "completed").length;

  return (
    <DashboardLayout title="Mini-Jeux" subtitle="Gestion des jeux, configurations et quiz">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard title="Jeux actifs" value={games.filter((g) => g.is_enabled).length} icon={<Gamepad2 className="w-5 h-5" />} variant="primary" />
        <StatCard title="Sessions totales" value={totalSessions} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="En cours" value={activeSessions} icon={<Rocket className="w-5 h-5" />} variant="warning" />
        <StatCard title="Terminées" value={completedSessions} icon={<Trophy className="w-5 h-5" />} variant="success" />
      </div>

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="quiz">Quiz Manager</TabsTrigger>
          <TabsTrigger value="sessions">Sessions récentes</TabsTrigger>
        </TabsList>

        {/* Config tab */}
        <TabsContent value="config" className="space-y-4">
          {games.map((game) => {
            const Icon = gameIcons[game.game_key] || Gamepad2;
            const isEditing = editingGame === game.game_key;
            return (
              <div key={game.game_key} className="glass rounded-xl p-6 border border-border space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg gradient-logo flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{gameLabels[game.game_key] || game.game_key}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{game.game_key}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!isEditing && (
                      <Button size="sm" variant="outline" onClick={() => startEdit(game)}>
                        <Pencil className="w-3 h-3 mr-1" /> Modifier
                      </Button>
                    )}
                    {isEditing && (
                      <>
                        <Button size="sm" onClick={() => saveConfig(game.game_key)}>
                          <Save className="w-3 h-3 mr-1" /> Sauvegarder
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingGame(null)}>
                          <X className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    <Switch checked={game.is_enabled} onCheckedChange={(v) => toggleGame(game.game_key, v)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(isEditing ? editConfig : game.config_json).map(([key, value]) => (
                    <div key={key} className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">{configLabels[key] || key}</p>
                      {isEditing ? (
                        Array.isArray(value) ? (
                          <input
                            className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
                            value={JSON.stringify(value)}
                            onChange={(e) => {
                              try {
                                setEditConfig({ ...editConfig, [key]: JSON.parse(e.target.value) });
                              } catch {
                                // ignore parse errors while typing
                              }
                            }}
                          />
                        ) : (
                          <input
                            className="w-full bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
                            type={typeof value === "number" ? "number" : "text"}
                            value={String(value)}
                            onChange={(e) =>
                              setEditConfig({
                                ...editConfig,
                                [key]: typeof value === "number" ? Number(e.target.value) : e.target.value,
                              })
                            }
                          />
                        )
                      ) : (
                        <p className="text-sm font-mono text-foreground">
                          {Array.isArray(value) ? value.join(", ") : String(value)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Quiz Manager tab */}
        <TabsContent value="quiz" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-foreground">Banque de questions</h3>
            <Button onClick={() => { resetQuizForm(); setShowQuizForm(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Ajouter
            </Button>
          </div>

          {showQuizForm && (
            <div className="glass rounded-xl p-6 border border-border space-y-4">
              <h4 className="font-semibold text-foreground">{editingQuestion ? "Modifier la question" : "Nouvelle question"}</h4>
              <div>
                <label className="text-sm text-muted-foreground">Question</label>
                <input
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground mt-1"
                  value={qForm.question}
                  onChange={(e) => setQForm({ ...qForm, question: e.target.value })}
                  placeholder="Quelle est la capitale de la France ?"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {qForm.choices.map((c, i) => (
                  <div key={i}>
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      Choix {String.fromCharCode(65 + i)}
                      {i === qForm.correct_index && <Badge className="text-[10px] bg-success/20 text-success border-success/30">Correct</Badge>}
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        className="flex-1 bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground"
                        value={c}
                        onChange={(e) => {
                          const nc = [...qForm.choices];
                          nc[i] = e.target.value;
                          setQForm({ ...qForm, choices: nc });
                        }}
                      />
                      <button
                        className={`px-2 rounded text-xs font-mono ${i === qForm.correct_index ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                        onClick={() => setQForm({ ...qForm, correct_index: i })}
                      >
                        ✓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Difficulté</label>
                  <select
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground mt-1"
                    value={qForm.difficulty}
                    onChange={(e) => setQForm({ ...qForm, difficulty: e.target.value })}
                  >
                    <option value="easy">Facile</option>
                    <option value="medium">Moyen</option>
                    <option value="hard">Difficile</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Catégorie</label>
                  <input
                    className="w-full bg-input border border-border rounded px-2 py-1.5 text-sm text-foreground mt-1"
                    value={qForm.category}
                    onChange={(e) => setQForm({ ...qForm, category: e.target.value })}
                    placeholder="general"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveQuestion}><Save className="w-3 h-3 mr-1" /> {editingQuestion ? "Modifier" : "Ajouter"}</Button>
                <Button variant="outline" onClick={resetQuizForm}>Annuler</Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {questions.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">Aucune question. Ajoutez-en pour alimenter le Quiz Blitz.</p>
            )}
            {questions.map((q) => (
              <div key={q.id} className="glass rounded-lg p-4 border border-border flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{q.question}</p>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {(q.choices_json as string[]).map((c, i) => (
                      <Badge key={i} variant={i === q.correct_index ? "default" : "secondary"} className={i === q.correct_index ? "bg-success/20 text-success border-success/30" : ""}>
                        {String.fromCharCode(65 + i)}: {c}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px]">{q.difficulty}</Badge>
                    <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => editQuestion(q)}><Pencil className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteQuestion(q.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Sessions tab */}
        <TabsContent value="sessions">
          <div className="glass rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Jeu</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Statut</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Channel</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Début</th>
                  <th className="text-left px-4 py-3 text-muted-foreground font-medium">Fin</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Aucune session enregistrée</td></tr>
                )}
                {sessions.map((s) => {
                  const Icon = gameIcons[s.game_key] || Gamepad2;
                  const statusColors: Record<string, string> = {
                    waiting: "bg-warning/20 text-warning",
                    active: "bg-primary/20 text-primary",
                    completed: "bg-success/20 text-success",
                    cancelled: "bg-destructive/20 text-destructive",
                  };
                  return (
                    <tr key={s.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        {gameLabels[s.game_key] || s.game_key}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${statusColors[s.status] || ""} border-0`}>{s.status}</Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.channel_id || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.started_at).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{s.ended_at ? new Date(s.ended_at).toLocaleString("fr-FR") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
