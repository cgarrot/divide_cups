import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from './drizzle.decorator';
import { DrizzleDB } from './types/drizzle';
import { sql } from 'drizzle-orm';

@Injectable()
export class DrizzleService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  async resetDatabase(): Promise<void> {
    await this.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await this.db.execute(sql`CREATE SCHEMA public`);
  }
}
