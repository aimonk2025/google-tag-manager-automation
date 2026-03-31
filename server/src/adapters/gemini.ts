import { spawn, execFileSync } from 'child_process';
import type { Adapter, AdapterContext, AdapterResult, AdapterEnvironmentResult } from './types.js';

export const geminiAdapter: Adapter = {
  type: 'gemini',
  label: 'Gemini CLI',
  supportsSessionResume: true,

  async testEnvironment(): Promise<AdapterEnvironmentResult> {
    try {
      const out = execFileSync('gemini', ['--version'], { timeout: 5000, encoding: 'utf-8' });
      return { ok: true, message: `Gemini CLI found: ${out.trim()}` };
    } catch {
      return { ok: false, message: 'gemini CLI not found. Install with: npm install -g @google/gemini-cli' };
    }
  },

  execute(ctx: AdapterContext): Promise<AdapterResult> {
    return new Promise((resolve, reject) => {
      // gemini --output-format stream-json --yolo -p <prompt> [--resume <sessionId>]
      // --resume accepts a session ID or "latest"
      // stream-json format emits structured JSON lines (same format as Claude Code)
      const args = [
        '--output-format', 'stream-json',
        '--yolo',
        '-p', ctx.prompt,
      ];

      if (ctx.sessionId) {
        args.push('--resume', ctx.sessionId);
      }

      let outputText = '';
      let buffer = '';
      let stderrLog = '';
      let sessionId: string | undefined = ctx.sessionId ?? undefined;
      let inputTokens = 0;
      let outputTokens = 0;
      let model = '';

      ctx.onActivity({ type: 'tool_use', tool: 'system', label: 'Gemini CLI starting up...' });

      const proc = spawn('gemini', args, {
        cwd: ctx.workspacePath,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });

      if (ctx.signal) {
        ctx.signal.addEventListener('abort', () => proc.kill('SIGTERM'));
      }

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
            const evType = (event.type ?? event.event) as string | undefined;

            // Capture session ID — Gemini emits it in system/init or metadata events
            if (!sessionId) {
              const sid = (event.session_id ?? event.sessionId ?? event.id) as string | undefined;
              if (sid && (evType === 'system' || evType === 'session' || evType === 'init' || evType === 'metadata')) {
                sessionId = sid;
                ctx.onMeta({ sessionId });
              }
            }

            // Also check any event that carries session_id
            if (!sessionId && event.session_id) {
              sessionId = event.session_id as string;
              ctx.onMeta({ sessionId });
            }

            // System init event (same shape as Claude's stream-json)
            if (evType === 'system') {
              const subtype = event.subtype as string | undefined;
              if (subtype === 'init') {
                model = (event.model as string | undefined) ?? '';
                if (model) ctx.onMeta({ model });
                const sid = event.session_id as string | undefined;
                if (sid) { sessionId = sid; ctx.onMeta({ sessionId }); }
                ctx.onActivity({ type: 'tool_use', tool: 'system', label: 'Gemini CLI initialised' });
              }
            }

            // Assistant text (stream-json format mirrors Claude's shape)
            if (evType === 'assistant') {
              const msg = event.message as Record<string, unknown> | undefined;
              const content = msg?.content as Array<Record<string, unknown>> | string | undefined;
              if (typeof content === 'string') {
                ctx.onChunk(content);
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    ctx.onChunk(block.text);
                  }
                  if (block.type === 'tool_use') {
                    const toolName = (block.name ?? '') as string;
                    const input = (block.input ?? {}) as Record<string, unknown>;
                    if (toolName) ctx.onActivity({ type: 'tool_use', tool: toolName, label: toolName, input });
                  }
                }
              }
            }

            // Streaming text delta
            if (evType === 'text' || evType === 'text_delta' || evType === 'delta') {
              const text = (event.delta ?? event.text ?? event.content) as string | undefined;
              if (typeof text === 'string' && text) ctx.onChunk(text);
            }

            // Tool use
            if (evType === 'tool_use') {
              const toolName = (event.name ?? event.tool ?? '') as string;
              const input = (event.input ?? {}) as Record<string, unknown>;
              if (toolName) ctx.onActivity({ type: 'tool_use', tool: toolName, label: toolName, input });
            }

            // Tool result
            if (evType === 'tool_result') {
              const toolName = (event.tool_name ?? event.tool ?? '') as string;
              if (toolName) ctx.onActivity({ type: 'tool_result', tool: toolName, label: `Done: ${toolName}` });
            }

            // Result / completion event — contains usage
            if (evType === 'result') {
              const usage = event.usage as Record<string, unknown> | undefined;
              if (usage) {
                inputTokens = (usage.input_tokens as number | undefined) ?? 0;
                outputTokens = (usage.output_tokens as number | undefined) ?? 0;
                const costUsd = (event.total_cost_usd as number | undefined) ?? 0;
                ctx.onMeta({ inputTokens, outputTokens, costUsd });
              }
              // Gemini may embed session_id in the result event
              const sid = event.session_id as string | undefined;
              if (sid && !sessionId) { sessionId = sid; ctx.onMeta({ sessionId }); }
            }
          } catch {
            // Not JSON — plain text line, stream as-is
            ctx.onChunk(trimmed + '\n');
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrLog += chunk.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 || sessionId) {
          resolve({
            sessionId,
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
        const errorMessage = err.message.includes('ENOENT')
          ? 'gemini CLI not found. Install with: npm install -g @google/gemini-cli'
          : err.message;
        reject(new Error(errorMessage));
      });
    });
  },
};
