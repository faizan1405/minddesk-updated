import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — MindDesk" },
      { name: "description", content: "Sign in to your MindDesk workspace." },
      { property: "og:title", content: "Sign in — MindDesk" },
      { property: "og:description", content: "Sign in to your MindDesk workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate({ to: "/", replace: true }); // "/" opens the start page chosen in Settings
  }, [user, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setRateLimitMessage(null);
    try {
      await signIn(email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const status = (err as { status?: number })?.status;
      if (status === 429 || msg.toLowerCase().includes("too many")) {
        setRateLimitMessage(msg);
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="mb-4 h-10 w-10" />
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your tasks, all in one calm place.</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {rateLimitMessage && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              <div className="flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>Temporary Security Delay</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed opacity-90">{rateLimitMessage}</p>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setRateLimitMessage(null);
                }}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={1}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setRateLimitMessage(null);
                }}
                className="h-11 rounded-xl"
              />
            </div>
            <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
