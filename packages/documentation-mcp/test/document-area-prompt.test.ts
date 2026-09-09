import { describe, expect, it } from "vitest";
import { documentAreaPrompt } from "../src/prompts/documentArea.js";

describe("document_area prompt", () => {
  it("takes an optional area argument", () => {
    expect(documentAreaPrompt.argsSchema.safeParse({}).success).toBe(true);
    expect(documentAreaPrompt.argsSchema.safeParse({ area: "src/billing" }).success).toBe(true);
  });

  it("takes an optional confluence_links argument", () => {
    expect(documentAreaPrompt.argsSchema.safeParse({ confluence_links: "https://x/pages/1" }).success).toBe(true);
  });

  it("asks the user for scope when no area argument is given", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;

    expect(result.messages[0].role).toBe("user");
    expect(text).toContain("Ask the user directly what part of the system");
    expect(text).not.toContain("undefined");
  });

  it("confirms scope with the user instead of re-asking when an area argument is given", async () => {
    const result = await documentAreaPrompt.handler({ area: "src/billing" });
    const text = result.messages[0].content.text;

    expect(text).toContain("document **src/billing**");
    expect(text).toContain("Confirm that's still the right scope");
  });

  it("walks the agent through ensure -> investigate -> dynamic questions -> record -> write", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;

    for (const tool of ["ensure_ai_dir", "record_evidence", "list_evidence", "write_doc", "write_context_chunk"]) {
      expect(text).toContain(tool);
    }
  });

  it("tells the agent to fetch named Confluence links and cite them as existing-docs evidence", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;
    expect(text).toContain("fetch_confluence_pages");
    expect(text).toContain('source: "existing-docs"');
    expect(text).toContain("lastModified");
  });

  it("triggers the Confluence step on a mid-conversation mention, not only the confluence_links argument", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;
    expect(text.toLowerCase()).toContain("come up at any point in this conversation");
  });

  it("includes the confluence_links argument's value in the instructions when given", async () => {
    const result = await documentAreaPrompt.handler({ confluence_links: "https://x/pages/1" });
    const text = result.messages[0].content.text;
    expect(text).toContain("https://x/pages/1");
  });

  it("tells the agent to ask dynamic, code-derived questions rather than a fixed checklist", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text.toLowerCase();
    expect(text).toContain("not from a fixed checklist");
  });

  it("tells the agent to ask, not guess", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;
    expect(text.toLowerCase()).toContain("don't");
  });

  it("skips drift check and whole-repo scan, unlike start_documentation", async () => {
    const result = await documentAreaPrompt.handler({});
    const text = result.messages[0].content.text;
    expect(text).not.toContain("check_drift");
    expect(text).not.toContain("scan_project");
  });
});
