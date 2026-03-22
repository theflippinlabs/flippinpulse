import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles, Copy, Save, RotateCcw, Hash, Smile, Users, Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { contentGenerationSchema } from "@/lib/validation";
import type { ContentGenerationInput } from "@/lib/validation";
import { generateContent, type GeneratedContent, AIRateLimitError } from "@/lib/ai";
import { aiContentLimiter } from "@/lib/rateLimit";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const TONES = [
  { value: "professional", label: "Professional", emoji: "💼", description: "Authoritative & informative" },
  { value: "casual", label: "Casual", emoji: "😎", description: "Relatable & conversational" },
  { value: "viral", label: "Viral", emoji: "🔥", description: "High-engagement hooks" },
  { value: "educational", label: "Educational", emoji: "📚", description: "Teaches & explains" },
  { value: "controversial", label: "Bold", emoji: "⚡", description: "Hot takes & opinions" },
] as const;

const FORMATS = [
  { value: "single", label: "Single Tweet", description: "Up to 280 characters" },
  { value: "thread", label: "Thread", description: "Multiple connected tweets" },
] as const;

const ENGAGEMENT_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground border-border",
  medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  high: "bg-green-500/10 text-green-400 border-green-500/20",
  viral: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

export default function ContentGenerator() {
  const { user } = useAuth();
  const [results, setResults] = useState<GeneratedContent[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(aiContentLimiter.remaining());

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ContentGenerationInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(contentGenerationSchema) as any,
    defaultValues: {
      tone: "viral",
      format: "single",
      includeHashtags: true,
      includeEmojis: false,
    },
  });

  const tone = watch("tone");
  const format = watch("format");
  const includeHashtags = watch("includeHashtags");
  const includeEmojis = watch("includeEmojis");

  const onSubmit = async (data: ContentGenerationInput) => {
    setIsGenerating(true);
    setResults([]);
    try {
      const generated = await generateContent(data);
      setResults(generated);
      setRemaining(aiContentLimiter.remaining());
      toast.success(`${generated.length} variations generated!`);
    } catch (err) {
      if (err instanceof AIRateLimitError) {
        toast.error(`Rate limit reached. Try again in ${Math.ceil(err.retryAfterMs / 1000)}s`);
      } else {
        toast.error("Generation failed. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (content: GeneratedContent) => {
    await navigator.clipboard.writeText(content.content);
    setCopiedId(content.id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveDraft = async (content: GeneratedContent) => {
    if (!user) return;
    const { error } = await supabase.from("content_drafts").insert({
      user_id: user.id,
      content: content.content,
      hashtags: content.hashtags,
      tone: "generated",
      is_thread: content.isThread,
      thread_parts: content.threadParts ?? null,
      status: "draft",
    });
    if (error) {
      toast.error("Failed to save draft");
    } else {
      toast.success("Draft saved!");
    }
  };

  return (
    <AppLayout
      title="Content Generator"
      subtitle="AI-powered tweet creation with Claude"
      actions={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="w-3 h-3" />
          <span>{remaining}/10 requests left</span>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Input panel */}
        <div className="xl:col-span-2">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Topic */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">Topic or Keyword</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  {...register("topic")}
                  rows={3}
                  placeholder="e.g. AI agents are replacing developers, Bitcoin hitting ATH, Building a SaaS in 30 days..."
                  className="w-full bg-input border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-colors"
                />
                {errors.topic && (
                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {errors.topic.message}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Tone */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">Tone</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setValue("tone", t.value)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-left transition-all border",
                        tone === t.value
                          ? "bg-primary/10 text-primary border-primary/30 glow-primary"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground bg-muted/30"
                      )}
                    >
                      <span className="text-base">{t.emoji}</span>
                      <div>
                        <p className="font-medium">{t.label}</p>
                        <p className="text-[11px] opacity-70">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Format */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">Format</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setValue("format", f.value)}
                      className={cn(
                        "flex flex-col items-start px-3 py-2.5 rounded-lg text-sm text-left transition-all border",
                        format === f.value
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-border text-muted-foreground hover:border-border/80 bg-muted/30"
                      )}
                    >
                      <p className="font-medium">{f.label}</p>
                      <p className="text-[11px] opacity-70">{f.description}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Options */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: "includeHashtags", label: "Include hashtags", icon: Hash, value: includeHashtags },
                  { key: "includeEmojis", label: "Include emojis", icon: Smile, value: includeEmojis },
                ].map(({ key, label, icon: Icon, value }) => (
                  <label key={key} className="flex items-center justify-between cursor-pointer">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="w-4 h-4" />
                      {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setValue(key as "includeHashtags" | "includeEmojis", !value)}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative",
                        value ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                          value ? "translate-x-5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </label>
                ))}

                <div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground mb-1.5">
                    <Users className="w-4 h-4" />
                    Target audience (optional)
                  </label>
                  <input
                    {...register("targetAudience")}
                    placeholder="e.g. indie hackers, crypto traders, developers"
                    className="w-full h-9 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                  />
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              disabled={isGenerating}
              className="w-full gradient-ai text-white border-0 hover:opacity-90 h-11"
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Generate Content
                </span>
              )}
            </Button>
          </form>
        </div>

        {/* Results panel */}
        <div className="xl:col-span-3 space-y-4">
          {isGenerating && (
            <Card className="glass border-border/50">
              <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-xl gradient-ai flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Claude is thinking…</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Crafting high-engagement variations for you
                  </p>
                </div>
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {results.length} variations generated
                </p>
                <button
                  onClick={handleSubmit(onSubmit)}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Regenerate
                </button>
              </div>

              {results.map((result, i) => (
                <Card key={result.id} className="glass border-border/50 hover:border-border transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground font-mono">
                          #{i + 1}
                        </span>
                        <Badge className={cn("text-[10px] px-2 py-0 border", ENGAGEMENT_COLORS[result.estimatedEngagement])}>
                          {result.estimatedEngagement} engagement
                        </Badge>
                        {result.isThread && (
                          <Badge className="text-[10px] px-2 py-0 bg-purple-500/10 text-purple-400 border-purple-500/20">
                            thread
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {result.charCount}/280
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {result.content}
                    </p>

                    {result.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {result.hashtags.map((tag) => (
                          <span key={tag} className="text-xs text-primary font-medium">{tag}</span>
                        ))}
                      </div>
                    )}

                    {result.isThread && result.threadParts && (
                      <div className="mt-4 pt-4 border-t border-border space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Thread preview</p>
                        {result.threadParts.map((part, j) => (
                          <div key={j} className="flex gap-2">
                            <span className="text-xs font-mono text-muted-foreground w-4 flex-shrink-0">
                              {j + 1}/
                            </span>
                            <p className="text-xs text-muted-foreground">{part}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(result)}
                        className="flex-1 h-8 text-xs"
                      >
                        {copiedId === result.id ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1.5 text-green-400" />Copied</>
                        ) : (
                          <><Copy className="w-3 h-3 mr-1.5" />Copy</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => saveDraft(result)}
                        className="flex-1 h-8 text-xs"
                      >
                        <Save className="w-3 h-3 mr-1.5" />
                        Save Draft
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

          {results.length === 0 && !isGenerating && (
            <Card className="glass border-border/50 border-dashed">
              <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Ready to generate</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter a topic and hit Generate Content to get AI-powered tweet variations
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                  {["🔥 Viral hooks", "💡 Value threads", "🎯 CTAs"].map((t) => (
                    <div key={t} className="px-2 py-1.5 rounded-lg bg-muted text-[11px] text-muted-foreground text-center">
                      {t}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
