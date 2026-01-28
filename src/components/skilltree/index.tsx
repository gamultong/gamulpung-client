// import { useCursorStore } from '@/store/cursorStore';
import S from './style.module.scss';
import { useState } from 'react';
import ReactFlow, { Background, useNodesState, useEdgesState, MarkerType } from 'react-flow-renderer';

const SKILL_DATA = [
  {
    id: 1,
    name: 'SPEED I',
    description: 'Increase moving speed',
    nexts: [2],
    cost: 2000,
  },
  {
    id: 2,
    name: 'SPEED II',
    description: 'Increase moving speed',
    nexts: [3],
    cost: 4000,
  },
  {
    id: 3,
    name: 'CLICK I',
    description: 'Increase click intraction range',
    nexts: [4],
    cost: 8000,
  },
  {
    id: 4,
    name: 'SPEED III',
    description: 'Increase moving speed',
    nexts: [5],
    cost: 16000,
  },
  {
    id: 5,
    name: 'EXPLODE I',
    description: 'Increase intraction range',
    nexts: [6],
    cost: 32000,
  },
  {
    id: 6,
    name: 'SPEED IV',
    description: 'Increase moving speed',
    nexts: [7],
    cost: 64000,
  },
];

const INITIAL_NODES = (() => {
  const radius = 200;
  const angleStep = (2 * Math.PI) / SKILL_DATA.length;

  return SKILL_DATA.map((skill, index) => {
    const angle = (index - 2) * angleStep;
    const x = radius * Math.cos(angle);
    const y = radius * Math.sin(angle);

    return {
      id: String(skill.id),
      data: { label: skill.name },
      position: { x, y },
    };
  });
})();

const INITIAL_EDGES = SKILL_DATA.flatMap(skill =>
  skill.nexts.map(nextId => ({
    id: `${skill.id}-${nextId}`,
    source: String(skill.id),
    target: String(nextId),
    animated: true,
    style: { strokeWidth: 4, stroke: '#ff4d4f' }, // 기본은 빨간색
    markerEnd: { type: MarkerType.ArrowClosed, width: 20, height: 20 },
  })),
);

export default function SkillTree() {
  // stores
  // const { score } = useCursorStore();

  // states
  const [isClosed, setIsClosed] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [selectedSkill, setSelectedSkill] = useState<(typeof SKILL_DATA)[number] | null>(null);
  const [purchasedSkills, setPurchasedSkills] = useState<number[]>([]);

  // temp states
  const [purchaseableSkills, setPurchaseableSkills] = useState<(typeof SKILL_DATA)[number][]>([]);

  // functions
  const toggleClosed = () => setIsClosed(!isClosed);

  const onNodeClick = (_: React.MouseEvent, node: { id: string }) => {
    const skill = SKILL_DATA.find(s => String(s.id) === node.id);
    setSelectedSkill(skill ?? null);
  };

  const purchaseSkill = () => {
    if (!selectedSkill) return;
    if (purchasedSkills.includes(selectedSkill.id)) return;

    // check prerequisite skills
    const prerequisiteSkills = SKILL_DATA.filter(skill => skill.nexts.includes(selectedSkill.id));
    const hasAllPrerequisites = prerequisiteSkills.every(skill => purchasedSkills.includes(skill.id));
    // if not all prerequisite skills are purchased, cannot purchase
    if (!hasAllPrerequisites && prerequisiteSkills.length > 0) return;

    // check remaining score
    // if (score < selectedSkill.cost) return;

    setPurchasedSkills(prev => {
      const next = [...prev, selectedSkill.id];
      const newEdges = edges.map(edge => {
        const stroke = next.includes(+edge.target) ? '#ffd700' : '#ff4d4f';
        return { ...edge, style: { ...edge.style, stroke } };
      });

      setEdges(newEdges);

      return next;
    });

    const newNodes = nodes.map(node => (node.id === `${selectedSkill.id}` ? { ...node, className: 'skill-purchased' } : node));

    setNodes(newNodes);
    setPurchaseableSkills(purchaseableSkills.filter(s => s.id !== selectedSkill.id));
  };

  return (
    <div className={`${S.skillTree} ${isClosed ? S.closed : ''}`}>
      <span>SKILL TREE</span>
      {!isClosed && (
        <div className={S.skillContainer}>
          <div className={S.skillInfo}>
            {selectedSkill ? (
              <>
                <div>
                  <p className={S.skillName}>{selectedSkill.name}</p>
                  <p className={S.skillCost}>{selectedSkill.cost.toLocaleString()} G</p>
                  <p className={S.skillDesc}>{selectedSkill.description}</p>
                </div>
                <button onClick={purchaseSkill}>BUY</button>
              </>
            ) : (
              <span className={S.skillPlaceholder}>SKILL INFO</span>
            )}
          </div>
          <div className={S.skillCanvas}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              nodesDraggable={false}
              fitView
            >
              <Background />
            </ReactFlow>
          </div>
        </div>
      )}
      <button onClick={toggleClosed} className={S.toggleButton}>
        {isClosed ? 'OPEN' : 'CLOSE'}
      </button>
    </div>
  );
}
