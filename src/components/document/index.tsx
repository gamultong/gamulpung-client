'use client';
import Link from 'next/link';
import S from './style.module.scss';
import aside from './docsPath.json';
import './global.css';

import { useSearchParams } from 'next/navigation';
import { Converter } from 'showdown';
import { useEffect, useState } from 'react';
import { AsideItem, AsideType } from '@/types';

export default function Document({ endpoint, files, dir }: { endpoint: string; files: string[]; dir: string }) {
  const url = process.env.NEXT_PUBLIC_HOST;
  const lang = useSearchParams().get('lang') || 'ko';
  const doc = useSearchParams().get('doc') || files[0];
  const asideData: AsideType = aside[lang as keyof typeof aside];
  const asideKeys = Object.keys(asideData);
  const [data, setData] = useState('');
  const [nowUrl, setNowUrl] = useState<string | null>(null);

  const fetchMarkdownFiles = async () => {
    try {
      const url = process.env.NEXT_PUBLIC_HOST;
      setNowUrl(`${url}/docs/${lang}/${dir}/${doc}.md`);
      const res = await fetch(`${url}/docs/${lang}/${dir}/${doc}.md`);
      if (!res.ok) throw new Error(`Failed to fetch ${doc}`);
      const markdownData = await res.text();
      const markdownConverter = new Converter();
      markdownConverter.setOption('tables', true);
      const htmlData = markdownConverter.makeHtml(markdownData);
      setData(htmlData);
    } catch (error) {
      console.error('Error fetching markdown files:', error);
    }
  };

  const makeHref = (text: string, page: string) => `${url}/documents/${text.replace(/ /g, '-').toLowerCase()}?lang=${lang}&doc=${page}`;
  const makeAsideItem = (key: string) =>
    Object.entries(asideData[key] as AsideItem)
      .filter(i => i[0] !== 'link')
      .map(([text, page]) => ({ text, page }));

  useEffect(() => {
    if (nowUrl !== `${url}/docs/${lang}/${dir}/${doc}.md`) fetchMarkdownFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, doc]);

  return (
    <div className={S.document}>
      <aside className={S.aside}>
        <h2>Documentation</h2>
        {asideKeys?.map(key => (
          <details key={key} open={endpoint === asideData[key].link}>
            <summary>{key}</summary>
            <ul>
              {makeAsideItem(key).map(({ text, page }) => (
                <Link key={text} href={makeHref(asideData[key].link, page)}>
                  <li>{text}</li>
                </Link>
              ))}
            </ul>
          </details>
        ))}
      </aside>
      <main className={S.main} dangerouslySetInnerHTML={{ __html: data }} />
    </div>
  );
}
