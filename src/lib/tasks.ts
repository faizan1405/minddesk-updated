import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

export type TaskList = {
  id: string; user_id: string; title: string; position: number; created_at: string; updated_at: string;
};
export type Task = {
  id: string; user_id: string; list_id: string; parent_id: string | null; title: string;
  description: string | null; completed: boolean; completed_at: string | null; starred: boolean;
  due_date: string | null; recurrence_rule: string | null; position: number; created_at: string; updated_at: string;
};
export type TaskPatch = Partial<Pick<Task, "title" | "description" | "completed" | "starred" | "due_date" | "list_id" | "position">>;

export const listsKey = ["task_lists"] as const;
export const tasksKey = ["tasks"] as const;

export function useLists() {
  return useQuery({
    queryKey: listsKey,
    queryFn: () => api<TaskList[]>("/api/task-lists"),
  });
}

export function useTasks() {
  return useQuery({
    queryKey: tasksKey,
    queryFn: () => api<Task[]>("/api/tasks"),
  });
}

const fail = (msg: string) => (e: unknown) =>
  toast.error(msg, { description: e instanceof Error ? e.message : undefined });

export function useTaskActions() {
  const qc = useQueryClient();
  const refreshLists = () => qc.invalidateQueries({ queryKey: listsKey });
  const refreshTasks = () => qc.invalidateQueries({ queryKey: tasksKey });

  const createList = useMutation({
    mutationFn: (title: string) => api<TaskList>("/api/task-lists", { method: "POST", body: { title } }),
    onSuccess: () => {
      refreshLists();
      toast.success("List created");
    },
    onError: fail("Couldn't create list"),
  });

  const renameList = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<TaskList>(`/api/task-lists/${id}`, { method: "PATCH", body: { title } }),
    onSuccess: refreshLists,
    onError: fail("Couldn't rename list"),
  });

  const deleteList = useMutation({
    mutationFn: (id: string) => api(`/api/task-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshLists();
      refreshTasks();
      toast.success("List deleted");
    },
    onError: fail("Couldn't delete list"),
  });

  const createTask = useMutation({
    mutationFn: async (input: {
      list_id: string;
      title: string;
      parent_id?: string | null;
      due_date?: string | null;
      description?: string | null;
    }) => api<Task>("/api/tasks", { method: "POST", body: input }),
    onSuccess: refreshTasks,
    onError: fail("Couldn't add task"),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TaskPatch }) =>
      api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: patch }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: tasksKey });
      const prev = qc.getQueryData<Task[]>(tasksKey);
      qc.setQueryData<Task[]>(tasksKey, (old) =>
        old?.map((t) =>
          t.id === id
            ? ({ ...t, ...patch, ...(patch.completed !== undefined ? { completed_at: patch.completed ? new Date().toISOString() : null } : {}) } as Task)
            : patch.list_id && t.parent_id === id
              ? { ...t, list_id: patch.list_id }
              : t,
        ),
      );
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(tasksKey, ctx.prev);
      fail("Couldn't save change")(e);
    },
    onSettled: refreshTasks,
  });

  const deleteTask = useMutation({
    mutationFn: (id: string) => api(`/api/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshTasks();
      toast.success("Task deleted");
    },
    onError: fail("Couldn't delete task"),
  });

  const toggleComplete = (t: Task) =>
    updateTask.mutate({
      id: t.id,
      patch: { completed: !t.completed },
    });

  const toggleStar = (t: Task) => updateTask.mutate({ id: t.id, patch: { starred: !t.starred } });

  return { createList, renameList, deleteList, createTask, updateTask, deleteTask, toggleComplete, toggleStar };
}
