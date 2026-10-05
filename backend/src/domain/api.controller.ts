import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { StopReason } from './enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSampleDto,
  DistributeDto,
  InspectDto,
  PrintDto,
  RecallDto,
  StopDto,
} from './dto';
import { SampleService } from './sample.service';

@Controller('api')
export class ApiController {
  constructor(
    private readonly samples: SampleService,
    private readonly prisma: PrismaService,
  ) {}

  // ---------- 基础数据 ----------
  @Get('staff')
  listStaff() {
    return this.prisma.staff.findMany({ orderBy: { role: 'asc' } });
  }

  @Get('batches')
  async listBatches() {
    const list = await this.prisma.ingredientBatch.findMany({ orderBy: { receivedAt: 'desc' } });
    return list.map((b) => ({ ...b, allergens: JSON.parse(b.allergens) }));
  }

  @Post('batches')
  createBatch(@Body() body: { code: string; name: string; supplier?: string; allergens?: string[] }) {
    return this.prisma.ingredientBatch.create({
      data: {
        code: body.code,
        name: body.name,
        supplier: body.supplier,
        allergens: JSON.stringify(body.allergens ?? []),
      },
    });
  }

  // ---------- 工作台 ----------
  @Get('workbench')
  workbench() {
    return this.samples.workbench();
  }

  @Get('samples/:id')
  detail(@Param('id') id: string) {
    return this.samples.getDetail(id);
  }

  @Post('samples')
  create(@Body() dto: CreateSampleDto) {
    return this.samples.createSample(dto);
  }

  // ---------- 打印告知牌（可模拟失败） ----------
  @Post('samples/:id/print')
  print(@Param('id') id: string, @Body() dto: PrintDto) {
    return this.samples.printLabel(id, { forceFail: dto.forceFail });
  }

  // ---------- 巡查核对 ----------
  @Post('samples/:id/inspect')
  inspect(@Param('id') id: string, @Body() dto: InspectDto) {
    return this.samples.inspect(id, dto.inspectorId, dto.passed, dto.note);
  }

  // ---------- 发放 ----------
  @Post('samples/:id/distribute')
  distribute(@Param('id') id: string, @Body() dto: DistributeDto) {
    return this.samples.distribute(id, dto.serverId, dto.quantity ?? 1, dto.customerNote);
  }

  // ---------- 手动停止（如发现过敏原标错） ----------
  @Post('samples/:id/stop')
  stop(@Param('id') id: string, @Body() dto: StopDto) {
    return this.samples.stopSample(id, StopReason.MANUAL, dto.note ?? '手动停止');
  }

  // ---------- 批次召回 ----------
  @Post('batches/:id/recall')
  recall(@Param('id') id: string, @Body() dto: RecallDto) {
    return this.samples.recallBatch(id, dto.reason);
  }

  // ---------- 批次追溯 ----------
  @Get('trace')
  trace(@Query('batch') batch: string) {
    return this.samples.traceByBatch(batch);
  }

  @Get('recall-notices')
  notices() {
    return this.prisma.recallNotice.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
