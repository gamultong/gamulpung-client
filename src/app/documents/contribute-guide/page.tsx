import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  return <Document files={f['contribute-guide']} endpoint="Contribute Guide" dir={'of_contribute'} />;
}
