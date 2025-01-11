import S from './style.module.scss';

export default function StatBlock({ text, value, isEven }: { text: string; value: string | number; isEven: boolean }) {
  return (
    <div className={`${S.statBlock} ${isEven ? S.isEven : S.isNotEven}`}>
      <div className={S.inner}>
        <p>{text}</p>
        <p className={S.value}>{value}</p>
      </div>
    </div>
  );
}
