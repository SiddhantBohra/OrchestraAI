import { IsString, IsOptional, IsEnum, IsNumber, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TraceType, TraceStatus } from '../entities/trace.entity';

export class CreateTraceDto {
  @ApiProperty()
  @IsString()
  traceId: string;

  @ApiProperty()
  @IsString()
  spanId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentSpanId?: string;

  @ApiProperty({ enum: TraceType })
  @IsEnum(TraceType)
  type: TraceType;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ enum: TraceStatus })
  @IsOptional()
  @IsEnum(TraceStatus)
  status?: TraceStatus;

  @ApiProperty()
  @IsNumber()
  startTime: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  endTime?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  promptTokens?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  completionTokens?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toolName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  toolArgs?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toolResult?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  input?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  output?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class TraceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ enum: TraceType })
  @IsOptional()
  @IsEnum(TraceType)
  type?: TraceType;

  @ApiPropertyOptional({ enum: TraceStatus })
  @IsOptional()
  @IsEnum(TraceStatus)
  status?: TraceStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  traceId?: string;

  @ApiPropertyOptional({ description: 'Filter by session ID' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Filter by end-user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Filter by LLM model name' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Minimum cost in USD (e.g., 0.01)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minCost?: number;

  @ApiPropertyOptional({ description: 'Minimum duration in ms (slow traces)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offset?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Comma-separated tags filter' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Sort field', enum: ['createdAt', 'durationMs', 'cost', 'totalTokens'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortOrder?: string;
}

export class TraceTreeNode {
  @ApiProperty()
  id: string;

  @ApiProperty()
  spanId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  type: TraceType;

  @ApiProperty()
  status: TraceStatus;

  @ApiProperty()
  durationMs: number;

  @ApiPropertyOptional()
  children?: TraceTreeNode[];
}
