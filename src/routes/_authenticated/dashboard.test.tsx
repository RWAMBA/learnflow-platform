import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Integration coverage for the parent dashboard route: the whole route
 * component tree (children widget, invitations, per-student due lists) must
 * render for every mix of visible and RLS-hidden student records.
 */

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
  Navigate: ({ to }: { to: string }) => <div>navigate:{to}</div>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));
vi.mock("@/lib/relationships.functions", () => ({ respondToInvitation: vi.fn() }));

const listLinked = vi.fn();
const listAssignments = vi.fn();

vi.mock("@/features/students/api", () => ({
  studentKeys: {
    forViewer: (id: string) => ["students", "linked", id],
    list: (id: string) => ["students", id],
  },
  listLinkedStudentsForParent: (...a: unknown[]) => listLinked(...a),
  listRosterForEducator: async () => [],
  listStudents: async () => [],
}));
vi.mock("@/features/relationships/api", () => ({
  relationshipKeys: {
    pendingForUser: (id: string) => ["pending", id],
    orgMembers: (id: string) => ["org-members", id],
  },
  listPendingInvitationsForUser: async () => [],
  listOrganizationMembers: async () => [],
}));
vi.mock("@/features/assignments/api", () => ({
  assignmentKeys: { forStudent: (id: string) => ["assignments", id], progress: (id: string) => ["progress", id] },
  listAssignmentsForStudents: (...a: unknown[]) => listAssignments(...a),
  listProgressForStudent: async () => [],
}));
vi.mock("@/features/messaging/api", () => ({
  messagingKeys: { conversations: (id: string) => ["conversations", id] },
  listConversations: async () => [],
}));
vi.mock("@/features/dashboard/use-viewer-students", () => ({ useCurrentStudent: () => ({ data: null, isPending: false }) }));
vi.mock("@/features/roles/role-context", () => ({
  useRoleContext: () => ({
    viewer: { userId: "u1", fullName: "Grace Parent", isPlatformAdmin: false, roles: [] },
    activeRole: {
      userRoleId: "ur1",
      roleCode: "parent_guardian",
      roleName: "Parent/Guardian",
      organizationId: "o1",
      organizationName: "Home Academy",
      tenantType: "family",
    },
    setActiveRoleId: vi.fn(),
    hasMultipleRoles: false,
  }),
}));

const { Route } = await import("./dashboard");
const DashboardPage = (Route as unknown as { options: { component: () => React.ReactElement } }).options.component;

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

const visible = (id: string, first: string) => ({
  id: `rel-${id}`,
  permission_level: "full",
  status: "active",
  student: { id, first_name: first, last_name: "Doe", organization_id: "o1", grade: { name: "Grade 4" } },
});
const hiddenNull = { id: "rel-null", permission_level: "view", status: "active", student: null };
const hiddenUndefined = { id: "rel-undef", permission_level: "view", status: "active", student: undefined };

beforeEach(() => {
  vi.clearAllMocks();
  listAssignments.mockResolvedValue([]);
});

describe("parent dashboard route", () => {
  it("renders the shell for a parent with no linked students", async () => {
    listLinked.mockResolvedValue([]);
    renderDashboard();
    expect(await screen.findByText("No students linked yet")).toBeInTheDocument();
    expect(screen.getByText(/Parent\/Guardian · Home Academy/)).toBeInTheDocument();
    expect(listAssignments).not.toHaveBeenCalled();
  });

  it("renders all visible students and one due list per student", async () => {
    listLinked.mockResolvedValue([visible("s1", "Ada"), visible("s2", "Ben")]);
    renderDashboard();
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Ben/)).toBeInTheDocument();
    await waitFor(() => expect(listAssignments).toHaveBeenCalledWith(["s1"]));
    expect(listAssignments).toHaveBeenCalledWith(["s2"]);
  });

  it("renders mixed visible and RLS-hidden relationships without crashing", async () => {
    listLinked.mockResolvedValue([visible("s1", "Ada"), hiddenNull, hiddenUndefined, visible("s2", "Ben")]);
    renderDashboard();
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    expect(screen.getByText(/Ben/)).toBeInTheDocument();
    await waitFor(() => expect(listAssignments).toHaveBeenCalledTimes(2));
    expect(listAssignments.mock.calls.flat(2)).toEqual(["s1", "s2"]);
  });

  it("falls back to the empty state when every student is hidden by RLS", async () => {
    listLinked.mockResolvedValue([hiddenNull, hiddenUndefined]);
    renderDashboard();
    expect(await screen.findByText("No students linked yet")).toBeInTheDocument();
    expect(listAssignments).not.toHaveBeenCalled();
  });

  it("still renders the dashboard when the relationships query fails", async () => {
    listLinked.mockRejectedValue(new Error("permission denied"));
    renderDashboard();
    expect(await screen.findByText("Messages")).toBeInTheDocument();
    expect(screen.getByText(/Welcome back, Grace/)).toBeInTheDocument();
  });
});
