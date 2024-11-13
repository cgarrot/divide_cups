import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

export interface QueueItem {
  type: 'create_match' | 'start_veto' | 'update_bracket';
  data: any;
}

@Injectable()
export class QueueService {
  constructor(@InjectQueue('match') private matchQueue: Queue) {}

  async addToQueue(item: QueueItem): Promise<void> {
    await this.matchQueue.add(item.type, item.data);
  }
}
