// 게임 단계·집계 계산. Supabase 클라이언트를 import 하지 않는 순수 모듈이라
// 단위 테스트에서 네트워크 연결 없이 그대로 불러 쓸 수 있다.
// 기존 호출부 호환을 위해 useRoom.ts 가 이 모듈을 그대로 재수출한다.
import type { Choice, Player, Room } from './types';

export type Phase = 'waiting' | 'ready' | 'countdown' | 'choosing' | 'locked' | 'revealed' | 'finished';

export function derivePhase(room: Room | null, now: number): Phase {
  if (!room) return 'waiting';
  if (room.status === 'playing') {
    const s = room.started_at ? Date.parse(room.started_at) : 0;
    const e = room.ends_at ? Date.parse(room.ends_at) : 0;
    if (now < s) return 'countdown';
    if (now < e) return 'choosing';
    return 'locked';
  }
  return room.status;
}

/** O/X 선택 집계. 미선택(none)과 분모(alive)는 생존자 기준이다. */
export function computeCounts(choices: Record<string, Choice>, players: Player[]) {
  let o = 0, x = 0;
  for (const c of Object.values(choices)) c === 'O' ? o++ : x++;
  const alive = players.filter((p) => !p.eliminated).length;
  return { o, x, none: Math.max(0, alive - o - x), alive };
}
