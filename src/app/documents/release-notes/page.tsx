import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  return <Document files={f['release-notes']} endpoint="Release Notes" dir="release" />;
}
