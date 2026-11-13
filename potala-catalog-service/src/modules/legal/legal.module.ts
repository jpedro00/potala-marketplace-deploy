import { Module } from '@nestjs/common';
import { LegalController, AdminLegalController, InternalLegalController } from './legal.controller';
import { LegalService } from './legal.service';
@Module({controllers:[LegalController,AdminLegalController,InternalLegalController],providers:[LegalService]})
export class LegalModule {}
