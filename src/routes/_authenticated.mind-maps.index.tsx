import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Lock, LockOpen, MoreHorizontal, Network, Plus, Search, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextPromptDialog } from "@/components/app/TextPromptDialog";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { LoadingState } from "@/components/app/PageStates";
import { useMindMapActions, useMindMaps, type MindMapMeta } from "@/lib/mindmaps";
import { parseMindMapJson } from "@/lib/mindmap-doc";

export const Route = createFileRoute("/_authenticated/mind-maps/")({ component: MindMapsHome });

function MindMapsHome() {
  const maps = useMindMaps();
  const { create } = useMindMapActions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (maps.data ?? []).filter((m) => !s || m.title.toLowerCase().includes(s));
  }, [maps.data, q]);

  const onImport = async (file: File) => {
    setImporting(true);
    const toastId = toast.loading("Importing mind map...");
    try {
      if (file.size > 5_000_000)
        throw new Error("File is larger than 5 MB (maximum supported size).");
      const text = await file.text();
      const defaultTitle = file.name ? file.name.replace(/\.[^/.]+$/, "").trim() : undefined;
      const { title, doc } = parseMindMapJson(text, defaultTitle);
      const m = await create.mutateAsync({ title, data: doc });
      toast.success(`Imported "${title}"`, { id: toastId });
      navigate({ to: "/mind-maps/$mapId", params: { mapId: m.id } });
    } catch (e) {
      const description =
        e instanceof SyntaxError
          ? "The file isn't valid JSON. Please check for syntax errors."
          : e instanceof Error
            ? e.message
            : "An unknown error occurred during import.";
      toast.error("Couldn't import mind map", { id: toastId, description });
    } finally {
      setImporting(false);
    }
  };

  if (maps.isPending) return <LoadingState />;
  if (maps.error)
    return (
      <div className="mx-auto mt-16 max-w-sm text-center">
        <p className="font-medium">Couldn't load your mind maps</p>
        <p className="mt-1 text-sm text-muted-foreground">{maps.error.message}</p>
        <Button className="mt-4" variant="outline" onClick={() => maps.refetch()}>
          Try again
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Mind Maps</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2 rounded-full"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> {importing ? "Importing..." : "Import"}
          </Button>
          <Button className="gap-2 rounded-full" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New mind map
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Import mind map file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void onImport(f);
          }}
        />
      </div>

      {maps.data.length > 0 && (
        <div className="relative mb-5 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search mind maps"
            className="rounded-full pl-9"
          />
        </div>
      )}

      {maps.data.length === 0 ? (
        <div className="mx-auto mt-16 max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border bg-card">
            <Network className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">No mind maps yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with a central idea and branch out from there.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">No mind maps match "{q}".</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <MapCard key={m.id} map={m} />
          ))}
        </div>
      )}

      <TextPromptDialog
        open={creating}
        onOpenChange={setCreating}
        title="New mind map"
        placeholder="Central idea"
        confirmLabel="Create"
        onSubmit={async (v) => {
          const m = await create.mutateAsync({ title: v });
          navigate({ to: "/mind-maps/$mapId", params: { mapId: m.id } });
        }}
      />
    </div>
  );
}

function MapCard({ map }: { map: MindMapMeta }) {
  const { rename, duplicate, remove, setLocked } = useMindMapActions();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <div className="group relative rounded-2xl border bg-card transition-colors hover:border-primary/40">
      <Link to="/mind-maps/$mapId" params={{ mapId: map.id }} className="block p-5 pr-12">
        <Network className="mb-4 h-5 w-5 text-primary" />
        <div className="flex items-center gap-1.5 font-medium">
          <span className="truncate">{map.title}</span>
          {map.is_locked && (
            <span title="Locked (read-only)">
              <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Locked" />
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {map.node_count} topic{map.node_count === 1 ? "" : "s"} · updated{" "}
          {formatDistanceToNow(new Date(map.updated_at), { addSuffix: true })}
        </div>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mind map actions"
            className="absolute right-3 top-3 h-8 w-8 rounded-full"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setLocked.mutate({ id: map.id, locked: !map.is_locked })}>
            {map.is_locked ? "Unlock" : "Lock"}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={map.is_locked} onSelect={() => setRenaming(true)}>Rename</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicate.mutate(map.id)}>Duplicate</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={map.is_locked}
            className="text-destructive focus:text-destructive"
            onSelect={() => setDeleting(true)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TextPromptDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename mind map"
        initial={map.title}
        onSubmit={(v) => rename.mutateAsync({ id: map.id, title: v })}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${map.title}"?`}
        description="All topics and connections in this mind map will be deleted. This can't be undone."
        onConfirm={() => remove.mutate(map.id)}
      />
    </div>
  );
}
