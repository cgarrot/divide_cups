import { Module } from '@nestjs/common';
import { HistoryUserStatsService } from './history-user-stats.service';
import { DrizzleModule } from 'src/drizzle/drizzle.module';
import { UserStatsModule } from '../user-stats/user-stats.module';

@Module({
  imports: [DrizzleModule, UserStatsModule],
  providers: [HistoryUserStatsService],
  exports: [HistoryUserStatsService],
})
export class HistoryUserStatsModule {}
