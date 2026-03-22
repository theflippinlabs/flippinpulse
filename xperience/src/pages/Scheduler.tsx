import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Sparkles, Trash2, Clock, CheckCircle2, XCircle, AlertCircle, Plus, CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Draft = Database["public"]["Tables"]["content_drafts"]["Row"];

const STATUS_CONFIG = {
  draft: { label: "Draft", icon: Clock, color: "bg-muted text-muted-foreground border-border" },
  scheduled: { label: "Scheduled", icon: CalendarClock, color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  published: { label: "Published", icon: CheckCircle2, color: "bg-green-500/10 text-green-400 border-green-500/20" },
  failed: { label: "Failed", icon: XCircle, color: "bg-red-500/10 text-red-400 border-red-500/20" },
};

function PostCard({ post, onDelete, onSchedule }: {
  post: Draft;
  onDelete: (id: string) => void;
  onSchedule: (id: string, at: string) => void;
}) {
  const [schedulingAt, setSchedulingAt] = useState("");
  const [showScheduler, setShowScheduler] = useState(false);
  const config = STATUS_CONFIG[post.status];
  const StatusIcon = config.icon;

  const handleSchedule = () => {
    if (!schedulingAt) {
      toast.error("Please select a date and time");
      return;
    }
    onSchedule(post.id, schedulingAt);
    setShowScheduler(false);
  };

  return (
    <Card className="glass border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground leading-relaxed line-clamp-3">{post.content}</p>

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge className={cn("text-[10px] px-2 py-0 border gap-1", config.color)}>
                <StatusIcon className="w-2.5 h-2.5" />
                {config.label}
              </Badge>
              {post.is_thread && (
                <Badge className="text-[10px] px-2 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">
                  Thread
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground font-mono">
                {post.content.length}/280
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {format(parseISO(post.created_at), "MMM d, HH:mm")}
              </span>
            </div>

            {post.scheduled_at && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-400">
                <CalendarClock className="w-3 h-3" />
                Scheduled: {format(parseISO(post.scheduled_at), "MMM d, yyyy 'at' HH:mm")}
              </div>
            )}

            {/* Schedule form */}
            {showScheduler && post.status === "draft" && (
              <div className="mt-3 p-3 rounded-lg bg-muted/40 space-y-2">
                <p className="text-xs font-medium text-foreground">Schedule this post</p>
                <input
                  type="datetime-local"
                  value={schedulingAt}
                  onChange={(e) => setSchedulingAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  className="w-full h-8 px-2 bg-input border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSchedule} className="h-7 text-xs flex-1 gradient-x text-white border-0">
                    <CalendarClock className="w-3 h-3 mr-1" />
                    Confirm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowScheduler(false)} className="h-7 text-xs">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {post.status === "draft" && (
              <button
                onClick={() => setShowScheduler(!showScheduler)}
                className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
              >
                <CalendarDays className="w-3 h-3" />
                Schedule
              </button>
            )}
            <button
              onClick={() => onDelete(post.id)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Scheduler() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Draft["status"] | "all">("all");
  const [newContent, setNewContent] = useState("");
  const [showCompose, setShowCompose] = useState(false);

  const { data: posts, isLoading } = useQuery<Draft[]>({
    queryKey: ["drafts", user?.id],
    queryFn: async (): Promise<Draft[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("content_drafts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data as Draft[]) ?? [];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_drafts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      toast.success("Post deleted");
    },
    onError: () => toast.error("Failed to delete post"),
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ id, at }: { id: string; at: string }) => {
      const { error } = await supabase
        .from("content_drafts")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ status: "scheduled" as any, scheduled_at: new Date(at).toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      toast.success("Post scheduled!");
    },
    onError: () => toast.error("Failed to schedule post"),
  });

  const composeMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("content_drafts").insert({
        user_id: user.id,
        content: content.trim(),
        hashtags: [] as string[],
        tone: "manual",
        status: "draft" as const,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["drafts"] });
      setNewContent("");
      setShowCompose(false);
      toast.success("Draft saved!");
    },
    onError: () => toast.error("Failed to save draft"),
  });

  const filtered = posts?.filter((p) => activeTab === "all" || p.status === activeTab) ?? [];

  const tabs: { value: Draft["status"] | "all"; label: string; count: number }[] = [
    { value: "all", label: "All", count: posts?.length ?? 0 },
    { value: "scheduled", label: "Scheduled", count: posts?.filter((p) => p.status === "scheduled").length ?? 0 },
    { value: "draft", label: "Drafts", count: posts?.filter((p) => p.status === "draft").length ?? 0 },
    { value: "published", label: "Published", count: posts?.filter((p) => p.status === "published").length ?? 0 },
  ];

  return (
    <AppLayout
      title="Content Scheduler"
      subtitle="Manage and schedule your posts"
      actions={
        <Button size="sm" onClick={() => setShowCompose(!showCompose)} className="gradient-ai text-white border-0 gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          New Draft
        </Button>
      }
    >
      {/* Compose area */}
      {showCompose && (
        <Card className="glass border-primary/20 mb-6">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">New Draft</p>
            </div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={4}
              placeholder="What's on your mind? (or use the Content Generator for AI-powered tweets)"
              className="w-full bg-input border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              maxLength={280}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-mono",
                  newContent.length > 260 ? "text-red-400" : "text-muted-foreground"
                )}>
                  {newContent.length}/280
                </span>
                {newContent.length > 260 && (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowCompose(false); setNewContent(""); }}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => composeMutation.mutate(newContent)}
                  disabled={!newContent.trim() || newContent.length > 280 || composeMutation.isPending}
                  className="gradient-x text-white border-0"
                >
                  Save Draft
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-border pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={cn(
                "text-[10px] font-mono px-1.5 rounded-full",
                activeTab === tab.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Posts */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onDelete={(id) => deleteMutation.mutate(id)}
              onSchedule={(id, at) => scheduleMutation.mutate({ id, at })}
            />
          ))}
        </div>
      ) : (
        <Card className="glass border-border/50 border-dashed">
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <CalendarClock className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No posts here</p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeTab === "all"
                  ? "Generate content with AI or create a draft manually"
                  : `No ${activeTab} posts yet`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowCompose(true)} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                New Draft
              </Button>
              <Button size="sm" asChild className="gradient-ai text-white border-0 gap-1.5">
                <a href="/content">
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate with AI
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
