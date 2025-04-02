'use client';

import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import data from './sitemap.json';
import useScreenSize from '@/hooks/useScreenSize';

interface DataItem {
  url: string;
  title: string;
  child?: DataItem[];
}

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
}

export default function SiteMapGraph() {
  const nodeInfo = {
    radius: 10,
    normal: 'steelblue',
    active: 'red',
  };
  const linkColor = '#ccc';

  const ref = useRef<SVGSVGElement>(null);
  const { windowWidth } = useScreenSize();

  useEffect(() => {
    const width = windowWidth;
    const height = windowWidth / 3;
    const nodes: Node[] = [];
    const links: Link[] = [];

    function traverse(current: DataItem, parent: string | null = null) {
      const id = current.url;
      nodes.push({ id, name: current.title });
      if (parent) links.push({ source: parent, target: id });
      if (current.child) Object.values(current.child).forEach(c => traverse(c, id));
    }

    // Initialize with root data
    traverse(data);
    const svg = d3.select(ref.current).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    const simulation = d3
      .forceSimulation<Node>(nodes)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(links)
          .id(d => d.id)
          .distance(100),
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Define arrow marker
    svg
      .append('defs')
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-10 -10 20 20')
      .attr('refX', 11) // Increased from 15 to 20 to move closer to node
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 20)
      .attr('markerHeight', 20)
      .append('path')
      .attr('d', 'M-6.75,-6.75 L 0,0 L -6.75,6.75')
      .attr('fill', '#ccc');

    const link = svg.append('g').attr('stroke', linkColor).selectAll('line').data(links).enter().append('line').attr('marker-end', 'url(#arrowhead)');

    const node = svg
      .append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', nodeInfo.radius)
      .attr('fill', nodeInfo.normal)
      .call(drag(simulation))
      .call(node => node.on('mouseover', NodeMouseOver).on('mouseout', NodeMouseOut))
      .on('click', NodeClick);

    const label = svg
      .append('g')
      .selectAll('text')
      .data(nodes)
      .enter()
      .append('text')
      .text(d => d.name)
      .attr('font-size', (nodeInfo.radius * 4) / 3)
      .attr('dx', 10)
      .attr('dy', 4)
      .call(drag(simulation));

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0);

      node.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0);
      label.attr('x', d => d.x ?? 0).attr('y', d => d.y ?? 0);
    });

    function drag<T extends SVGElement>(simulation: d3.Simulation<Node, undefined>) {
      const start = (event: d3.D3DragEvent<T, Node, Node>, d: Node) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        document.body.style.cursor = 'grabbing';
        d.fx = d.x;
        d.fy = d.y;
      };

      const drag = (event: d3.D3DragEvent<T, Node, Node>, d: Node) => {
        document.body.style.cursor = 'grabbing';
        d.fx = event.x;
        d.fy = event.y;
      };

      const end = (event: d3.D3DragEvent<T, Node, Node>, d: Node) => {
        if (!event.active) simulation.alphaTarget(0);
        document.body.style.cursor = 'grab';
        d.fx = d.fy = null;
      };
      return d3.drag<T, Node>().on('start', start).on('drag', drag).on('end', end);
    }

    function NodeMouseOver(event: MouseEvent) {
      d3.select(event.target as SVGCircleElement).attr('fill', nodeInfo.active);
      document.body.style.cursor = 'grab';
    }

    function NodeMouseOut(event: MouseEvent) {
      d3.select(event.target as SVGCircleElement).attr('fill', nodeInfo.normal);
      document.body.style.cursor = 'default';
    }

    function NodeClick(e: MouseEvent, d: Node) {
      simulation
        .force('center', d3.forceCenter(width / 2, height / 2))
        .alpha(1) // 다시 시뮬레이션 시작
        .restart();
      simulation.nodes().forEach(node => {
        node.fx = null;
        node.fy = null;
      });
      d.fx = width / 2;
      d.fy = height / 2;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth]);

  return (
    <>
      <h1>Site Map Graph</h1>
      <svg ref={ref} className="w-full h-full border rounded shadow" />
    </>
  );
}
