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

  async findAll(creatorId?: string): Promise<UsageEntity[]> {
    if (creatorId) {
      return this.repo.find({ where: { creatorId } });
    }
    return this.repo.find();
  }

  // Accept a DeepPartial<UsageEntity> so callers (controllers or other services)
  // can pass either a DTO or a partially-built entity.
  async create(data: DeepPartial<UsageEntity>): Promise<UsageEntity> {
    const toSave: DeepPartial<UsageEntity> = {
      ...data,
      startOperatingHours: data.startOperatingHours ?? 0,
      endOperatingHours: data.endOperatingHours,
      fuelLitersRefilled: (data.fuelLitersRefilled ?? 0) as any,
    };
    const saved = await this.repo.save(this.repo.create(toSave) as UsageEntity);
    return saved;
  }
}
