import { EmbedBuilder, Message } from 'discord.js';

export function parseTeamCreationCommand(content: string): {
  teamName: string;
  mentionedUsers: string[];
} {
  const regex = /"([^"]+)"|(\S+)/g;
  const matches = content.match(regex);

  if (!matches) {
    throw new Error('Invalid command format');
  }

  const teamName = matches[2].replace(/"/g, '');
  const mentionedUsers = content.match(/<@!?(\d+)>/g) || [];

  return { teamName, mentionedUsers };
}

export function createTeamEmbed(
  teamName: string,
  owner: string,
  members: string[],
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Team "${teamName}" Created`)
    .setDescription(`Owner: <@${owner}>\nMembers: ${members.join(', ')}`)
    .setTimestamp();
}
