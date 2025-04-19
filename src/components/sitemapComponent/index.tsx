'use client';

import { CSSProperties, useCallback, useEffect } from 'react';
import ReactFlow, { Node, Edge, Controls, Background, useNodesState, useEdgesState, MarkerType, NodeMouseHandler } from 'react-flow-renderer';
import data from './sitemap.json';
import useScreenSize from '@/hooks/useScreenSize';

interface DataItem {
  url: string;
  title: string;
  child?: DataItem[];
}

const normalNodeStyle: CSSProperties = {
  background: '#6495ED',
  color: 'white',
  border: '2px solid white',
  width: 120,
  borderRadius: '10px',
  fontSize: '16px',
};

const activeNodeStyle: CSSProperties = {
  background: '#FF6347',
  color: 'white',
  border: '2px solid white',
  width: 120,
  borderRadius: '10px',
  fontSize: '16px',
};

export default function SiteMapGraph() {
  const { windowWidth } = useScreenSize();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);

  useEffect(() => {
    const [initialNodes, initialEdges] = [[], []] as [Node[], Edge[]];
    const [NODE_WIDTH, HORIZONTAL_GAP] = [150, 50];

    const calculateSubtreeWidth = (node: DataItem): number => {
      if (!node.child || node.child.length === 0) return NODE_WIDTH;
      const childWidths = node.child.map(calculateSubtreeWidth);
      return childWidths.reduce((a, b) => a + b, 0) + (node.child.length - 1) * HORIZONTAL_GAP;
    };

    const traverse = (current: DataItem, parent: string | null = null, level: number = 0, xOffset: number = 0): number => {
      const id = current.url;
      let currentX = xOffset;

      if (current.child && current.child.length > 0) {
        const childXOffsets: number[] = [];
        let nextX = xOffset;

        current.child.forEach(child => {
          const subtreeWidth = calculateSubtreeWidth(child);
          const childCenterX = traverse(child, id, level + 1, nextX);
          childXOffsets.push(childCenterX);
          nextX += subtreeWidth + HORIZONTAL_GAP;
        });

        currentX = childXOffsets.reduce((a, b) => a + b) / childXOffsets.length;
      }

      initialNodes.push({
        id,
        data: { label: current.title },
        position: { x: currentX, y: level * 150 },
        style: normalNodeStyle,
      });

      if (parent) {
        const MarkerEnd = { type: MarkerType.Arrow };
        initialEdges.push({
          id: `${parent}-${id}`,
          source: parent,
          target: id,
          markerEnd: MarkerEnd,
          animated: true,
        });
      }

      return currentX;
    };

    traverse(data); // Start traversal from the root node
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeClick = useCallback<NodeMouseHandler>((ev, node: Node) => (window.location.href = node.id), []);

  const onNodeMouseEnter = useCallback<NodeMouseHandler>((ev, node: Node) => {
    if (node) {
      const setToActive = (me: Node) => (me.id === node.id ? { ...me, style: activeNodeStyle } : me);
      setNodes(n => n.map(no => setToActive(no)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNodeMouseLeave = useCallback<NodeMouseHandler>((ev, node: Node) => {
    if (node) {
      const setToNormal = (me: Node) => (me.id === node.id ? { ...me, style: normalNodeStyle } : me);
      setNodes(n => n.map(no => setToNormal(no)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ width: '100%', height: '70vh' }}>
      <h1 style={{ textAlign: 'center' }}>Site Map Graph</h1>
      <div style={{ width: windowWidth, height: 'calc(100% - 40px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeClick={onNodeClick}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
