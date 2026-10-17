import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/AppSidebar";
import { CreateMenu } from "@/components/app/CreateMenu";
import { PreviewBanner } from "@/components/app/PreviewBanner";
import { MobileBottomNav } from "@/components/app/MobileBottomNav";
import { Logo } from "@/components/app/Logo";
import { useApplySettings, useSettingsQuery } from "@/hooks/use-settings";
import { DEFAULT_SETTINGS } from "@/lib/settings-shared";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user, loading, error, retry } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !error && !user) navigate({ to: "/auth", replace: true });
  }, [loading, error, user, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="font-medium">Can't reach the MindDesk server</p>
        <p className="max-w-sm text-sm text-muted-foreground">{error.message}</p>
        <button className="rounded-full border px-4 py-2 text-sm hover:bg-accent" onClick={() => retry()}>Try again</button>
      </div>
    );
  }

  if (loading || !user) return <Spinner />;
  return <SignedInShell />;
}

function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function SignedInShell() {
  const sq = useSettingsQuery();
  const s = sq.data ?? DEFAULT_SETTINGS;
  useApplySettings(s);
  // Wait briefly for preferences so times and week layout render right the first time (falls back to defaults on error).
  if (sq.isPending) return <Spinner />;
  // Remount pages when time-related preferences change so every time label re-renders.
  const prefsKey = `${s.time_zone}|${s.clock}|${s.week_start}`;
  return <Shell prefsKey={prefsKey} />;
}

function Shell({ prefsKey }: { prefsKey: string }) {


  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
            <SidebarTrigger className="hidden h-9 w-9 md:inline-flex" />
            <div className="flex items-center gap-2 md:hidden">
              <Logo className="h-6 w-6" />
              <span className="text-[15px] font-semibold tracking-tight">MindDesk</span>
            </div>
            <div className="flex-1" />
            <div className="md:hidden">
              <CreateMenu compact />
            </div>
          </header>
          <main className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
            <Outlet key={prefsKey} />
          </main>
        </div>
      </div>
      <MobileBottomNav />
      <PreviewBanner />
    </SidebarProvider>
  );
}
