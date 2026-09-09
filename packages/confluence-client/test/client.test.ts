import { describe, expect, it, vi } from "vitest";
import { ConfluenceApiError, ConfluenceClient, extractPageIdFromUrl, fetchPageByUrl } from "../src/client.js";

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const options = { siteUrl: "https://example.atlassian.net", email: "a@b.com", apiToken: "tok" };

function noSleepClient(fetchImpl: typeof fetch): { client: ConfluenceClient; sleeps: number[] } {
  const sleeps: number[] = [];
  const client = new ConfluenceClient({
    ...options,
    fetchImpl,
    sleepImpl: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, sleeps };
}

describe("extractPageIdFromUrl", () => {
  it("extracts the id from a Confluence Cloud page URL", () => {
    expect(extractPageIdFromUrl("https://example.atlassian.net/wiki/spaces/ENG/pages/12345678/Guide")).toBe("12345678");
  });

  it("extracts the id from a legacy ?pageId= URL", () => {
    expect(extractPageIdFromUrl("https://example.atlassian.net/wiki/pages/viewpage.action?pageId=999")).toBe("999");
  });

  it("returns undefined when no id is present", () => {
    expect(extractPageIdFromUrl("https://example.atlassian.net/wiki/spaces/ENG/overview")).toBeUndefined();
  });
});

describe("ConfluenceClient", () => {
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

  it("throws ConfluenceApiError on a non-retryable, non-404 error status", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(400, { message: "bad request" }));
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.getPageById("1")).rejects.toBeInstanceOf(ConfluenceApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("getPageById surfaces lastModified from version.when", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse(200, { id: "1", title: "T", version: { number: 1, when: "2021-03-14T10:00:00.000Z" } }),
    );
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect((await client.getPageById("1"))?.lastModified).toBe("2021-03-14T10:00:00.000Z");
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

  describe("retry/backoff", () => {
    it("retries a 5xx with capped exponential backoff, then succeeds", async () => {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls++;
        if (calls < 3) return fakeResponse(503, { message: "boom" });
        return fakeResponse(200, { id: "1", title: "T", version: { number: 1 } });
      });
      const { client, sleeps } = noSleepClient(fetchImpl as unknown as typeof fetch);
      await expect(client.getPageById("1")).resolves.not.toBeNull();
      expect(calls).toBe(3);
      expect(sleeps).toEqual([1000, 2000]);
    });

    it("honors a numeric Retry-After header on a 429", async () => {
      let calls = 0;
      const fetchImpl = vi.fn(async () => {
        calls++;
        if (calls < 2) return fakeResponse(429, { message: "slow down" }, { "Retry-After": "5" });
        return fakeResponse(200, { id: "1", title: "T", version: { number: 1 } });
      });
      const { client, sleeps } = noSleepClient(fetchImpl as unknown as typeof fetch);
      await client.getPageById("1");
      expect(sleeps).toEqual([5000]);
    });

    it("gives up and throws after exhausting all retry attempts", async () => {
      const fetchImpl = vi.fn(async () => fakeResponse(500, { message: "still failing" }));
      const { client } = noSleepClient(fetchImpl as unknown as typeof fetch);
      await expect(client.getPageById("1")).rejects.toBeInstanceOf(ConfluenceApiError);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("does not retry a non-retryable 4xx", async () => {
      const fetchImpl = vi.fn(async () => fakeResponse(404, { message: "not found" }));
      const { client } = noSleepClient(fetchImpl as unknown as typeof fetch);
      await client.getPageById("1");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });
  });

  describe("uploadAttachment", () => {
    const LOOKUP_URL = "https://example.atlassian.net/wiki/rest/api/content/20/child/attachment?filename=source.md";
    const CREATE_URL = "https://example.atlassian.net/wiki/rest/api/content/20/child/attachment";
    const UPDATE_URL = "https://example.atlassian.net/wiki/rest/api/content/20/child/attachment/att-1/data";

    async function fileFromBody(init?: RequestInit): Promise<File> {
      const form = init?.body as FormData;
      return form.get("file") as File;
    }

    function noExistingAttachment(): Response {
      return fakeResponse(200, { results: [] });
    }

    function existingAttachment(): Response {
      return fakeResponse(200, { results: [{ id: "att-1", title: "source.md" }] });
    }

    it("looks up by filename first, then creates when none exists yet (not JSON, nocheck token header)", async () => {
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method !== "POST") {
          expect(url).toBe(LOOKUP_URL);
          return noExistingAttachment();
        }
        expect(url).toBe(CREATE_URL);
        const headers = init.headers as Record<string, string>;
        expect(headers["X-Atlassian-Token"]).toBe("nocheck");
        expect(headers["Content-Type"]).toBeUndefined();
        expect(init.body).toBeInstanceOf(FormData);
        const file = await fileFromBody(init);
        expect(file.name).toBe("source.md");
        expect(file.type).toBe("text/markdown");
        expect(await file.text()).toBe("# Heading\n\nSome content, exactly as authored.");
        return fakeResponse(200, { results: [{ id: "att-1", title: "source.md" }] });
      });
      const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
      const result = await client.uploadAttachment({
        pageId: "20",
        filename: "source.md",
        content: "# Heading\n\nSome content, exactly as authored.",
        mimeType: "text/markdown",
      });
      expect(result).toEqual({ id: "att-1", title: "source.md" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("versions the existing attachment via .../data when the filename already exists (found live -- create-endpoint 400s on a repeat filename)", async () => {
      const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method !== "POST") {
          expect(url).toBe(LOOKUP_URL);
          return existingAttachment();
        }
        expect(url).toBe(UPDATE_URL);
        const file = await fileFromBody(init);
        expect(await file.text()).toBe("updated content");
        return fakeResponse(200, { id: "att-1", title: "source.md" }); // update-data returns the attachment directly, not wrapped in results
      });
      const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
      const result = await client.uploadAttachment({ pageId: "20", filename: "source.md", content: "updated content", mimeType: "text/markdown" });
      expect(result).toEqual({ id: "att-1", title: "source.md" });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("retries a transient 5xx on the upload POST itself, without re-doing the lookup", async () => {
      let postAttempts = 0;
      const { client, sleeps } = noSleepClient(vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method !== "POST") return noExistingAttachment();
        postAttempts++;
        if (postAttempts < 3) return fakeResponse(503, { message: "transient" });
        return fakeResponse(200, { results: [{ id: "att-1", title: "source.md" }] });
      }) as unknown as typeof fetch);
      const result = await client.uploadAttachment({ pageId: "20", filename: "source.md", content: "c", mimeType: "text/markdown" });
      expect(result).toEqual({ id: "att-1", title: "source.md" });
      expect(postAttempts).toBe(3);
      expect(sleeps).toEqual([1000, 2000]);
    });

    it("gives up and throws after exhausting retries on the upload POST", async () => {
      const { client } = noSleepClient(vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method !== "POST" ? noExistingAttachment() : fakeResponse(500, { message: "still failing" }),
      ) as unknown as typeof fetch);
      await expect(
        client.uploadAttachment({ pageId: "20", filename: "source.md", content: "c", mimeType: "text/markdown" }),
      ).rejects.toBeInstanceOf(ConfluenceApiError);
    });
  });
});

