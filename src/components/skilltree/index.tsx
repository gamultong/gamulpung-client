import S from './style.module.scss';
import { useState, useEffect } from 'react';
import { ReactFlow, Background } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useSkillTree from '@/hooks/useSkillTree';

const MOBILE_BREAKPOINT = 768;

export default function SkillTree() {
  const [isClosed, setIsClosed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { nodes, edges, onNodesChange, onEdgesChange, selectedSkill, onNodeClick, purchaseSkill, isPurchased } = useSkillTree();

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
      if (e.matches) setIsClosed(true);
    };
    onChange(mql);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggleClosed = () => setIsClosed(!isClosed);

  return (
    <>
      {/* Mobile: backdrop overlay when open */}
      {isMobile && !isClosed && <div className={S.backdrop} onClick={toggleClosed} />}
      <div className={`${S.skillTree} ${isClosed ? S.closed : ''} ${isMobile && !isClosed ? S.bottomSheet : ''}`}>
        {!(isMobile && isClosed) && <span>SKILL TREE</span>}
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
                style={{ width: '100%', height: '100%' }}
              >
                <Background />
              </ReactFlow>
            </div>
          </div>
        )}
        <button onClick={toggleClosed} className={S.toggleButton}>
          {isClosed ? (isMobile ? 'SKILL ▶' : 'OPEN') : 'CLOSE'}
        </button>
      </div>
    </>
  );
}
