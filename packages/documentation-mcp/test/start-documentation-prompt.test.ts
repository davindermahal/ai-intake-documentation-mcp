import { describe, expect, it } from "vitest";
import { startDocumentationPrompt } from "../src/prompts/startDocumentation.js";

describe("start_documentation prompt", () => {
  it("takes no required arguments", () => {
    expect(startDocumentationPrompt.argsSchema.safeParse({}).success).toBe(true);
  });

  it("walks the agent through detect -> scan -> ask -> record -> write", async () => {
    const result = await startDocumentationPrompt.handler();
    const text = result.messages[0].content.text;

    expect(result.messages[0].role).toBe("user");
    for (const tool of [
      "detect_ai_dir",
      "init_ai_scaffold",
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

  it("tells the agent to ask, not guess", async () => {
    const result = await startDocumentationPrompt.handler();
    const text = result.messages[0].content.text;
    expect(text.toLowerCase()).toContain("don't");
  });
});
