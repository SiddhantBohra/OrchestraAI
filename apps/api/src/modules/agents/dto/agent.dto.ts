import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentFramework } from '../entities/agent.entity';

export class CreateAgentDto {
  @ApiProperty({ example: 'Customer Support Bot' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Handles customer inquiries via chat' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: AgentFramework, example: AgentFramework.LANGGRAPH })
  @IsEnum(AgentFramework)
  framework: AgentFramework;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ example: ['search', 'send_email', 'create_ticket'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateAgentDto {
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
  @IsString()
  version?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedTools?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class AgentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string | null;

  @ApiProperty()
  framework: AgentFramework;

  @ApiProperty()
  status: string;

  @ApiProperty()
  version: string | null;

  @ApiProperty()
  totalRuns: number;

  @ApiProperty()
  successfulRuns: number;

  @ApiProperty()
  failedRuns: number;

  @ApiProperty()
  totalTokens: number;

  @ApiProperty()
  totalCost: number;

  @ApiProperty()
  lastRunAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}
