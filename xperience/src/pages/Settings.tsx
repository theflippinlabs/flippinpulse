import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, Shield, Bell, Zap, Key, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { signOut } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notifications, setNotifications] = useState({
    weeklyReport: true,
    trendAlerts: true,
    scheduledPosts: true,
    aiUsageWarning: true,
  });

  const { data: profile } = useQuery<{ full_name: string | null } | null>({
    queryKey: ["profile", user?.id],
    queryFn: async (): Promise<{ full_name: string | null } | null> => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      return data as { full_name: string | null } | null;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile?.full_name) setDisplayName(profile.full_name);
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("profiles") as any)
        .upsert({ id: user.id, full_name: displayName, email: user.email ?? "", updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Profile updated"),
    onError: () => toast.error("Failed to update profile"),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
      if (newPassword.length < 8) throw new Error("Password too short");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated successfully");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  const PLAN_LIMITS = {
    aiRequests: { used: 47, limit: 100, label: "AI Requests this month" },
    accounts: { used: 1, limit: 3, label: "Connected accounts" },
    scheduledPosts: { used: 4, limit: 20, label: "Scheduled posts" },
  };

  return (
    <AppLayout title="Settings" subtitle="Manage your account & preferences">
      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full gradient-brand flex items-center justify-center text-white font-bold text-xl">
                {(displayName || user?.email || "U")[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-foreground">{displayName || "Your Name"}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your full name"
                className="w-full h-9 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Email</label>
              <input
                value={user?.email ?? ""}
                readOnly
                className="w-full h-9 px-3 bg-muted border border-border rounded-md text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>

            <Button
              size="sm"
              onClick={() => updateProfileMutation.mutate()}
              disabled={updateProfileMutation.isPending || !displayName.trim()}
              className="gradient-x text-white border-0 gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Save Profile
            </Button>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full h-9 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className={cn(
                  "w-full h-9 px-3 bg-input border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                  confirmPassword && newPassword !== confirmPassword
                    ? "border-destructive focus:ring-destructive"
                    : "border-border"
                )}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Passwords do not match
                </p>
              )}
            </div>

            <Button
              size="sm"
              onClick={() => updatePasswordMutation.mutate()}
              disabled={!newPassword || !confirmPassword || updatePasswordMutation.isPending}
              variant="outline"
              className="gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              Update Password
            </Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-yellow-400" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(notifications).map(([key, enabled]) => {
              const labels: Record<string, { title: string; desc: string }> = {
                weeklyReport: { title: "Weekly growth report", desc: "Summary of your account performance" },
                trendAlerts: { title: "Trend alerts", desc: "Get notified when topics are going viral" },
                scheduledPosts: { title: "Post reminders", desc: "Alert before scheduled posts go live" },
                aiUsageWarning: { title: "AI usage warnings", desc: "Alert when approaching monthly limits" },
              };
              const { title, desc } = labels[key];

              return (
                <div key={key} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-sm font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <button
                    onClick={() => {
                      setNotifications((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }));
                      toast.success("Preference saved");
                    }}
                    className={cn(
                      "w-10 h-5 rounded-full transition-colors relative flex-shrink-0",
                      enabled ? "bg-primary" : "bg-muted border border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                        enabled ? "translate-x-5" : "translate-x-0.5"
                      )}
                    />
                  </button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Plan & Usage */}
        <Card className="glass border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Plan & Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Pro Plan</p>
                <p className="text-xs text-muted-foreground">Renews on April 22, 2026</p>
              </div>
              <Badge className="bg-primary/10 text-primary border-primary/20">Active</Badge>
            </div>

            <div className="space-y-4">
              {Object.entries(PLAN_LIMITS).map(([key, data]) => {
                const pct = (data.used / data.limit) * 100;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{data.label}</span>
                      <span className={cn(
                        "font-mono font-medium",
                        pct > 80 ? "text-red-400" : pct > 60 ? "text-yellow-400" : "text-foreground"
                      )}>
                        {data.used} / {data.limit}
                      </span>
                    </div>
                    <div className="score-bar">
                      <div
                        className={cn(
                          "score-fill",
                          pct > 80 ? "bg-red-400" : pct > 60 ? "bg-yellow-400" : "bg-primary"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button variant="outline" size="sm" className="mt-4 w-full gap-1.5">
              <Zap className="w-3.5 h-3.5" />
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="glass border-destructive/20">
          <CardHeader className="pb-4">
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-foreground">Sign out</p>
                <p className="text-xs text-muted-foreground">Sign out from this device</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="gap-1.5 hover:text-destructive hover:border-destructive/30"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
