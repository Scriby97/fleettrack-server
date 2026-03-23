import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsagesService } from '../usages/usages.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';

@Controller('sync')
export class SyncController {
  constructor(private readonly usagesService: UsagesService) {}

  /**
   * GET /sync/changes?since=<ms>
   * Returns usages changed since timestamp (ms). Includes tombstones (deleted=true).
   */
  @Get('changes')
  async changes(@Query('since') since: string, @CurrentUser() user: AuthUser) {
    const sinceMs = Number(since) || 0;
    const changes = await this.usagesService.findChangesSince(sinceMs);
    return { changes, nextCursor: Date.now() };
  }
}
