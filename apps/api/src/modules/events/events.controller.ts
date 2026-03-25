import {
  Controller,
  Param,
  Get,
  UseGuards,
  Request,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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

  @Get('stream')
  @ApiOperation({ summary: 'Stream real-time trace events via SSE' })
  async streamTraces(
    @Param('projectId') projectId: string,
    @Request() req: any,
    @Res() res: any,
  ): Promise<void> {
    // Verify project ownership
    await this.projectsService.findOne(projectId, req.user);

    // Get the raw Node.js http.ServerResponse (works for both Express and Fastify)
    const raw = res.raw || res;

    // Set SSE headers
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': 'true',
    });

    // Flush headers immediately
    if (typeof raw.flushHeaders === 'function') {
      raw.flushHeaders();
    }

    // Send initial connection event
    raw.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // Heartbeat every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        raw.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`);
      } catch {
        // Connection closed
        clearInterval(heartbeat);
      }
    }, 15_000);

    // Subscribe to trace events
    const unsubTrace = this.eventsService.onTrace(projectId, (event: TraceEvent) => {
      try {
        raw.write(`data: ${JSON.stringify({ event: 'trace', ...event.trace })}\n\n`);

        if (event.policyAlert) {
          raw.write(`data: ${JSON.stringify({ event: 'alert', ...event.policyAlert })}\n\n`);
        }
      } catch {
        // Connection closed
      }
    });

    // Subscribe to alert events
    const unsubAlert = this.eventsService.onAlert(projectId, (alert: any) => {
      try {
        raw.write(`data: ${JSON.stringify({ event: 'alert', ...alert })}\n\n`);
      } catch {
        // Connection closed
      }
    });

    // Cleanup on disconnect — listen on the raw Node.js request
    const rawReq = req.raw || req;
    const cleanup = () => {
      clearInterval(heartbeat);
      unsubTrace();
      unsubAlert();
    };
    rawReq.on('close', cleanup);
    rawReq.on('error', cleanup);

    // IMPORTANT for Fastify: Tell Fastify's reply object that we're handling the response ourselves.
    // Without this, Fastify may log warnings or try to send its own response.
    if (res.hijack) {
      res.hijack();
    }
  }
}
