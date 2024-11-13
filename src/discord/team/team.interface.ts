import { User } from '../user/user.interface';

export interface Team {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  voiceChannelId: string;
  ownerId: number;
  memberIds: string;
  isDisabled: boolean;
  roleId: string;
  owner?: User;
  members?: User[];
}
