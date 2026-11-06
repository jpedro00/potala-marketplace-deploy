import { Module } from '@nestjs/common';
import { ContentsService } from './contents.service';
import { AdminContentsController } from './admin-contents.controller';

@Module({
  controllers: [AdminContentsController],
  providers: [ContentsService],
  exports: [ContentsService],
})
export class ContentsModule {}
