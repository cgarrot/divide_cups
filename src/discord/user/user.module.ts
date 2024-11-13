import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { UserStatsModule } from '../user-stats/user-stats.module';

@Module({
  imports: [DrizzleModule, UserStatsModule],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
