import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { DomainError } from './domain/domain.error';

/** 业务冲突统一映射：打印失败/未核对/到期等门禁错误返回 409 */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception.code === 'SAMPLE_NOT_FOUND' || exception.code === 'BATCH_NOT_FOUND'
        ? HttpStatus.NOT_FOUND
        : HttpStatus.CONFLICT;
    res.status(status).json({ statusCode: status, code: exception.code, message: exception.message });
  }
}
