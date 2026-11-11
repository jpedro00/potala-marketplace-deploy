import { Module } from '@nestjs/common';
import { AdminContactController, PublicContactController } from './contact.controller';
import { ContactService } from './contact.service';
@Module({controllers:[PublicContactController,AdminContactController],providers:[ContactService]})
export class ContactModule {}
