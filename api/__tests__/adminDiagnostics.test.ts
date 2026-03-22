import { afterEach, describe, expect, it } from "vitest";
import { buildAdminEnvDiagnostics } from "../_lib/adminDiagnostics";

const ORIGINAL_ENV = { ...process.env };

const restoreEnv = () => {
  const currentKeys = Object.keys(process.env);
  currentKeys.forEach((key) => {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  });
  Object.entries(ORIGINAL_ENV).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  });
};

describe("admin env diagnostics", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("never returns secret values in diagnostics payload", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "super-secret-service-role";
    process.env.CLAUDE_API_KEY = "claude-secret-value";
    process.env.GEMINI_API_KEY = "gemini-secret-value";

    const diagnostics = buildAdminEnvDiagnostics();
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).not.toContain("super-secret-service-role");
    expect(serialized).not.toContain("claude-secret-value");
    expect(serialized).not.toContain("gemini-secret-value");
  });

  it("adds warnings when required combinations are missing", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;

    const diagnostics = buildAdminEnvDiagnostics();

    expect(
      diagnostics.warnings.some((warning) =>
        warning.includes("VITE_SUPABASE_URL") || warning.includes("VITE_SUPABASE_ANON_KEY")
      )
    ).toBe(true);
  });
});
