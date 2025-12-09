import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

describe('VehiclesController', () => {
  let vehiclesController: VehiclesController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [VehiclesService],
    }).compile();

    vehiclesController = app.get<VehiclesController>(VehiclesController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(vehiclesController.getHello()).toBe('Hello World!');
    });
  });
});
