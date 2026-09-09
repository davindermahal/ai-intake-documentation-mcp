import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface LocalGuideFile {
  filename: string;
  title: string;
  description: string;
  content: string;
}

/**
 * Title is the first `# Heading` line; description is the paragraph immediately following it (the
 * lines up to the next blank line, joined with spaces). Matches the convention every guide in
 * `ai-context-guides` already follows (`# Title` then a `Produces:`/`Purpose:` paragraph) -- no
 * frontmatter required.
 */
function parseTitleAndDescription(content: string): { title: string; description: string } {
  const lines = content.split("\n");
  let title = "";
  let titleLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^#\s+(.+)/);
    if (match) {
      title = match[1].trim();
      titleLineIdx = i;
      break;
    }
  }
  let description = "";
  if (titleLineIdx !== -1) {
    const paragraphLines: string[] = [];
    for (const line of lines.slice(titleLineIdx + 1)) {
      if (line.trim() === "") {
        if (paragraphLines.length > 0) break;
        continue;
      }
      paragraphLines.push(line.trim());
    }
    description = paragraphLines.join(" ");
  }
  return { title, description };
}

/** Non-recursive: only top-level `*.md` files in `dir`, sorted for a stable listing order. */
export function listLocalGuideFiles(dir: string): LocalGuideFile[] {
  const filenames = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  return filenames.map((filename) => {
    const content = readFileSync(join(dir, filename), "utf-8");
    const { title, description } = parseTitleAndDescription(content);
    return { filename, title: title || filename.replace(/\.md$/, ""), description, content };
  });
}
