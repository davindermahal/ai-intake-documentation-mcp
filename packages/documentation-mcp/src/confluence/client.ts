import type { ResolvedConfluenceAuth } from "../config.js";

export class ConfluenceApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string
  ) {
    super(`Confluence API error ${status} ${statusText}: ${body}`);
  }
}

export interface ConfluencePage {
  id: string;
  title: string;
  version: number;
  url: string;
  storageBody: string;
}

interface RawConfluencePage {
  id: string;
  title: string;
  version: { number: number };
  body?: { storage?: { value: string } };
  _links?: { webui?: string; base?: string };
}

/** Confluence Cloud page URLs contain the numeric id as .../pages/<id>/..., or ?pageId=<id>. */
export function extractPageId(url: string): string | null {
  const match = url.match(/\/pages\/(\d+)/) ?? url.match(/[?&]pageId=(\d+)/);
  return match ? match[1] : null;
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
  };
}

export interface ConfluenceClientOptions extends ResolvedConfluenceAuth {
  fetchImpl?: typeof fetch;
}

export interface AttachmentResult {
  id: string;
  title: string;
}

interface RawAttachmentResponse {
  results: Array<{ id: string; title: string }>;
}

const ATTACHMENT_UPLOAD_ATTEMPTS = 3;
const ATTACHMENT_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Write-capable Confluence client, targeting REST API v1 (/wiki/rest/api/content — confirmed
 * correct for Confluence Cloud, the deployment in use). Mirrors ai-intake-mcp's JiraClient pattern:
 * one auth-header chokepoint, injectable fetch for tests, a typed error class for non-2xx.
 */
export class ConfluenceClient {
  private readonly siteUrl: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConfluenceClientOptions) {
    const normalized = /^https?:\/\//.test(options.siteUrl) ? options.siteUrl : `https://${options.siteUrl}`;
    this.siteUrl = normalized.replace(/\/+$/, "");
    this.authHeader = "Basic " + Buffer.from(`${options.email}:${options.apiToken}`).toString("base64");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.siteUrl}${path}`, {
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
    return (await res.json()) as T;
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
   * Retries transient failures a few times before giving up (evidence, not a hard requirement --
   * callers are expected to tolerate and report a final failure rather than treat it as fatal).
   */
  async uploadAttachment(params: { pageId: string; filename: string; content: string; mimeType: string }): Promise<AttachmentResult> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= ATTACHMENT_UPLOAD_ATTEMPTS; attempt++) {
      try {
        return await this.uploadAttachmentOnce(params);
      } catch (err) {
        lastError = err;
        if (attempt < ATTACHMENT_UPLOAD_ATTEMPTS) await sleep(ATTACHMENT_RETRY_DELAY_MS);
      }
    }
    throw lastError;
  }

  private async findAttachmentByFilename(pageId: string, filename: string): Promise<{ id: string } | null> {
    const query = new URLSearchParams({ filename });
    const res = await this.fetchImpl(`${this.siteUrl}/wiki/rest/api/content/${pageId}/child/attachment?${query.toString()}`, {
      headers: { Authorization: this.authHeader, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ConfluenceApiError(res.status, res.statusText, body);
    }
    const json = (await res.json()) as RawAttachmentResponse;
    const match = json.results[0];
    return match ? { id: match.id } : null;
  }

  private async uploadAttachmentOnce(params: { pageId: string; filename: string; content: string; mimeType: string }): Promise<AttachmentResult> {
    const existing = await this.findAttachmentByFilename(params.pageId, params.filename);
    const path = existing
      ? `/wiki/rest/api/content/${params.pageId}/child/attachment/${existing.id}/data`
      : `/wiki/rest/api/content/${params.pageId}/child/attachment`;

    // Multipart, not JSON -- this deliberately doesn't go through request(), which hardcodes
    // Content-Type: application/json. Confluence's attachment endpoints also require the
    // X-Atlassian-Token: nocheck header (its standard XSRF-check bypass for non-browser clients).
    const form = new FormData();
    form.append("file", new Blob([params.content], { type: params.mimeType }), params.filename);

    const res = await this.fetchImpl(`${this.siteUrl}${path}`, {
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
