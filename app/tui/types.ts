export type TranscriptEntry = {
  role: "you" | "assistant" | "system";
  text: string;
  streaming?: boolean;
};

export type MascotMode = "idle" | "thinking" | "tool" | "error";
