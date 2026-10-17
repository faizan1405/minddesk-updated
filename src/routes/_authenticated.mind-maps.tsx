import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/mind-maps")({
  head: () => ({
    meta: [
      { title: "Mind Maps — MindDesk" },
      { name: "description", content: "Brainstorm visually: create, move, connect and organize ideas on a free canvas." },
      { property: "og:title", content: "Mind Maps — MindDesk" },
      { property: "og:description", content: "Brainstorm visually: create, move, connect and organize ideas on a free canvas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <Outlet />,
});
