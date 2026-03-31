import { spawn, execFileSync } from 'child_process';
import type { Adapter, AdapterContext, AdapterResult, AdapterEnvironmentResult } from './types.js';

export const openCodeAdapter: Adapter = {
  type: 'opencode',
  label: 'OpenCode',
  supportsSessionResume: true,

  async testEnvironment(): Promise<AdapterEnvironmentResult> {
    try {
      const out = execFileSync('opencode', ['--version'], { timeout: 5000, encoding: 'utf-8' });
      return { ok: true, message: `OpenCode found: ${out.trim()}` };
    } catch {
      return { ok: false, message: 'opencode CLI not found. Install with: npm install -g opencode-ai' };
    }
  },

  execute(ctx: AdapterContext): Promise<AdapterResult> {
    return new Promise((resolve, reject) => {
      // opencode run [message..] --format json [--session <id>]
      // Session resume uses: --session <sessionId>
      const args = ['run', '--format', 'json'];

      if (ctx.sessionId) {
        args.push('--session', ctx.sessionId);
      }

      // Pass prompt as positional arg (message)
      args.push(ctx.prompt);

      let outputText = '';
      let buffer = '';
      let stderrLog = '';
      let sessionId: string | undefined = ctx.sessionId ?? undefined;
      let inputTokens = 0;
      let outputTokens = 0;
      let model = '';

      const proc = spawn('opencode', args, {
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

            // Session ID — opencode emits this in session-related events
            if (!sessionId) {
              const sid = (event.session_id ?? event.sessionID ?? event.id) as string | undefined;
              if (sid && (evType === 'session' || evType === 'session.created' || evType === 'session.updated')) {
                sessionId = sid;
                ctx.onMeta({ sessionId });
              }
            }

            // Emitted on every event — pick up session from any event that carries it
            if (!sessionId && event.session_id) {
              sessionId = event.session_id as string;
              ctx.onMeta({ sessionId });
            }

            // Text output
            if (evType === 'assistant' || evType === 'message') {
              const content = event.content as Array<Record<string, unknown>> | string | undefined;
              if (typeof content === 'string') {
                ctx.onChunk(content);
              } else if (Array.isArray(content)) {
                for (const block of content) {
                  if (block.type === 'text' && typeof block.text === 'string') {
                    ctx.onChunk(block.text);
                  }
                  if (block.type === 'tool_use') {
                    const toolName = (block.name ?? block.tool ?? '') as string;
                    const input = (block.input ?? {}) as Record<string, unknown>;
                    if (toolName) ctx.onActivity({ type: 'tool_use', tool: toolName, label: toolName, input });
                  }
                }
              }
            }

            if (evType === 'text' || evType === 'text_delta' || evType === 'delta') {
              const text = (event.delta ?? event.text ?? event.content) as string | undefined;
              if (typeof text === 'string' && text) ctx.onChunk(text);
            }

            if (evType === 'tool_call' || evType === 'tool_use') {
              const toolName = (event.name ?? event.tool ?? '') as string;
              const input = (event.input ?? event.arguments ?? {}) as Record<string, unknown>;
              if (toolName) ctx.onActivity({ type: 'tool_use', tool: toolName, label: toolName, input });
            }

            if (evType === 'tool_result') {
              const toolName = (event.name ?? event.tool ?? '') as string;
              if (toolName) ctx.onActivity({ type: 'tool_result', tool: toolName, label: `Done: ${toolName}` });
            }

            if (evType === 'usage' || evType === 'metrics') {
              inputTokens = (event.input_tokens ?? event.prompt_tokens ?? inputTokens) as number;
              outputTokens = (event.output_tokens ?? event.completion_tokens ?? outputTokens) as number;
              ctx.onMeta({ inputTokens, outputTokens });
            }

            if (!model && (evType === 'model' || event.model)) {
              model = (event.model ?? '') as string;
              if (model) ctx.onMeta({ model });
            }

            if (evType === 'init' || evType === 'start') {
              ctx.onActivity({ type: 'tool_use', tool: 'system', label: 'OpenCode starting up...' });
            }
          } catch {
            // plain text fallback
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
          ? 'opencode CLI not found. Install with: npm install -g opencode-ai'
          : err.message;
        reject(new Error(errorMessage));
      });
    });
  },
};
