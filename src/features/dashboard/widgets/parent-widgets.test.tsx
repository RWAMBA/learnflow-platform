import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => vi.fn() }));

const listMock = vi.fn();
vi.mock("@/features/students/api", () => ({
  studentKeys: { forViewer: (id: string) => ["students", "linked", id] },
  listLinkedStudentsForParent: (...args: unknown[]) => listMock(...args),
}));
vi.mock("@/features/relationships/api", () => ({
  relationshipKeys: { pendingForUser: (id: string) => ["pending", id] },
  listPendingInvitationsForUser: async () => [],
}));
vi.mock("@/lib/relationships.functions", () => ({ respondToInvitation: vi.fn() }));

const { ChildrenWidget } = await import("./parent-widgets");

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChildrenWidget userId="u1" />
    </QueryClientProvider>,
  );
}

const visible = {
  id: "r1",
  permission_level: "full",
  status: "active",
  student: { id: "s1", first_name: "Ada", last_name: "Lovelace", organization_id: "o1", grade: { name: "Grade 4" } },
};
const hidden = { id: "r2", permission_level: "view", status: "active", student: null };

describe("ChildrenWidget relationship states", () => {
  it("renders empty state with no relationships", async () => {
    listMock.mockResolvedValueOnce([]);
    renderWidget();
    expect(await screen.findByText("No students linked yet")).toBeInTheDocument();
  });

  it("renders visible students", async () => {
    listMock.mockResolvedValueOnce([visible]);
    renderWidget();
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
  });

  it("skips RLS-hidden students without crashing", async () => {
    listMock.mockResolvedValueOnce([visible, hidden]);
    renderWidget();
    expect(await screen.findByText(/Ada/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows empty state when every student row is hidden", async () => {
    listMock.mockResolvedValueOnce([hidden, { ...hidden, id: "r3", student: undefined }]);
    renderWidget();
    expect(await screen.findByText("No students linked yet")).toBeInTheDocument();
  });
});
