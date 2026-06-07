import {
  createFileChangeApproverWithUi,
  type FileChangeDecision,
  type FileChangeRequest,
} from "../editApproval.ts";
import { openFileInEditor } from "../openInEditor.ts";
import type { TuiScreen } from "./screen.ts";

function createTuiApprovalUi(
  screen: TuiScreen,
  getSignal: () => AbortSignal | undefined,
) {
  return {
    beginReview() {
      screen.setStatus("");
      screen.setMascotMode("tool");
    },
    show(text: string) {
      screen.setEphemeralPanel(text);
    },
    ask(prompt: string) {
      return screen.readUserLine({ prompt }).then((answer) => {
        if (answer === null || getSignal()?.aborted) {
          throw new Error("cancelled");
        }

        return answer.trim();
      });
    },
    isCancelled() {
      return getSignal()?.aborted ?? false;
    },
    openInEditor(filePath: string, startLine: number) {
      return openFileInEditor(filePath, startLine);
    },
  };
}

export function createTuiFileChangeApprover(
  screen: TuiScreen,
  getSignal: () => AbortSignal | undefined,
) {
  const approve = createFileChangeApproverWithUi(
    createTuiApprovalUi(screen, getSignal),
  );

  return async (
    request: FileChangeRequest,
  ): Promise<FileChangeDecision> => {
    try {
      return await approve(request);
    } finally {
      screen.setEphemeralPanel(null);
      screen.setMascotMode("idle");
      screen.setStatus("");
    }
  };
}
