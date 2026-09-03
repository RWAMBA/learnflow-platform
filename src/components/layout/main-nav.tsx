import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  MessagesSquare,
  Globe,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { useRoleContext } from "@/features/roles/role-context";
import { cn } from "@/lib/utils";

const linkClass =
  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground";
const activeClass = "bg-accent text-accent-foreground";

export function MainNav({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}) {
  const { activeRole, viewer } = useRoleContext();
  const roleCode = activeRole?.roleCode;

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, visible: true },
    {
      to: "/students",
      label: roleCode === "teacher" || roleCode === "tutor" ? "Roster" : "Students",
      icon: Users,
      visible: roleCode !== "student",
    },
    { to: "/curriculum", label: "Curriculum", icon: BookOpen, visible: true },
    { to: "/assignments", label: "Assignments", icon: ClipboardList, visible: true },
    { to: "/assessments", label: "Assessments", icon: ClipboardCheck, visible: true },
    { to: "/programmes", label: "Programmes", icon: Sparkles, visible: true },
    { to: "/messages", label: "Messages", icon: MessagesSquare, visible: true },
    { to: "/admin/tenants", label: "Platform", icon: Shield, visible: viewer.isPlatformAdmin },
    { to: "/admin/content", label: "Website", icon: Globe, visible: viewer.isPlatformAdmin },
  ] as const;

  return (
    <nav
      aria-label="Main"
      className={cn("flex gap-1", orientation === "vertical" ? "flex-col" : "flex-row flex-wrap")}
    >
      {items
        .filter((item) => item.visible)
        .map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={linkClass}
            activeProps={{ className: cn(linkClass, activeClass) }}
          >
            <item.icon aria-hidden="true" className="size-4" />
            {item.label}
          </Link>
        ))}
    </nav>
  );
}
