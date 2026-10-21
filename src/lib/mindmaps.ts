import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { MapDoc } from "@/lib/mindmap-doc";

export type MindMapMeta = {
  id: string;
  title: string;
  is_locked: boolean;
  is_pinned?: boolean | undefined;
  node_count: number;
  version: number;
  created_at: string;
  updated_at: string;
};
export type MindMapFull = MindMapMeta & { data: MapDoc };

export const mapsKey = ["mind-maps"] as const;
export const useMindMaps = () => useQuery({ queryKey: mapsKey, queryFn: () => api<MindMapMeta[]>("/api/mind-maps") });
export const useMindMap = (id: string) =>
  useQuery({
    queryKey: ["mind-map", id], queryFn: () => api<MindMapFull>(`/api/mind-maps/${id}`),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
  });

const fail = (msg: string) => (e: unknown) => toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function useMindMapActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: mapsKey });
  return {
    create: useMutation({
      mutationFn: (b: { title: string; data?: MapDoc }) => api<MindMapMeta>("/api/mind-maps", { method: "POST", body: b }),
      onSuccess: refresh, onError: fail("Couldn't create mind map"),
    }),
    rename: useMutation({
      mutationFn: ({ id, title }: { id: string; title: string }) => api<MindMapMeta>(`/api/mind-maps/${id}`, { method: "PATCH", body: { title } }),
      onSuccess: refresh, onError: fail("Couldn't rename mind map"),
    }),
    setLocked: useMutation({
      mutationFn: ({ id, locked }: { id: string; locked: boolean }) =>
        api<MindMapMeta>(`/api/mind-maps/${id}`, { method: "PATCH", body: { is_locked: locked } }),
      onSuccess: (meta) => {
        refresh();
        qc.setQueryData(["mind-map", meta.id], (old: MindMapFull | undefined) =>
          old ? { ...old, is_locked: meta.is_locked, version: meta.version } : old,
        );
      },
      onError: fail("Couldn't update mind map lock"),
    }),
    setPinned: useMutation({
      mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
        api<MindMapMeta>(`/api/mind-maps/${id}`, { method: "PATCH", body: { is_pinned: pinned } }),
      onSuccess: (meta) => {
        refresh();
        qc.setQueryData(["mind-map", meta.id], (old: MindMapFull | undefined) =>
          old ? { ...old, is_pinned: meta.is_pinned } : old,
        );
        toast.success(meta.is_pinned ? "Mind map pinned" : "Mind map unpinned");
      },
      onError: fail("Couldn't update mind map pin"),
    }),
    duplicate: useMutation({
      mutationFn: async (id: string) => {
        const m = await api<MindMapFull>(`/api/mind-maps/${id}`);
        return api<MindMapMeta>("/api/mind-maps", { method: "POST", body: { title: `${m.title} (copy)`.slice(0, 200), data: m.data } });
      },
      onSuccess: () => { refresh(); toast.success("Mind map duplicated"); }, onError: fail("Couldn't duplicate mind map"),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/api/mind-maps/${id}`, { method: "DELETE" }),
      onSuccess: () => { refresh(); toast.success("Mind map deleted"); }, onError: fail("Couldn't delete mind map"),
    }),
  };
}
