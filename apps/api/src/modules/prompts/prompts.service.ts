import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prompt } from './entities/prompt.entity';

@Injectable()
export class PromptsService {
  constructor(
    @InjectRepository(Prompt)
    private promptsRepository: Repository<Prompt>,
  ) {}

  /**
   * Create a new prompt version. Auto-increments version number per name.
   */
  async create(
    projectId: string,
    dto: {
      name: string;
      template: string;
      variables?: string[];
      model?: string;
      modelConfig?: Record<string, any>;
      tag?: string;
      notes?: string;
      createdBy?: string;
    },
  ): Promise<Prompt> {
    // Get next version number
    const latest = await this.promptsRepository.findOne({
      where: { projectId, name: dto.name },
      order: { version: 'DESC' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    const prompt = this.promptsRepository.create({
      ...dto,
      projectId,
      version: nextVersion,
    });

    return this.promptsRepository.save(prompt);
  }

  /**
   * List all prompts for a project (latest version of each name).
   */
  async listLatest(projectId: string): Promise<Prompt[]> {
    // Get latest version per name using subquery
    const result = await this.promptsRepository
      .createQueryBuilder('p')
      .where('p.projectId = :projectId', { projectId })
      .andWhere(
        'p.version = (SELECT MAX(p2.version) FROM prompts p2 WHERE p2."projectId" = p."projectId" AND p2.name = p.name)',
      )
      .orderBy('p.name', 'ASC')
      .getMany();

    return result;
  }

  /**
   * Get all versions of a prompt by name.
   */
  async getVersions(projectId: string, name: string): Promise<Prompt[]> {
    return this.promptsRepository.find({
      where: { projectId, name },
      order: { version: 'DESC' },
    });
  }

  /**
   * Get a specific prompt by name and version (or latest if no version).
   */
  async get(projectId: string, name: string, version?: number): Promise<Prompt> {
    const where: any = { projectId, name };
    if (version) where.version = version;

    const prompt = await this.promptsRepository.findOne({
      where,
      order: { version: 'DESC' },
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt "${name}"${version ? ` v${version}` : ''} not found`);
    }

    return prompt;
  }

  /**
   * Get a prompt by tag (e.g. "production").
   */
  async getByTag(projectId: string, name: string, tag: string): Promise<Prompt> {
    const prompt = await this.promptsRepository.findOne({
      where: { projectId, name, tag },
      order: { version: 'DESC' },
    });

    if (!prompt) {
      throw new NotFoundException(`Prompt "${name}" with tag "${tag}" not found`);
    }

    return prompt;
  }

  /**
   * Tag a specific version (e.g. mark v3 as "production").
   */
  async tagVersion(id: string, tag: string): Promise<Prompt> {
    const prompt = await this.promptsRepository.findOne({ where: { id } });
    if (!prompt) throw new NotFoundException('Prompt version not found');

    prompt.tag = tag;
    return this.promptsRepository.save(prompt);
  }
}
