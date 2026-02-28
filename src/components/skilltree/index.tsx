import S from './style.module.scss';
import { useState } from 'react';
import { ReactFlow, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useSkillTree from '@/hooks/useSkillTree';

export default function SkillTree() {
  const [isClosed, setIsClosed] = useState(false);
  const { nodes, edges, onNodesChange, onEdgesChange, selectedSkill, onNodeClick, purchaseSkill, isPurchased } = useSkillTree();

  const toggleClosed = () => setIsClosed(!isClosed);

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
                {!isPurchased && <button onClick={purchaseSkill}>BUY</button>}
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
