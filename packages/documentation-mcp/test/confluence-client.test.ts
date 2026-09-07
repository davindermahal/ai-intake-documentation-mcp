import { describe, expect, it, vi } from "vitest";
import { ConfluenceApiError, ConfluenceClient, extractPageId } from "../src/confluence/client.js";

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe("extractPageId", () => {
  it("extracts the id from a Confluence Cloud page URL", () => {
    expect(extractPageId("https://example.atlassian.net/wiki/spaces/ENG/pages/12345678/Guide")).toBe("12345678");
  });

  it("extracts the id from a legacy ?pageId= URL", () => {
    expect(extractPageId("https://example.atlassian.net/wiki/pages/viewpage.action?pageId=999")).toBe("999");
  });

  it("returns null when no id is present", () => {
    expect(extractPageId("https://example.atlassian.net/wiki/spaces/ENG/overview")).toBeNull();
  });
});

describe("ConfluenceClient", () => {
  const options = { siteUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok" };

  it("sends a Basic auth header derived from email:apiToken", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe(`Basic ${Buffer.from("a@b.com:tok").toString("base64")}`);
      return fakeResponse(200, { id: "1", title: "T", version: { number: 1 } });
    });
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.getPageById("1");
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("getPageById returns null on 404", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(404, { message: "not found" }));
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.getPageById("1")).toBeNull();
  });

  it("throws ConfluenceApiError on a non-404 error status", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(500, { message: "boom" }));
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getPageById("1")).rejects.toBeInstanceOf(ConfluenceApiError);
  });

  it("createPage posts the expected body shape", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body).toEqual({
        type: "page",
        title: "Guide",
        space: { key: "ENG" },
        ancestors: [{ id: "10" }],
        body: { storage: { value: "<p>hi</p>", representation: "storage" } },
      });
      return fakeResponse(200, {
        id: "20",
        title: "Guide",
        version: { number: 1 },
        _links: { webui: "/spaces/ENG/pages/20/Guide", base: "https://example.atlassian.net/wiki" },
      });
    });
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    const page = await client.createPage({ spaceKey: "ENG", title: "Guide", storageBody: "<p>hi</p>", parentId: "10" });
    expect(page.url).toBe("https://example.atlassian.net/wiki/spaces/ENG/pages/20/Guide");
  });

  it("updatePage increments the version number", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string);
      expect(body.version).toEqual({ number: 4 });
      return fakeResponse(200, { id: "20", title: "Guide", version: { number: 4 } });
    });
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.updatePage({ pageId: "20", title: "Guide", storageBody: "<p>hi</p>", version: 3 });
  });

  it("normalizes a bare-domain siteUrl (no scheme) by adding https://", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toBe("https://example.atlassian.net/wiki/rest/api/content/1?expand=body.storage,version");
      return fakeResponse(200, { id: "1", title: "T", version: { number: 1 } });
    });
    const client = new ConfluenceClient({ siteUrl: "example.atlassian.net", email: "a@b.com", apiToken: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });
    await client.getPageById("1");
    expect(fetchImpl).toHaveBeenCalled();
  });
});
