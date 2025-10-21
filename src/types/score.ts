export type RankState = {
  ranking: number;
  score: number;
  before_rank?: number;
};

export type ResponseRankState = {
  scores: RankState[];
};
