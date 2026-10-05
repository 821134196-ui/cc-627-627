import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ApiController } from './domain/api.controller';
import { SampleService } from './domain/sample.service';

@Module({
  imports: [PrismaModule],
  controllers: [ApiController],
  providers: [SampleService],
})
export class AppModule {}
