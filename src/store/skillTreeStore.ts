import { create } from 'zustand';

interface SkillTreeState {
  purchasedSkills: string[];
  setPurchasedSkills: (skills: string[] | ((prev: string[]) => string[])) => void;
}

export const useSkillTreeStore = create<SkillTreeState>(set => ({
  purchasedSkills: [],
  setPurchasedSkills: updater =>
    set(state => ({
      purchasedSkills: typeof updater === 'function' ? updater(state.purchasedSkills) : updater,
    })),
}));
