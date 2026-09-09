export class ConfluenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`Confluence API error ${status} ${statusText}: ${body}`);
  }
}

export type FetchLike = typeof fetch;

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

/** Retry-After is either a whole number of seconds, or an HTTP-date (RFC 7231 §7.1.3). */
function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  if (/^\d+$/.test(header.trim())) return Number(header) * 1000;
  const dateMs = Date.parse(header);
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - Date.now());
}

export interface ConfluencePage {
  id: string;
  title: string;
  version: number;
  url: string;
  storageBody: string;
  /** ISO timestamp of the page's last edit (`version.when`), when the API response included it. */
  lastModified?: string;
}

interface RawConfluencePage {
  id: string;
  title: string;
  version: { number: number; when?: string };
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

function toConfluencePage(siteUrl: string, raw: RawConfluencePage): ConfluencePage {
  const webui = raw._links?.webui;
  const base = raw._links?.base ?? siteUrl;
  return {
    id: raw.id,
    title: raw.title,
    version: raw.version.number,
    url: webui ? `${base}${webui}` : `${siteUrl}/wiki/pages/viewpage.action?pageId=${raw.id}`,
    storageBody: raw.body?.storage?.value ?? "",
    lastModified: raw.version.when,
  };
}

export interface ConfluenceClientOptions {
  siteUrl: string;
  email: string;
  apiToken: string;
  /** Substituted directly in tests -- no real HTTP in unit tests. */
  fetchImpl?: FetchLike;
  /** Substituted in tests to avoid real delays during retry-backoff assertions. */
  sleepImpl?: (ms: number) => Promise<void>;
}

export interface AttachmentResult {
  id: string;
  title: string;
}

interface RawAttachmentResponse {
  results: Array<{ id: string; title: string }>;
}

/**
 * Confluence Cloud REST API v1 client (`/wiki/rest/api/content`). One auth-header chokepoint,
 * injectable fetch/sleep for tests, a typed error for non-2xx, and generic 429/5xx retry with
 * `Retry-After` awareness and capped exponential backoff on every request -- adopted from
 * `ai-intake-mcp`'s implementation as the shared baseline (extract-a-shared-confluence-client-package
 * plan, Key decision #2): this repo's write calls never had real retry logic before.
 */
export class ConfluenceClient {
  private readonly siteUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: FetchLike;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(options: ConfluenceClientOptions) {
    const normalized = /^https?:\/\//.test(options.siteUrl) ? options.siteUrl : `https://${options.siteUrl}`;
    this.siteUrl = normalized.replace(/\/+$/, "");
    this.authHeader = "Basic " + Buffer.from(`${options.email}:${options.apiToken}`).toString("base64");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleepImpl = options.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** Retries 429/5xx responses; every other status (including a thrown network error) surfaces immediately. */
  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await this.fetchImpl(url, init);
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      if ((res.status === 429 || res.status >= 500) && !isLastAttempt) {
        await this.sleepImpl(retryAfterMs(res.headers.get("Retry-After")) ?? backoffMs(attempt));
        continue;
      }
      return res;
    }
    // Unreachable: the loop always returns on its last iteration.
    throw new Error("Confluence request retry loop exited unexpectedly.");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchWithRetry(`${this.siteUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ConfluenceApiError(res.status, res.statusText, body);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async getPageById(pageId: string): Promise<ConfluencePage | null> {
    try {
      const page = await this.request<RawConfluencePage>(`/wiki/rest/api/content/${pageId}?expand=body.storage,version`);
      return toConfluencePage(this.siteUrl, page);
    } catch (err) {
      if (err instanceof ConfluenceApiError && err.status === 404) return null;
      throw err;
    }
  }

  async getPageByTitle(params: { spaceKey: string; title: string }): Promise<ConfluencePage | null> {
    const query = new URLSearchParams({
      spaceKey: params.spaceKey,
      title: params.title,
      expand: "body.storage,version",
    });
    const result = await this.request<{ results: RawConfluencePage[] }>(`/wiki/rest/api/content?${query.toString()}`);
    const page = result.results[0];
    return page ? toConfluencePage(this.siteUrl, page) : null;
  }

  async createPage(params: { spaceKey: string; title: string; storageBody: string; parentId?: string }): Promise<ConfluencePage> {
    const body = {
      type: "page",
      title: params.title,
      space: { key: params.spaceKey },
      ...(params.parentId ? { ancestors: [{ id: params.parentId }] } : {}),
      body: { storage: { value: params.storageBody, representation: "storage" } },
    };
    const page = await this.request<RawConfluencePage>(`/wiki/rest/api/content`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return toConfluencePage(this.siteUrl, page);
  }

  /** Confluence's update API is optimistic-locked on the *current* version; pass it in, we bump it. */
  async updatePage(params: { pageId: string; title: string; storageBody: string; version: number }): Promise<ConfluencePage> {
    const body = {
      id: params.pageId,
      type: "page",
      title: params.title,
      version: { number: params.version + 1 },
      body: { storage: { value: params.storageBody, representation: "storage" } },
    };
    const page = await this.request<RawConfluencePage>(`/wiki/rest/api/content/${params.pageId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return toConfluencePage(this.siteUrl, page);
  }

  private async findAttachmentByFilename(pageId: string, filename: string): Promise<{ id: string } | null> {
    const query = new URLSearchParams({ filename });
    const json = await this.request<RawAttachmentResponse>(`/wiki/rest/api/content/${pageId}/child/attachment?${query.toString()}`);
    const match = json.results[0];
    return match ? { id: match.id } : null;
  }

  /**
   * Uploads (or, on a repeat call with the same filename, versions) a file attachment on a page.
   *
   * Found live, against a real Confluence Cloud instance (not documented clearly enough to have
   * been caught by reading the API docs alone): creating a new attachment and versioning an
   * existing one are two *different* endpoints, not one upsert-by-filename endpoint as originally
   * assumed. POSTing to .../child/attachment a second time with a filename that already exists
   * returns a 400 ("Cannot add a new attachment with same file name as an existing attachment").
   * The actual API requires looking up the existing attachment by filename first, then POSTing to
   * .../child/attachment/{attachmentId}/data to version it if found.
   *
   * The upload POST goes through the same 429/5xx retry as every other request; unlike this
   * method's previous repo-local implementation, a non-retryable failure (e.g. a 400) is no longer
   * retried blindly a fixed number of times -- callers still tolerate and report a final failure
   * rather than treat it as fatal (see `sync_guide`'s attachment handling).
   */
  async uploadAttachment(params: { pageId: string; filename: string; content: string; mimeType: string }): Promise<AttachmentResult> {
    const existing = await this.findAttachmentByFilename(params.pageId, params.filename);
    const path = existing
      ? `/wiki/rest/api/content/${params.pageId}/child/attachment/${existing.id}/data`
      : `/wiki/rest/api/content/${params.pageId}/child/attachment`;

    // Multipart, not JSON -- this deliberately doesn't go through request(), which hardcodes
    // Content-Type: application/json. Confluence's attachment endpoints also require the
    // X-Atlassian-Token: nocheck header (its standard XSRF-check bypass for non-browser clients).
    const form = new FormData();
    form.append("file", new Blob([params.content], { type: params.mimeType }), params.filename);

    const res = await this.fetchWithRetry(`${this.siteUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "X-Atlassian-Token": "nocheck",
      },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ConfluenceApiError(res.status, res.statusText, body);
    }
    const json = (await res.json()) as RawAttachmentResponse | { id: string; title: string };
    const result = "results" in json ? json.results[0] : json;
    return { id: result.id, title: result.title };
  }
}

/** Confluence Cloud page URLs contain the numeric id as .../pages/<id>/..., or ?pageId=<id>. */
export function extractPageIdFromUrl(url: string): string | undefined {
  const spacesMatch = url.match(/\/pages\/(\d+)(?:\/|$)/);
  if (spacesMatch) return spacesMatch[1];
  const viewpageMatch = url.match(/[?&]pageId=(\d+)/);
  if (viewpageMatch) return viewpageMatch[1];
  return undefined;
}

/** Fetches a page's storage-format body (plus version/lastModified) directly from its full URL. */
export async function fetchPageByUrl(client: ConfluenceClient, url: string): Promise<ConfluencePage> {
  const pageId = extractPageIdFromUrl(url);
  if (!pageId) {
    throw new Error(`Could not extract a Confluence page ID from URL: ${url}`);
  }
  const page = await client.getPageById(pageId);
  if (!page) {
    throw new Error(`Confluence page not found: ${url}`);
  }
  return page;
}
