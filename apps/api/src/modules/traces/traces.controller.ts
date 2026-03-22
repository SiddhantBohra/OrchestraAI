import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TracesService } from './traces.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateTraceDto, TraceQueryDto } from './dto/trace.dto';

@ApiTags('traces')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/traces')
export class TracesController {
  constructor(
    private readonly tracesService: TracesService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new trace (internal use)' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateTraceDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Query traces for a project' })
  async findAll(
    @Param('projectId') projectId: string,
    @Query() query: TraceQueryDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.findByProject(projectId, query);
  }

  @Get('runs')
  @ApiOperation({ summary: 'Get recent agent runs' })
  async getAgentRuns(
    @Param('projectId') projectId: string,
    @Query('limit') limit: number,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getAgentRuns(projectId, limit);
  }

  @Get('errors')
  @ApiOperation({ summary: 'Get recent errors' })
  async getErrors(
    @Param('projectId') projectId: string,
    @Query('limit') limit: number,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getRecentErrors(projectId, limit);
  }

  @Get('tree/:traceId')
  @ApiOperation({ summary: 'Get trace tree by trace ID' })
  async getTraceTree(
    @Param('projectId') projectId: string,
    @Param('traceId') traceId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getTraceTree(traceId);
  }

  @Get('runaway')
  @ApiOperation({ summary: 'Detect runaway agents' })
  async detectRunaway(
    @Param('projectId') projectId: string,
    @Query('windowMinutes') windowMinutes: number,
    @Query('threshold') threshold: number,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.detectRunaway(projectId, windowMinutes, threshold);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a trace by ID' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.findOne(id);
  }
}
