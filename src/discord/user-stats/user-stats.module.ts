import { Module } from '@nestjs/common';
import { UserStatsService } from './user-stats.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';

@Module({
  imports: [DrizzleModule],
  providers: [UserStatsService],
  exports: [UserStatsService],
})
export class UserStatsModule {}
