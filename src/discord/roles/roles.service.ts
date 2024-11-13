import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from 'src/drizzle/drizzle.decorator';
import { DrizzleDB } from 'src/drizzle/types/drizzle';
import { roles } from 'src/drizzle/schema/roles.schema';
import { channels } from 'src/drizzle/schema/channel.schema';
import { eq } from 'drizzle-orm';
import { ChannelMessage } from './channel-message.interface';

@Injectable()
export class RolesService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async upsertRole(
    name: string,
    discordId: string,
    type: number,
  ): Promise<void> {
    const existingRole = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, name))
      .execute();

    if (existingRole.length > 0) {
      await this.db
        .update(roles)
        .set({ discordId, type })
        .where(eq(roles.name, name))
        .execute();
    } else {
      await this.db.insert(roles).values({ name, discordId, type }).execute();
    }
  }

  async getRoleByDiscordId(discordId: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.discordId, discordId))
      .limit(1);
    return role;
  }

  async getRoleById(id: number) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);
    return role;
  }

  async getRoleByName(name: string) {
    const [role] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.name, name))
      .limit(1);
    return role;
  }

  async createChannel(
    discordId: string,
    name: string,
    type: number,
    noTalk: boolean = false,
  ): Promise<void> {
    await this.db.insert(channels).values({
      discordId,
      name,
      type,
      noTalk,
      messages: JSON.stringify([]),
    });
  }

  async upsertChannel(
    discordId: string,
    name: string,
    type: number,
    noTalk: boolean = false,
  ): Promise<void> {
    const existingChannel = await this.db
      .select()
      .from(channels)
      .where(eq(channels.discordId, discordId))
      .limit(1);

    if (existingChannel.length > 0) {
      await this.db
        .update(channels)
        .set({ name, type, noTalk })
        .where(eq(channels.discordId, discordId))
        .execute();
    } else {
      await this.db
        .insert(channels)
        .values({
          discordId,
          name,
          type,
          noTalk,
          messages: JSON.stringify([]),
        })
        .execute();
    }
  }

  async createRole(name: string, type: number): Promise<any> {
    const [role] = await this.db
      .insert(roles)
      .values({ name, type, discordId: '' })
      .returning();
    return role;
  }

  async getCommandChannel() {
    const [commandChannel] = await this.db
      .select()
      .from(channels)
      .where(eq(channels.name, 'command'))
      .limit(1);
    return commandChannel;
  }

  async addChannelMessage(
    channelId: string,
    message: ChannelMessage,
  ): Promise<void> {
    const channel = await this.getChannelByDiscordId(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const updatedMessages = [...channel.messages, message];

    await this.db
      .update(channels)
      .set({ messages: JSON.stringify(updatedMessages) })
      .where(eq(channels.discordId, channelId))
      .execute();
  }

  async updateChannelMessage(
    channelId: string,
    messageId: string,
    updatedMessage: Partial<ChannelMessage>,
  ): Promise<void> {
    const channel = await this.getChannelByDiscordId(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const updatedMessages = JSON.parse(channel.messages).map((msg) =>
      msg.id === messageId ? { ...msg, ...updatedMessage } : msg,
    );

    await this.db
      .update(channels)
      .set({ messages: JSON.stringify(updatedMessages) })
      .where(eq(channels.discordId, channelId))
      .execute();
  }

  async getChannelByDiscordId(discordId: string) {
    const [channel] = await this.db
      .select()
      .from(channels)
      .where(eq(channels.discordId, discordId))
      .limit(1);

    return channel;
  }

  async updateChannelMessages(
    channelId: string,
    messages: ChannelMessage[],
  ): Promise<void> {
    await this.db
      .update(channels)
      .set({ messages: JSON.stringify(messages) })
      .where(eq(channels.discordId, channelId))
      .execute();
  }

  async getChannelByName(name: string) {
    const [channel] = await this.db
      .select()
      .from(channels)
      .where(eq(channels.name, name))
      .limit(1);

    return channel;
  }
}
