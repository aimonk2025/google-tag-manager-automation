import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Adapter, AdapterContext, AdapterResult, AdapterEnvironmentResult, ActivityEvent } from './types.js';

function labelForToolUse(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
    case 'read_file': {
      const p = (input.file_path ?? input.path ?? '') as string;
      return `Reading ${path.basename(p)}`;
    }
    case 'Write':
    case 'write_file': {
      const p = (input.file_path ?? input.path ?? '') as string;
      return `Writing ${path.basename(p)}`;
    }
    case 'Edit':
    case 'edit_file': {
      const p = (input.file_path ?? input.path ?? '') as string;
      return `Editing ${path.basename(p)}`;
    }
    case 'Glob':
    case 'glob': {
      const pattern = (input.pattern ?? '') as string;
      return `Scanning files: ${pattern}`;
    }
    case 'Grep':
    case 'grep': {
      const q = (input.pattern ?? input.query ?? '') as string;
      return `Searching: ${String(q).slice(0, 60)}`;
    }
    case 'Bash':
    case 'bash':
    case 'computer':
    case 'execute_command': {
      const cmd = (input.command ?? '') as string;
      return `Running: ${String(cmd).slice(0, 60)}`;
    }
    case 'WebSearch':
    case 'web_search': {
      const q = (input.query ?? '') as string;
      return `Searching web: ${q}`;
    }
    case 'WebFetch':
    case 'web_fetch':
      return 'Fetching web page';
    default:
      return toolName;
  }
}

export const claudeCodeAdapter: Adapter = {
  type: 'claude_code',
  label: 'Claude Code',
  supportsSessionResume: true,

  async testEnvironment(): Promise<AdapterEnvironmentResult> {
    try {
      const out = execFileSync('claude', ['--version'], { timeout: 5000, encoding: 'utf-8' });
      return { ok: true, message: `Claude Code found: ${out.trim()}` };
    } catch {
      return { ok: false, message: 'claude CLI not found. Install from https://claude.ai/code' };
    }
  },

  execute(ctx: AdapterContext): Promise<AdapterResult> {
    return new Promise((resolve, reject) => {
      const tmpFile = ctx.systemPromptFile ?? '';
      let ownTmpFile: string | null = null;

      // If caller didn't provide a tempfile, we write nothing (skill prompt injected via stdin only)
      const args = [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
      ];

      if (tmpFile) {
        args.push('--append-system-prompt-file', tmpFile);
      }

      if (ctx.sessionId) {
        args.push('--resume', ctx.sessionId);
      }

      let outputText = '';
      let buffer = '';
      let resolvedSessionId = ctx.sessionId ?? '';
      let stderrLog = '';
      let inputTokens = 0;
      let outputTokens = 0;
      let model = '';

      const proc = spawn('claude', args, {
        cwd: ctx.workspacePath,
        env: { ...process.env, TERM: 'dumb' },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      });

      if (ctx.signal) {
        ctx.signal.addEventListener('abort', () => {
          proc.kill('SIGTERM');
        });
      }

      proc.stdin.write(ctx.prompt + '\n');
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          outputText += line + '\n';

          try {
            const event = JSON.parse(trimmed) as Record<string, unknown>;

            if (typeof event.session_id === 'string' && event.session_id) {
              resolvedSessionId = event.session_id;
              ctx.onMeta({ sessionId: resolvedSessionId });
            }

            if (event.type === 'system') {
              const subtype = event.subtype as string | undefined;
              if (subtype === 'init') {
                model = (event.model as string | undefined) ?? '';
                if (model) ctx.onMeta({ model });
                ctx.onActivity({ type: 'tool_use', tool: 'system', label: 'Claude Code starting up...' });
              }
            }

            if (event.type === 'assistant') {
              const msg = event.message as Record<string, unknown> | undefined;
              const content = msg?.content as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    ctx.onChunk(block.text);
                  }
                  if (block.type === 'tool_use') {
                    const toolName = (block.name ?? block.tool ?? '') as string;
                    const input = (block.input ?? {}) as Record<string, unknown>;
                    ctx.onActivity({
                      type: 'tool_use',
                      tool: toolName,
                      label: labelForToolUse(toolName, input),
                      input,
                    });
                  }
                }
              }
            }

            if (event.type === 'tool_use') {
              const toolName = (event.name ?? event.tool ?? '') as string;
              const input = (event.input ?? {}) as Record<string, unknown>;
              if (toolName) {
                ctx.onActivity({
                  type: 'tool_use',
                  tool: toolName,
                  label: labelForToolUse(toolName, input),
                  input,
                });
              }
            }

            if (event.type === 'tool_result') {
              const toolName = (event.tool_name ?? event.tool ?? '') as string;
              if (toolName) {
                ctx.onActivity({
                  type: 'tool_result',
                  tool: toolName,
                  label: `Done: ${labelForToolUse(toolName, {})}`,
                });
              }
            }

            if (event.type === 'result') {
              const usage = event.usage as Record<string, unknown> | undefined;
              if (usage) {
                inputTokens = (usage.input_tokens as number | undefined) ?? 0;
                outputTokens = (usage.output_tokens as number | undefined) ?? 0;
                const costUsd = (event.total_cost_usd as number | undefined) ?? 0;
                ctx.onMeta({ inputTokens, outputTokens, costUsd });
              }
            }
          } catch {
            // not JSON, skip
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrLog += chunk.toString();
      });

      const cleanup = () => {
        if (ownTmpFile) {
          try { fs.unlinkSync(ownTmpFile); } catch { /* ignore */ }
        }
      };

      proc.on('close', (code) => {
        cleanup();
        if (code === 0 || resolvedSessionId) {
          resolve({
            sessionId: resolvedSessionId || undefined,
            exitCode: code ?? 0,
            timedOut: false,
            usage: inputTokens || outputTokens ? { inputTokens, outputTokens } : undefined,
            model: model || undefined,
            outputText,
          });
        } else {
          const errorMessage = stderrLog.trim() || `Process exited with code ${code}`;
          resolve({
            exitCode: code ?? 1,
            timedOut: false,
            errorMessage,
            outputText,
          });
        }
      });

      proc.on('error', (err) => {
        cleanup();
        const errorMessage = err.message.includes('ENOENT')
          ? 'claude CLI not found. Install Claude Code from claude.ai/code'
          : err.message;
        reject(new Error(errorMessage));
      });
    });
  },
};
