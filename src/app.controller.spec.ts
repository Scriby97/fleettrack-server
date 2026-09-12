import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const entityManager = { query: jest.fn() };

  beforeEach(async () => {
    entityManager.query.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getEntityManagerToken(), useValue: entityManager },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHello', () => {
    it('returns the running message', () => {
      expect(appController.getHello()).toBe('FleetTrack API is running!');
    });
  });

  describe('healthCheck', () => {
    it('reports ok when the database query succeeds', async () => {
      entityManager.query.mockResolvedValue([{ '?column?': 1 }]);

      const result = await appController.healthCheck();

      expect(result.status).toBe('ok');
      expect(result.database).toBe('connected');
    });

    it('reports error when the database query fails', async () => {
      entityManager.query.mockRejectedValue(new Error('connection refused'));

      const result = await appController.healthCheck();

      expect(result.status).toBe('error');
      expect(result.database).toBe('disconnected');
      if ('error' in result) {
        expect(result.error).toBe('connection refused');
      }
    });
  });
});
