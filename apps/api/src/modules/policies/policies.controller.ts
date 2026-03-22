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
import { PoliciesService } from './policies.service';
import { ProjectsService } from '../projects/projects.service';
import { CreatePolicyDto, UpdatePolicyDto } from './dto/policy.dto';

@ApiTags('policies')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/policies')
export class PoliciesController {
  constructor(
    private readonly policiesService: PoliciesService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new policy' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreatePolicyDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.create(projectId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all policies for a project' })
  async findAll(@Param('projectId') projectId: string, @Request() req: any) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.findAllByProject(projectId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a policy by ID' })
  async findOne(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a policy' })
  async update(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a policy' })
  async delete(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.delete(id);
  }

  @Post('defaults')
  @ApiOperation({ summary: 'Create default policies for project' })
  async createDefaults(@Param('projectId') projectId: string, @Request() req: any) {
    await this.projectsService.findOne(projectId, req.user);
    await this.policiesService.createDefaultPolicies(projectId);
    return { message: 'Default policies created' };
  }
}
