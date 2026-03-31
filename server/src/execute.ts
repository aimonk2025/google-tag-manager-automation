import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.js';
import { getAdapterOrDefault } from './adapters/registry.js';
import type { ActivityEvent } from './adapters/types.js';
import { logActivity } from './services/activity.js';
import { snapshotFileTree } from './services/changeDetector.js';

export type { ActivityEvent };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Per-adapter cost calculation (reads from adapter_pricing table)
function computeCostUsd(adapterType: string, inputTokens: number, outputTokens: number): number {
  try {
    const db = getDb();
    const row = db.prepare('SELECT input_price_per_million, output_price_per_million FROM adapter_pricing WHERE adapter_type = ?').get(adapterType) as { input_price_per_million: number; output_price_per_million: number } | undefined;
    if (row) {
      return (inputTokens * row.input_price_per_million + outputTokens * row.output_price_per_million) / 1_000_000;
    }
  } catch { /* fall through to default */ }
  // Default: Claude Sonnet pricing
  return inputTokens * 0.000003 + outputTokens * 0.000015;
}
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

export interface RunSkillOptions {
  skillName: string;
  prompt: string;
  projectPath: string;
  sessionId: string;
  claudeSessionId: string | null;
  adapterType?: string;
  maxRetries?: number;
  runContext?: 'first_run' | 'retry' | 'rerun';
  pageContext?: string;
  onChunk: (chunk: string) => void;
  onSessionId: (id: string) => void;
  onActivity?: (event: ActivityEvent) => void;
  onRetry?: (attempt: number, reason: string) => void;
  onTimeout?: () => void;
  onConfidenceUpdate?: (signals: CoverageSignals) => void;
  onRunId?: (runId: string) => void;
}

export interface RunSkillResult {
  claudeSessionId: string;
  skillRunId: string;
  outputLog: string;
  retryCount: number;
}

// ---- SKILL.md section parsing ----

interface SkillSections {
  PERSONA: string;
  WORKFLOW: string;
  OUTPUT_FORMAT: string;
  EXAMPLES: string;
  EDGE_CASES: string;
  RAW: string;
}

function parseSkillSections(content: string): SkillSections {
  const sections: Partial<SkillSections> = { RAW: content };
  const parts = content.split(/^## (PERSONA|WORKFLOW|OUTPUT_FORMAT|EXAMPLES|EDGE_CASES)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i] as keyof SkillSections;
    sections[name] = parts[i + 1]?.trim() ?? '';
  }
  return sections as SkillSections;
}

function selectSkillSections(sections: SkillSections, context: 'first_run' | 'retry' | 'rerun'): string {
  // If SKILL.md has no section headers, always return full content
  const hasSections = sections.WORKFLOW || sections.OUTPUT_FORMAT;
  if (!hasSections) return sections.RAW;

  switch (context) {
    case 'first_run':
      return sections.RAW;
    case 'retry':
      return [sections.WORKFLOW, sections.OUTPUT_FORMAT].filter(Boolean).join('\n\n');
    case 'rerun':
      return [sections.PERSONA, sections.WORKFLOW, sections.OUTPUT_FORMAT].filter(Boolean).join('\n\n');
  }
}

function readSkillContent(skillName: string, context: 'first_run' | 'retry' | 'rerun' = 'first_run'): string {
  const skillPath = path.join(SKILLS_DIR, skillName, 'SKILL.md');
  if (!fs.existsSync(skillPath)) {
    throw new Error(`Skill not found: ${skillName} (looked for ${skillPath})`);
  }
  const raw = fs.readFileSync(skillPath, 'utf-8');
  const sections = parseSkillSections(raw);
  return selectSkillSections(sections, context);
}

// ---- Confidence / coverage signal extraction ----

export interface CoverageSignals {
  coveragePct: number;
  unresolvedCount: number;
  confidence: 'high' | 'medium' | 'low';
  flaggedIssues: string[];
  notes: string;
}

