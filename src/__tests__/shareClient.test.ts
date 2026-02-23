import { afterEach, describe, expect, it, vi } from "vitest";
import { createShortShareLink, resolveShortShareCode, ShareClientError } from "../shareClient";

describe("shareClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("surfaces SHARE_SNAPSHOT_TOO_LARGE from shorten API", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "SHARE_SNAPSHOT_TOO_LARGE",
            message: "Too large"
          }
        }),
        {
          status: 413,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createShortShareLink("x")).rejects.toMatchObject({
      code: "SHARE_SNAPSHOT_TOO_LARGE",
      status: 413
    });
  });

  it("resolves short share codes", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          token: "s2.abc",
          expiresAt: "2026-03-25T00:00:00.000Z"
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json"
          }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveShortShareCode("abc12345");
    expect(result.token).toBe("s2.abc");
    expect(result.expiresAt).toBe("2026-03-25T00:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledWith("/api/share/resolve?code=abc12345", { method: "GET" });
  });
});
