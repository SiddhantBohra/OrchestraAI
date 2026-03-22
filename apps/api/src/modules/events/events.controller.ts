import {
  Controller,
  Param,
  Sse,
  UseGuards,
  Request,
  MessageEvent,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { EventsService, TraceEvent } from './events.service';
import { ProjectsService } from '../projects/projects.service';

@ApiTags('events')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('projects/:projectId/events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Sse('stream')
  @ApiOperation({ summary: 'Stream real-time trace events via SSE' })
  streamTraces(
    @Param('projectId') projectId: string,
    @Request() req: any,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      // Auth check is handled by guard, but verify project ownership
      this.projectsService
        .findOne(projectId, req.user)
        .then(() => {
          // Send heartbeat every 30s to keep connection alive
          const heartbeat = setInterval(() => {
            subscriber.next({ data: { type: 'heartbeat', timestamp: Date.now() } });
          }, 30_000);

          // Subscribe to trace events
          const unsubTrace = this.eventsService.onTrace(projectId, (event: TraceEvent) => {
            subscriber.next({
              data: { event: 'trace', ...event.trace },
            });

            if (event.policyAlert) {
              subscriber.next({
                data: { event: 'alert', ...event.policyAlert },
              });
            }
          });

          // Subscribe to alert events
          const unsubAlert = this.eventsService.onAlert(projectId, (alert: any) => {
            subscriber.next({
              data: { event: 'alert', ...alert },
            });
          });

          // Cleanup on disconnect
          req.on('close', () => {
            clearInterval(heartbeat);
            unsubTrace();
            unsubAlert();
            subscriber.complete();
          });
        })
        .catch((err) => {
          subscriber.error(err);
        });
    });
  }
}
