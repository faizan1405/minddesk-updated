import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — MindDesk" },
      { name: "description", content: "Organize projects with pages and subpages." },
      { property: "og:title", content: "Projects — MindDesk" },
      { property: "og:description", content: "Organize projects with pages and subpages." },
    ],
  }),
  component: () => <Outlet />,
});
