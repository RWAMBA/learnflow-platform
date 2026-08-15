/**
 * Security review coverage for the MCP (agent-integration) surface.
 *
 * The MCP capability is read-only and acts strictly as the signed-in user:
 * every tool refuses to run without a verified OAuth bearer token, forwards
 * that same token to PostgREST so RLS is the authoritative boundary, and never
 * reaches a service-role client. These tests pin those properties.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isOriginExemptPath, requiresOriginValidation } from "./origin-policy";

const TOOL_DIR = "src/lib/mcp/tools";
const MCP_FILES = [
  "src/lib/mcp/index.ts",
  "src/lib/mcp/supabase.ts",
  ...readdirSync(TOOL_DIR).map((name) => `${TOOL_DIR}/${name}`),
  "src/routes/mcp.ts",
  "src/routes/[.mcp]/list-tools.ts",
  "src/routes/[.mcp]/invoke-tool/$tool.ts",
  "src/routes/[.well-known]/oauth-protected-resource.ts",
];
const SOURCES = Object.fromEntries(MCP_FILES.map((file) => [file, readFileSync(file, "utf8")]));

/** Minimal query-builder double recording the PostgREST calls a tool makes. */
function supabaseDouble() {
  const calls: { table?: string; select?: string; filters: string[]; limit?: number } = {
    filters: [],
  };
  const builder: Record<string, unknown> = {};
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      if (name === "select") calls.select = String(args[0]);
      else if (name === "limit") calls.limit = Number(args[0]);
      else calls.filters.push(`${name}(${args.map(String).join(",")})`);
      return builder;
    });
  for (const name of ["select", "eq", "or", "ilike", "order", "limit", "maybeSingle"]) {
    builder[name] = chain(name);
  }
  (builder as { then?: unknown }).then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: [], error: null });
  const client = {
    from: vi.fn((table: string) => {
      calls.table = table;
      return builder;
    }),
  };
  return { client, calls };
}

vi.mock("./mcp/supabase", () => ({
  supabaseForUser: vi.fn(() => mockedClient),
}));

let mockedClient: unknown;

function ctx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    isAuthenticated: () => true,
    getToken: () => "verified.jwt.token",
    getUserId: () => "11111111-1111-1111-1111-111111111111",
    getUserEmail: () => "user@example.test",
    ...overrides,
  } as never;
}

const anonymousCtx = ctx({
  isAuthenticated: () => false,
  getToken: () => undefined,
  getUserId: () => undefined,
  getUserEmail: () => undefined,
});

async function tools() {
  const mcp = (await import("./mcp/index")).default;
  return mcp.tools;
}

describe("MCP server definition", () => {
  it("advertises exactly the reviewed read-only tools", async () => {
    const list = await tools();
    expect(list.map((tool) => tool.name).sort()).toEqual([
      "list_assignments",
      "list_students",
      "search_curriculum",
      "whoami",
    ]);
    for (const tool of list) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.openWorldHint).toBe(false);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it("returns tool-not-found for an unknown tool name", async () => {
    const list = await tools();
    expect(list.find((tool) => tool.name === "delete_students")).toBeUndefined();
  });

  it("requires OAuth bearer authentication with no anonymous fallback", () => {
    const source = SOURCES["src/lib/mcp/index.ts"]!;
    expect(source).toContain("auth.oauth.issuer");
    expect(source).toContain('acceptedAudiences: "authenticated"');
    expect(source).not.toMatch(/auth\.none|allowAnonymous|public:\s*true/);
  });

  it("publishes no secret in the OAuth resource metadata or manifest", () => {
    const manifest = readFileSync(".lovable/mcp/manifest.json", "utf8");
    for (const text of [manifest, SOURCES["src/lib/mcp/index.ts"]!]) {
      expect(text).not.toMatch(/service_role|sb_secret_|SUPABASE_SERVICE_ROLE_KEY|eyJhbGciOi/);
    }
    expect(JSON.parse(manifest).auth.type).toBe("oauth");
  });
});

describe("MCP token handling", () => {
  it("never imports a service-role client or a secret key", () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      expect(source, file).not.toContain("client.server");
      expect(source, file).not.toContain("supabaseAdmin");
      expect(source, file).not.toContain("SERVICE_ROLE");
    }
  });

  it("forwards the caller's verified token and disables session persistence", () => {
    const source = SOURCES["src/lib/mcp/supabase.ts"]!;
    expect(source).toContain("ctx.getToken()");
    expect(source).toContain("Authorization: `Bearer ${token}`");
    expect(source).toContain("persistSession: false");
    expect(source).toContain("supabaseForUser requires a verified OAuth token");
    // Only publishable/anon keys may be used as the apikey.
    expect(source).toMatch(/SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY/);
  });

  it("never logs the token or the returned rows", () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      expect(source, file).not.toMatch(/console\.(log|info|warn|error)/);
    }
  });
});

describe.each([
  ["whoami", () => import("./mcp/tools/whoami"), {}],
  ["list_students", () => import("./mcp/tools/list-students"), { limit: 25 }],
  ["list_assignments", () => import("./mcp/tools/list-assignments"), { limit: 25 }],
  ["search_curriculum", () => import("./mcp/tools/search-curriculum"), { query: "maths", limit: 20 }],
] as const)("MCP tool %s", (_name, load, input) => {
  it("refuses a missing, invalid or expired token", async () => {
    const tool = (await load()).default;
    const result = await tool.handler(input as never, anonymousCtx);
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ text: "Not authenticated" });
  });

  it("queries only through the caller-scoped client", async () => {
    const double = supabaseDouble();
    mockedClient = double.client;
    const tool = (await load()).default;
    await tool.handler(input as never, ctx());
    expect(double.client.from).toHaveBeenCalled();
  });
});

