import Document from '@/components/document';

export default function ContributeGuide() {
  const files = ['firstbeta_statistics'];

  return (
    <>
      <Document files={files} endpoint="Blog" dir={'blog'} />
    </>
  );
}
