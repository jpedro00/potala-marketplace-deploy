import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  HealthService,
  LivenessResult,
  ReadinessResult,
} from './health.service';

@Controller(['health', 'api/v1/health'])
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): LivenessResult {
    return this.healthService.liveness();
  }

  /**
   * Sets the status code manually instead of throwing: an orchestrator probe
   * must read the same flat body on 200 and on 503, which the global
   * exception filter envelope would replace. 'degraded' (one upstream down)
   * still gets 503 here — a caller of this gateway can't do anything useful
   * with a half-working backend, so there's no value in a third status code.
   */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResult> {
    const result = await this.healthService.readiness();
    response.status(
      result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return result;
  }
}
