import { LogOut, User } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useRoleContext } from "@/features/roles/role-context";
import { initialsOf } from "@/lib/format";

export function ProfileMenu() {
  const { viewer, activeRole } = useRoleContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    await navigate({ to: "/auth" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open profile menu">
          <Avatar className="size-8">
            <AvatarFallback>{initialsOf(viewer.fullName) || <User className="size-4" />}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block truncate font-medium">{viewer.fullName || "Your account"}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {activeRole ? `${activeRole.roleName} · ${activeRole.organizationName}` : "No active role"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/organization/billing" })}>
          Plan &amp; entitlements
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/account/security" })}>
          Password &amp; security
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/account/security-checklist" })}>
          Security checklist
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleSignOut()}>
          <LogOut aria-hidden="true" className="mr-2 size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
