'use client';

import { useEffect, useRef, useState } from 'react';
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
  url: string;
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
    linkColor: '#ccc',
    linkWidth: 1,
  };

  const ref = useRef<SVGSVGElement>(null);
  const { windowWidth } = useScreenSize();
  const [radius, setRadius] = useState(nodeInfo.radius);
  const [globalNodes, setGlobalNodes] = useState<Node[]>([]);
  const [globalLinks, setGlobalLinks] = useState<Link[]>([]);

  const goToUrl = (url: string) => (window.location.href = url);

  useEffect(() => {
    if (!ref.current) return;

    const width = windowWidth;
    const height = windowWidth / 3;
    const radiusSquared = radius * radius;

    // Initialize nodes and links only once
    if (globalNodes.length === 0 && globalLinks.length === 0) {
      const nodes: Node[] = [];
      const links: Link[] = [];

      const traverse = (current: DataItem, parent: string | null = null) => {
        const id = current.url;
        nodes.push({ id, name: current.title, url: current.url });
        if (parent) links.push({ source: parent, target: id });
        if (current.child) current.child.forEach(c => traverse(c, id));
      };

      traverse(data);
      setGlobalNodes(nodes);
      setGlobalLinks(links);
    }

    // Cache selections and computations
    const svg = d3.select(ref.current).attr('width', width).attr('height', height);

    svg.selectAll('*').remove();

    const simulation = d3
      .forceSimulation<Node>(globalNodes)
      .force(
        'link',
        d3
          .forceLink<Node, Link>(globalLinks)
          .id(d => d.id)
          .distance(radiusSquared),
      )
      .force('charge', d3.forceManyBody().strength(-2 * radiusSquared))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Create arrow marker once
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-10 -10 20 20')
      .attr('refX', radius + nodeInfo.linkWidth)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 20)
      .attr('markerHeight', 20)
      .append('path')
      .attr('d', 'M-6.75,-6.75 L 0,0 L -6.75,6.75')
      .attr('fill', nodeInfo.linkColor);

    // Create elements with minimal attributes
    const link = svg
      .append('g')
      .selectAll('line')
      .data(globalLinks)
      .join('line')
      .attr('stroke', nodeInfo.linkColor)
      .attr('stroke-width', nodeInfo.linkWidth)
      .attr('marker-end', 'url(#arrowhead)');

    const dragBehavior = d3
      .drag<SVGElement, Node>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = d.fy = null;
      }) as unknown as (selection: d3.Selection<d3.BaseType | SVGCircleElement, Node, SVGGElement, unknown>) => void;

    const node = svg
      .append('g')
      .selectAll('circle')
      .data(globalNodes)
      .join('circle')
      .attr('r', radius)
      .attr('fill', nodeInfo.normal)
      .attr('stroke', '#fff')
      .attr('stroke-width', 3)
      .call(dragBehavior)
      .on('mouseover', e => d3.select(e.target).attr('fill', nodeInfo.active))
      .on('mouseout', e => d3.select(e.target).attr('fill', nodeInfo.normal))
      .on('click', (e, d) => {
        // simulation
        //   .force('center', d3.forceCenter(width / 2, height / 2))
        //   .alpha(1)
        //   .alphaDecay(0.05)
        //   .restart();
        // globalNodes.forEach(n => {
        //   n.fx = n.fy = null;
        // });
        // d.fx = width / 2;
        // d.fy = height / 2;
        // window.location.href = e.;
        if (d.url) goToUrl(d.url);
      });

    const label = svg
      .append('g')
      .selectAll('text')
      .data(globalNodes)
      .join('text')
      .text(d => d.name)
      .attr('font-size', (radius * 4) / 3)
      .attr('dx', radius)
      .attr('dy', radius / 2)
      .call(dragBehavior);

    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as Node).x ?? 0)
        .attr('y1', d => (d.source as Node).y ?? 0)
        .attr('x2', d => (d.target as Node).x ?? 0)
        .attr('y2', d => (d.target as Node).y ?? 0);
      node.attr('cx', d => d.x ?? 0).attr('cy', d => d.y ?? 0);
      label.attr('x', d => d.x ?? 0).attr('y', d => d.y ?? 0);
    });

    return () => {
      simulation.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowWidth, radius]);

  return (
    <>
      <h1>Site Map Graph</h1>
      <input type="range" step={0.1} min={nodeInfo.radius / 2} max={nodeInfo.radius * 3} value={radius} onChange={e => setRadius(+e.target.value)} />
      <label>Node Size</label>
      <svg ref={ref} />
    </>
  );
}
