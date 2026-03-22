import { IsString, IsOptional, IsEnum, IsBoolean, IsNumber, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PolicyType, PolicyAction } from '../entities/policy.entity';

export class PolicyConditionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxBudget?: number;

  @ApiPropertyOptional({ enum: ['hourly', 'daily', 'monthly'] })
  @IsOptional()
  @IsString()
  budgetPeriod?: 'hourly' | 'daily' | 'monthly';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxRequests?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  windowSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  allowedTools?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  blockedTools?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxLoopsPerMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxTokensPerMinute?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxConsecutiveFailures?: number;

  @ApiPropertyOptional()
  @IsOptional()
  agentIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  agentNames?: string[];
}

export class CreatePolicyDto {
  @ApiProperty({ example: 'Daily Budget Limit' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: PolicyType })
  @IsEnum(PolicyType)
  type: PolicyType;

  @ApiProperty()
  @IsObject()
  conditions: PolicyConditionsDto;

  @ApiProperty({ enum: PolicyAction })
  @IsEnum(PolicyAction)
  action: PolicyAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notifications?: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
}

export class UpdatePolicyDto {
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
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  conditions?: PolicyConditionsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(PolicyAction)
  action?: PolicyAction;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  notifications?: {
    email?: string[];
    webhook?: string;
    slack?: string;
  };
}

export class PolicyWarning {
  policyId: string;
  policyName: string;
  action: PolicyAction;
  reason: string;
}

export class PolicyEvaluationResult {
  @ApiProperty()
  allowed: boolean;

  @ApiProperty()
  policyId: string | null;

  @ApiProperty()
  policyName: string | null;

  @ApiProperty()
  action: PolicyAction | null;

  @ApiProperty()
  reason: string | null;

  @ApiPropertyOptional({ type: [PolicyWarning] })
  warnings?: PolicyWarning[];
}
