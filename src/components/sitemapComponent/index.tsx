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
  const ref = useRef<SVGSVGElement>(null);
  const { windowWidth } = useScreenSize();

  useEffect(() => {
    const width = windowWidth;
    const height = windowWidth / 2;

    const nodes: Node[] = [];
    const links: Link[] = [];

    function traverse(current: DataItem, parent: string | null = null) {
      const nodeId = current.url;
      nodes.push({ id: nodeId, name: current.title });

      if (parent) {
        links.push({ source: parent, target: nodeId });
      }

      if (current.child) {
        // Handle child object with language keys
        Object.values(current.child).forEach(child => {
          traverse(child, nodeId);
        });
      }
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

    const link = svg.append('g').attr('stroke', '#ccc').selectAll('line').data(links).enter().append('line');

    const node = svg
      .append('g')
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .selectAll('circle')
      .data(nodes)
      .enter()
      .append('circle')
      .attr('r', 10)
      .attr('fill', 'steelblue')
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
      .attr('font-size', 10)
      .attr('dx', 10)
      .attr('dy', 4);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0);

      node.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0);

      label.attr('x', d => d.x ?? 0).attr('y', d => d.y ?? 0);
    });

    function drag(simulation: d3.Simulation<Node, undefined>) {
      function dragstarted(event: d3.D3DragEvent<SVGElement, Node, Node>, d: Node) {
        if (!event.active) {
          simulation.alphaTarget(0.3).restart();
          document.body.style.cursor = 'grabbing';
        }
        d.fx = d.x;
        d.fy = d.y;
      }

      function dragged(event: d3.D3DragEvent<SVGAElement, Node, Node>, d: Node) {
        document.body.style.cursor = 'grabbing';
        d.fx = event.x;
        d.fy = event.y;
      }

      function dragended(event: d3.D3DragEvent<SVGAElement, Node, Node>, d: Node) {
        if (!event.active) {
          simulation.alphaTarget(0);
          document.body.style.cursor = 'grab';
        }
        d.fx = null;
        d.fy = null;
      }

      return d3.drag<SVGCircleElement, Node>().on('start', dragstarted).on('drag', dragged).on('end', dragended);
    }

    function NodeMouseOver(event: MouseEvent) {
      d3.select(event.target as SVGCircleElement).attr('fill', 'red');
      document.body.style.cursor = 'grab';
    }

    function NodeMouseOut(event: MouseEvent) {
      d3.select(event.target as SVGCircleElement).attr('fill', 'steelblue');
      document.body.style.cursor = 'default';
    }

    function NodeClick(event: MouseEvent, d: Node) {
      // center the node and sort all nodes
      simulation
        .force('center', d3.forceCenter(width / 2, height / 2))
        .alpha(1) // 다시 시뮬레이션 시작
        .restart();

      // 2. 모든 노드의 고정 좌표 초기화
      simulation.nodes().forEach(node => {
        node.fx = null;
        node.fy = null;
      });

      // 3. 선택 노드를 중심에 고정
      d.fx = width / 2;
      d.fy = height / 2;
    }
  }, [windowWidth]);

  return (
    <>
      <h1>Site Map</h1>
      <svg ref={ref} className="w-full h-full border rounded shadow" />
    </>
  );
}
