import { api } from "@/lib/api-client";
import { type TemplateDefinition, getNormalizedMindMapDoc } from "./template-definitions";
import type { PageMeta } from "@/lib/pages";
import type { Task, TaskList } from "@/lib/tasks";
import type { MindMapMeta } from "@/lib/mindmaps";

export type ApplyTaskTemplateOptions = {
  listMode: "new" | "existing";
  listId?: string;
  newListName?: string;
};

export type ApplyResult =
  | { type: "notes"; id: string; url: string }
  | { type: "tasks"; id: string; url: string }
  | { type: "projects"; id: string; url: string }
  | { type: "mind-maps"; id: string; url: string };

/**
 * Creates a note page from template using POST /api/pages with initial structured content.
 */
export async function applyNoteTemplate(
  template: TemplateDefinition,
  customTitle?: string,
): Promise<ApplyResult> {
  const title = customTitle?.trim() || template.title;
  const page = await api<PageMeta>("/api/pages", {
    method: "POST",
    body: {
      title,
      content: template.noteContent,
    },
  });

  return {
    type: "notes",
    id: page.id,
    url: `/notes/${page.id}`,
  };
}

/**
 * Creates tasks and subtasks under a new or existing list.
 */
export async function applyTaskTemplate(
  template: TemplateDefinition,
  options: ApplyTaskTemplateOptions,
): Promise<ApplyResult> {
  if (!template.taskData) {
    throw new Error("Template does not contain task data");
  }

  let listId = options.listId;

  if (options.listMode === "new" || !listId) {
    const listTitle = options.newListName?.trim() || template.taskData.defaultListName;
    const newList = await api<TaskList>("/api/task-lists", {
      method: "POST",
      body: { title: listTitle },
    });
    listId = newList.id;
  }

  // Create tasks and subtasks sequentially to preserve order and parent-child links
  for (let i = 0; i < template.taskData.tasks.length; i++) {
    const item = template.taskData.tasks[i]!;
    const parentTask = await api<Task>("/api/tasks", {
      method: "POST",
      body: {
        list_id: listId,
        title: item.title,
        description: item.description ?? null,
        position: Date.now() + i * 10,
      },
    });

    if (item.subtasks && item.subtasks.length > 0) {
      for (let j = 0; j < item.subtasks.length; j++) {
        const subTitle = item.subtasks[j]!;
        await api<Task>("/api/tasks", {
          method: "POST",
          body: {
            list_id: listId,
            parent_id: parentTask.id,
            title: subTitle,
            position: Date.now() + i * 10 + j + 1,
          },
        });
      }
    }
  }

  return {
    type: "tasks",
    id: listId,
    url: `/lists/${listId}`,
  };
}

/**
 * Creates a project with structured pages and subpages.
 */
export async function applyProjectTemplate(
  template: TemplateDefinition,
  customTitle?: string,
): Promise<ApplyResult> {
  if (!template.projectData) {
    throw new Error("Template does not contain project data");
  }

  const projectTitle = customTitle?.trim() || template.projectData.defaultProjectTitle;
  const project = await api<{ id: string; title: string }>("/api/projects", {
    method: "POST",
    body: { title: projectTitle },
  });

  // Create project pages and nested subpages
  for (const pageItem of template.projectData.pages) {
    const parentPage = await api<PageMeta>("/api/pages", {
      method: "POST",
      body: {
        project_id: project.id,
        title: pageItem.title,
        content: pageItem.content,
      },
    });

    if (pageItem.subpages && pageItem.subpages.length > 0) {
      for (const subpageItem of pageItem.subpages) {
        await api<PageMeta>("/api/pages", {
          method: "POST",
          body: {
            project_id: project.id,
            parent_id: parentPage.id,
            title: subpageItem.title,
            content: subpageItem.content,
          },
        });
      }
    }
  }

  return {
    type: "projects",
    id: project.id,
    url: `/projects/${project.id}`,
  };
}

/**
 * Creates a Mind Map with normalized layout and hierarchy.
 */
export async function applyMindMapTemplate(
  template: TemplateDefinition,
  customTitle?: string,
): Promise<ApplyResult> {
  const doc = getNormalizedMindMapDoc(template);
  const title = customTitle?.trim() || template.title;

  const map = await api<MindMapMeta>("/api/mind-maps", {
    method: "POST",
    body: {
      title,
      data: doc,
    },
  });

  return {
    type: "mind-maps",
    id: map.id,
    url: `/mind-maps/${map.id}`,
  };
}