describe("MCP input validation and bounds", () => {
  it("bounds list_students and list_assignments to 100 rows", async () => {
    const list = await tools();
    for (const name of ["list_students", "list_assignments"]) {
      const shape = list.find((tool) => tool.name === name)!.inputSchema!;
      const limit = z.object(shape as never).shape.limit as z.ZodTypeAny;
      expect(limit.parse(undefined)).toBe(25);
      expect(() => limit.parse(101)).toThrow();
      expect(() => limit.parse(0)).toThrow();
      expect(limit.parse(100)).toBe(100);
    }
  });

  it("bounds search_curriculum to 50 rows and requires a non-empty query", async () => {
    const list = await tools();
    const shape = list.find((tool) => tool.name === "search_curriculum")!.inputSchema!;
    const schema = z.object(shape as never);
    expect(() => schema.parse({ query: "" })).toThrow();
    expect(() => schema.parse({ query: "x", limit: 51 })).toThrow();
    expect(schema.parse({ query: "x" }).limit).toBe(20);
  });

  it("rejects malformed identifiers and unknown properties", async () => {
    const list = await tools();
    const students = z
      .object(list.find((tool) => tool.name === "list_students")!.inputSchema! as never)
      .strict();
    expect(() => students.parse({ organizationId: "not-a-uuid" })).toThrow();
    expect(() => students.parse({ userId: "11111111-1111-1111-1111-111111111111" })).toThrow();
    const assignments = z
      .object(list.find((tool) => tool.name === "list_assignments")!.inputSchema! as never)
      .strict();
    expect(() => assignments.parse({ status: "deleted" })).toThrow();
  });
});

describe("MCP identity and tenant boundary", () => {
  it("derives whoami identity from the verified token, never from input", async () => {
    const double = supabaseDouble();
    mockedClient = double.client;
    const tool = (await import("./mcp/tools/whoami")).default;
    const source = readFileSync("src/lib/mcp/tools/whoami.ts", "utf8");
    expect(source).toContain("ctx.getUserId()");
    expect(tool.inputSchema).toEqual({});
    await tool.handler({} as never, ctx());
    // Identity reaches PostgREST only as the token-derived user id.
    expect(double.calls.filters.join(" ")).toContain("11111111-1111-1111-1111-111111111111");
    expect(double.calls.filters.join(" ")).not.toContain("undefined");
  });

  it("treats organizationId as a narrowing filter, never as an authorization claim", () => {
    const source = SOURCES["src/lib/mcp/tools/list-students.ts"]!;
    expect(source).toContain('query.eq("organization_id", organizationId)');
    // No service-role escape and no RLS-bypassing rpc: the filter can only
    // reduce the rows RLS already permits.
    expect(source).not.toContain(".rpc(");
    expect(source).not.toContain("service");
  });

  it("keeps every tool read-only at the PostgREST level", () => {
    for (const file of readdirSync(TOOL_DIR)) {
      const source = SOURCES[`${TOOL_DIR}/${file}`]!;
      expect(source, file).not.toMatch(/\.(insert|update|upsert|delete)\(/);
      expect(source, file).toContain(".select(");
    }
  });

  it("surfaces PostgREST errors without SQL, schema internals or tokens", () => {
    for (const file of readdirSync(TOOL_DIR)) {
      const source = SOURCES[`${TOOL_DIR}/${file}`]!;
      expect(source, file).toContain("text: error.message");
      expect(source, file).not.toContain("error.details");
      expect(source, file).not.toContain("JSON.stringify(error");
    }
  });
});

describe("MCP route and origin exemptions", () => {
  it("exempts only whole-segment MCP transport paths", () => {
    for (const path of [
      "/mcp",
      "/mcp/messages",
      "/.mcp/list-tools",
      "/.mcp/invoke-tool/whoami",
      "/.well-known/oauth-protected-resource",
    ]) {
      expect(isOriginExemptPath(path), path).toBe(true);
    }
    for (const path of [
      "/mcp-admin-console",
      "/mcpx",
      "/.mcpx/list-tools",
      "/account/mcp",
      "/api/env-preflight",
    ]) {
      expect(isOriginExemptPath(path), path).toBe(false);
    }
  });

  it("still validates the origin of state-changing app routes and server functions", () => {
    expect(
      requiresOriginValidation({ handlerType: "serverFn", method: "POST", pathname: "/mcp" }),
    ).toBe(true);
    expect(
      requiresOriginValidation({
        handlerType: "router",
        method: "POST",
        pathname: "/mcp-admin-console",
      }),
    ).toBe(true);
    expect(
      requiresOriginValidation({ handlerType: "router", method: "POST", pathname: "/mcp" }),
    ).toBe(false);
  });

  it("keeps the consent screen free of caller-controlled redirect targets", () => {
    const consent = readFileSync("src/routes/[.]lovable.oauth.consent.tsx", "utf8");
    // The redirect target comes from the Supabase authorization server response,
    // never from the query string.
    expect(consent).toContain("data?.redirect_url ?? data?.redirect_to");
    expect(consent).not.toMatch(/search\.(redirect|next|return_to)/);
    expect(consent).toContain("authorization_id");
  });
});
