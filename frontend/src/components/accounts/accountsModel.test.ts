import { describe, expect, it } from "vitest";
import type { AccountStatus } from "../../api/types";
import {
  accountErrorCopy,
  accountView,
  choiceKindKey,
  collectFields,
  connectReasonKey,
  countConnected,
  expiryLevel,
  fieldMeta,
  parseConnectReturn,
  setupDocUrl,
  statusFor,
  stripConnectParams,
} from "./accountsModel";

const acc = (over: Partial<AccountStatus>): AccountStatus => ({ ...statusFor(null, "facebook_page"), ...over });
const NOW = Date.parse("2026-09-30T12:00:00Z");

describe("accountView", () => {
  it("not connected: Connect when OAuth is available, plus manual entry", () => {
    const v = accountView(acc({ state: "not_connected", oauth_available: true, manual_fields: ["page_id", "page_token"] }), NOW);
    expect(v.pill).toBe("brandinfo.accounts.pill.not_connected");
    expect(v.primary).toBe("connect");
    expect(v.manual).toBe("enter");
    expect(v.test || v.disconnect).toBe(false);
  });

  it("not connected without OAuth keys: manual only", () => {
    const v = accountView(acc({ state: "not_connected", manual_fields: ["page_id"] }), NOW);
    expect(v.primary).toBeNull();
    expect(v.manual).toBe("enter");
  });

  it("connected as a named account: test, reconnect, disconnect", () => {
    const v = accountView(acc({ state: "connected", method: "oauth", account_name: "Gajanan", oauth_available: true, manual_fields: ["page_id"] }), NOW);
    expect(v).toMatchObject({ tone: "ok", line: "brandinfo.accounts.line.connectedAs", usesName: true, primary: "reconnect", manual: "update", test: true, disconnect: true });
  });

  it("connected without a name reads plainly", () => {
    expect(accountView(acc({ state: "connected", method: "manual" }), NOW).line).toBe("brandinfo.accounts.line.connected");
  });

  it("warns when the token expires within a week", () => {
    const soon = new Date(NOW + 3 * 86_400_000).toISOString();
    const later = new Date(NOW + 40 * 86_400_000).toISOString();
    expect(accountView(acc({ state: "connected", method: "oauth", expires_at: soon }), NOW)).toMatchObject({ tone: "warn", expiry: "soon" });
    expect(accountView(acc({ state: "connected", method: "oauth", expires_at: later }), NOW)).toMatchObject({ tone: "ok", expiry: "info" });
    expect(expiryLevel("not a date", NOW)).toBe("none");
  });

  it("shared .env account: can't be disconnected here, offers the brand's own", () => {
    const v = accountView(acc({ state: "connected", method: "env", oauth_available: true }), NOW);
    expect(v).toMatchObject({ pill: "brandinfo.accounts.pill.shared", primary: "connect", disconnect: false, test: true });
  });

  it("needs setup: docs link, manual still allowed", () => {
    const v = accountView(acc({ state: "needs_setup", manual_fields: ["page_id"] }), NOW);
    expect(v).toMatchObject({ tone: "warn", docs: true, manual: "enter", primary: null, showDetail: true });
  });

  it("pending approval and expired", () => {
    expect(accountView(acc({ channel: "google_business", state: "pending_approval" }), NOW)).toMatchObject({
      pill: "brandinfo.accounts.pill.pending_approval",
      docs: true,
    });
    expect(accountView(acc({ state: "expired", oauth_available: true }), NOW)).toMatchObject({ tone: "err", primary: "reconnect", disconnect: true });
  });

  it("WhatsApp needs no account", () => {
    const v = accountView(acc({ channel: "whatsapp", state: "not_connected" }), NOW);
    expect(v).toMatchObject({ pill: "brandinfo.accounts.pill.ready", primary: null, manual: null, test: false });
  });
});

