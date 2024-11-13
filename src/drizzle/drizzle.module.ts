import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
export const DRIZZLE = Symbol('drizzle-connection');
import * as schema from './schema/schema';
import { DrizzleService } from './drizzle.service';
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: async () => {
        const databaseURL = process.env.DB_URL;
        const pool = new Pool({
          connectionString: databaseURL,
          ssl: false,
        });
        return drizzle(pool, { schema }) as NodePgDatabase<typeof schema>;
      },
    },
    DrizzleService,
  ],
  exports: [DRIZZLE, DrizzleService],
})
export class DrizzleModule {}
