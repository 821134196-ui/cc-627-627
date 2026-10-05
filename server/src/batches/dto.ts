import { IsArray, IsOptional, IsString } from 'class-validator';

export class CreateBatchDto {
  @IsString()
  name!: string;

  @IsString()
  batchNo!: string;

  @IsOptional()
  @IsString()
  supplier?: string;

  @IsArray()
  @IsString({ each: true })
  allergens!: string[];
}
