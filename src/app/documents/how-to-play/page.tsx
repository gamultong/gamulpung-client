import Document from '@/components/document';
import f from '../files.json';

export default function ContributeGuide() {
  const files = f['how-to-play'];
  return <Document files={files} endpoint="How to Play" dir="play" />;
}
