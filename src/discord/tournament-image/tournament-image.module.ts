import { Module } from '@nestjs/common';
import { TournamentImageService } from './tournament-image.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [TournamentImageService],
  exports: [TournamentImageService],
})
export class TournamentImageModule {}
