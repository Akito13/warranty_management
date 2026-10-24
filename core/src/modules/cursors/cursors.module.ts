import { Module } from '@nestjs/common';
import { CursorsController } from './cursors.controller';
import { CursorsService } from './cursors.service';

@Module({
  controllers: [CursorsController],
  providers: [CursorsService],
  exports: [CursorsService],
})
export class CursorsModule {}

