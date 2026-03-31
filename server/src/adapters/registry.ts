import { claudeCodeAdapter } from './claude-code.js';
import { openCodeAdapter } from './opencode.js';
import { geminiAdapter } from './gemini.js';
import type { Adapter } from './types.js';

const ADAPTERS: Record<string, Adapter> = {
  claude_code: claudeCodeAdapter,
  opencode: openCodeAdapter,
  gemini: geminiAdapter,
};

export const ADAPTER_LIST = Object.values(ADAPTERS).map((a) => ({
  type: a.type,
  label: a.label,
  supportsSessionResume: a.supportsSessionResume,
}));

export function getAdapter(type: string): Adapter {
  const adapter = ADAPTERS[type];
  if (!adapter) {
    throw new Error(`Unknown adapter type: "${type}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
  }
  return adapter;
}

export function getAdapterOrDefault(type: string | null | undefined): Adapter {
  if (!type) return claudeCodeAdapter;
  return ADAPTERS[type] ?? claudeCodeAdapter;
}
