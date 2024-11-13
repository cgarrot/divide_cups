import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import { Interaction } from 'discord.js';
import { MatchMakingService } from './match-making.service';

@Injectable()
export class MatchMakingEvents {
  constructor(private readonly matchMakingService: MatchMakingService) {}

  @On('interactionCreate')
  async handleInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
      await this.matchMakingService.handleButtonInteraction(interaction);
    }
  }

  // You can add more event handlers here if needed
  // For example, you might want to initialize the match-making system when the bot is ready

  @On('ready')
  async onReady() {
    console.log('Match-making system is ready!');
    // You might want to call a method to initialize the match-making channel here
    // For example:
    // await this.matchMakingService.initializeMatchMaking();
  }
}
