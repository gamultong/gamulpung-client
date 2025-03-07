import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  const files = f['release-notes'];
  return <Document files={files} endpoint="Release Notes" dir="release" />;
}
