import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — MindDesk" },
      { name: "description", content: "Your MindDesk profile and account." },
      { property: "og:title", content: "Profile — MindDesk" },
      { property: "og:description", content: "Your MindDesk profile and account." },
    ],
  }),
  // Profile lives in Settings → Profile & Account.
  component: () => <Navigate to="/settings" search={{ section: "profile" }} replace />,
});
