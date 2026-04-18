import OpenAI from "openai";

export type ApiConfig = {
  client: OpenAI;
  model: string;
  provider: "groq" | "openrouter";
};