export function extractCoverageSignals(output: string, _skillName: string): CoverageSignals | null {
  const startMarker = '---CONFIDENCE-REPORT-START---';
  const endMarker = '---CONFIDENCE-REPORT-END---';

  const startIdx = output.indexOf(startMarker);
  if (startIdx === -1) return null;

  const endIdx = output.indexOf(endMarker, startIdx);
  if (endIdx === -1) return null;

  const block = output.slice(startIdx + startMarker.length, endIdx).trim();

  const coveragePctMatch = block.match(/^coverage_pct:\s*(\d+(?:\.\d+)?)/m);
  const unresolvedCountMatch = block.match(/^unresolved_count:\s*(\d+)/m);
  const confidenceMatch = block.match(/^confidence:\s*(high|medium|low)/m);
  const notesMatch = block.match(/^notes:\s*(.+)$/m);

  // Extract flagged_issues list items (lines starting with "- " after "flagged_issues:")
  const flaggedIssues: string[] = [];
  const flaggedSection = block.match(/^flagged_issues:\s*\n([\s\S]*?)(?=\n\w|$)/m);
  if (flaggedSection) {
    const listLines = flaggedSection[1].split('\n');
    for (const line of listLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        flaggedIssues.push(trimmed.slice(2).trim());
      }
    }
  }

  if (!coveragePctMatch || !unresolvedCountMatch || !confidenceMatch) return null;

  const confidence = confidenceMatch[1] as 'high' | 'medium' | 'low';

  return {
    coveragePct: parseFloat(coveragePctMatch[1]),
    unresolvedCount: parseInt(unresolvedCountMatch[1], 10),
    confidence,
    flaggedIssues,
    notes: notesMatch ? notesMatch[1].trim() : '',
  };
}

// ---- Retry helpers ----

