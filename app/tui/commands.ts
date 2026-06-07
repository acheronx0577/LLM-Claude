export type SlashCommand = {
  name: string;
  aliases?: string;
  description: string;
  action: "clear" | "exit" | "help" | "tools" | "plain-info";
};

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "/clear",
    aliases: "reset, new",
    description: "Clear conversation history and start fresh",
    action: "clear",
  },
  {
    name: "/help",
    description: "Show available slash commands",
    action: "help",
  },
  {
    name: "/tools",
    description: "List built-in tools available in chat",
    action: "tools",
  },
  {
    name: "/exit",
    aliases: "quit",
    description: "Exit the interactive session",
    action: "exit",
  },
  {
    name: "/plain",
    description: "Tip: restart with --plain for classic line chat",
    action: "plain-info",
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized.startsWith("/")) {
    return [];
  }

  return SLASH_COMMANDS.filter((command) =>
    command.name.toLowerCase().startsWith(normalized),
  );
}

export function formatCommandLabel(command: SlashCommand): string {
  if (command.aliases) {
    return `${command.name} (${command.aliases})`;
  }

  return command.name;
}

export function findExactSlashCommand(input: string): SlashCommand | null {
  const token = input.trim().split(/\s+/)[0]?.toLowerCase();
  return SLASH_COMMANDS.find((command) => command.name === token) ?? null;
}
