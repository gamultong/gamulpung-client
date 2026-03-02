'use client';
import S from './style.module.scss';
import { useCursorStore, InteractionMode } from '@/store/cursorStore';

const MODE_CONFIG: Record<InteractionMode, { icon: string; label: string; className?: string }> = {
  normal: { icon: '🖐', label: 'TAP' },
  flag: { icon: '⚑', label: 'FLAG', className: 'flagMode' },
  bomb: { icon: '💣', label: 'BOMB', className: 'bombMode' },
};

export default function ModeFab() {
  const { interactionMode, cycleInteractionMode } = useCursorStore();
  const config = MODE_CONFIG[interactionMode];

  return (
    <button
      className={`${S.fab} ${config.className ? S[config.className] : ''}`}
      onClick={cycleInteractionMode}
    >
      <span className={S.icon}>{config.icon}</span>
      <span className={S.label}>{config.label}</span>
    </button>
  );
}
