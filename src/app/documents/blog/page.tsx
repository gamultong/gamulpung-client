import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  const files = f.blog;

  return <Document files={files} endpoint="Blog" dir={'blog'} />;
}
