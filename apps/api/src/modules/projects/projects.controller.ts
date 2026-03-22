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
import { ProjectsService } from './projects.service';
import { PoliciesService } from '../policies/policies.service';
import { CreateProjectDto, UpdateProjectDto, ProjectResponseDto } from './dto/project.dto';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly policiesService: PoliciesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  @ApiResponse({ status: 201, type: ProjectResponseDto })
  async create(@Body() dto: CreateProjectDto, @Request() req: any) {
    const project = await this.projectsService.create(dto, req.user);
    // Auto-create default policies for new projects
    await this.policiesService.createDefaultPolicies(project.id);
    return project;
  }

  @Get()
  @ApiOperation({ summary: 'Get all projects for current user' })
  @ApiResponse({ status: 200, type: [ProjectResponseDto] })
  async findAll(@Request() req: any) {
    return this.projectsService.findAll(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by ID' })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.findOne(id, req.user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
    @Request() req: any,
  ) {
    return this.projectsService.update(id, dto, req.user);
  }

  @Post(':id/regenerate-key')
  @ApiOperation({ summary: 'Regenerate project API key' })
  @ApiResponse({ status: 200, type: ProjectResponseDto })
  async regenerateApiKey(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.regenerateApiKey(id, req.user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  @ApiResponse({ status: 204 })
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.projectsService.delete(id, req.user);
  }

  @Get(':id/budget')
  @ApiOperation({ summary: 'Check budget status for a project' })
  async checkBudget(@Param('id') id: string, @Request() req: any) {
    await this.projectsService.findOne(id, req.user); // Auth check
    return this.projectsService.checkBudget(id);
  }
}
