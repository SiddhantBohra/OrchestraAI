import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TracesModule } from '../traces/traces.module';
import { AgentsModule } from '../agents/agents.module';
import { ProjectsModule } from '../projects/projects.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [TracesModule, AgentsModule, ProjectsModule, PoliciesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
