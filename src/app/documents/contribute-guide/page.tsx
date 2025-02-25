import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  const files = f['contribute-guide'];

  return <Document files={files} endpoint="Contribute Guide" dir={'of_contribute'} />;
}
