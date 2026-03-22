import {
  Controller,
  Post,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { IngestService } from './ingest.service';
import { IngestEventDto, IngestBatchDto, IngestTracesDto } from './dto/ingest.dto';

@ApiTags('ingest')
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  private extractApiKey(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Support "Bearer <key>" or just "<key>"
    const parts = authHeader.split(' ');
    return parts.length > 1 ? parts[1] : parts[0];
  }

  @Post('event')
  @ApiOperation({ summary: 'Ingest a single event' })
  @ApiHeader({ name: 'Authorization', description: 'API Key (Bearer <key>)' })
  @ApiResponse({ status: 201, description: 'Event accepted' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 403, description: 'Policy violation or budget exceeded' })
  async ingestEvent(
    @Headers('authorization') authHeader: string,
    @Body() event: IngestEventDto,
  ) {
    const apiKey = this.extractApiKey(authHeader);
    return this.ingestService.ingestEvent(apiKey, event);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Ingest a batch of events' })
  @ApiHeader({ name: 'Authorization', description: 'API Key (Bearer <key>)' })
  @ApiResponse({ status: 201, description: 'Batch processed' })
  async ingestBatch(
    @Headers('authorization') authHeader: string,
    @Body() batch: IngestBatchDto,
  ) {
    const apiKey = this.extractApiKey(authHeader);
    return this.ingestService.ingestBatch(apiKey, batch);
  }

  @Post('v1/traces')
  @ApiOperation({ summary: 'OTLP-compatible trace ingestion endpoint' })
  @ApiHeader({ name: 'Authorization', description: 'API Key (Bearer <key>)' })
  @ApiResponse({ status: 200, description: 'Traces accepted' })
  async ingestOTLP(
    @Headers('authorization') authHeader: string,
    @Body() data: IngestTracesDto,
  ) {
    const apiKey = this.extractApiKey(authHeader);
    return this.ingestService.ingestOTLP(apiKey, data);
  }
}
