import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  return <Document files={f.blog} endpoint="Blog" dir={'blog'} />;
}
