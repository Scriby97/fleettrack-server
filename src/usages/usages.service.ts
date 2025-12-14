import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
import { UsageEntity } from './usage.entity';

@Injectable()
export class UsagesService {
  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
  ) {}

  async findAll(): Promise<UsageEntity[]> {
    return this.repo.find();
  }

  // Accept a DeepPartial<UsageEntity> so callers (controllers or other services)
  // can pass either a DTO or a partially-built entity.
  async create(data: DeepPartial<UsageEntity>): Promise<UsageEntity> {
    const start = data.startTime ? new Date(data.startTime as any) : new Date();
    const end = data.endTime ? new Date(data.endTime as any) : undefined;
    const toSave: DeepPartial<UsageEntity> = {
      ...data,
      startTime: start as any,
      endTime: end as any,
      fuelLitersRefilled: (data.fuelLitersRefilled ?? 0) as any,
    };
    const saved = await this.repo.save(this.repo.create(toSave) as UsageEntity);
    return saved;
  }
}
