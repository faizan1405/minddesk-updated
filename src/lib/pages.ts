import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { PageContent } from "@/lib/page-content";

export type Project = { id: string; title: string; position: number; created_at: string; updated_at: string };
export type PageMeta = {
  id: string; project_id: string | null; parent_id: string | null; title: string; position: number;
  version: number; created_at: string; updated_at: string;
};
export type PageFull = PageMeta & { content: PageContent };

export const projectsKey = ["projects"] as const;
export const pagesKey = ["pages"] as const;
export const pageKey = (id: string) => ["page", id] as const;

export const useProjects = () =>
  useQuery({ queryKey: projectsKey, queryFn: () => api<Project[]>("/api/projects") });
export const usePages = () =>
  useQuery({ queryKey: pagesKey, queryFn: () => api<PageMeta[]>("/api/pages") });
export const usePage = (id: string) =>
  useQuery({
    queryKey: pageKey(id),
    queryFn: () => api<PageFull>(`/api/pages/${id}`),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

export const pageTitle = (p: { title: string }) => p.title.trim() || "Untitled";

const fail = (msg: string) => (e: unknown) =>
  toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function usePageActions() {
  const qc = useQueryClient();
  const refreshPages = () => qc.invalidateQueries({ queryKey: pagesKey });
  const refreshProjects = () => qc.invalidateQueries({ queryKey: projectsKey });

  const createPage = useMutation({
    mutationFn: (input: { parent_id?: string | null; project_id?: string | null; title?: string; content?: PageContent }) =>
      api<PageMeta>("/api/pages", { method: "POST", body: input }),
    onSuccess: (page) => {
      qc.setQueryData<PageMeta[]>(pagesKey, (old) => (old ? [...old, page] : old));
      refreshPages();
    },
    onError: fail("Couldn't create page"),
  });

  const renamePage = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<PageMeta>(`/api/pages/${id}`, { method: "PATCH", body: { title } }),
    onSuccess: (page) => {
      setPageTitleInCache(qc, page.id, page.title);
    },
    onError: fail("Couldn't rename page"),
  });

  const deletePage = useMutation({
    mutationFn: (id: string) => api(`/api/pages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshPages();
      toast.success("Page deleted");
    },
    onError: fail("Couldn't delete page"),
  });

  const createProject = useMutation({
    mutationFn: (title: string) => api<Project>("/api/projects", { method: "POST", body: { title } }),
    onSuccess: () => {
      refreshProjects();
      toast.success("Project created");
    },
    onError: fail("Couldn't create project"),
  });

  const renameProject = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<Project>(`/api/projects/${id}`, { method: "PATCH", body: { title } }),
    onSuccess: refreshProjects,
    onError: fail("Couldn't rename project"),
  });

  const deleteProject = useMutation({
    mutationFn: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshProjects();
      refreshPages();
      toast.success("Project deleted");
    },
    onError: fail("Couldn't delete project"),
  });

  return { createPage, renamePage, deletePage, createProject, renameProject, deleteProject };
}

export function setPageTitleInCache(qc: ReturnType<typeof useQueryClient>, id: string, title: string) {
  qc.setQueryData<PageMeta[]>(pagesKey, (old) => old?.map((p) => (p.id === id ? { ...p, title } : p)));
}

/** All descendant ids of a page (for "delete" warnings). */
export function descendantCount(pages: PageMeta[], id: string): number {
  const kids = pages.filter((p) => p.parent_id === id);
  return kids.reduce((n, k) => n + 1 + descendantCount(pages, k.id), 0);
}

export function ancestors(pages: PageMeta[], id: string): PageMeta[] {
  const out: PageMeta[] = [];
  let cur = pages.find((p) => p.id === id);
  const seen = new Set<string>();
  while (cur?.parent_id && !seen.has(cur.parent_id)) {
    seen.add(cur.parent_id);
    const parent = pages.find((p) => p.id === cur!.parent_id);
    if (!parent) break;
    out.unshift(parent);
    cur = parent;
  }
  return out;
}
