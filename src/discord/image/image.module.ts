import { Module } from '@nestjs/common';
import { ImageService } from './image.service';
import { DrizzleModule } from '../../drizzle/drizzle.module';
import { OpenAIModule } from '../../openai/openai.module';

@Module({
  imports: [DrizzleModule, OpenAIModule],
  providers: [ImageService],
  exports: [ImageService],
})
export class ImageModule {}
