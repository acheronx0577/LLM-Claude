import type { MascotMode } from "./types.ts";
import { padEndVisible } from "./ansi.ts";

const SPRITE_DISPLAY_WIDTH = 14;

const HEAD = "  ／l、          ";
const BODY = "  l ~ ヽ        ";
const FEET = "  じしf_,)ノ      ";

function faceLine(eyeLeft: string, eyeRight: string): string {
  return `（${eyeLeft}､ ${eyeRight} ７`;
}

function buildSprite(eyeLeft: string, eyeRight: string): string[] {
  return [HEAD, faceLine(eyeLeft, eyeRight), BODY, FEET].map((line) =>
    padEndVisible(line, SPRITE_DISPLAY_WIDTH),
  );
}

const IDLE_OPEN = buildSprite("ﾟ", "｡");
const IDLE_BLINK = buildSprite("-", "-");
const ERROR_FACE = buildSprite("×", "×");

const IDLE_FRAMES = [IDLE_OPEN, IDLE_BLINK];
const IDLE_HOLDS = [18, 2];

function centerX(stageWidth: number): number {
  return Math.max(0, Math.floor(stageWidth / 2) - Math.ceil(SPRITE_DISPLAY_WIDTH / 2));
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

    if (this.mode !== "idle") {
      return;
    }

    const hold = IDLE_HOLDS[this.frame % IDLE_HOLDS.length] ?? 1;

    this.holdTicks++;
    if (this.holdTicks < hold) {
      return;
    }

    this.holdTicks = 0;
    this.frame = (this.frame + 1) % IDLE_FRAMES.length;
  }

  getSpriteLines(): string[] {
    if (this.mode === "error") {
      return ERROR_FACE;
    }

    if (this.mode !== "idle") {
      return IDLE_OPEN;
    }

    return IDLE_FRAMES[this.frame % IDLE_FRAMES.length] ?? IDLE_OPEN;
  }

  getShakeOffset(): number {
    return 0;
  }
}