function classifyError(errorMsg: string, outputLog: string): string {
  if (outputLog.includes('```json') && !/```json[\s\S]+?```/.test(outputLog)) {
    return 'incomplete_json_block';
  }
  const msg = errorMsg.toLowerCase();
  if (msg.includes('malformed') || msg.includes('parse') || msg.includes('json')) return 'malformed_json';
  if (msg.includes('missing required') || msg.includes('required field')) return 'missing_required_fields';
  if (msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
  return 'unknown_error';
}

function buildRetryPrompt(originalPrompt: string, errorMsg: string, errorType: string, attempt: number): string {
  const corrections: Record<string, string> = {
    incomplete_json_block:
      'CORRECTION: Your previous response contained an incomplete JSON code block. ' +
      'You MUST emit the complete JSON object inside ```json ... ``` fences. ' +
      'Do not truncate the output. Start fresh and produce the complete JSON now.',
    malformed_json:
      'CORRECTION: Your previous response contained malformed JSON. ' +
      'Review the OUTPUT_FORMAT section carefully. ' +
      'Emit only valid JSON inside ```json ... ``` fences. No trailing commas, no comments inside JSON.',
    missing_required_fields:
      `CORRECTION: Your previous response was missing required output fields. ` +
      `Error: ${errorMsg}. ` +
      `Review the OUTPUT_FORMAT section and include every required field.`,
    timeout:
      'CORRECTION: The previous run timed out. Reduce scope: process only the first 10 files, ' +
      'emit partial results rather than attempting everything at once.',
    unknown_error:
      `CORRECTION: The previous attempt failed with: ${errorMsg}. ` +
      `Review the TASK and OUTPUT_FORMAT sections and try again with a simpler, more direct approach.`,
  };

  const correction = corrections[errorType] ?? corrections.unknown_error;
  return `[RETRY ATTEMPT ${attempt}]\n${correction}\n\n---\nORIGINAL TASK:\n${originalPrompt}`;
}

// ---- Core skill execution (single attempt) ----

const SKILL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function attemptSkillRun(opts: {
  skillName: string;
  prompt: string;
  projectPath: string;
  sessionId: string;
  claudeSessionId: string | null;
  adapterType?: string;
  runContext: 'first_run' | 'retry' | 'rerun';
  pageContext?: string;
  onChunk: (chunk: string) => void;
  onSessionId: (id: string) => void;
  onActivity?: (event: ActivityEvent) => void;
  onTimeout?: () => void;
  onConfidenceUpdate?: (signals: CoverageSignals) => void;
  onRunId?: (runId: string) => void;
}): Promise<{ claudeSessionId: string; skillRunId: string; outputLog: string }> {
  const { skillName, prompt, projectPath, sessionId, claudeSessionId, adapterType, runContext, pageContext, onChunk, onSessionId, onActivity, onConfidenceUpdate } = opts;

  const skillContent = readSkillContent(skillName, runContext);
  const skillRunId = uuidv4();
  const db = getDb();
  const startedAtMs = Date.now();

  db.prepare(`
    INSERT INTO skill_runs (id, session_id, skill_name, status, adapter_type, prompt_sent, page_context, started_at)
    VALUES (?, ?, ?, 'running', ?, ?, ?, datetime('now'))
  `).run(skillRunId, sessionId, skillName, adapterType ?? 'claude_code', prompt, pageContext ?? null);

  opts.onRunId?.(skillRunId);

  logActivity(sessionId, 'skill.started', 'skill_run', skillRunId, { skillName, adapterType });

  const tmpFile = path.join(os.tmpdir(), `gtm-skill-${skillRunId}.md`);
  fs.writeFileSync(tmpFile, skillContent, 'utf-8');

  const adapter = getAdapterOrDefault(adapterType);
  let resolvedSessionId = claudeSessionId ?? '';
  let outputLog = '';
  let confidenceEmitted = false;

  // Timeout: kill if no output for SKILL_TIMEOUT_MS
  let lastOutputAt = Date.now();
  const abortController = new AbortController();
  const timeoutInterval = setInterval(() => {
    if (Date.now() - lastOutputAt > SKILL_TIMEOUT_MS) {
      clearInterval(timeoutInterval);
      abortController.abort();
    }
  }, 30_000);

  try {
    const result = await adapter.execute({
      skillName,
      prompt,
      sessionId: adapter.supportsSessionResume ? claudeSessionId : null,
      workspacePath: projectPath,
      systemPromptFile: tmpFile,
      signal: abortController.signal,
      onChunk: (chunk) => {
        lastOutputAt = Date.now();
        outputLog += chunk;
        onChunk(chunk);

        // Emit confidence_update SSE when the report block becomes complete in the stream
        if (!confidenceEmitted && onConfidenceUpdate && outputLog.includes('---CONFIDENCE-REPORT-END---')) {
          const signals = extractCoverageSignals(outputLog, skillName);
          if (signals) {
            confidenceEmitted = true;
            onConfidenceUpdate(signals);
          }
        }
      },
      onActivity: (event) => {
        lastOutputAt = Date.now();
        onActivity?.(event);
      },
      onMeta: (meta) => {
        if (meta.sessionId) {
          resolvedSessionId = meta.sessionId;
          onSessionId(meta.sessionId);
        }
      },
    });

    outputLog = result.outputText;
    if (result.sessionId) resolvedSessionId = result.sessionId;

    const now = new Date().toISOString();
    const durationMs = Date.now() - startedAtMs;
    const inputTokens = result.usage?.inputTokens ?? 0;
    const outputTokens = result.usage?.outputTokens ?? 0;
    const costUsd = computeCostUsd(adapterType ?? 'claude_code', inputTokens, outputTokens);

    // Check if we were killed by timeout
    if (abortController.signal.aborted) {
      db.prepare(`
        UPDATE skill_runs
        SET status = 'timeout', output_log = ?, error_message = ?, completed_at = ?, duration_ms = ?
        WHERE id = ?
      `).run(outputLog, 'Skill timed out after 10 minutes of no output', now, durationMs, skillRunId);
      logActivity(sessionId, 'skill.timeout', 'skill_run', skillRunId, { skillName, durationMs });
      opts.onTimeout?.();
      throw new Error('SKILL_TIMEOUT: Skill timed out after 10 minutes. Try reducing the scope or re-running.');
    }

    if (result.exitCode === 0 || resolvedSessionId) {
      db.prepare(`
        UPDATE skill_runs
        SET status = 'complete', claude_session_id = ?, output_log = ?, completed_at = ?,
            input_tokens = ?, output_tokens = ?, cost_usd = ?, duration_ms = ?
        WHERE id = ?
      `).run(resolvedSessionId, outputLog, now, inputTokens, outputTokens, costUsd, durationMs, skillRunId);

      try {
        db.prepare(`
          INSERT INTO cost_events (id, session_id, skill_run_id, skill_name, adapter_type, model, input_tokens, output_tokens, cost_usd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(uuidv4(), sessionId, skillRunId, skillName, adapterType ?? 'claude_code', result.model ?? null, inputTokens, outputTokens, costUsd);
      } catch { /* non-fatal */ }

      logActivity(sessionId, 'skill.completed', 'skill_run', skillRunId, { skillName, durationMs, inputTokens, outputTokens, costUsd });

      // Extract and persist coverage signals for gtm-analytics-audit runs
      if (skillName === 'gtm-analytics-audit') {
        try {
          const signals = extractCoverageSignals(outputLog, skillName);
          if (signals) {
            // If the confidence_update wasn't emitted during streaming (e.g. adapter buffers output),
            // emit it now so the frontend still gets it
            if (!confidenceEmitted && onConfidenceUpdate) {
              onConfidenceUpdate(signals);
            }

            let snapshotJson: string | null = null;
            try {
              const snapshot = snapshotFileTree(projectPath);
              snapshotJson = JSON.stringify(snapshot);
            } catch { /* non-fatal - snapshot may fail on large or locked trees */ }

            db.prepare(`
              UPDATE sessions
              SET audit_coverage_pct = ?,
                  file_tree_snapshot = ?,
                  drift_acknowledged = 0
              WHERE id = ?
            `).run(signals.coveragePct, snapshotJson, sessionId);
          }
        } catch { /* non-fatal - do not fail the run because of signal extraction */ }
      }

      return { claudeSessionId: resolvedSessionId, skillRunId, outputLog };
    } else {
      const errorMsg = result.errorMessage || `Process exited with code ${result.exitCode}`;
      db.prepare(`
        UPDATE skill_runs
        SET status = 'error', output_log = ?, error_message = ?, completed_at = ?, duration_ms = ?
        WHERE id = ?
      `).run(outputLog, errorMsg, now, durationMs, skillRunId);

      logActivity(sessionId, 'skill.failed', 'skill_run', skillRunId, { skillName, errorMsg, durationMs });

      throw new Error(errorMsg);
    }
  } finally {
    clearInterval(timeoutInterval);
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

// ---- Public runSkill with retry loop ----

export async function runSkill(opts: RunSkillOptions): Promise<RunSkillResult> {
  const maxRetries = opts.maxRetries ?? 3;
  const db = getDb();
  let lastError: Error | null = null;
  let retryCount = 0;
  let currentPrompt = opts.prompt;
  let runContext: 'first_run' | 'retry' | 'rerun' = opts.runContext ?? 'first_run';
  let lastSkillRunId: string | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await attemptSkillRun({
        ...opts,
        prompt: currentPrompt,
        runContext,
        pageContext: opts.pageContext,
        onTimeout: opts.onTimeout,
        onConfidenceUpdate: opts.onConfidenceUpdate,
      });

      // Update retry count on the successful run
      if (retryCount > 0) {
        db.prepare('UPDATE skill_runs SET retry_count = ? WHERE id = ?').run(retryCount, result.skillRunId);
      }

      return { ...result, retryCount };
    } catch (err) {
      lastError = err as Error;
      lastSkillRunId = null;

      if (attempt >= maxRetries) break;

      retryCount++;
      const reason = classifyError(lastError.message, currentPrompt);
      opts.onRetry?.(retryCount, reason);

      // Mark the failed run as 'retried' so history shows the chain
      // (the run ID is not accessible here, but the status was already set to 'error' by attemptSkillRun)

      // Build corrective prompt for next attempt
      currentPrompt = buildRetryPrompt(opts.prompt, lastError.message, reason, retryCount);
      runContext = 'retry';

      // Exponential backoff: 2s, 4s, 8s
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
    }
  }

  throw lastError!;
}

export interface ParallelWorker {
  id: string;
  prompt: string;
}

export interface RunSkillParallelOptions {
  skillName: string;
  workers: ParallelWorker[];
  projectPath: string;
  sessionId: string;
  adapterType?: string;
  onChunk: (workerId: string, chunk: string) => void;
  onActivity: (workerId: string, event: ActivityEvent) => void;
  onWorkerComplete: (workerId: string, sessionId: string) => void;
}

export interface ParallelResult {
  workerId: string;
  claudeSessionId: string;
  outputLog: string;
}

export async function runSkillParallel(opts: RunSkillParallelOptions): Promise<ParallelResult[]> {
  const { skillName, workers, projectPath, sessionId, adapterType, onChunk, onActivity, onWorkerComplete } = opts;
  const skillContent = readSkillContent(skillName);
  const adapter = getAdapterOrDefault(adapterType);

  const workerPromises = workers.map((worker) => {
    return new Promise<ParallelResult>((resolve, reject) => {
      const skillRunId = uuidv4();
      const db = getDb();
      const workerStartMs = Date.now();

      db.prepare(`
        INSERT INTO skill_runs (id, session_id, skill_name, status, adapter_type, prompt_sent, started_at)
        VALUES (?, ?, ?, 'running', ?, ?, datetime('now'))
      `).run(skillRunId, sessionId, `${skillName}:${worker.id}`, adapterType ?? 'claude_code', worker.prompt);

      const tmpFile = path.join(os.tmpdir(), `gtm-skill-${skillRunId}.md`);
      fs.writeFileSync(tmpFile, skillContent, 'utf-8');

      let resolvedSessionId = '';
      let outputLog = '';

      adapter.execute({
        skillName,
        prompt: worker.prompt,
        sessionId: null,
        workspacePath: projectPath,
        systemPromptFile: tmpFile,
        onChunk: (chunk) => {
          outputLog += chunk;
          onChunk(worker.id, chunk);
        },
        onActivity: (event) => onActivity(worker.id, event),
        onMeta: (meta) => {
          if (meta.sessionId) {
            resolvedSessionId = meta.sessionId;
            onWorkerComplete(worker.id, meta.sessionId);
          }
        },
      }).then((result) => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

        outputLog = result.outputText;
        if (result.sessionId) resolvedSessionId = result.sessionId;

        const now = new Date().toISOString();
        const workerDurationMs = Date.now() - workerStartMs;
        const wInputTokens = result.usage?.inputTokens ?? 0;
        const wOutputTokens = result.usage?.outputTokens ?? 0;
        const wCostUsd = computeCostUsd(adapterType ?? 'claude_code', wInputTokens, wOutputTokens);

        if (result.exitCode === 0 || resolvedSessionId) {
          db.prepare(`UPDATE skill_runs SET status = 'complete', claude_session_id = ?, output_log = ?, completed_at = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, duration_ms = ? WHERE id = ?`)
            .run(resolvedSessionId, outputLog, now, wInputTokens, wOutputTokens, wCostUsd, workerDurationMs, skillRunId);
          resolve({ workerId: worker.id, claudeSessionId: resolvedSessionId, outputLog });
        } else {
          const errorMsg = result.errorMessage || `Worker ${worker.id} exited with code ${result.exitCode}`;
          db.prepare(`UPDATE skill_runs SET status = 'error', output_log = ?, error_message = ?, completed_at = ?, duration_ms = ? WHERE id = ?`)
            .run(outputLog, errorMsg, now, workerDurationMs, skillRunId);
          reject(new Error(errorMsg));
        }
      }).catch((err: Error) => {
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        reject(new Error(err.message.includes('ENOENT') ? 'CLI not found' : err.message));
      });
    });
  });

  return Promise.all(workerPromises);
}

export interface ParsedEdit {
  file: string;
  elementText: string;
  addedId: string | null;
  addedClasses: string[];
}

export interface ParsedRunEdits {
  edits: ParsedEdit[];
  byFile: Record<string, ParsedEdit[]>;
  totalEdits: number;
  filesModified: number;
  noChanges: boolean;
  summaryText: string | null;
  filesExamined: string[];
}

export function parseRunEdits(outputLog: string): ParsedRunEdits {
  const lines = outputLog.split('\n').filter(l => l.trim());
  const edits: ParsedEdit[] = [];
  const filesReadSet = new Set<string>();
  let summaryText: string | null = null;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'assistant') {
      const content = (obj.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined;
      if (!content) continue;

      for (const block of content) {
        // Capture Claude's final summary text
        if (block.type === 'text') {
          const text = block.text as string;
          if (text?.includes('filesModified') || text?.includes('elements') || text?.length > 20) {
            summaryText = text.trim();
          }
        }

        if (block.type !== 'tool_use') continue;
        const name = block.name as string;
        const input = block.input as Record<string, unknown>;
        const filePath = (input.file_path ?? input.path) as string | undefined;
        if (!filePath) continue;

        // Track all files read (examined but not necessarily changed)
        if (name === 'Read') {
          filesReadSet.add(filePath.replace(/\\/g, '/'));
          continue;
        }

        if (name !== 'Edit' && name !== 'Write' && name !== 'MultiEdit') continue;

        const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;

        if (name === 'MultiEdit') {
          const editsArr = input.edits as Array<{ old_string?: string; new_string?: string }> | undefined;
          for (const e of editsArr ?? []) {
            const parsed = extractTrackingChange(e.old_string ?? '', e.new_string ?? '', fileName, filePath);
            if (parsed) edits.push(parsed);
          }
        } else {
          const oldStr = (input.old_string ?? '') as string;
          const newStr = (input.new_string ?? input.content ?? '') as string;
          const parsed = extractTrackingChange(oldStr, newStr, fileName, filePath);
          if (parsed) edits.push(parsed);
        }
      }
    }

    // Also capture summary from result block
    if (obj.type === 'result') {
      const resultText = obj.result as string | undefined;
      if (resultText) summaryText = resultText.trim();
    }
  }

  const byFile: Record<string, ParsedEdit[]> = {};
  for (const edit of edits) {
    (byFile[edit.file] ??= []).push(edit);
  }

  // Files examined = read files that were NOT edited (already tracked)
  const editedPaths = new Set(edits.map(e => e.file));
  const filesExamined = Array.from(filesReadSet).filter(f => !editedPaths.has(f));

  return {
    edits,
    byFile,
    totalEdits: edits.length,
    filesModified: Object.keys(byFile).length,
    noChanges: edits.length === 0,
    summaryText,
    filesExamined,
  };
}

function extractTrackingChange(oldStr: string, newStr: string, fileName: string, filePath: string): ParsedEdit | null {
  // Include any edit that touches tracking-related attributes OR any element edit
  const hasTracking = newStr.includes('js-track') || newStr.includes('data-track') || newStr.includes('id=') || newStr.includes('onClick') || newStr.includes('trackCTA') || newStr.includes('trackNav') || newStr.includes('trackCourse');
  if (!hasTracking && !oldStr.includes('js-track') && !oldStr.includes('id=')) return null;

  // Extract element text (button/link label)
  const elementText = extractElementText(oldStr || newStr);

  // Extract added id
  const idMatch = newStr.match(/\bid="([^"]+)"/);
  const addedId = idMatch ? idMatch[1] : null;

  // Extract added classes relevant to tracking
  const classMatch = newStr.match(/className="([^"]+)"/);
  const addedClasses = classMatch
    ? classMatch[1].split(' ').filter(c => c.startsWith('js-') || c.startsWith('data-'))
    : [];

  // Normalize file path
  const file = filePath.replace(/\\/g, '/');

  return { file, elementText, addedId, addedClasses };
}

function extractElementText(str: string): string {
  // Try to get inner text of the element
  const innerText = str.match(/>([^<>{}\n]{2,60})</);
  if (innerText) return innerText[1].trim();

  // Fallback: look for value or aria-label
  const valueMatch = str.match(/(?:value|aria-label|placeholder)="([^"]{2,60})"/);
  if (valueMatch) return valueMatch[1];

  // Last resort: first meaningful string in the code
  const words = str.replace(/<[^>]+>/g, ' ').replace(/[{}"']/g, ' ').trim();
  const first = words.split(/\s+/).filter(w => w.length > 2).slice(0, 4).join(' ');
  return first || 'element';
}

export interface GtmCreatedResources {
  variablesCreated: number;
  triggersCreated: number;
  tagsCreated: number;
  versionId: string | null;
  published: boolean;
  eventsImplemented: string[];
  filesModified: number;
}

/**
 * Parse GTM creation counts and implementation results directly from the output log.
 * Looks at the final `{"type":"result"}` block which contains Claude's full summary.
 */
export function parseImplementationResult(outputLog: string): GtmCreatedResources | null {
  const lines = outputLog.split('\n').filter(l => l.trim());
  let resultText: string | null = null;

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (obj.type === 'result' && typeof obj.result === 'string') {
        resultText = obj.result as string;
      }
    } catch { /* skip malformed lines */ }
  }

  if (!resultText) return null;

  // Strip markdown fences if present
  const stripped = resultText.replace(/^```json\s*/m, '').replace(/\s*```\s*$/m, '').trim();
  // Find the outermost JSON object
  const start = stripped.indexOf('{');
  if (start === -1) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start)) as Record<string, unknown>;
    const gtm = parsed.gtmResources as Record<string, unknown> | undefined;
    if (!gtm) return null;

    return {
      variablesCreated: Number(gtm.variablesCreated ?? 0),
      triggersCreated: Number(gtm.triggersCreated ?? 0),
      tagsCreated: Number(gtm.tagsCreated ?? 0),
      versionId: gtm.versionId ? String(gtm.versionId) : null,
      published: Boolean(gtm.published ?? false),
      eventsImplemented: Array.isArray(parsed.eventsImplemented) ? (parsed.eventsImplemented as string[]) : [],
      filesModified: Number(parsed.filesModified ?? 0),
    };
  } catch {
    return null;
  }
}

export function getSkillRun(skillRunId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM skill_runs WHERE id = ?').get(skillRunId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const edits = row.output_log ? parseRunEdits(row.output_log as string) : null;

  // For audit runs, attach the stored audit report from session_outputs
  let auditReport: unknown = null;
  if (row.skill_name === 'gtm-analytics-audit' && row.session_id) {
    const outputRow = db.prepare('SELECT output_json FROM session_outputs WHERE session_id = ? AND skill_name = ?')
      .get(row.session_id, 'gtm-analytics-audit') as { output_json: string } | undefined;
    if (outputRow) {
      try { auditReport = JSON.parse(outputRow.output_json); } catch { /* ignore */ }
    }
  }

  return { ...row, edits, auditReport };
}
