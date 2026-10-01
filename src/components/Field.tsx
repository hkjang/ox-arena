import { useMemo } from 'react';
import { Character } from './Character';
import type { Choice, Player } from '../lib/types';

function hash(id: string, salt: number) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

interface Props {
  players: Player[];
  choices: Record<string, Choice>;
  myId?: string;
  topId?: string;
  answer?: Choice | null;       // 정답 공개 후
  big?: boolean;                // 행사장 화면
  counts?: { o: number; x: number };
}

export function Field({ players, choices, myId, topId, answer, big, counts }: Props) {
  const n = players.length;
  const size = (big ? 1.5 : 1) * (n <= 12 ? 46 : n <= 40 ? 36 : n <= 100 ? 28 : 22);
  const showNames = n <= (big ? 80 : 30);

  const placed = useMemo(() => players.map((p) => {
    const c = choices[p.id];
    const u = hash(p.id, 1), v = hash(p.id, 2);
    const left = c === 'O' ? 58 + u * 36 : c === 'X' ? 6 + u * 36 : 38 + u * 24;
    const top = 22 + v * 70;
    return { p, c, left, top };
  }).sort((a, b) => a.top - b.top), [players, choices]);

  return (
    <div className={`field ${big ? 'big' : ''} ${answer ? `reveal-${answer}` : ''}`}>
      <div className="zone zone-x"><span className="zone-label">X</span>{counts && <span className="zone-count">{counts.x}</span>}</div>
      <div className="zone zone-o"><span className="zone-label">O</span>{counts && <span className="zone-count">{counts.o}</span>}</div>
      <div className="divider" />
      {placed.map(({ p, c, left, top }) => {
        const revealed = !!answer;
        const right = revealed && c === answer;
        const wrong = revealed && c !== answer;
        return (
          <div key={p.id} className={`actor ${wrong ? 'fall' : ''}`} style={{ left: `${left}%`, top: `${top}%`, zIndex: Math.round(top) + (p.id === myId ? 100 : 0) }}>
            <Character avatar={p.avatar} gender={p.gender} size={size} name={showNames || p.id === myId ? p.nickname : undefined}
              crown={p.id === topId && p.score > 0} streak={p.streak} mine={p.id === myId} right={right} wrong={wrong} />
          </div>
        );
      })}
    </div>
  );
}
