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