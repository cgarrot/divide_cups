import { Module } from '@nestjs/common';
import { HistoryTeamStatsService } from './history-team-stats.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { TeamModule } from '../team/team.module';
import { TeamStatsModule } from '../team-stats/team-stats.module';

@Module({
  imports: [DrizzleModule, TeamModule, TeamStatsModule],
  providers: [HistoryTeamStatsService],
  exports: [HistoryTeamStatsService],
})
export class HistoryTeamStatsModule {}
