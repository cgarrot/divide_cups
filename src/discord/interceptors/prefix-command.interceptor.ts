import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class PrefixCommandInterceptor implements NestInterceptor {
  constructor(private readonly prefix: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const [message] = context.getArgs();

    if (!message || typeof message.content !== 'string') {
      return next.handle();
    }

    if (!message.content.startsWith(this.prefix)) {
      return new Observable();
    }

    return next.handle();
  }
}
