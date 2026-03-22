import { IsString, IsOptional, IsNumber, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OTLP-compatible span format
export class IngestSpanDto {
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

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsNumber()
  startTimeUnixNano: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  endTimeUnixNano?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  status?: {
    code: number;
    message?: string;
  };

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  events?: Array<{
    name: string;
    timeUnixNano: number;
    attributes?: Record<string, any>;
  }>;
}

export class IngestResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;
}

export class IngestScopeSpansDto {
  @ApiPropertyOptional()
  @IsOptional()
  scope?: {
    name?: string;
    version?: string;
  };

  @ApiProperty({ type: [IngestSpanDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestSpanDto)
  spans: IngestSpanDto[];
}

export class IngestResourceSpansDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => IngestResourceDto)
  resource?: IngestResourceDto;

  @ApiProperty({ type: [IngestScopeSpansDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestScopeSpansDto)
  scopeSpans: IngestScopeSpansDto[];
}

export class IngestTracesDto {
  @ApiProperty({ type: [IngestResourceSpansDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestResourceSpansDto)
  resourceSpans: IngestResourceSpansDto[];
}

// Simplified SDK format
export class IngestEventDto {
  @ApiProperty({ enum: ['agent_run', 'step', 'tool_call', 'llm_call', 'retriever', 'agent_action', 'human_input', 'error'] })
  @IsString()
  type: 'agent_run' | 'step' | 'tool_call' | 'llm_call' | 'retriever' | 'agent_action' | 'human_input' | 'error';

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

  @ApiProperty()
  @IsString()
  name: string;

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
  status?: 'started' | 'completed' | 'failed' | 'timeout';

  // Agent info
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentName?: string;

  @ApiPropertyOptional({ description: 'Session/thread ID for multi-turn conversations' })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional({ description: 'End-user ID for per-user cost/usage attribution' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ description: 'Tags for filtering and organizing traces', type: [String] })
  @IsOptional()
  @IsArray()
  tags?: string[];

  // LLM fields
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

  @ApiPropertyOptional({ description: 'Pre-calculated cost in USD. When provided, skips server-side cost estimation.' })
  @IsOptional()
  @IsNumber()
  cost?: number;

  // Tool fields
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

  // Input/Output
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  input?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  output?: string;

  // Error
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
  @IsString()
  errorStack?: string;

  // Metadata
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class IngestBatchDto {
  @ApiProperty({ type: [IngestEventDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEventDto)
  events: IngestEventDto[];
}
