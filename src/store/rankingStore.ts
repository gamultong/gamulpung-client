import { create } from 'zustand';

interface RankState {
  ranking: number;
  score: number;
}

interface RankStore {
  rankings: RankState[];
  setRanking: (newRank: RankState[]) => void;
}

export const useHighRankStore = create<RankStore>(set => ({
  // Initialize with dummy data
  rankings: [
    {
      ranking: 1,
      score: 12345,
    },
    {
      ranking: 2,
      score: 12345,
    },
    {
      ranking: 3,
      score: 12345,
    },
    {
      ranking: 4,
      score: 12345,
    },
    {
      ranking: 5,
      score: 12345,
    },
    {
      ranking: 6,
      score: 12345,
    },
    {
      ranking: 7,
      score: 12345,
    },
    {
      ranking: 8,
      score: 12345,
    },
    {
      ranking: 9,
      score: 12345,
    },
    {
      ranking: 10,
      score: 12345,
    },
  ],
  setRanking: (newRank: RankState[]) => set({ rankings: newRank }),
}));

export const useMyRankStore = create<RankState>(set => ({
  ranking: 0,
  score: 0,
  setRanking: (newRank: RankState) => set({ ranking: newRank.ranking, score: newRank.score }),
}));
