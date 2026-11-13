import { Module } from '@nestjs/common';
import { PartnerDocumentsController, AdminPartnerDocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { SellerNotificationDispatcher } from './seller-notifications';
@Module({controllers:[PartnerDocumentsController,AdminPartnerDocumentsController],providers:[DocumentsService,SellerNotificationDispatcher]})
export class DocumentsModule {}
