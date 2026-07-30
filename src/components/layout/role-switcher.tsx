import { ChevronsUpDown } from "lucide-react";
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

/**
 * Shown only when the user holds more than one active role. Switching changes
 * what the UI displays; data access is always decided by the database.
 */
export function RoleSwitcher() {
  const { activeRole, hasMultipleRoles, viewer, setActiveRoleId } = useRoleContext();

  if (!hasMultipleRoles || !activeRole) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[15rem] justify-between gap-2">
          <span className="truncate">{activeRole.roleName}</span>
          <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Switch role context</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {viewer.roles.map((role) => (
          <DropdownMenuItem
            key={role.userRoleId}
            onSelect={() => setActiveRoleId(role.userRoleId)}
            aria-current={role.userRoleId === activeRole.userRoleId ? "true" : undefined}
          >
            <span className="flex flex-col">
              <span className="font-medium">{role.roleName}</span>
              <span className="text-xs text-muted-foreground">{role.organizationName}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
