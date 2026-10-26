import React, { useState } from "react";
import { ShieldCheck, Lock, Settings, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVault } from "./VaultContext";
import { VaultSettingsModal } from "./VaultSettingsModal";

export function VaultHeader() {
  const { lockVault, secondsUntilLock } = useVault();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/70">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">My Private Vault</h1>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              AES-256-GCM Unlocked
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Zero-knowledge client-side encrypted storage for your passwords and personal documents.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Countdown timer */}
          <div
            className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground font-mono"
            title="Auto-locks after inactivity"
          >
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>{formatTimer(secondsUntilLock)}</span>
          </div>

          {/* Settings */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs font-medium"
            onClick={() => setSettingsOpen(true)}
            title="Vault Settings"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Button>

          {/* Lock Vault Button */}
          <Button
            variant="destructive"
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold shadow-sm"
            onClick={lockVault}
            title="Lock Vault immediately"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Lock Vault</span>
          </Button>
        </div>
      </div>

      <VaultSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
