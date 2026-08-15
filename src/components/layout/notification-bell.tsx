import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listNotifications, notificationKeys } from "@/features/notifications/api";
import { useRoleContext } from "@/features/roles/role-context";

export function NotificationBell() {
  const { viewer } = useRoleContext();
  const userRoleIds = viewer.roles.map((role) => role.userRoleId);

  const { data } = useQuery({
    queryKey: notificationKeys.list(userRoleIds),
    queryFn: () => listNotifications(userRoleIds),
    enabled: userRoleIds.length > 0,
    refetchInterval: 60_000,
  });

  const unread = (data ?? []).filter((notification) => !notification.read_at).length;

  return (
    <Button asChild variant="ghost" size="icon" className="relative">
      <Link
        to="/notifications"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
      >
        <Bell aria-hidden="true" className="size-5" />
        {unread > 0 ? (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-xs"
          >
            {unread > 9 ? "9+" : unread}
          </Badge>
        ) : null}
      </Link>
    </Button>
  );
}
