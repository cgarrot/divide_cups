import { Injectable } from '@nestjs/common';
import { Tournament } from '../tournament.interface';

@Injectable()
export class BracketService {
  generateBracket(tournament: Tournament): any {
    const teams = Array.isArray(tournament.teams)
      ? tournament.teams
      : JSON.parse(tournament.teams);

    const shuffledTeams = this.shuffleArray(teams);
    const rounds = Math.ceil(Math.log2(shuffledTeams.length));
    const bracket = {
      name: tournament.name, // Add the tournament name here
      rounds: [],
    };

    let matchCount = 1;
    for (let round = 1; round <= rounds; round++) {
      const matchesInRound = Math.pow(2, rounds - round);
      const roundMatches = [];

      for (let i = 0; i < matchesInRound; i++) {
        const match = {
          match: matchCount++,
          team1: round === 1 ? shuffledTeams[i * 2]?.name || 'TBD' : 'TBD',
          team2: round === 1 ? shuffledTeams[i * 2 + 1]?.name || 'TBD' : 'TBD',
          score1: 0,
          score2: 0,
        };
        roundMatches.push(match);
      }

      bracket.rounds.push({ round, matches: roundMatches });
    }

    return bracket;
  }

  private shuffleArray(array: any[]): any[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  async updateBracket(matches: any[], matchId: number): Promise<any[]> {
    // Implement the logic to update the bracket based on the match result
    // This is a placeholder implementation
    return matches.map((match) => {
      if (match.id === matchId) {
        // Update the match result
        // You need to implement the actual logic here
      }
      return match;
    });
  }
}
