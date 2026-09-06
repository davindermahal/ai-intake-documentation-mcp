import { describe, expect, it } from "vitest";
import { startDocumentationPrompt } from "../src/prompts/startDocumentation.js";

describe("start_documentation prompt", () => {
  it("takes no required arguments", () => {
    expect(startDocumentationPrompt.argsSchema.safeParse({}).success).toBe(true);
  });

  it("walks the agent through detect -> drift check -> scan -> ask -> record -> write", async () => {
    const result = await startDocumentationPrompt.handler();
    const text = result.messages[0].content.text;

    expect(result.messages[0].role).toBe("user");
    for (const tool of [
      "ensure_ai_dir",
      "check_drift",
      "scan_project",
      "open_questions",
      "record_evidence",
      "list_evidence",
      "write_doc",
      "write_context_chunk",
      "get_setup_status",
    ]) {
      expect(text).toContain(tool);
    }
  });

  it("confirms with the user before rescanning a repo that's already been scanned", async () => {
    const result = await startDocumentationPrompt.handler();
    const text = result.messages[0].content.text.toLowerCase();
    expect(text).toContain("stale");
    expect(text).toContain("rescan");
  });

  it("tells the agent to ask, not guess", async () => {
    const result = await startDocumentationPrompt.handler();
    const text = result.messages[0].content.text;
    expect(text.toLowerCase()).toContain("don't");
  });
});
