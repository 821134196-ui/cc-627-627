import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { BatchesService } from './batches.service';
import { CreateBatchDto } from './dto';

@Controller('api/batches')
export class BatchesController {
  constructor(private batches: BatchesService) {}

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.batches.create(dto);
  }

  @Get()
  list() {
    return this.batches.list();
  }

  @Post(':id/recall')
  recall(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.batches.recall(id, body?.reason?.trim() || '未填写召回原因');
  }
}
