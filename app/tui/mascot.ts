import type { MascotMode } from "./types.ts";
import { padEndVisible } from "./ansi.ts";

const SPRITE_DISPLAY_WIDTH = 14;

const HEAD = "  ／l、";
const BODY = "  l  ~ヽ";
const FEET = "  じしf_,)ノ";

function faceLine(eyeLeft: string, eyeRight: string): string {
  return `（${eyeLeft}､ ${eyeRight} ７`;
}

function buildSprite(eyeLeft: string, eyeRight: string): string[] {
  return [HEAD, faceLine(eyeLeft, eyeRight), BODY, FEET].map((line) =>
    padEndVisible(line, SPRITE_DISPLAY_WIDTH),
  );
}

function framesFromEyes(
  eyes: ReadonlyArray<readonly [string, string]>,
): string[][] {
  return eyes.map(([left, right]) => buildSprite(left, right));
}

const IDLE_FRAMES = framesFromEyes([
  ["ﾟ", "｡"],
  ["-", "-"],
]);

const THINKING_FRAMES = framesFromEyes([
  ["◔", "◑"],
  ["◑", "◔"],
  ["ﾟ", "｡"],
]);

const TOOL_FRAMES = framesFromEyes([
  ["O", "O"],
  ["ﾟ", "｡"],
]);

const FRAME_HOLDS: Record<MascotMode, number[]> = {
  idle: [18, 2],
  thinking: [6, 6, 6],
  tool: [5, 5],
  error: [1],
};

function centerX(stageWidth: number): number {
  return Math.max(0, Math.floor(stageWidth / 2) - Math.ceil(SPRITE_DISPLAY_WIDTH / 2));
}

function framesForMode(mode: MascotMode): string[][] {
  if (mode === "idle") {
    return IDLE_FRAMES;
  }

  if (mode === "thinking") {
    return THINKING_FRAMES;
  }

  if (mode === "tool") {
    return TOOL_FRAMES;
  }

  return [buildSprite("×", "×")];
}

export class Mascot {
  x = 0;
  frame = 0;
  holdTicks = 0;
  mode: MascotMode = "idle";

  setMode(mode: MascotMode): void {
    if (this.mode !== mode) {
      this.frame = 0;
      this.holdTicks = 0;
    }

    this.mode = mode;
  }

  tick(stageWidth: number): void {
    this.x = centerX(stageWidth);

    const frames = framesForMode(this.mode);
    const holds = FRAME_HOLDS[this.mode];
    const hold = holds[this.frame % holds.length] ?? 1;

    this.holdTicks++;
    if (this.holdTicks < hold) {
      return;
    }

    this.holdTicks = 0;
    this.frame = (this.frame + 1) % frames.length;
  }

  getSpriteLines(): string[] {
    const frames = framesForMode(this.mode);
    return frames[this.frame % frames.length] ?? frames[0]!;
  }

  getShakeOffset(): number {
    return 0;
  }
}

export { SPRITE_DISPLAY_WIDTH as SPRITE_WIDTH };
