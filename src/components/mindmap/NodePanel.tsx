import { useEffect, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Copy, CornerDownRight, ExternalLink, LayoutGrid, Plus, Spline, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MAP_COLORS, NODE_ICONS, NODE_SIZES, TEXT_COLORS, type MapNode } from "@/lib/mindmap-doc";
import { ICONS, colorVar, fillFor, textFor } from "./parts";
import { cn } from "@/lib/utils";

export type NodeActions = {
  update: (patch: Partial<MapNode>, key?: string) => void;
  addChild: () => void; addSibling: () => void; duplicate: () => void; remove: () => void;
  toggleCollapse: () => void; connect: () => void; arrangeBranch: () => void;
};
export type PanelTab = "content" | "style" | "details";

const TEXT_LABEL = { default: "Default", muted: "Soft", accent: "Accent", color: "Branch", dark: "Dark" } as const;
const SIZE_LABEL = { s: "Small", m: "Medium", l: "Large" } as const;

export function NodePanel({ node, isRoot, childCount, actions, tab, onTab, onClose, readOnly = false }: {
  node: MapNode; isRoot: boolean; childCount: number; actions: NodeActions;
  tab: PanelTab; onTab: (t: PanelTab) => void; onClose?: () => void; readOnly?: boolean;
}) {
  const [link, setLink] = useState(node.link);
  useEffect(() => setLink(node.link), [node.id, node.link]);
  useEffect(() => {
    if (readOnly && tab !== "content") onTab("content");
  }, [readOnly, tab, onTab]);
  const linkValid = link === "" || /^https?:\/\/\S+$/i.test(link);

  return (
    <Tabs value={tab} onValueChange={(v) => onTab(v as PanelTab)} className="text-sm">
      <div className="mb-4 flex items-center gap-2">
        <TabsList className="h-8 flex-1">
          <TabsTrigger value="content" className="flex-1 text-xs">Content</TabsTrigger>
          <TabsTrigger value="style" disabled={readOnly} className="flex-1 text-xs">Style</TabsTrigger>
          <TabsTrigger value="details" disabled={readOnly} className="flex-1 text-xs">Actions</TabsTrigger>
        </TabsList>
        {onClose && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close panel"><X className="h-4 w-4" /></Button>}
      </div>

      <TabsContent value="content" className="mt-0 space-y-4">
        <div>
          <Label htmlFor="mm-title" className="mb-2 block text-xs text-muted-foreground">Title</Label>
          <Input id="mm-title" value={node.title} maxLength={300} placeholder="New topic"
            disabled={readOnly} readOnly={readOnly}
            onChange={(e) => actions.update({ title: e.target.value }, `title:${node.id}`)} className="font-medium" />
        </div>
        <div>
          <Label htmlFor="mm-notes" className="mb-2 block text-xs text-muted-foreground">Notes</Label>
          <Textarea id="mm-notes" rows={4} maxLength={10000} value={node.notes} placeholder={readOnly ? "No notes added." : "Add notes…"}
            disabled={readOnly} readOnly={readOnly}
            onChange={(e) => actions.update({ notes: e.target.value }, `notes:${node.id}`)} />
        </div>
        <div>
          <Label htmlFor="mm-link" className="mb-2 block text-xs text-muted-foreground">Link</Label>
          <div className="flex gap-2">
            <Input id="mm-link" value={link} placeholder={readOnly ? "No link added." : "https://…"} maxLength={2000}
              disabled={readOnly} readOnly={readOnly}
              onChange={(e) => { setLink(e.target.value); if (/^https?:\/\/\S+$/i.test(e.target.value) || e.target.value === "") actions.update({ link: e.target.value }, `link:${node.id}`); }} />
            {node.link && (
              <Button asChild variant="outline" size="icon" aria-label="Open link">
                <a href={node.link} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
            )}
          </div>
          {!linkValid && <p className="mt-1 text-xs text-destructive">Links must start with http:// or https://</p>}
        </div>
      </TabsContent>

      <TabsContent value="style" className="mt-0 space-y-5">
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Color</Label>
          <div className="flex flex-wrap gap-2">
            {MAP_COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => actions.update({ color: c })}
                className={cn("h-7 w-7 rounded-full border-2 transition-transform hover:scale-110", node.color === c && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                style={{ background: fillFor(c), borderColor: c === "default" ? "var(--border)" : colorVar(c) }} />
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Text</Label>
          <div className="flex flex-wrap gap-1.5">
            {TEXT_COLORS.map((t) => (
              <button key={t} type="button" onClick={() => actions.update({ textColor: t })}
                className={cn("rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors", node.textColor === t && "border-primary")}
                style={{ color: textFor(t, node.color), background: t === "dark" ? fillFor(node.color === "default" ? "gray" : node.color) : undefined }}>
                {TEXT_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Size</Label>
          <div className="inline-flex rounded-lg border p-0.5">
            {NODE_SIZES.map((s) => (
              <button key={s} type="button" onClick={() => actions.update({ size: s })}
                className={cn("rounded-md px-3 py-1 text-xs transition-colors", node.size === s ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")}>
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="mb-2 block text-xs text-muted-foreground">Icon</Label>
          <div className="flex flex-wrap gap-1.5">
            {NODE_ICONS.map((i) => {
              const I = i === "none" ? null : ICONS[i];
              return (
                <button key={i} type="button" aria-label={`Icon ${i}`} onClick={() => actions.update({ icon: i })}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:text-foreground", node.icon === i && "border-primary text-foreground")}>
                  {I ? <I className="h-4 w-4" /> : <X className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="details" className="mt-0 space-y-4">
        <div className="grid grid-cols-1 gap-1.5">
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.addChild}><CornerDownRight className="h-4 w-4" />Add child</Button>
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.addSibling} disabled={isRoot}><Plus className="h-4 w-4" />Add sibling</Button>
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.connect}><Spline className="h-4 w-4" />Connect to another topic…</Button>
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.duplicate} disabled={isRoot}><Copy className="h-4 w-4" />Duplicate branch</Button>
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.toggleCollapse} disabled={isRoot || childCount === 0}>
            {node.collapsed ? <ChevronsUpDown className="h-4 w-4" /> : <ChevronsDownUp className="h-4 w-4" />}{node.collapsed ? "Expand branch" : "Collapse branch"}
          </Button>
          <Button variant="secondary" size="sm" className="justify-start gap-2" onClick={actions.arrangeBranch} disabled={childCount === 0}><LayoutGrid className="h-4 w-4" />Arrange branch</Button>
        </div>
        {!isRoot && (
          <Button variant="outline" className="w-full gap-2 text-destructive hover:text-destructive" onClick={actions.remove}>
            <Trash2 className="h-4 w-4" /> Delete topic{childCount ? " and its branch" : ""}
          </Button>
        )}
      </TabsContent>
    </Tabs>
  );
}
