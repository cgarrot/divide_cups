export interface User {
  id: number;
  username: string;
  discordId: string;
  steamId: string;
  steamUsername: string;
  teamId: number | null;
  region: string;
  createdAt: Date;
  updatedAt: Date;
  roles: string;
  roleDb: string;
}
