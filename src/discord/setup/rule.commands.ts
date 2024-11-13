import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { Injectable } from '@nestjs/common';
import { EmbedBuilder, TextChannel, PermissionFlagsBits } from 'discord.js';

@Injectable()
@Command({
  name: 'send-welcome-rules',
  description: 'Send the welcome message with server rules (Admin only)',
})
export class SendWelcomeRulesCommand {
  @Handler()
  async onSendWelcomeRules(
    @InteractionEvent() interaction: any,
  ): Promise<void> {
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true,
      });
      return;
    }

    const rulesEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Welcome to Our Server!')
      .setDescription('Please read and follow these rules:')
      .addFields(
        { name: 'Rule 1', value: 'Be respectful to all members.' },
        { name: 'Rule 2', value: 'No spamming or excessive self-promotion.' },
        { name: 'Rule 3', value: 'Keep discussions in appropriate channels.' },
        { name: 'Rule 4', value: 'No NSFW content.' },
        { name: 'Rule 5', value: "Follow Discord's Terms of Service." },
      )
      .setFooter({
        text: 'Failure to comply with these rules may result in warnings or bans.',
      });

    const channel = interaction.channel as TextChannel;
    await channel.send({ embeds: [rulesEmbed] });
    await interaction.reply({
      content: 'Welcome message with rules sent successfully!',
      ephemeral: true,
    });
  }
}
