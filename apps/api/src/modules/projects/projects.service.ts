import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcrypt';
import { Project } from './entities/project.entity';
import { CreateProjectDto, UpdateProjectDto } from './dto/project.dto';
import { User } from '../auth/entities/user.entity';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
  ) { }

  async create(dto: CreateProjectDto, user: User): Promise<Project & { rawApiKey: string }> {
    const rawKey = `oai_${uuidv4().replace(/-/g, '')}`;
    const prefix = rawKey.slice(0, 12); // "oai_02083c5f" — enough for lookup
    const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

    const project = this.projectsRepository.create({
      ...dto,
      apiKey: hash,
      apiKeyPrefix: prefix,
      ownerId: user.id,
    });

    const saved = await this.projectsRepository.save(project);

    // Return the raw key ONCE — it's never stored or retrievable again
    return { ...saved, apiKey: rawKey, rawApiKey: rawKey };
  }

  async findAll(user: User): Promise<Project[]> {
    return this.projectsRepository.find({
      where: { ownerId: user.id },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, user: User): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: ['agents'],
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.ownerId !== user.id) {
      throw new ForbiddenException('Access denied');
    }

    return project;
  }

  async findByApiKey(apiKey: string): Promise<Project | null> {
    const prefix = apiKey.slice(0, 12);

    // Find candidates by prefix (fast index lookup)
    const candidates = await this.projectsRepository.find({
      where: { apiKeyPrefix: prefix, isActive: true },
    });

    // Verify against bcrypt hash
    for (const project of candidates) {
      const isMatch = await bcrypt.compare(apiKey, project.apiKey);
      if (isMatch) return project;
    }

    // Fallback: support legacy plaintext keys (pre-migration)
    const legacy = await this.projectsRepository.findOne({
      where: { apiKey, isActive: true },
    });
    return legacy;
  }

  async update(id: string, dto: UpdateProjectDto, user: User): Promise<Project> {
    const project = await this.findOne(id, user);

    Object.assign(project, dto);

    return this.projectsRepository.save(project);
  }

  async regenerateApiKey(id: string, user: User): Promise<Project & { rawApiKey: string }> {
    const project = await this.findOne(id, user);

    const rawKey = `oai_${uuidv4().replace(/-/g, '')}`;
    project.apiKey = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
    project.apiKeyPrefix = rawKey.slice(0, 12);

    const saved = await this.projectsRepository.save(project);
    return { ...saved, apiKey: rawKey, rawApiKey: rawKey };
  }

  async delete(id: string, user: User): Promise<void> {
    const project = await this.findOne(id, user);
    await this.projectsRepository.remove(project);
  }

  async updateSpend(projectId: string, amount: number): Promise<void> {
    await this.projectsRepository.increment({ id: projectId }, 'currentSpend', amount);
  }

  async checkBudget(projectId: string): Promise<{ allowed: boolean; remaining: number }> {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });

    if (!project) {
      return { allowed: false, remaining: 0 };
    }

    const remaining = Number(project.budgetLimit) - Number(project.currentSpend);

    const budgetExhausted = remaining <= 0;

    return {
      allowed: budgetExhausted
        ? (project.killSwitchEnabled ? false : true)
        : project.isActive,
      remaining: Math.max(0, remaining),
    };
  }
}
