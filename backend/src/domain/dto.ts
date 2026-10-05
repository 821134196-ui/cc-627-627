import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateSampleDto {
  @IsString() name: string;
  @IsString() batchId: string;
  @IsString() serveUntil: string;
  @IsString() makerId: string;
}

export class PrintDto {
  @IsOptional() @IsBoolean() forceFail?: boolean;
}

export class InspectDto {
  @IsString() inspectorId: string;
  @IsBoolean() passed: boolean;
  @IsOptional() @IsString() note?: string;
}

export class DistributeDto {
  @IsString() serverId: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() customerNote?: string;
}

export class StopDto {
  @IsOptional() @IsString() note?: string;
}

export class RecallDto {
  @IsString() reason: string;
}
