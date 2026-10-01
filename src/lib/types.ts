export type Choice = 'O' | 'X';
export type Status = 'waiting' | 'ready' | 'playing' | 'revealed' | 'finished';

export interface Room {
  id: string;
  name: string;
  status: Status;
  duration_sec: number;
  question_ids: string[];
  current_index: number;
  current_question: { id: string; index: number; total: number; text: string | null } | null;
  started_at: string | null;
  ends_at: string | null;
  reveal: { answer: Choice; explanation: string | null; text: string; o: number; x: number; none: number; total: number } | null;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  gender: 'M' | 'F';
  avatar: number;
  score: number;
  correct: number;
  streak: number;
  best_streak: number;
  last_correct: boolean | null;
}

export interface Question {
  id: string;
  ord: number;
  text: string;
  answer: Choice | null;
  explanation: string | null;
  auto_rule: string | null;
  enabled: boolean;
}

export interface Ranked extends Player { rank: number }

/** 공동 순위(1,2,2,4) */
export function rankPlayers(players: Player[]): Ranked[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || b.correct - a.correct || a.nickname.localeCompare(b.nickname));
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1].score) rank = i + 1;
    return { ...p, rank };
  });
}
