import OpenAI from "openai";

export type ApiConfig = {
  client: OpenAI;
  model: string;
  provider: "groq" | "openrouter";
};

export function loadApiConfig(): ApiConfig {
  const groqApiKey = process.env.GROQ_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const apiKey = groqApiKey ?? openRouterApiKey;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY or GROQ_API_KEY is not set");
  }

  if (groqApiKey) {
    return {
      provider: "groq",
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
      client: new OpenAI({
        apiKey: groqApiKey,
        baseURL: "https://api.groq.com/openai/v1",
      }),
    };
  }

  return {
    provider: "openrouter",
    model: "anthropic/claude-haiku-4.5",
    client: new OpenAI({
      apiKey: openRouterApiKey!,
      baseURL:
        process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    }),
  };
}
