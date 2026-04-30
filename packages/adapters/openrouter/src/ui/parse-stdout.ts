import type { TranscriptEntry } from "@paperclipai/adapter-utils";
export type { TranscriptEntry } from "@paperclipai/adapter-utils";


export function parseStdout(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "kind" in parsed) {
      const entry = parsed as Record<string, unknown>;
      if (typeof entry.ts !== "string" || entry.ts.length === 0) {
        entry.ts = ts;
      }
      return [entry as TranscriptEntry];
    }
  } catch {
    // fall through to stdout entry
  }

  return [
    {
      kind: "stdout",
      ts,
      text: line,
    },
  ];
}
