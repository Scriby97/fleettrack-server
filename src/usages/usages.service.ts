import { Injectable } from '@nestjs/common';

@Injectable()
export class UsagesService {
  getHello(): string {
    return 'Hello World!';
  }
}
