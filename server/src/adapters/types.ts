export interface ActivityEvent {
  type: 'tool_use' | 'tool_result';
  tool: string;
  label: string;
  input?: Record<string, unknown>;
}

export interface AdapterMeta {
  sessionId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface AdapterContext {
  skillName: string;
  prompt: string;
  sessionId?: string | null;
  workspacePath: string;
  /** system prompt content to inject (skill SKILL.md) */
  systemPromptFile?: string;
  onChunk: (text: string) => void;
  onActivity: (event: ActivityEvent) => void;
  onMeta: (meta: AdapterMeta) => void;
  signal?: AbortSignal;
}

export interface AdapterResult {
  sessionId?: string;
  exitCode: number;
  timedOut: boolean;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
  errorMessage?: string;
  outputText: string;
}

export interface AdapterEnvironmentResult {
  ok: boolean;
  message: string;
}

export interface Adapter {
  type: string;
  label: string;
  supportsSessionResume: boolean;
  execute(ctx: AdapterContext): Promise<AdapterResult>;
  testEnvironment(): Promise<AdapterEnvironmentResult>;
}
