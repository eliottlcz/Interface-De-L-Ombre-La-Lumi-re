import "server-only";
export function isAiConfigured() { return Boolean(process.env.ANTHROPIC_API_KEY); }
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";
