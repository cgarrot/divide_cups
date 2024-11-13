import { HttpModule } from '@nestjs/axios';
import { SteamService } from './steam.service';
import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';

@Module({
  imports: [HttpModule, ConfigModule.forRoot()],
  providers: [SteamService],
  exports: [SteamService],
})
export class SteamModule {}