describe("fetchPageByUrl", () => {
  it("fetches the page by its extracted ID with body.storage and version expanded", async () => {
    let seenUrl: string | undefined;
    const fetchImpl = vi.fn(async (url: string) => {
      seenUrl = url;
      return fakeResponse(200, {
        id: "12345",
        title: "Symfony 4→5 Upgrade",
        body: { storage: { value: "<p>x</p>" } },
        version: { number: 1, when: "2021-03-14T10:00:00.000Z" },
      });
    });
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    const page = await fetchPageByUrl(client, "https://example.atlassian.net/wiki/spaces/ENG/pages/12345/Symfony");
    expect(seenUrl).toBe("https://example.atlassian.net/wiki/rest/api/content/12345?expand=body.storage,version");
    expect(page.title).toBe("Symfony 4→5 Upgrade");
    expect(page.lastModified).toBe("2021-03-14T10:00:00.000Z");
  });

  it("throws when the URL has no extractable page ID", async () => {
    const client = new ConfluenceClient({ ...options, fetchImpl: vi.fn() as unknown as typeof fetch });
    await expect(fetchPageByUrl(client, "https://example.atlassian.net/wiki/overview")).rejects.toThrow(
      /Could not extract a Confluence page ID/,
    );
  });

  it("throws when the page doesn't exist", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(404, { message: "not found" }));
    const client = new ConfluenceClient({ ...options, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(fetchPageByUrl(client, "https://example.atlassian.net/wiki/pages/999")).rejects.toThrow(
      /Confluence page not found/,
    );
  });
});
