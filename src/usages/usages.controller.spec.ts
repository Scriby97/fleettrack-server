import { Test, TestingModule } from '@nestjs/testing';
import { UsagesController } from './usages.controller';
import { UsagesService } from './usages.service';

describe('UsagesController', () => {
  let usagesController: UsagesController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [UsagesController],
      providers: [UsagesService],
    }).compile();

    usagesController = app.get<UsagesController>(UsagesController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(usagesController.getHello()).toBe('Hello World!');
    });
  });
});
