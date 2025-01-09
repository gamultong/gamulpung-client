'use client';
import Link from 'next/link';
import S from './style.module.scss';
import aside from './docsPath.json';

import { useSearchParams } from 'next/navigation';
import { Converter } from 'showdown';
import { useEffect, useState } from 'react';

export default function Document({ endpoint, files, dir }: { endpoint: string; files: string[]; dir: string }) {
  const url = process.env.NEXT_PUBLIC_HOST;
  const [data, setData] = useState('');
  const lang = useSearchParams().get('lang') || 'ko';
  const asideData: { [key: string]: { link: string; [key: string]: string } } = aside[lang as keyof typeof aside];
  const fetchMarkdownFiles = async () => {
    try {
      const url = process.env.NEXT_PUBLIC_HOST;
      const promises = files.map(file =>
        fetch(`${url}/docs/${lang}/${dir}/${file}.md`).then(res => {
          if (!res.ok) throw new Error(`Failed to fetch ${file}`);
          return res.text();
        }),
      );
      const values = await Promise.all(promises);
      const markdownData = values.join('\n');
      const markdownConverter = new Converter();
      markdownConverter.setOption('tables', true);
      const htmlData = markdownConverter.makeHtml(markdownData);
      setData(htmlData);
    } catch (error) {
      console.error('Error fetching markdown files:', error);
      return '';
    }
  };
  useEffect(() => {
    fetchMarkdownFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <div className={S.document}>
      <aside className={S.aside}>
        {asideData &&
          Object.keys(asideData).map(key => (
            <details key={key} open={endpoint === asideData[key].link}>
              <summary>{key}</summary>
              <ul>
                {Object.entries(asideData[key as keyof typeof asideData]).map(([value, href]) =>
                  value !== 'link' ? (
                    <Link href={`${url}/documents/${asideData[key].link.replace(/ /g, '-').toLowerCase()}?lang=${lang}${href}`} key={value}>
                      <li>{value}</li>
                    </Link>
                  ) : null,
                )}
              </ul>
            </details>
          ))}
      </aside>
      <main className={S.main} dangerouslySetInnerHTML={{ __html: data }} />
    </div>
  );
}
