import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller';
import { IngestService } from './ingest.service';
import { ProjectsModule } from '../projects/projects.module';
import { TracesModule } from '../traces/traces.module';
import { AgentsModule } from '../agents/agents.module';
import { PoliciesModule } from '../policies/policies.module';

@Module({
  imports: [ProjectsModule, TracesModule, AgentsModule, PoliciesModule],
  controllers: [IngestController],
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
