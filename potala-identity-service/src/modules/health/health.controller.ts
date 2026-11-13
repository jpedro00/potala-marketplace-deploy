import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import {
  HealthService,
  LivenessResult,
  ReadinessResult,
} from './health.service';

@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Liveness probe (does not touch the database)' })
  check(): LivenessResult {
    return this.healthService.liveness();
  }

  /**
   * Sets the status code manually instead of throwing: an orchestrator probe
   * must read the same flat body on 200 and on 503, which the global exception
   * filter envelope would replace.
   */
  @Public()
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe (verifies PostgreSQL)' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Database reachable' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'Database unreachable',
  })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessResult> {
    const result = await this.healthService.readiness();
    response.status(
      result.database === 'up' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return result;
  }
}
