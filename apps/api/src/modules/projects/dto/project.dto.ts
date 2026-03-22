import { IsString, IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'Customer Support Agents' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Multi-agent system for customer support' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 500, description: 'Monthly budget limit in USD' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000000)
  budgetLimit?: number;

  @ApiPropertyOptional({ example: true, description: 'Block requests when budget is exceeded' })
  @IsOptional()
  @IsBoolean()
  killSwitchEnabled?: boolean;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  budgetLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  killSwitchEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string | null;

  @ApiProperty()
  apiKey: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  budgetLimit: number;

  @ApiProperty()
  currentSpend: number;

  @ApiProperty()
  killSwitchEnabled: boolean;

  @ApiProperty()
  createdAt: Date;
}
