import { Module, forwardRef } from '@nestjs/common';
import { TeamStatsService } from './team-stats.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { TeamModule } from '../team/team.module';

@Module({
  imports: [forwardRef(() => TeamModule), DrizzleModule],
  providers: [TeamStatsService],
  exports: [TeamStatsService],
})
export class TeamStatsModule {}
