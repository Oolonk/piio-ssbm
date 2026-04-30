import { EventEmitter } from 'events';
import type { IMatchRecord } from '@shared/types/database.types';
import type { DatabaseService } from '../services/DatabaseService';

export class MatchModel extends EventEmitter {
  private currentId: string | null = null;

  constructor(private readonly db: DatabaseService) {
    super();
  }

  get id(): string | null {
    return this.currentId;
  }

  async createNew(clear = false): Promise<IMatchRecord> {
    const record = await this.db.add<IMatchRecord>('match', {
      teams: {},
      caster: [],
      characters: {},
      fields: {},
      _D: new Date(),
    } as unknown as IMatchRecord);
    this.currentId = record._id as string;
    if (!clear) this.emit('new', record);
    return record;
  }

  async applyLastId(): Promise<void> {
    const matches = await this.db.get<IMatchRecord>('match', undefined, {
      sort: { _D: -1 },
      limit: 1,
    });
    this.currentId = matches[0]?._id ?? null;
  }

  async update(data: Partial<IMatchRecord>): Promise<void> {
    if (!this.currentId) return;
    await this.db.update('match', { _id: this.currentId }, data as Record<string, unknown>);
    this.emit('updated', data);
  }

  async getAll(params?: { limit?: number; sort?: Record<string, 1 | -1> }): Promise<IMatchRecord[]> {
    return this.db.get<IMatchRecord>('match', undefined, params);
  }
}
