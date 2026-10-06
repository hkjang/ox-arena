import { useNow, derivePhase } from '../lib/useRoom';
import type { Room } from '../lib/types';

/** 서버가 내려준 started_at / ends_at 기준으로 표시 */
export function Timer({ room, big }: { room: Room; big?: boolean }) {
  // 문제가 진행 중일 때만 시간을 따라간다 (나머지 단계에서는 아래가 전부 null 을 반환한다)
  const now = useNow(room.status === 'playing' ? 50 : null);
  const phase = derivePhase(room, now);
  const s = room.started_at ? Date.parse(room.started_at) : 0;
  const e = room.ends_at ? Date.parse(room.ends_at) : 0;
  if (phase === 'countdown') {
    return <div className={`timer countdown ${big ? 'big' : ''}`}><span key={Math.ceil((s - now) / 1000)}>{Math.max(1, Math.ceil((s - now) / 1000))}</span></div>;
  }
  if (phase === 'choosing') {
    const left = Math.max(0, e - now);
    return (
      <div className={`timer ${big ? 'big' : ''} ${left < 3000 ? 'hurry' : ''}`}>
        <div className="timer-num">{Math.ceil(left / 1000)}</div>
        <div className="timer-bar"><div style={{ width: `${(left / (e - s)) * 100}%` }} /></div>
      </div>
    );
  }
  if (phase === 'locked') return <div className={`timer locked ${big ? 'big' : ''}`}>⏱ 마감!</div>;
  return null;
}
