import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AtSign, Plus, Trash2, RefreshCw, Users, TrendingUp, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { addAccountSchema } from "@/lib/validation";
import type { XAccount } from "@/types";
import { formatNumber, cn } from "@/lib/utils";
import { z } from "zod";

type AddAccountInput = z.infer<typeof addAccountSchema>;

export default function Accounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: accounts, isLoading } = useQuery<XAccount[]>({
    queryKey: ["x-accounts", user?.id],
    queryFn: async (): Promise<XAccount[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from("x_accounts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return (data as XAccount[]) ?? [];
    },
    enabled: !!user,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddAccountInput>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(addAccountSchema) as any,
  });

  const addMutation = useMutation({
    mutationFn: async (data: AddAccountInput) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("x_accounts").insert({
        user_id: user.id,
        handle: data.handle,
        display_name: data.displayName,
        is_connected: true,
        followers_count: 0,
        following_count: 0,
        tweets_count: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["x-accounts"] });
      reset();
      setShowAddForm(false);
      toast.success("Account added successfully!");
    },
    onError: (err: Error) => {
      toast.error(err.message.includes("duplicate") ? "This account is already connected" : "Failed to add account");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("x_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["x-accounts"] });
      toast.success("Account removed");
    },
    onError: () => toast.error("Failed to remove account"),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, connected }: { id: string; connected: boolean }) => {
      const { error } = await supabase
        .from("x_accounts")
        .update({ is_connected: connected, last_synced_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { connected }) => {
      queryClient.invalidateQueries({ queryKey: ["x-accounts"] });
      toast.success(connected ? "Account connected" : "Account disconnected");
    },
  });

  return (
    <AppLayout
      title="Connected Accounts"
      subtitle="Manage your X accounts"
      actions={
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)} className="gradient-x text-white border-0 gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Add Account
        </Button>
      }
    >
      {/* Add account form */}
      {showAddForm && (
        <Card className="glass border-primary/20 mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AtSign className="w-4 h-4 text-primary" />
              Connect X Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => addMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    X Handle (without @)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <input
                      {...register("handle")}
                      placeholder="yourhandle"
                      className="w-full h-9 pl-7 pr-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {errors.handle && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.handle.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    Display Name
                  </label>
                  <input
                    {...register("displayName")}
                    placeholder="Your Name"
                    className="w-full h-9 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.displayName && (
                    <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errors.displayName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Note:</span> In production, this connects via OAuth 2.0.
                  Enter your handle manually for demo purposes.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  size="sm"
                  disabled={addMutation.isPending}
                  className="gradient-x text-white border-0 gap-1.5"
                >
                  {addMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Connect Account
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Accounts list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} className={cn(
              "glass border-border/50 hover:border-border transition-colors",
              !account.is_connected && "opacity-60"
            )}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full gradient-x flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {account.display_name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{account.display_name}</p>
                      <p className="text-sm text-muted-foreground font-mono">@{account.handle}</p>
                    </div>
                  </div>
                  <Badge className={cn(
                    "text-[10px] border gap-1",
                    account.is_connected
                      ? "bg-green-500/10 text-green-400 border-green-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  )}>
                    {account.is_connected ? (
                      <><CheckCircle2 className="w-2.5 h-2.5" />Connected</>
                    ) : (
                      <><XCircle className="w-2.5 h-2.5" />Disconnected</>
                    )}
                  </Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: "Followers", value: formatNumber(account.followers_count), icon: Users },
                    { label: "Following", value: formatNumber(account.following_count), icon: AtSign },
                    { label: "Tweets", value: formatNumber(account.tweets_count), icon: TrendingUp },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center p-2 rounded-lg bg-muted/40">
                      <p className="text-xs font-bold font-mono text-foreground">{stat.value}</p>
                      <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>

                {account.last_synced_at && (
                  <p className="text-[10px] text-muted-foreground mb-3">
                    Last synced: {new Date(account.last_synced_at).toLocaleDateString()}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleMutation.mutate({ id: account.id, connected: !account.is_connected })}
                    disabled={toggleMutation.isPending}
                    className={cn("flex-1 h-7 text-xs", account.is_connected && "hover:text-destructive hover:border-destructive/30")}
                  >
                    {account.is_connected ? "Disconnect" : "Reconnect"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMutation.mutate(account.id)}
                    disabled={deleteMutation.isPending}
                    className="h-7 w-7 p-0 hover:text-destructive hover:border-destructive/30"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="glass border-border/50 border-dashed">
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <AtSign className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">No accounts connected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your X accounts to track growth and schedule content
              </p>
            </div>
            <Button onClick={() => setShowAddForm(true)} className="gradient-x text-white border-0 gap-1.5">
              <Plus className="w-4 h-4" />
              Connect Your First Account
            </Button>
          </CardContent>
        </Card>
      )}
    </AppLayout>
  );
}
