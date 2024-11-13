import { Injectable } from '@nestjs/common';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Message,
  TextChannel,
  ChannelType,
  Guild,
} from 'discord.js';
import { CommandProcessor } from '../command-processor';
import { MatchService } from '../../match/match.service';
import { OpenAIService } from 'src/openai/openai.service';
import { ImageService } from '../../image/image.service';
import { UserService } from '../../user/user.service';
import { TeamService } from '../../team/team.service';
import { RolesService } from '../../roles/roles.service';
import { TournamentService } from '../../tournament/tournament.service';
import { QueueService } from 'src/queue/queue.service';
import { Match } from 'src/discord/match/match.interface';

@Injectable()
export class MatchCommands {
  constructor(
    private readonly matchService: MatchService,
    private readonly openAIService: OpenAIService,
    private readonly imageService: ImageService,
    private readonly userService: UserService,
    private readonly teamService: TeamService,
    private readonly rolesService: RolesService,
    private readonly tournamentService: TournamentService,
    private readonly queueService: QueueService,
  ) {}

  public async onVeto(message: Message): Promise<void> {
    const args = message.content.split(' ').slice(1);
    if (args.length !== 1) {
      await message.reply('Usage: !veto <matchId>');
      return;
    }

    const matchId = parseInt(args[0], 10);
    if (isNaN(matchId)) {
      await message.reply('Invalid match ID. Please provide a valid number.');
      return;
    }

    if (!message.channel.isTextBased()) {
      await message.reply('This command can only be used in text channels.');
      return;
    }

    const channel = message.channel as TextChannel;
    const match = await this.matchService.getMatchByChannelId(channel.id);
    if (!match) {
      await message.reply('This command can only be used in a match channel.');
      return;
    }

    const user = await this.userService.getUserByDiscordId(message.author.id);
    if (!user || !user.teamId) {
      await message.reply(
        'You must be a member of a team to use this command.',
      );
      return;
    }

    const team = await this.teamService.getTeamById(user.teamId);
    if (!team) {
      await message.reply('Your team could not be found.');
      return;
    }

    const teamRole = await this.rolesService.getRoleById(team.roleId);
    if (!teamRole) {
      await message.reply('Your team role could not be found.');
      return;
    }

    if (!message.member.roles.cache.has(teamRole.discordId)) {
      await message.reply(
        'You do not have the correct team role to use this command.',
      );
      return;
    }

    if (team.id !== match.team1Id && team.id !== match.team2Id) {
      await message.reply('Your team is not part of this match.');
      return;
    }

    try {
      await this.matchService.startVetoProcess(match.id, channel.id);
    } catch (error) {
      console.error('Error starting veto process:', error);
      await message.reply(
        'An error occurred while starting the veto process. Please try again later.',
      );
    }
  }

  public async onResCommand(message: Message): Promise<void> {
    const channel = message.channel as TextChannel;
    const match = await this.matchService.getMatchByChannelId(channel.id);
    if (!match) {
      await message.reply('This command can only be used in a match channel.');
      return;
    }

    if (match.status !== 'pending') {
      await message.reply('This match is not in progress.');
      return;
    }

    const attachment = message.attachments.first();
    if (!attachment) {
      await message.reply('Please attach an image to analyze.');
      return;
    }

    if (!message.channel.isTextBased()) {
      await message.reply('This command can only be used in text channels.');
      return;
    }

    const user = await this.userService.getUserByDiscordId(message.author.id);
    if (!user || !user.teamId) {
      await message.reply(
        'You must be a member of a team to use this command.',
      );
      return;
    }

    const team = await this.teamService.getTeamById(user.teamId);
    if (!team) {
      await message.reply('Your team could not be found.');
      return;
    }

    const teamRole = await this.rolesService.getRoleById(team.roleId);
    if (!teamRole) {
      await message.reply('Your team role could not be found.');
      return;
    }

    if (!message.member.roles.cache.has(teamRole.discordId)) {
      await message.reply(
        'You do not have the correct team role to use this command.',
      );
      return;
    }

    if (team.id !== match.team1Id && team.id !== match.team2Id) {
      await message.reply('Your team is not part of this match.');
      return;
    }

    try {
      // Save the image to the "result" channel
      const resultChannel = await this.getResultChannel(message.guild);
      if (!resultChannel) {
        await message.reply(
          'Result channel not found. Please contact an admin.',
        );
        return;
      }

      const resultMessage = await resultChannel.send({
        content: `Match ID: ${match.id}`,
        files: [attachment],
      });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('accept_result')
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('deny_result')
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger),
      );

