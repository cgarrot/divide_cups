import { Message } from 'discord.js';

type CommandHandler = (message: Message) => Promise<void>;

interface Command {
  name: string;
  handler: CommandHandler;
  adminOnly: boolean;
  allowDM: boolean;
}

export class CommandProcessor {
  private commands: Command[] = [];

  constructor(private isAdminCheck: (userId: string) => Promise<boolean>) {}

  registerCommand(
    name: string,
    handler: CommandHandler,
    adminOnly: boolean = false,
    allowDM: boolean = false,
  ) {
    this.commands.push({ name, handler, adminOnly, allowDM });
  }

  async processMessage(message: Message): Promise<void> {
    const content = message.content.trim();
    const isAdmin = await this.isAdminCheck(message.author.id);

    for (const command of this.commands) {
      if (content.startsWith(`!${command.name}`)) {
        if (command.adminOnly && !isAdmin) {
          return;
        }
        await command.handler(message);
        return;
      }
    }
  }
}
