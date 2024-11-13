import { Inject } from '@nestjs/common';
import { DRIZZLE } from './drizzle.module';

export const InjectDrizzle = () => Inject(DRIZZLE);
