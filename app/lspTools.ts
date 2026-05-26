import path from "node:path";
import ts from "typescript";
import { resolveWithinProject } from "./pathSecurity.ts";

type PositionArgs = {
  file_path: string;
  line: number;
  column: number;
};

let languageService: ts.LanguageService | null = null;
let projectFiles: string[] = [];

function getLanguageService(): ts.LanguageService {
  if (languageService) {
    return languageService;
  }

  const cwd = process.cwd();
  const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, "tsconfig.json");

  if (!configPath) {
    throw new Error("tsconfig.json not found in project root");
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  );

  projectFiles = parsed.fileNames;

  const host: ts.LanguageServiceHost = {
    getScriptFileNames: () => projectFiles,
    getScriptVersion: () => "1",
    getScriptSnapshot: (fileName) => {
      if (!ts.sys.fileExists(fileName)) {
        return undefined;
      }

      return ts.ScriptSnapshot.fromString(ts.sys.readFile(fileName)!);
    },
    getCurrentDirectory: () => cwd,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
  };

  languageService = ts.createLanguageService(
    host,
    ts.createDocumentRegistry(),
  );

  return languageService;
}

function resolveFilePath(filePath: string): string {
  const absPath = resolveWithinProject(process.cwd(), filePath);
  const normalized = absPath.replace(/\\/g, "/").toLowerCase();
  const match = projectFiles.find(
    (file) => file.replace(/\\/g, "/").toLowerCase() === normalized,
  );

  if (match) {
    return match;
  }

  if (ts.sys.fileExists(absPath)) {
    return absPath.replace(/\\/g, "/");
  }

  throw new Error(`File not found: ${filePath}`);
}

function toOffset(filePath: string, line: number, column: number): number {
  const content = ts.sys.readFile(filePath);

  if (!content) {
    throw new Error(`File not found: ${filePath}`);
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const lineStarts = sourceFile.getLineStarts();
  const lineCount = lineStarts.length;

  if (line < 1 || line > lineCount) {
    throw new Error(`Line ${line} is out of range (file has ${lineCount} lines)`);
  }

  const lineStart = lineStarts[line - 1]!;
  const lineEnd = line < lineCount ? lineStarts[line]! : sourceFile.getEnd();
  const lineLength = lineEnd - lineStart;
  const safeColumn = Math.min(Math.max(column, 1), lineLength + 1);

  return lineStart + safeColumn - 1;
}

function formatLocation(fileName: string, position: number): string {
  const content = ts.sys.readFile(fileName);

  if (!content) {
    return fileName;
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const { line, character } = ts.getLineAndCharacterOfPosition(
    sourceFile,
    position,
  );

  return `${path.relative(process.cwd(), fileName)}:${line + 1}:${character + 1}`;
}

function formatDiagnostics(diagnostics: ts.Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "No diagnostics.";
  }

  return diagnostics
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n",
      );

      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line, character } = ts.getLineAndCharacterOfPosition(
          diagnostic.file,
          diagnostic.start,
        );
        const fileName = path.relative(
          process.cwd(),
          diagnostic.file.fileName,
        );
        const severity =
          diagnostic.category === ts.DiagnosticCategory.Error
            ? "error"
            : diagnostic.category === ts.DiagnosticCategory.Warning
              ? "warning"
              : "info";

        return `${fileName}:${line + 1}:${character + 1} [${severity}] ${message}`;
      }

      return message;
    })
    .join("\n");
}

export function goToDefinition(args: PositionArgs): string {
  const service = getLanguageService();
  const filePath = resolveFilePath(args.file_path);
  const offset = toOffset(filePath, args.line, args.column);
  const definitions = service.getDefinitionAtPosition(filePath, offset);

  if (!definitions?.length) {
    return "No definition found.";
  }

  return definitions
    .map((definition) =>
      formatLocation(definition.fileName, definition.textSpan.start),
    )
    .join("\n");
}

export function findReferences(args: PositionArgs): string {
  const service = getLanguageService();
  const filePath = resolveFilePath(args.file_path);
  const offset = toOffset(filePath, args.line, args.column);
  const references = service.getReferencesAtPosition(filePath, offset);

  if (!references?.length) {
    return "No references found.";
  }

  return references
    .map((reference: ts.ReferenceEntry) =>
      formatLocation(reference.fileName, reference.textSpan.start),
    )
    .join("\n");
}

export function getDiagnostics(filePath?: string): string {
  const service = getLanguageService();

  if (filePath) {
    const absPath = resolveFilePath(filePath);
    const diagnostics = [
      ...service.getSyntacticDiagnostics(absPath),
      ...service.getSemanticDiagnostics(absPath),
    ];

    return formatDiagnostics(diagnostics);
  }

  const diagnostics = projectFiles.flatMap((file) => [
    ...service.getSyntacticDiagnostics(file),
    ...service.getSemanticDiagnostics(file),
  ]);

  return formatDiagnostics(diagnostics);
}
