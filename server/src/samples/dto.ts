import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSampleDto {
  @IsString()
  name!: string;

  @IsString()
  materialBatchId!: string;

  @IsDateString()
  serveDeadline!: string;

  @IsString()
  preparedBy!: string;

  /** 告知牌标注过敏原；为空时默认取原料批次过敏原 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labelAllergens?: string[];

  @IsOptional()
  @IsString()
  labelNote?: string;
}

export class ReviewDto {
  @IsString()
  reviewedBy!: string;

  @IsOptional()
  @IsString()
  reviewNote?: string;
}

export class PrintDto {
  /** 模拟打印失败（打印机缺纸/卡纸）；true 时样品立即停止发放 */
  @IsOptional()
  @IsBoolean()
  fail?: boolean;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class StopDto {
  @IsString()
  @IsIn(['PRINT_FAILED', 'EXPIRED', 'ALLERGEN_ERROR', 'MANUAL'])
  reason!: 'PRINT_FAILED' | 'EXPIRED' | 'ALLERGEN_ERROR' | 'MANUAL';

  @IsOptional()
  @IsString()
  note?: string;
}

export class DistributeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsString()
  distributedBy!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
