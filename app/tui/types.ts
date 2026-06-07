export type TranscriptEntry = {
  role: "you" | "assistant" | "system";
  text: string;
};

export type MascotMode = "idle" | "thinking" | "tool" | "error";
