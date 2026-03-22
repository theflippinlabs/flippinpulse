import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircleReply, Copy, Loader2, AlertCircle, CheckCircle2, Zap } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { replyGenerationSchema, type ReplyGenerationInput } from "@/lib/validation";
import { generateReply, type GeneratedReply, AIRateLimitError } from "@/lib/ai";
import { aiReplyLimiter } from "@/lib/rateLimit";
import { cn } from "@/lib/utils";

const TONES = [
  { value: "agree", label: "Agree & Amplify", emoji: "✅", description: "Support and build on their point" },
  { value: "disagree", label: "Respectful Counter", emoji: "⚔️", description: "Challenge with a data-backed view" },
  { value: "add-value", label: "Add Value", emoji: "💡", description: "Contribute insight to the conversation" },
  { value: "funny", label: "Witty", emoji: "😂", description: "Funny, light-hearted reply" },
  { value: "question", label: "Curious", emoji: "🤔", description: "Ask a follow-up question" },
] as const;

export default function ReplyGenerator() {
  const [results, setResults] = useState<GeneratedReply[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(aiReplyLimiter.remaining());

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ReplyGenerationInput>({
    resolver: zodResolver(replyGenerationSchema),
    defaultValues: { tone: "add-value" },
  });

  const tone = watch("tone");
  const tweet = watch("originalTweet") ?? "";

  const onSubmit = async (data: ReplyGenerationInput) => {
    setIsGenerating(true);
    setResults([]);
    try {
      const generated = await generateReply(data);
      setResults(generated);
      setRemaining(aiReplyLimiter.remaining());
      toast.success(`${generated.length} reply options generated!`);
    } catch (err) {
      if (err instanceof AIRateLimitError) {
        toast.error(`Rate limit reached. Retry in ${Math.ceil(err.retryAfterMs / 1000)}s`);
      } else {
        toast.error("Generation failed. Please try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (reply: GeneratedReply) => {
    await navigator.clipboard.writeText(reply.content);
    setCopiedId(reply.id);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AppLayout
      title="Reply Generator"
      subtitle="AI-powered replies that drive engagement"
      actions={
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Zap className="w-3 h-3" />
          <span>{remaining}/15 requests left</span>
        </div>
      }
    >
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Input panel */}
        <div className="xl:col-span-2 space-y-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Original tweet */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">
                  Tweet to Reply To
                </CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  {...register("originalTweet")}
                  rows={5}
                  placeholder="Paste the tweet you want to reply to here…"
                  className="w-full bg-input border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none transition-colors"
                />
                <div className="flex items-center justify-between mt-1.5">
                  {errors.originalTweet ? (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.originalTweet.message}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="text-xs text-muted-foreground font-mono">
                    {tweet.length}/560
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Tone selector */}
            <Card className="glass border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-foreground">Reply Tone</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setValue("tone", t.value)}
                      className={cn(
                        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-all border",
                        tone === t.value
                          ? "bg-primary/10 text-primary border-primary/30"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground bg-muted/30"
                      )}
                    >
                      <span className="text-base flex-shrink-0">{t.emoji}</span>
                      <div>
                        <p className="font-medium">{t.label}</p>
                        <p className="text-[11px] opacity-70">{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Button
              type="submit"
              disabled={isGenerating}
              className="w-full gradient-x text-white border-0 hover:opacity-90 h-11"
            >
              {isGenerating ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating replies…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <MessageCircleReply className="w-4 h-4" />
                  Generate Replies
                </span>
              )}
            </Button>
          </form>

          {/* Tips */}
          <Card className="glass border-border/50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-foreground mb-2">💡 Reply Strategy Tips</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li>• Reply within the first hour for max visibility</li>
                <li>• Add value — don't just say "great point"</li>
                <li>• Ask questions to spark more conversation</li>
                <li>• Tag big accounts to get noticed in threads</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Results panel */}
        <div className="xl:col-span-3 space-y-4">
          {isGenerating && (
            <Card className="glass border-border/50">
              <CardContent className="p-10 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-xl gradient-x flex items-center justify-center">
                  <MessageCircleReply className="w-6 h-6 text-white animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Crafting your reply…</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Finding the perfect angle for maximum impact
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

          {/* Original tweet preview */}
          {tweet && (
            <Card className="glass border-border/50 border-l-2 border-l-primary/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">
                  Original Tweet
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground leading-relaxed">{tweet}</p>
              </CardContent>
            </Card>
          )}

          {results.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">{results.length} reply options</p>
                <Badge className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                  {TONES.find((t) => t.value === tone)?.label}
                </Badge>
              </div>

              {results.map((reply, i) => (
                <Card key={reply.id} className="glass border-border/50 hover:border-border transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-muted-foreground font-mono">
                        Option {i + 1}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {reply.charCount}/280
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-foreground leading-relaxed">{reply.content}</p>
                    <div className="flex gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(reply)}
                        className="flex-1 h-8 text-xs"
                      >
                        {copiedId === reply.id ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1.5 text-green-400" />Copied</>
                        ) : (
                          <><Copy className="w-3 h-3 mr-1.5" />Copy Reply</>
                        )}
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
                  <MessageCircleReply className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Paste a tweet to get started</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Get 3 AI-crafted reply options tailored to your chosen tone
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
