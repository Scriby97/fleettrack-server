import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleEntity } from './vehicle.entity';

export interface Vehicle {
  id: string;
  name: string;
  plate: string;
}

@Injectable()
export class VehiclesService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly repo: Repository<VehicleEntity>,
  ) {}

  async findAll(): Promise<Vehicle[]> {
    return this.repo.find();
  }

  async create(data: Partial<Vehicle>): Promise<Vehicle> {
    const v = this.repo.create(data);
    return this.repo.save(v);
  }
}

  // getHello(): Vehicle[] {
  //   return [
  //     { id: '1', name: 'Pistenbully 600', plate: 'BE 245 834' },
  //     { id: '2', name: 'Ratrak 600', plate: 'BE 512 091' },
  //     { id: '3', name: 'PistenBully 400 W', plate: 'BE 687 445' },
  //     { id: '4', name: 'Snowcat ST4', plate: 'BE 834 567' },
  //     { id: '5', name: 'Hägglunds BV206', plate: 'BE 923 156' },
  //     { id: '6', name: 'Loon ST5', plate: 'BE 178 203' },
  //   ];
  // }
