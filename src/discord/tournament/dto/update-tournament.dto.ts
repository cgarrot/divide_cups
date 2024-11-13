import {
  IsOptional,
  IsString,
  IsDate,
  IsNumber,
  IsEnum,
} from 'class-validator';

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsDate()
  startTime?: string | Date;

  @IsOptional()
  @IsNumber()
  maxTeamLimit?: number;

  @IsOptional()
  @IsString()
  prize?: string;

  @IsOptional()
  @IsEnum(['draft', 'waiting', 'start', 'in_progress', 'complete'])
  status?: 'draft' | 'waiting' | 'start' | 'in_progress' | 'complete';

  @IsOptional()
  @IsEnum(['NA', 'EU', 'ASIA', 'OCEA', 'SA'])
  region?: 'NA' | 'EU' | 'ASIA' | 'OCEA' | 'SA';
}
