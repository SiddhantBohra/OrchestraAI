import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { ProjectsService } from '../projects/projects.service';
import { CreateAgentDto, UpdateAgentDto, AgentResponseDto } from './dto/agent.dto';

@ApiTags('agents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/agents')
export class AgentsController {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Register a new agent' })
  @ApiResponse({ status: 201, type: AgentResponseDto })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateAgentDto,
    @Request() req: any,
  ) {
    // Verify project ownership
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all agents for a project' })
  @ApiResponse({ status: 200, type: [AgentResponseDto] })
  async findAll(@Param('projectId') projectId: string, @Request() req: any) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.findAllByProject(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an agent by ID' })
  @ApiResponse({ status: 200, type: AgentResponseDto })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an agent' })
  @ApiResponse({ status: 200, type: AgentResponseDto })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.update(id, dto);
  }

  @Post(':id/kill')
  @ApiOperation({ summary: 'Kill (stop) an agent' })
  @ApiResponse({ status: 200, type: AgentResponseDto })
  async killAgent(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.killAgent(id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Get agent metrics' })
  async getMetrics(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.getAgentMetrics(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an agent' })
  @ApiResponse({ status: 204 })
  async delete(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.agentsService.delete(id);
  }
}
