import type { MascotMode } from "./types.ts";

const SPRITE_WIDTH = 9;

const FRAMES: string[][] = [
  [
    "  ▄▀▀▀▄  ",
    " ▐ ● ● ▌ ",
    "  ▀▄▄▄▀   ",
  ],
  [
    "  ▄▀▀▀▄  ",
    " ▐ ● ● ▌ ",
    "  ▀▀ ▀▀   ",
  ],
  [
    "  ▄▀▀▀▄  ",
    " ▐ ◐ ◑ ▌ ",
    "  ▀▄▄▄▀   ",
  ],
  [
    "  ▄▀▀▀▄  ",
    " ▐ × × ▌ ",
    "  ▀▄▄▄▀   ",
  ],
];

export class Mascot {
  x = 2;
  direction = 1;
  frame = 0;
  shake = 0;
  mode: MascotMode = "idle";

  setMode(mode: MascotMode): void {
    this.mode = mode;
  }

  tick(stageWidth: number): void {
    if (this.mode === "idle") {
      this.x += this.direction;
      const maxX = Math.max(1, stageWidth - SPRITE_WIDTH - 1);

      if (this.x <= 1 || this.x >= maxX) {
        this.direction *= -1;
        this.x = Math.min(Math.max(this.x, 1), maxX);
      }

      this.frame = (this.frame + 1) % 2;
      return;
    }

    if (this.mode === "thinking") {
      this.x = Math.max(1, Math.floor(stageWidth / 2) - 4);
      this.frame = (this.frame + 1) % 3;
      return;
    }

    if (this.mode === "tool") {
      this.x += this.direction * 2;
      const maxX = Math.max(1, stageWidth - SPRITE_WIDTH - 1);

      if (this.x <= 1 || this.x >= maxX) {
        this.direction *= -1;
        this.x = Math.min(Math.max(this.x, 1), maxX);
      }

      this.frame = (this.frame + 1) % 2;
      return;
    }

    if (this.mode === "error") {
      this.shake = (this.shake + 1) % 4;
      this.x = Math.max(
        1,
        Math.floor(stageWidth / 2) - 4 + (this.shake % 2 === 0 ? -1 : 1),
      );
      this.frame = 3;
    }
  }

  getSpriteLines(): string[] {
    return FRAMES[this.frame % FRAMES.length] ?? FRAMES[0]!;
  }

  getShakeOffset(): number {
    if (this.mode !== "error") {
      return 0;
    }

    return this.shake % 2 === 0 ? -1 : 1;
  }
}

export { SPRITE_WIDTH };
