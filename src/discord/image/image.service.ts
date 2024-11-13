import { Injectable } from '@nestjs/common';
import { images } from '../../drizzle/schema/image.schema';
import { InjectDrizzle } from 'src/drizzle/drizzle.decorator';
import { DrizzleDB } from 'src/drizzle/types/drizzle';

@Injectable()
export class ImageService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async saveImageToDB(
    url: string,
    name: string,
    userId: number,
    analysis: string,
  ) {
    try {
      const result = await this.db
        .insert(images)
        .values({
          url,
          name,
          userId,
          analysis,
        })
        .returning();
      return result[0];
    } catch (error) {
      console.error('Error saving image to DB:', error);
      throw error;
    }
  }
}
