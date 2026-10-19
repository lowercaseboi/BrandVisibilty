import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { common } from "../i18n/en/common";

// The cold-start notice lives in module state (has the server answered yet? was the notice shown?),
// so each test imports a fresh copy of the client. The toast spy is hoisted so every copy shares it.
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("../components/Toaster", () => ({ toast }));

const WAKE_NOTICE_MS = 4000;
const pending = () => new Promise<Response>(() => {});
const ok = () => Promise.resolve(new Response("[]", { status: 200 }));

async function freshClient() {
  vi.resetModules();
  return import("./client");
}

beforeEach(() => {
  vi.useFakeTimers();
  toast.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("cold-start notice", () => {
  it("shows once when the first request is slow", async () => {
    vi.stubGlobal("fetch", vi.fn(pending));
    const { listBrands } = await freshClient();

    void listBrands();
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS - 1);
    expect(toast).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    // No document under node, so the notice falls back to English.
    expect(toast).toHaveBeenCalledExactlyOnceWith(common.serverWaking);

    void listBrands();
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS * 2);
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("stays quiet once the server has answered", async () => {
    const fetch = vi.fn(ok);
    vi.stubGlobal("fetch", fetch);
    const { listBrands } = await freshClient();

    await listBrands();
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS);
    expect(toast).not.toHaveBeenCalled();

    // A later slow request (a long run poll, a flaky network) isn't a cold start.
    fetch.mockImplementation(pending);
    void listBrands();
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS * 2);
    expect(toast).not.toHaveBeenCalled();
  });

  it("is cancelled when a slow first request answers in time", async () => {
    let answer: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const { listBrands } = await freshClient();

    const done = listBrands();
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS - 500);
    answer(new Response("[]", { status: 200 }));
    await done;
    await vi.advanceTimersByTimeAsync(WAKE_NOTICE_MS);
    expect(toast).not.toHaveBeenCalled();
  });
});
