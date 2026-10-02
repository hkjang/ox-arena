import { describe, expect, it } from 'vitest';
// useRoom 의 counts useMemo / Timer·Display·Admin·Play 의 derivePhase 가 실제로 호출하는 그 함수들이다.
import { computeCounts, derivePhase } from './phase';
import type { Choice, Player, Room } from './types';

const T0 = Date.parse('2026-10-02T11:00:00.000Z');

/** 필수 필드를 전부 채운 실제 Room 을 만든다 (부분 캐스팅 금지) */
function room(over: Partial<Room> = {}): Room {
  return {
    id: 'main',
    name: '테스트 방',
    status: 'waiting',
    duration_sec: 10,
    elimination: false,
    question_ids: [],
    current_index: -1,
    current_question: null,
    started_at: null,
    ends_at: null,
    reveal: null,
    ...over,
  };
}

/** 필수 필드를 전부 채운 실제 Player 를 만든다 (부분 캐스팅 금지) */
function player(id: string, eliminated = false): Player {
  return {
    id,
    room_id: 'main',
    nickname: id,
    gender: 'F',
    avatar: 1,
    score: 0,
    correct: 0,
    streak: 0,
    best_streak: 0,
    last_correct: null,
    eliminated,
  };
}

const playing = room({
  status: 'playing',
  started_at: new Date(T0).toISOString(),
  ends_at: new Date(T0 + 10_000).toISOString(),
});

describe('derivePhase', () => {
  it('방이 없으면 waiting', () => {
    expect(derivePhase(null, T0)).toBe('waiting');
  });

  it("playing 이고 now < started_at 이면 countdown", () => {
    expect(derivePhase(playing, T0 - 1)).toBe('countdown');
  });

  it('now === started_at 이면 choosing (경계값)', () => {
    expect(derivePhase(playing, T0)).toBe('choosing');
  });

  it('started_at 과 ends_at 사이면 choosing', () => {
    expect(derivePhase(playing, T0 + 5_000)).toBe('choosing');
  });

  it('now === ends_at 이면 locked (경계값)', () => {
    expect(derivePhase(playing, T0 + 10_000)).toBe('locked');
  });

  it('now > ends_at 이면 locked', () => {
    expect(derivePhase(playing, T0 + 10_001)).toBe('locked');
  });

  it.each(['waiting', 'ready', 'revealed', 'finished'] as const)(
    'playing 이 아닌 status (%s) 는 그대로 통과한다',
    (status) => {
      expect(derivePhase(room({ status }), T0)).toBe(status);
    },
  );
});

describe('computeCounts', () => {
  it('O/X 선택을 각각 센다', () => {
    const choices: Record<string, Choice> = { p1: 'O', p2: 'X', p3: 'O' };
    const players = [player('p1'), player('p2'), player('p3')];
    expect(computeCounts(choices, players)).toEqual({ o: 2, x: 1, none: 0, alive: 3 });
  });

  it('아무도 선택하지 않으면 none 이 생존자 전원이다', () => {
    expect(computeCounts({}, [player('p1'), player('p2')])).toEqual({ o: 0, x: 0, none: 2, alive: 2 });
  });

  it('탈락자는 alive 분모에서 빠진다', () => {
    const players = [player('p1'), player('p2', true), player('p3', true)];
    expect(computeCounts({}, players)).toEqual({ o: 0, x: 0, none: 1, alive: 1 });
  });

  it('탈락자가 none 분모에서 빠져 생존자 기준으로 계산된다', () => {
    const choices: Record<string, Choice> = { p1: 'O' };
    const players = [player('p1'), player('p2'), player('p3', true)];
    // 생존자 2명 중 1명이 선택 → 미선택 1명 (탈락자 p3 은 세지 않는다)
    expect(computeCounts(choices, players)).toEqual({ o: 1, x: 0, none: 1, alive: 2 });
  });

  it('선택 수가 생존자 수보다 많아도 none 이 음수가 되지 않는다', () => {
    // 탈락한 뒤에도 남아 있는 이번 라운드 선택 때문에 생길 수 있는 상황
    const choices: Record<string, Choice> = { p1: 'O', p2: 'X', p3: 'O' };
    const players = [player('p1'), player('p2', true), player('p3', true)];
    const c = computeCounts(choices, players);
    expect(c.none).toBe(0);
    expect(c.alive).toBe(1);
  });

  it('플레이어가 없으면 전부 0', () => {
    expect(computeCounts({}, [])).toEqual({ o: 0, x: 0, none: 0, alive: 0 });
  });
});
