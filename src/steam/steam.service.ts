import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SteamService {
  private readonly apiKey: string;
  private readonly apiUrl: string = 'http://api.steampowered.com';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = process.env.STEAM_API_KEY;
  }

  async getSteamUsernames(steamIds: string[]): Promise<string[]> {
    const url = `${this.apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamIds.join(',')}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const players = response.data.response.players;
      return players.map((player) => player.personaname);
    } catch (error) {
      console.error('Error fetching Steam usernames:', error);
      throw new Error('Failed to fetch Steam usernames');
    }
  }

  async getSteamUsername(steamId: string): Promise<string | null> {
    const url = `${this.apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamId}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const players = response.data.response.players;
      return players.length > 0 ? players[0].personaname : null;
    } catch (error) {
      console.error('Error fetching Steam username:', error);
      return null;
    }
  }

  async getSteamUserSummary(steamId: string): Promise<any | null> {
    const url = `${this.apiUrl}/ISteamUser/GetPlayerSummaries/v0002/?key=${this.apiKey}&steamids=${steamId}`;

    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const players = response.data.response.players;
      return players.length > 0 ? players[0] : null;
    } catch (error) {
      console.error('Error fetching Steam user summary:', error);
      return null;
    }
  }
}
