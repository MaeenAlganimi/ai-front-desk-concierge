export type Args = Record<string, unknown>;
export type ToolCall = { name: string; args: Args };
export type ToolResult = Record<string, unknown>;
export type PendingAction = { calls: ToolCall[]; summary: string };
export type Trace = {
  id: string;
  conversation_id: string;
  turn: number;
  step: number;
  tool: string;
  args: Args;
  result: ToolResult;
  latency_ms: number;
  kind: "tool" | "guardrail" | "confirm";
  created_at?: string;
};
export type HistoryMessage = { role: string; content: string };
export type PlannerContext = {
  message: string;
  lang: "en" | "ar";
  customerId?: string;
  customerPhone?: string;
  history: HistoryMessage[];
  results: { call: ToolCall; result: ToolResult }[];
  today: string;
};
export type Plan = { calls?: ToolCall[]; reply?: string };
