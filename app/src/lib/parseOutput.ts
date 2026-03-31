/**
 * Utilities for extracting structured content from raw Claude skill output.
 *
 * Claude sometimes emits reasoning/thinking prose before the actual output.
 * These helpers strip that noise and surface only the meaningful parts:
 * fenced code blocks (diffs, JSON, markdown) and clean text sections.
 */

export interface ExtractedBlocks {
  /** All fenced diff code blocks found in the output */
  diffs: string[]
  /** The last valid JSON object found in a fenced code block */
  jsonSummary: string | null
  /** Parsed JSON from jsonSummary, or null if parse fails */
  parsedJson: Record<string, unknown> | null
  /** Non-code fenced blocks (e.g. ```markdown, ```text) */
  otherBlocks: Array<{ lang: string; content: string }>
}

/**
 * Extract fenced code blocks from raw output.
 * Ignores all surrounding prose (reasoning text, commentary, etc).
 */
export function extractBlocks(text: string): ExtractedBlocks {
  const diffs: string[] = []
  let jsonSummary: string | null = null
  let parsedJson: Record<string, unknown> | null = null
  const otherBlocks: Array<{ lang: string; content: string }> = []

  const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = codeBlockRe.exec(text)) !== null) {
    const lang = match[1].toLowerCase().trim()
    const content = match[2].trim()

    if (lang === 'json') {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>
        // Last valid JSON block wins (summary is always last)
        jsonSummary = content
        parsedJson = parsed
      } catch { /* not valid JSON, skip */ }
    } else if (
      lang === 'diff' ||
      content.startsWith('--- ') ||
      content.startsWith('+++ ') ||
      content.startsWith('diff --git') ||
      content.startsWith('@@ ')
    ) {
      diffs.push(content)
    } else if (content.length > 0) {
      otherBlocks.push({ lang, content })
    }
  }

  return { diffs, jsonSummary, parsedJson, otherBlocks }
}

/**
 * Strip reasoning prose from output, returning only content after the last
 * substantive fenced code block. This prevents Claude's "Now let me check..."
 * text from appearing as the primary output.
 *
 * For skills that output diffs + JSON, the real output is the code blocks.
 * For skills that output markdown reports, the real output is the prose AFTER
 * any reasoning (markdown reports don't use code blocks).
 */
export function stripReasoningProse(text: string): string {
  // If there are code blocks, the output is the code blocks — return the text
  // from the first code block onwards (dropping any prose before it)
  const firstBlockIdx = text.indexOf('```')
  if (firstBlockIdx > 0) {
    // Check if the content before the first block is just reasoning
    const before = text.slice(0, firstBlockIdx)
    const looksLikeReasoning = /\b(let me|now i|i'll|i need to|let's|checking|reading|looking|scanning|wait|actually|however|but |the task|the file|the code)\b/i.test(before)
    if (looksLikeReasoning) {
      return text.slice(firstBlockIdx)
    }
  }
  return text
}

/**
 * Extract the filename from a diff block header.
 * Handles: "--- a/path/file.tsx", "+++ b/path/file.tsx", "diff --git a/... b/..."
 */
export function diffFilename(diff: string): string {
  const plusMatch = diff.match(/^\+\+\+\s+(?:b\/)?(.+)$/m)
  if (plusMatch) return plusMatch[1].trim().split(/[\\/]/).pop() ?? plusMatch[1]
  const minusMatch = diff.match(/^---\s+(?:a\/)?(.+)$/m)
  if (minusMatch) return minusMatch[1].trim().split(/[\\/]/).pop() ?? minusMatch[1]
  return 'diff'
}
