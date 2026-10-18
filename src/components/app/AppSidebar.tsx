import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { displayNameOf, initialsOf } from "@/hooks/use-auth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  CheckSquare, Star, List, NotebookPen, FolderKanban, CalendarDays, Clock, Network, Repeat,
  Settings, LogOut, ChevronRight, BarChart3, LayoutTemplate, Trash2,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useLists } from "@/lib/tasks";
import { Logo } from "./Logo";
import { CreateMenu } from "./CreateMenu";

const workspace = [
  { title: "Notes", url: "/notes", icon: NotebookPen },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Plan Your Day", url: "/plan", icon: Clock },
  { title: "Mind Maps", url: "/mind-maps", icon: Network },
  { title: "Habits & Routines", url: "/habits", icon: Repeat },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Templates", url: "/templates", icon: LayoutTemplate },
  { title: "Recycle Bin", url: "/trash", icon: Trash2 },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, signOut } = useAuth();
  const { data: lists } = useLists();
  const close = () => isMobile && setOpenMobile(false);
  const prefs = useSettings();
  const [tasksOpen, setTasksOpen] = useState(prefs.sidebar_tasks_open);
  const name = displayNameOf(user);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          <Logo className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="text-[15px] font-semibold tracking-tight">MindDesk</span>}
        </div>
        {!collapsed && <CreateMenu />}
      </SidebarHeader>

      <SidebarContent>
        <Collapsible open={tasksOpen || collapsed} onOpenChange={setTasksOpen} asChild>
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className="w-full justify-between rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              My Tasks
              <ChevronRight className={`transition-transform duration-200 ${tasksOpen ? "rotate-90" : ""}`} />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path === "/tasks"} tooltip="All Tasks">
                  <Link to="/tasks" onClick={close}><CheckSquare /><span>All Tasks</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={path === "/starred"} tooltip="Starred">
                  <Link to="/starred" onClick={close}><Star /><span>Starred</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Lists" className="pointer-events-none text-muted-foreground">
                  <List /><span>Lists</span>
                </SidebarMenuButton>
                {!collapsed && (
                  <SidebarMenuSub>
                    {lists?.length === 0 && (
                      <li className="px-2 py-1 text-xs text-muted-foreground">No lists yet</li>
                    )}
                    {lists?.map((l) => (
                      <SidebarMenuSubItem key={l.id}>
                        <SidebarMenuSubButton asChild isActive={path === `/lists/${l.id}`}>
                          <Link to="/lists/$listId" params={{ listId: l.id }} onClick={close}>
                            <span className="truncate">{l.title}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
        </Collapsible>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspace.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={path === item.url || path.startsWith(item.url + "/")} tooltip={item.title}>
                    <Link to={item.url} onClick={close}><item.icon /><span>{item.title}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={path === "/settings"} tooltip="Settings">
              <Link to="/settings" onClick={close}><Settings /><span>Settings</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={path === "/profile"} tooltip="Profile" size="lg">
              <Link to="/profile" onClick={close}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase">
                  {initialsOf(name)}
                </div>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{user?.email}</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={() => signOut()}>
              <LogOut /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
