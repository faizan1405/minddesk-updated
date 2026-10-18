import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  LayoutTemplate,
  Search,
  NotebookPen,
  CheckSquare,
  FolderKanban,
  Network,
  Sparkles,
  ArrowRight,
  Eye,
  Check,
  ListPlus,
  Loader2,
  X,
  Layers,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  TEMPLATES,
  type TemplateCategory,
  type TemplateDefinition,
} from "@/lib/templates/template-definitions";
import {
  applyNoteTemplate,
  applyTaskTemplate,
  applyProjectTemplate,
  applyMindMapTemplate,
} from "@/lib/templates/template-actions";
import { useLists, listsKey, tasksKey } from "@/lib/tasks";
import { pagesKey, projectsKey } from "@/lib/pages";
import { mapsKey } from "@/lib/mindmaps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Template Library — MindDesk" },
      {
        name: "description",
        content: "Professional built-in templates for Notes, Tasks, Projects, and Mind Maps.",
      },
      { property: "og:title", content: "Template Library — MindDesk" },
      {
        property: "og:description",
        content: "Professional built-in templates for Notes, Tasks, Projects, and Mind Maps.",
      },
    ],
  }),
  component: TemplateLibraryPage,
});

const CATEGORIES: {
  id: "all" | TemplateCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: "all", label: "All Templates", icon: Sparkles },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "mind-maps", label: "Mind Maps", icon: Network },
];

export function TemplateLibraryPage() {
  const [selectedCategory, setSelectedCategory] = useState<"all" | TemplateCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTemplate, setActiveTemplate] = useState<TemplateDefinition | null>(null);

  // Filter templates based on category and search query
  const filteredTemplates = useMemo(() => {
    return TEMPLATES.filter((t) => {
      const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Template Library</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Instantly create structured notes, organized task lists, complete projects, and visual
            mind maps.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates & tags..."
            className="pl-9 pr-8 rounded-xl bg-card"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = selectedCategory === cat.id;
          const count =
            cat.id === "all"
              ? TEMPLATES.length
              : TEMPLATES.filter((t) => t.category === cat.id).length;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{cat.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.2 text-[10px]",
                  active
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Template Cards Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
            <Search className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No matching templates found</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            Try adjusting your search query or selecting a different category tab.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("all");
            }}
            className="mt-4 rounded-xl"
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={() => setActiveTemplate(template)}
            />
          ))}
        </div>
      )}

      {/* Template Detail & Customization Modal */}
      {activeTemplate && (
        <TemplateUseDialog
          template={activeTemplate}
          open={!!activeTemplate}
          onOpenChange={(open) => !open && setActiveTemplate(null)}
        />
      )}
    </div>
  );
}

