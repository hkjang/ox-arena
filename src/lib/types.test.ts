import { describe, expect, it } from 'vitest';
import { rankPlayers } from './types';
import type { Player } from './types';

/** 필수 필드를 전부 채운 실제 Player 를 만든다 (부분 캐스팅 금지) */
function player(over: Partial<Player> & Pick<Player, 'nickname' | 'score'>): Player {
  return {
    id: `p-${over.nickname}`,
    room_id: 'main',
    gender: 'M',
    avatar: 0,
    correct: 0,
    streak: 0,
    best_streak: 0,
    last_correct: null,
    eliminated: false,
    ...over,
  };
}

describe('rankPlayers', () => {
  it('동점자는 같은 랭크를 받고 다음 랭크는 인원 수만큼 건너뛴다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'a', score: 100 }),
      player({ nickname: 'b', score: 100 }),
      player({ nickname: 'c', score: 50 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });

  it('동점 그룹 3명 뒤의 랭크도 4가 된다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'a', score: 10 }),
      player({ nickname: 'b', score: 10 }),
      player({ nickname: 'c', score: 10 }),
      player({ nickname: 'd', score: 1 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 1, 4]);
  });

  it('점수 내림차순으로 정렬한다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'low', score: 1 }),
      player({ nickname: 'high', score: 9 }),
      player({ nickname: 'mid', score: 5 }),
    ]);
    expect(ranked.map((p) => p.nickname)).toEqual(['high', 'mid', 'low']);
  });

  it('동점 그룹 안에서는 correct 내림차순으로 정렬한다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'a', score: 100, correct: 1 }),
      player({ nickname: 'b', score: 100, correct: 3 }),
    ]);
    expect(ranked.map((p) => p.nickname)).toEqual(['b', 'a']);
  });

  it('correct 는 정렬에만 쓰이고 랭크 기준은 점수뿐이다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'a', score: 100, correct: 1 }),
      player({ nickname: 'b', score: 100, correct: 3 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1]);
  });

  it('점수와 correct 가 같으면 nickname 오름차순으로 정렬한다', () => {
    const ranked = rankPlayers([
      player({ nickname: 'bravo', score: 7, correct: 2 }),
      player({ nickname: 'alpha', score: 7, correct: 2 }),
    ]);
    expect(ranked.map((p) => p.nickname)).toEqual(['alpha', 'bravo']);
  });

  it('입력 배열을 변경하지 않는다', () => {
    const input = [player({ nickname: 'a', score: 1 }), player({ nickname: 'b', score: 9 })];
    rankPlayers(input);
    expect(input.map((p) => p.nickname)).toEqual(['a', 'b']);
  });

  it('빈 배열은 빈 배열을 반환한다', () => {
    expect(rankPlayers([])).toEqual([]);
  });
});
