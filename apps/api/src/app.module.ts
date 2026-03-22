import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AgentsModule } from './modules/agents/agents.module';
import { TracesModule } from './modules/traces/traces.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { IngestModule } from './modules/ingest/ingest.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EventsModule } from './modules/events/events.module';
import { PromptsModule } from './modules/prompts/prompts.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),

    // PostgreSQL Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        autoLoadEntities: true,
        // WARNING: Never use synchronize in production — it can drop columns/data.
        // Use migrations: npm run migration:run (in apps/api)
        synchronize: false,
        migrationsRun: configService.get('NODE_ENV') !== 'test',
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        logging: false, // Set to true for SQL debugging, false for clean output
      }),
    }),

    // Feature Modules
    EventsModule,
    AuthModule,
    ProjectsModule,
    AgentsModule,
    TracesModule,
    PoliciesModule,
    IngestModule,
    DashboardModule,
    PromptsModule,
  ],
})
export class AppModule { }
