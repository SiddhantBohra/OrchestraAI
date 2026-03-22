import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { ProjectsService } from '../projects/projects.service';
import { PoliciesService } from '../policies/policies.service';
import { AlertSeverity } from '../policies/entities/policy-alert.entity';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly projectsService: ProjectsService,
    private readonly policiesService: PoliciesService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get project dashboard overview' })
  async getOverview(@Param('projectId') projectId: string, @Request() req: any) {
    await this.projectsService.findOne(projectId, req.user);
    return this.dashboardService.getOverview(projectId);
  }

  @Get('cost')
  @ApiOperation({ summary: 'Get cost analytics' })
  async getCostAnalytics(
    @Param('projectId') projectId: string,
    @Query('period') period: 'day' | 'week' | 'month',
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.dashboardService.getCostAnalytics(projectId, period);
  }

  @Get('agents/:agentId')
  @ApiOperation({ summary: 'Get agent performance dashboard' })
  async getAgentPerformance(
    @Param('projectId') projectId: string,
    @Param('agentId') agentId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.dashboardService.getAgentPerformance(projectId, agentId);
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get policy alerts' })
  async getAlerts(
    @Param('projectId') projectId: string,
    @Query('severity') severity?: AlertSeverity,
    @Query('acknowledged') acknowledged?: string,
    @Query('limit') limit?: string,
    @Request() req?: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    return this.policiesService.getAlerts(projectId, {
      severity,
      acknowledged: acknowledged !== undefined ? acknowledged === 'true' : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('alerts/count')
  @ApiOperation({ summary: 'Get unacknowledged alert count' })
  async getAlertCount(
    @Param('projectId') projectId: string,
    @Request() req: any,
  ) {
    await this.projectsService.findOne(projectId, req.user);
    const count = await this.policiesService.getUnacknowledgedCount(projectId);
    return { count };
  }

  @Patch('alerts/:alertId/acknowledge')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  async acknowledgeAlert(
    @Param('alertId') alertId: string,
    @Request() req: any,
  ) {
    return this.policiesService.acknowledgeAlert(alertId, req.user.id);
  }
}
