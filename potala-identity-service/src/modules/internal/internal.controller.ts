import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Body,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { SessionService } from '../auth/session.service';
import { UsersService } from '../users/users.service';
import { IntrospectSessionDto } from './dto/introspect-session.dto';

/**
 * Server-to-server only. Never called by the frontend directly — see
 * docs/internal-api-contract.md. Protected by InternalApiKeyGuard instead of
 * the session cookie (there isn't one on service-to-service calls), and
 * marked @Public() so SessionAuthGuard/RolesGuard don't also demand a cookie.
 */
@Public()
@UseGuards(InternalApiKeyGuard)
@ApiTags('internal')
@Controller('internal')
export class InternalController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly usersService: UsersService,
  ) {}

  @Post('sessions/introspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resolve a raw session-cookie token to the authenticated identity. Called by api-gateway.',
  })
  async introspect(@Body() dto: IntrospectSessionDto) {
    const authUser = await this.sessionService.validateToken(dto.token);
    if (!authUser) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    return authUser;
  }

  @Get('users/:id')
  @ApiOperation({
    summary:
      'Minimal identity lookup by id, for services that only hold a userId reference (e.g. sellers-service verifying an owner before creating a membership).',
  })
  async getUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles.map((item) => item.role),
    };
  }
}
