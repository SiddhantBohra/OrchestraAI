import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PromptsService } from './prompts.service';
import { ProjectsService } from '../projects/projects.service';

@ApiTags('prompts')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/prompts')
export class PromptsController {
  constructor(
    private readonly promptsService: PromptsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new prompt version' })
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: { name: string; template: string; variables?: string[]; model?: string; modelConfig?: Record<string, any>; tag?: string; notes?: string },
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.promptsService.create(projectId, { ...dto, createdBy: req.user.id });
  }

  @Get()
  @ApiOperation({ summary: 'List all prompts (latest version of each)' })
  async listLatest(
    @Param('projectId') projectId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.promptsService.listLatest(projectId);
  }

  @Get(':name')
  @ApiOperation({ summary: 'Get a prompt by name (latest or specific version)' })
  async get(
    @Param('projectId') projectId: string,
    @Param('name') name: string,
    @Query('version') version?: string,
    @Query('tag') tag?: string,
    @Request() req?: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    if (tag) {
      return this.promptsService.getByTag(projectId, name, tag);
    }
    return this.promptsService.get(projectId, name, version ? parseInt(version, 10) : undefined);
  }

  @Get(':name/versions')
  @ApiOperation({ summary: 'Get all versions of a prompt' })
  async getVersions(
    @Param('projectId') projectId: string,
    @Param('name') name: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.promptsService.getVersions(projectId, name);
  }

  @Patch(':id/tag')
  @ApiOperation({ summary: 'Tag a prompt version (e.g. production)' })
  async tagVersion(
    @Param('id') id: string,
    @Body() dto: { tag: string },
    @Request() req: any,
  ) {
    return this.promptsService.tagVersion(id, dto.tag);
  }
}
