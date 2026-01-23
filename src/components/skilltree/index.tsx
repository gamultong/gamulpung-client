import S from './style.module.scss';
import { useState } from 'react';

export default function SkillTree() {
  // constants
  const skillTreeData = [
    {
      id: 1,
      name: 'speed I',
      description: 'increase moving speed',
      nexts: [2],
      cost: 2000,
    },
    {
      id: 2,
      name: 'speed II',
      description: 'increase moving speed',
      nexts: [3],
      cost: 4000,
    },
    {
      id: 3,
      name: 'intraction I',
      description: 'increase intraction range',
      nexts: [4],
      cost: 8000,
    },
    {
      id: 4,
      name: 'speed III',
      description: 'increase moving speed',
      nexts: [5],
      cost: 16000,
    },
    {
      id: 5,
      name: 'explosion I',
      description: 'increase intraction range',
      nexts: [6],
      cost: 32000,
    },
    {
      id: 6,
      name: 'speed IV',
      description: 'increase moving speed',
      nexts: [7],
      cost: 64000,
    },
  ];
  // states
  const [isClosed, setIsClosed] = useState(false);

  // functions
  const toggleClosed = () => setIsClosed(!isClosed);

  return (
    <div className={`${S.skillTree} ${isClosed ? S.closed : ''}`}>
      <span>Skill Tree</span>
     {!isClosed && <div className={S.skillList}>
        {skillTreeData.map(skill => (
          <div key={skill.id} className={S.skillItem}>
            <span>{skill.name}</span>
          </div>
        ))}
      </div>}
      <button onClick={toggleClosed} className={S.toggleButton}>
        {isClosed ? 'Open' : 'Close'}
      </button>
    </div>
  );
}