      const opponentTeam =
        team.id === match.team1Id ? match.team2Id : match.team1Id;
      const opponentRole = await this.rolesService.getRoleById(
        (await this.teamService.getTeamById(opponentTeam)).roleId,
      );

      const resultEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('Match Result')
        .setDescription(
          `Match result submitted by ${message.author}. <@&${opponentRole.discordId}>, please review and accept or deny within 2 minutes.`,
        )
        .setImage(attachment.url)
        .setTimestamp();

      const reviewMessage = await channel.send({
        embeds: [resultEmbed],
        components: [row],
      });

      const buttonCollector = reviewMessage.createMessageComponentCollector({
        filter: (i) => i.user.id !== message.author.id, // Only allow the opponent to interact
        time: 120000, // 2 minutes timeout
      });

      let denyCount = 0;

      buttonCollector.on('collect', async (interaction) => {
        if (interaction.customId === 'accept_result') {
          buttonCollector.stop('accepted');
          await interaction.update({
            content: 'Result accepted!',
            components: [],
          });
          await this.processResult(match, attachment.url, channel);
        } else if (interaction.customId === 'deny_result') {
          denyCount++;
          if (denyCount >= 2) {
            buttonCollector.stop('denied');
            await interaction.update({
              content: 'Result denied twice. Please contact an admin.',
              components: [],
            });
          } else {
            await interaction.reply({
              content: 'Result denied. Please submit your own result image.',
              ephemeral: true,
            });
            // Wait for the denying user to submit their own image
            const denyingUserCollector = channel.createMessageCollector({
              filter: (m) =>
                m.author.id === interaction.user.id && m.attachments.size > 0,
              time: 300000, // 5 minutes timeout
            });

            denyingUserCollector.on('collect', async (denyingUserMessage) => {
              const denyingAttachment = denyingUserMessage.attachments.first();
              if (denyingAttachment.contentType.startsWith('image')) {
                denyingUserCollector.stop();
                const denyingResultEmbed = new EmbedBuilder()
                  .setColor('#FFA500')
                  .setTitle('Conflicting Match Result')
                  .setDescription(
                    `Conflicting result submitted by ${denyingUserMessage.author}. Admin review required.`,
                  )
                  .setImage(denyingAttachment.url)
                  .setTimestamp();

                await channel.send({ embeds: [denyingResultEmbed] });
                await channel.send(
                  'Conflicting results submitted. Please contact an admin for resolution.',
                );
              }
            });

            denyingUserCollector.on('end', (collected, reason) => {
              if (reason === 'time') {
                channel.send(
                  'No conflicting result image submitted in time. Please contact an admin.',
                );
              }
            });
          }
        }
      });

      buttonCollector.on('end', async (collected, reason) => {
        if (reason === 'time') {
          await reviewMessage.edit({
            content: 'Review time expired. Proceeding with automatic parsing.',
            components: [],
          });
          await this.processResult(match, attachment.url, channel);
        }
      });

