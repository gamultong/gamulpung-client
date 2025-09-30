// import Link from 'next/link';
import S from './style.module.scss';
// import Image from 'next/image';

export default function Inactive({ time }: { time: number }) {
  // const host = process.env.NEXT_PUBLIC_HOST;
  return (
    <div className={S.inactive}>
      <div className={S.alert}>
        <p>You`re stunned!</p>
        <p>Try Again After</p>
        <p>
          {(time / 60) >>> 0}:{(time % 60).toString().padStart(2, '0')}
        </p>
      </div>
      {/* <Link target="_blank" href={'https://forms.gle/Aub94WBWSKrwq9ud6'} className={S.ad}>
        <Image src={host + '/review.png'} alt="review" width={300} height={100} />
        기다리는 동안 간단한 설문 참여하기
      </Link> */}
      <div className={S.ad}>광고 받습니다: kkh061101@naver.com</div>
    </div>
  );
}
