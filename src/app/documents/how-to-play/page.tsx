import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  return <Document files={f['how-to-play']} endpoint="How to Play" dir="play" />;
}