      await message.reply('Match result image submitted for review.');
    } catch (error) {
      console.error('Error processing match result:', error);
      await message.reply(
        'An error occurred while processing the match result. Please try again.',
      );
    }
  }

  private async processResult(
    match: Match,
    imageUrl: string,
    channel: TextChannel,
  ): Promise<void> {
    try {
      const analysisResult = await this.matchService.updateMatchStats(
        match.id,
        imageUrl,
      );

      // Determine the winner based on total score
      const winner =
        analysisResult.winner === 'team1' ? match.team1Id : match.team2Id;

      // Fetch teams and their roles
      const team1 = await this.teamService.getTeamById(match.team1Id);
      const team2 = await this.teamService.getTeamById(match.team2Id);
      const team1Role = await this.rolesService.getRoleById(team1.roleId);
      const team2Role = await this.rolesService.getRoleById(team2.roleId);

      // Create an embed to announce the result
      const resultEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🏆 Match Result 🏆')
        .setDescription('The match has concluded! Here are the final results:')
        .addFields(
          {
            name: `Team 1`,
            value: `<@&${team1Role.discordId}>\n**Score:** ${analysisResult.team1.score.total}`,
            inline: true,
          },
          {
            name: `Team 2`,
            value: `<@&${team2Role.discordId}>\n**Score:** ${analysisResult.team2.score.total}`,
            inline: true,
          },
          {
            name: '🎉 Winner 🎉',
            value:
              winner === match.team1Id
                ? `**${team1.name}** <@&${team1Role.discordId}>`
                : `**${team2.name}** <@&${team2Role.discordId}>`,
          },
        )
        .setFooter({ text: 'Congratulations to the winning team!' })
        .setTimestamp();

      // Send the result announcement
      await channel.send({ embeds: [resultEmbed] });

      // Inform users about channel deletion
      await channel.send({
        content: '⚠️ This channel will be deleted in 5 minutes. ⚠️',
        embeds: [
          new EmbedBuilder()
            .setColor('#FFA500')
            .setDescription(
              'Please save any important information before the channel is removed.',
            ),
        ],
      });

      // Delete the match channel after 5 minutes
      setTimeout(
        async () => {
          await this.matchService.deleteMatchChannel(
            channel.client,
            channel.id,
          );
        },
        5 * 60 * 1000,
      ); // 5 minutes in milliseconds

      // Add a new job to update the tournament bracket
      await this.queueService.addToQueue({
        type: 'update_bracket',
        data: { matchId: match.id, tournamentId: match.tournamentId },
      });
    } catch (error) {
      console.error('Error processing match result:', error);
      await channel.send(
        'An error occurred while processing the match result. Please contact an admin.',
      );
    }
  }

  public async onMatchCommand(message: Message): Promise<void> {
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      await this.onMatchInfo(message);
    } else {
      await this.onCreateMatchCommand(message, args);
    }
  }

  private async onMatchInfo(message: Message): Promise<void> {
    if (!message.channel.isTextBased()) {
      await message.reply('This command can only be used in text channels.');
      return;
    }

    const channel = message.channel as TextChannel;
    const match = await this.matchService.getMatchByChannelId(channel.id);

    if (!match) {
      await message.reply('This command can only be used in a match channel.');
      return;
    }

    const team1 = await this.teamService.getTeamById(match.team1Id);
    const team2 = await this.teamService.getTeamById(match.team2Id);
    const tournament = await this.tournamentService.getTournamentById(
      match.tournamentId,
    );

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Match Information')
      .addFields(
        { name: 'Match ID', value: match.id.toString(), inline: true },
        { name: 'Tournament', value: tournament.name, inline: true },
        { name: 'Round', value: match.round.toString(), inline: true },
        { name: 'Status', value: match.status, inline: true },
        { name: 'Map', value: match.map || 'Not selected', inline: true },
        { name: 'Team 1', value: team1.name, inline: true },
        { name: 'Team 2', value: team2.name, inline: true },
        {
          name: 'Team 1 Score',
          value: match.team1Score?.toString() || '0',
          inline: true,
        },
        {
          name: 'Team 2 Score',
          value: match.team2Score?.toString() || '0',
          inline: true,
        },
        {
          name: 'Team 1 Side',
          value: match.team1Side || 'Not selected',
          inline: true,
        },
        {
          name: 'Team 2 Side',
          value: match.team2Side || 'Not selected',
          inline: true,
        },
        {
          name: 'Created At',
          value: match.createdAt.toLocaleString(),
          inline: true,
        },
        {
          name: 'Updated At',
          value: match.updatedAt.toLocaleString(),
          inline: true,
        },
      );

    await message.reply({ embeds: [embed] });
  }

  private async onCreateMatchCommand(
    message: Message,
    args: string[],
  ): Promise<void> {
    const mentionedRoles = message.mentions.roles;

    if (mentionedRoles.size !== 2 || args.length !== 3) {
      await message.reply(
        'Please use the correct format: !match <tournamentId> @team1 @team2',
      );
      return;
    }

    const tournamentId = parseInt(args[0], 10);
    if (isNaN(tournamentId)) {
      await message.reply(
        'Invalid tournament ID. Please provide a valid number.',
      );
      return;
    }

    try {
      const [team1Role, team2Role] = mentionedRoles.values();
      const match = await this.matchService.createMatchFromRoles(
        team1Role,
        team2Role,
        message.guild,
        tournamentId,
      );

      if (match) {
        await message.reply(
          `Match created successfully! Check the new private channel: <#${match.discordChannelId}>`,
        );

        await this.matchService.startVetoProcess(
          match.id,
          match.discordChannelId,
        );
      } else {
        await message.reply(
          'Failed to create the match. Please make sure both teams exist.',
        );
      }
    } catch (error) {
      console.error('Error creating match:', error);
      let errorMessage = 'An error occurred while creating the match.';
      if (error instanceof Error) {
        errorMessage += ` ${error.message}`;
      }
      await message.reply(errorMessage);
    }
  }

  private async getResultChannel(guild: Guild): Promise<TextChannel | null> {
    const resultChannelData =
      await this.rolesService.getChannelByName('result');
    if (!resultChannelData) {
      return null;
    }

    const resultChannel = guild.channels.cache.get(
      resultChannelData.discordId,
    ) as TextChannel;
    return resultChannel || null;
  }
}
