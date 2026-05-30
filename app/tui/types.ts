export type TranscriptEntry = {
  role: "you" | "assistant" | "system";
  text: string;
  streaming?: boolean;
  /** Peach body text (errors, tool actions). */
  peach?: boolean;
};

export type MascotMode = "idle" | "thinking" | "tool" | "error";