describe("counts, fields and docs", () => {
  it("counts only the five posting platforms that are connected", () => {
    const list = [
      acc({ channel: "facebook_page", state: "connected" }),
      acc({ channel: "x", state: "expired" }),
      acc({ channel: "whatsapp", state: "connected" }),
      acc({ channel: "linkedin", state: "connected", method: "env" }),
    ];
    expect(countConnected(list)).toBe(2);
    expect(countConnected(null)).toBe(0);
  });

  it("secrets get password inputs; unknown fields fall back to a humanised label", () => {
    expect(fieldMeta("page_token").secret).toBe(true);
    expect(fieldMeta("api_key").secret).toBe(true);
    expect(fieldMeta("page_id").secret).toBe(false);
    expect(fieldMeta("page_id").label).toBe("brandinfo.accounts.field.page_id.label");
    const odd = fieldMeta("business_phone");
    expect(odd.label).toBeNull();
    expect(odd.fallbackLabel).toBe("Business phone");
    expect(odd.help).toBe("brandinfo.accounts.field.generic.help");
  });

  it("collects trimmed values and reports the first missing required field", () => {
    expect(collectFields(["page_id", "page_token"], { page_id: " 123 ", page_token: "" })).toEqual({ fields: { page_id: "123" }, missing: "page_token", invalid: null });
    expect(collectFields(["access_token", "refresh_token"], { access_token: "a" })).toEqual({ fields: { access_token: "a" }, missing: null, invalid: null });
  });

  it("checks the LinkedIn author shape", () => {
    expect(collectFields(["author_urn"], { author_urn: "urn:li:person:abc123" }).invalid).toBeNull();
    expect(collectFields(["author_urn"], { author_urn: "urn:li:organization:42" }).invalid).toBeNull();
    expect(collectFields(["author_urn"], { author_urn: "jane-doe" }).invalid).toBe("author_urn");
  });

  it("turns API errors into plain setup hints", () => {
    expect(accountErrorCopy(503, "SECRET_KEY is not set; set SECRET_KEY to store account tokens")).toEqual({ key: "brandinfo.accounts.err.noSecretKey" });
    expect(accountErrorCopy(403, "Set ADMIN_TOKEN to publish to real channels")).toEqual({ key: "brandinfo.accounts.err.noAdminToken" });
    expect(accountErrorCopy(422, "author_urn must be urn:li:person:…")).toEqual({ key: "brandinfo.accounts.err.action", message: "author_urn must be urn:li:person:…" });
  });

  it("labels picker choice kinds", () => {
    expect(choiceKindKey("organization")).toBe("brandinfo.accounts.kind.organization");
    expect(choiceKindKey("something")).toBeNull();
  });

  it("links to the right setup-guide section", () => {
    expect(setupDocUrl("x")).toMatch(/docs\/CHANNEL_SETUP\.md#3-x-twitter$/);
    expect(setupDocUrl("linkedin")).toMatch(/docs\/CHANNEL_SETUP\.md$/);
  });
});

describe("return from a platform sign-in", () => {
  it("parses connected / choose / error", () => {
    expect(parseConnectReturn("?connected=instagram")).toEqual({ kind: "connected", channel: "instagram", offer: null });
    expect(parseConnectReturn("?connected=facebook_page&offer=instagram")).toEqual({ kind: "connected", channel: "facebook_page", offer: "instagram" });
    expect(parseConnectReturn("?connect_choose=linkedin")).toEqual({ kind: "choose", channel: "linkedin" });
    expect(parseConnectReturn("?connect_error=x&reason=access%20denied")).toEqual({ kind: "error", channel: "x", reason: "access denied" });
    expect(parseConnectReturn("?connect_error=x")).toEqual({ kind: "error", channel: "x", reason: null });
  });

  it("ignores unknown channels and unrelated params", () => {
    expect(parseConnectReturn("?connected=myspace")).toBeNull();
    expect(parseConnectReturn("?run=abc")).toBeNull();
    expect(parseConnectReturn("")).toBeNull();
  });

  it("maps known reason codes to plain copy", () => {
    expect(connectReasonKey("denied")).toBe("brandinfo.accounts.reason.denied");
    expect(connectReasonKey("weird_code")).toBeNull();
    expect(connectReasonKey(null)).toBeNull();
  });

  it("strips only its own params", () => {
    expect(stripConnectParams("?connected=x")).toBe("");
    expect(stripConnectParams("?connected=facebook_page&offer=instagram")).toBe("");
    expect(stripConnectParams("?connect_error=x&reason=nope&run=7")).toBe("?run=7");
  });
});
