'use client';

import { useCursorStore } from '@/store/cursorStore';
import { useSkillTreeStore } from '@/store/skillTreeStore';
import { useMemo, useState } from 'react';
import { useNodesState, useEdgesState, MarkerType } from 'react-flow-renderer';

// TO-DO add categories and values for each skill
export interface SkillItem {
  id: string;
  name: string;
  description: string;
  nexts: string[];
  cost: number;
}

// please multiply cost by 1000 before deployment
export const SKILL_DATA: SkillItem[] = [
  { id: '1', name: 'SPEED I', description: 'Increase moving speed', nexts: ['2'], cost: 2 },
  { id: '2', name: 'SPEED II', description: 'Increase moving speed', nexts: ['3'], cost: 4 },
  { id: '3', name: 'CLICK I', description: 'Increase click intraction range', nexts: ['4'], cost: 8 },
  { id: '4', name: 'SPEED III', description: 'Increase moving speed', nexts: ['5'], cost: 16 },
  { id: '5', name: 'EXPLODE I', description: 'Increase intraction range', nexts: ['6'], cost: 32 },
  { id: '6', name: 'SPEED IV', description: 'Increase moving speed', nexts: ['7'], cost: 64 },
];

export type SkillDataItem = SkillItem;

const SPEED_SKILL_IDS = ['1', '2', '4', '6'];

const createInitialNodes = () => {
  const radius = 200;
  const angleStep = (2 * Math.PI) / SKILL_DATA.length;

  return SKILL_DATA.map(({ id, name }, index) => {
    const angle = (index - 2) * angleStep;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);
    const position = { x, y };

    return { id, data: { label: name }, position };
  });
};

const createInitialEdges = () =>
  SKILL_DATA.flatMap(skill =>
    skill.nexts.map(nextId => ({
      id: `${skill.id}-${nextId}`,
      source: skill.id,
      target: nextId,
      animated: true,
      style: { strokeWidth: 4, stroke: '#ff4d4f' },
      markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
    })),
  );

export default function useSkillTree() {
  const ORIGIN_MOVE_SPEED = 200;
  const { score } = useCursorStore();
  const purchasedSkills = useSkillTreeStore(s => s.purchasedSkills);
  const setPurchasedSkills = useSkillTreeStore(s => s.setPurchasedSkills);
  const [nodes, setNodes, onNodesChange] = useNodesState(createInitialNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(createInitialEdges());
  const [selectedSkill, setSelectedSkill] = useState<SkillDataItem | null>(null);
  const [purchaseableSkills, setPurchaseableSkills] = useState<SkillDataItem[]>([]);
  const isPurchased = useMemo(() => selectedSkill && purchasedSkills.includes(selectedSkill.id), [purchasedSkills, selectedSkill]);

  // Add 20% for each speed skill
  const MOVE_SPEED = useMemo(() => {
    const multiplier = 1 + SPEED_SKILL_IDS.filter(id => purchasedSkills.includes(id)).length * 0.2;
    return ORIGIN_MOVE_SPEED / multiplier;
  }, [purchasedSkills]);

  const onNodeClick = (_: React.MouseEvent, node: { id: string }) => {
    const skill = SKILL_DATA.find(({ id }) => id === node.id);
    setSelectedSkill(skill ?? null);
  };

  const purchaseSkill = () => {
    if (!selectedSkill) return;
    if (purchasedSkills.includes(selectedSkill.id)) return;
    // check cost
    if (selectedSkill.cost > score) return;

    const prerequisiteSkills = SKILL_DATA.filter(skill => skill.nexts.includes(selectedSkill.id));
    const hasAllPrerequisites = prerequisiteSkills.every(skill => purchasedSkills.includes(skill.id));
    if (!hasAllPrerequisites && prerequisiteSkills.length > 0) return;

    const next = [...purchasedSkills, selectedSkill.id];
    setPurchasedSkills(next);

    const newEdges = edges.map(edge => {
      const stroke = next.includes(edge.target) ? '#ffd700' : '#ff4d4f';
      return { ...edge, style: { ...edge.style, stroke } };
    });
    setEdges(newEdges);

    const newNodes = nodes.map(node => (node.id === selectedSkill.id ? { ...node, className: 'skill-purchased' } : node));

    setNodes(newNodes);
    setPurchaseableSkills(purchaseableSkills.filter(s => s.id !== selectedSkill.id));
  };

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    selectedSkill,
    purchasedSkills,
    purchaseableSkills,
    isPurchased,
    MOVE_SPEED,
    onNodeClick,
    purchaseSkill,
  };
}
