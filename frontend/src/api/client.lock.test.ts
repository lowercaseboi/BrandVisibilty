import { afterEach, describe, expect, it, vi } from "vitest";
import { common } from "../i18n/en/common";

vi.mock("../components/Toaster", () => ({ toast: vi.fn() }));

const unauthorized = () =>
  new Response(JSON.stringify({ detail: "Missing or wrong X-Admin-Token" }), { status: 401 });
const accepted = () => new Response(JSON.stringify({ job_id: "j1" }), { status: 202 });

async function freshClient() {
  vi.resetModules();
  return import("./client");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo lock", () => {
  it("asks for the admin password on a 401 and retries with it", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(accepted());
    vi.stubGlobal("fetch", fetchMock);
    const client = await freshClient();
    const ask = vi.fn().mockResolvedValue("s3cret");
    client.setAdminLockHandler({ token: () => null, ask });

    await expect(client.startRun("b", { providers: "groq", samples: 1 })).resolves.toEqual({ job_id: "j1" });
    expect(ask).toHaveBeenCalledExactlyOnceWith(false);
    const retryHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(retryHeaders[client.ADMIN_HEADER]).toBe("s3cret");
  });

  it("sends a stored token up front and reports a refused one as rejected", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(accepted());
    vi.stubGlobal("fetch", fetchMock);
    const client = await freshClient();
    const ask = vi.fn().mockResolvedValue("right");
    client.setAdminLockHandler({ token: () => "stale", ask });

    await client.deleteBrand("b");
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>)[client.ADMIN_HEADER]).toBe("stale");
    expect(ask).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("explains instead of failing silently when the user cancels", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorized()));
    const client = await freshClient();
    client.setAdminLockHandler({ token: () => null, ask: async () => null });

    await expect(client.cancelJob("j1")).rejects.toMatchObject({ status: 401, message: common["lock.cancelled"] });
  });
});
