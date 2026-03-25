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

  @Get('count')
  @ApiOperation({ summary: 'Count traces matching filters' })
  async count(
    @Param('projectId') projectId: string,
    @Query() query: TraceQueryDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    const count = await this.tracesService.countByProject(projectId, query);
    return { count };
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List sessions with aggregated metrics' })
  async getSessions(
    @Param('projectId') projectId: string,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @Query('userId') userId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getSessionList(projectId, { limit, offset, userId });
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get session detail with all traces' })
  async getSessionDetail(
    @Param('projectId') projectId: string,
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getSessionTraces(projectId, sessionId);
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with aggregated metrics' })
  async getUsers(
    @Param('projectId') projectId: string,
    @Query('limit') limit: number,
    @Query('offset') offset: number,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getUserList(projectId, { limit, offset });
  }

  @Get('users/:userId')
  @ApiOperation({ summary: 'Get user detail with sessions' })
  async getUserDetail(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.tracesService.getUserSessions(projectId, userId);
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
