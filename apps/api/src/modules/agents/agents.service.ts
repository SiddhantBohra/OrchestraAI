import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent, AgentStatus } from './entities/agent.entity';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent)
    private agentsRepository: Repository<Agent>,
  ) {}

  async create(projectId: string, dto: CreateAgentDto): Promise<Agent> {
    const agent = this.agentsRepository.create({
      ...dto,
      projectId,
    });

    return this.agentsRepository.save(agent);
  }

  async findAllByProject(projectId: string): Promise<Agent[]> {
    return this.agentsRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Agent> {
    const agent = await this.agentsRepository.findOne({
      where: { id },
      relations: ['project'],
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  async findByNameAndProject(name: string, projectId: string): Promise<Agent | null> {
    return this.agentsRepository.findOne({
      where: { name, projectId },
    });
  }

  async update(id: string, dto: UpdateAgentDto): Promise<Agent> {
    const agent = await this.findOne(id);
    Object.assign(agent, dto);
    return this.agentsRepository.save(agent);
  }

  async updateStatus(id: string, status: AgentStatus): Promise<Agent> {
    const agent = await this.findOne(id);
    agent.status = status;
    return this.agentsRepository.save(agent);
  }

  async recordRun(
    id: string,
    success: boolean,
    tokens: number,
    cost: number,
  ): Promise<void> {
    const agent = await this.findOne(id);

    agent.totalRuns += 1;
    if (success) {
      agent.successfulRuns += 1;
    } else {
      agent.failedRuns += 1;
    }
    agent.totalTokens = Number(agent.totalTokens) + tokens;
    agent.totalCost = Number(agent.totalCost) + cost;
    agent.lastRunAt = new Date();

    await this.agentsRepository.save(agent);
  }

  async killAgent(id: string): Promise<Agent> {
    return this.updateStatus(id, AgentStatus.KILLED);
  }

  async delete(id: string): Promise<void> {
    const agent = await this.findOne(id);
    await this.agentsRepository.remove(agent);
  }

  async getAgentMetrics(id: string) {
    const agent = await this.findOne(id);

    return {
      totalRuns: agent.totalRuns,
      successfulRuns: agent.successfulRuns,
      failedRuns: agent.failedRuns,
      successRate: agent.totalRuns > 0 
        ? (agent.successfulRuns / agent.totalRuns * 100).toFixed(2) 
        : 0,
      totalTokens: agent.totalTokens,
      totalCost: agent.totalCost,
      avgTokensPerRun: agent.totalRuns > 0 
        ? Math.round(Number(agent.totalTokens) / agent.totalRuns) 
        : 0,
      avgCostPerRun: agent.totalRuns > 0 
        ? (Number(agent.totalCost) / agent.totalRuns).toFixed(4) 
        : 0,
      lastRunAt: agent.lastRunAt,
    };
  }
}
