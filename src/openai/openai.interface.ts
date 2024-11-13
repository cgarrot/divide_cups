export interface IAnalysisResultMatch {
  winner: string;
  team1: ITeam;
  team2: ITeam;
}

export interface ITeam {
  players: IPlayer[];
  score: IScore;
}

export interface IPlayer {
  username: string;
  sponsor: string;
  kda: IKDA;
  damage: number;
  ping: number;
  money: string;
  win: boolean;
  crew: string | number;
}

interface IKDA {
  kills: number;
  deaths: number;
  assists: number;
}

interface IScore {
  atk: number;
  def: number;
  total: number;
}