// Individual Template Card
function TemplateCard({
  template,
  onSelect,
}: {
  template: TemplateDefinition;
  onSelect: () => void;
}) {
  const CategoryIcon =
    template.category === "notes"
      ? NotebookPen
      : template.category === "tasks"
        ? CheckSquare
        : template.category === "projects"
          ? FolderKanban
          : Network;

  const categoryLabel =
    template.category === "notes"
      ? "Notes"
      : template.category === "tasks"
        ? "Tasks"
        : template.category === "projects"
          ? "Projects"
          : "Mind Maps";

  const categoryBadgeColor =
    template.category === "notes"
      ? "bg-amber-500/10 text-amber-500"
      : template.category === "tasks"
        ? "bg-blue-500/10 text-blue-500"
        : template.category === "projects"
          ? "bg-emerald-500/10 text-emerald-500"
          : "bg-violet-500/10 text-violet-500";

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md">
      <div>
        {/* Category Badge & Icon */}
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
              categoryBadgeColor,
            )}
          >
            <CategoryIcon className="h-3 w-3" />
            {categoryLabel}
          </span>
          <span className="text-[11px] text-muted-foreground">{template.previewSummary}</span>
        </div>

        {/* Title & Description */}
        <h3 className="mt-3.5 text-base font-semibold tracking-tight text-foreground group-hover:text-primary transition-colors">
          {template.title}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {template.description}
        </p>

        {/* Tags */}
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {template.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 pt-3.5 border-t flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSelect}
          className="rounded-xl text-xs gap-1.5 flex-1"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </Button>
        <Button size="sm" onClick={onSelect} className="rounded-xl text-xs gap-1.5 flex-1">
          Use Template
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// Dialog to preview, customize, and instantiate the template
function TemplateUseDialog({
  template,
  open,
  onOpenChange,
}: {
  template: TemplateDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: userLists = [] } = useLists();

  const [title, setTitle] = useState(template.title);
  const [listMode, setListMode] = useState<"new" | "existing">("new");
  const [selectedListId, setSelectedListId] = useState<string>(userLists[0]?.id || "");
  const [newListName, setNewListName] = useState(
    template.taskData?.defaultListName || template.title,
  );
  const [isApplying, setIsApplying] = useState(false);

  const handleUseTemplate = async () => {
    setIsApplying(true);
    try {
      let result;

      if (template.category === "notes") {
        result = await applyNoteTemplate(template, title);
        await qc.invalidateQueries({ queryKey: pagesKey });
        toast.success(`Created "${title}" in Notes`);
      } else if (template.category === "tasks") {
        result = await applyTaskTemplate(template, {
          listMode,
          listId: selectedListId,
          newListName,
        });
        await qc.invalidateQueries({ queryKey: listsKey });
        await qc.invalidateQueries({ queryKey: tasksKey });
        toast.success(`Created tasks from "${template.title}"`);
      } else if (template.category === "projects") {
        result = await applyProjectTemplate(template, title);
        await qc.invalidateQueries({ queryKey: projectsKey });
        await qc.invalidateQueries({ queryKey: pagesKey });
        toast.success(`Created "${title}" in Projects`);
      } else if (template.category === "mind-maps") {
        result = await applyMindMapTemplate(template, title);
        await qc.invalidateQueries({ queryKey: mapsKey });
        toast.success(`Created "${title}" in Mind Maps`);
      }

      onOpenChange(false);
      if (result?.url) {
        navigate({ to: result.url });
      }
    } catch (err: unknown) {
      toast.error("Couldn't create item from template", {
        description: err instanceof Error ? err.message : "An unexpected error occurred",
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl p-6">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary uppercase">
              {template.category}
            </span>
            <span className="text-xs text-muted-foreground">• {template.previewSummary}</span>
          </div>
          <DialogTitle className="text-xl font-bold mt-1">{template.title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            {template.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 my-2">
          {/* Title Customization Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              {template.category === "projects"
                ? "Project Title"
                : template.category === "mind-maps"
                  ? "Mind Map Central Topic"
                  : "Item Title"}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
              className="rounded-xl"
            />
          </div>

          {/* Task-specific options (Choose existing list or create new) */}
          {template.category === "tasks" && (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-3.5 text-xs">
              <span className="font-semibold text-foreground block">Destination Task List:</span>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="listMode"
                    checked={listMode === "new"}
                    onChange={() => setListMode("new")}
                    className="accent-primary"
                  />
                  <span>Create a new task list</span>
                </label>
                {listMode === "new" && (
                  <Input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list name..."
                    className="h-8 rounded-lg ml-5 w-auto"
                  />
                )}

                {userLists.length > 0 && (
                  <>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="listMode"
                        checked={listMode === "existing"}
                        onChange={() => setListMode("existing")}
                        className="accent-primary"
                      />
                      <span>Add to an existing list</span>
                    </label>
                    {listMode === "existing" && (
                      <select
                        value={selectedListId}
                        onChange={(e) => setSelectedListId(e.target.value)}
                        className="ml-5 h-8 rounded-lg border bg-background px-2 text-xs text-foreground focus:outline-none"
                      >
                        {userLists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Structured Content Preview */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-foreground block">Content Preview:</span>
            <div className="max-h-60 overflow-y-auto rounded-xl border bg-muted/20 p-4 text-xs font-mono">
              {template.category === "notes" && template.noteContent && (
                <div className="space-y-2 font-sans">
                  {template.noteContent.blocks.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      {b.type === "check" ? (
                        <span className="mt-0.5 h-3.5 w-3.5 rounded border border-muted-foreground/60 shrink-0" />
                      ) : b.type === "bullet" ? (
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      ) : null}
                      <span
                        className={cn(
                          b.type === "p" && b.text.endsWith(":")
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {b.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {template.category === "tasks" && template.taskData && (
                <div className="space-y-3 font-sans">
                  {template.taskData.tasks.map((t, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{t.title}</span>
                      </div>
                      {t.subtasks && t.subtasks.length > 0 && (
                        <div className="ml-5 space-y-0.5 border-l-2 border-border/80 pl-3">
                          {t.subtasks.map((s, sIdx) => (
                            <p key={sIdx} className="text-muted-foreground text-[11px]">
                              • {s}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {template.category === "projects" && template.projectData && (
                <div className="space-y-2.5 font-sans">
                  {template.projectData.pages.map((p, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{p.title}</span>
                      </div>
                      {p.subpages && p.subpages.length > 0 && (
                        <div className="ml-5 space-y-0.5 border-l-2 border-border/80 pl-3">
                          {p.subpages.map((sub, sIdx) => (
                            <p key={sIdx} className="text-muted-foreground text-[11px]">
                              📄 {sub.title}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {template.category === "mind-maps" && template.mindMapHierarchy && (
                <div className="space-y-2 font-sans">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                    <span>{template.mindMapHierarchy.title}</span>
                  </div>
                  <div className="ml-4 space-y-1.5 border-l-2 border-border/80 pl-3">
                    {template.mindMapHierarchy.children.map((branch, bIdx) => (
                      <div key={bIdx} className="space-y-0.5">
                        <p className="font-semibold text-foreground text-[11px]">
                          🔹 {branch.title}
                        </p>
                        {branch.children && (
                          <div className="ml-4 space-y-0.5 text-muted-foreground text-[10px]">
                            {branch.children.map((sub, sIdx) => (
                              <p key={sIdx}>• {sub.title}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
            className="rounded-xl"
          >
            Cancel
          </Button>
          <Button
            onClick={handleUseTemplate}
            disabled={isApplying || !title.trim()}
            className="rounded-xl gap-2"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create from Template
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
