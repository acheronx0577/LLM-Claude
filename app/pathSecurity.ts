import path from "node:path";

// fallow-ignore-file security-sink

const MAX_USER_PATH_LENGTH = 4096;

class PathSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathSecurityError";
  }
}

/** Reject traversal, null bytes, and absurdly long paths from tool/user input. */
function assertSafeRelativePath(userPath: string): void {
  if (!userPath || typeof userPath !== "string") {
    throw new PathSecurityError("Path is required");
  }

  if (userPath.length > MAX_USER_PATH_LENGTH) {
    throw new PathSecurityError("Path is too long");
  }

  if (userPath.includes("\0")) {
    throw new PathSecurityError("Path contains invalid characters");
  }

  if (path.isAbsolute(userPath)) {
    return;
  }

  const normalized = userPath.replace(/\\/g, "/");
  const segments = normalized.split("/");

  for (const segment of segments) {
    if (segment === "..") {
      throw new PathSecurityError("Path must not contain '..'");
    }
  }
}

/** Resolve a user/tool path and ensure it stays inside the project root. */
export function resolveWithinProject(
  projectRoot: string,
  userPath: string,
): string {
  assertSafeRelativePath(userPath);

  const root = path.resolve(projectRoot);
  const resolved = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(root, userPath);

  if (!isPathInsideRoot(resolved, root)) {
    throw new PathSecurityError(`Path escapes project root: ${userPath}`);
  }

  return resolved;
}

function isPathInsideRoot(resolved: string, root: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(resolved);
  const relative = path.relative(normalizedRoot, normalizedTarget);

  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve MCP config path — absolute env paths are admin-controlled; relative paths stay in-repo. */
export function resolveMcpConfigPath(
  projectRoot: string,
  configPath?: string,
): string {
  const chosen = configPath ?? process.env.MCP_CONFIG ?? "mcp.json";

  if (path.isAbsolute(chosen)) {
    return path.resolve(chosen);
  }

  return resolveWithinProject(projectRoot, chosen);
}

/** Build a path under a trusted base using literal segments only. */
export function joinUnderTrustedBase(
  base: string,
  ...segments: readonly string[]
): string {
  const resolved = path.resolve(base, ...segments);

  if (!isPathInsideRoot(resolved, base)) {
    throw new PathSecurityError("Trusted base path escape");
  }

  return resolved;
}

/** Allow the Cursor CLI shim name or an existing editor binary path. */
export function assertSafeEditorCommand(command: string): void {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new PathSecurityError("Editor command is empty");
  }

  if (trimmed === "cursor") {
    return;
  }

  if (/[\0\r\n&|;<>$`"'()]/.test(trimmed)) {
    throw new PathSecurityError("Editor command contains unsafe characters");
  }

  if (!path.isAbsolute(trimmed)) {
    throw new PathSecurityError("Editor command must be absolute or 'cursor'");
  }
}
