import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SamplesService } from './samples.service';
import {
  CreateSampleDto,
  DistributeDto,
  PrintDto,
  ReviewDto,
  StopDto,
} from './dto';

@Controller('api/samples')
export class SamplesController {
  constructor(private samples: SamplesService) {}

  @Get('workbench')
  workbench() {
    return this.samples.workbench();
  }

  @Post('sweep-expired')
  sweep() {
    return this.samples.sweepExpired();
  }

  @Get('trace/:batchId')
  trace(@Param('batchId') batchId: string) {
    return this.samples.traceByBatch(batchId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.samples.get(id);
  }

  @Post()
  create(@Body() dto: CreateSampleDto) {
    return this.samples.create(dto);
  }

  @Post(':id/print')
  print(@Param('id') id: string, @Body() dto: PrintDto) {
    return this.samples.print(id, dto ?? {});
  }

  @Post(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewDto) {
    return this.samples.review(id, dto);
  }

  @Post(':id/stop')
  stop(@Param('id') id: string, @Body() dto: StopDto) {
    return this.samples.stop(id, dto);
  }

  @Post(':id/distribute')
  distribute(@Param('id') id: string, @Body() dto: DistributeDto) {
    return this.samples.distribute(id, dto);
  }

  @Get(':id/records')
  records(@Param('id') id: string) {
    return this.samples.records(id);
  }
}
