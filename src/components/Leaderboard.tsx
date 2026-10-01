import type { Ranked } from '../lib/types';

export function Leaderboard({ ranked, myId, limit = 10 }: { ranked: Ranked[]; myId?: string; limit?: number }) {
  const top = ranked.slice(0, limit);
  const me = myId ? ranked.find((r) => r.id === myId) : undefined;
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `${r}`);
  return (
    <ol className="board">
      {top.map((p) => (
        <li key={p.id} className={p.id === myId ? 'me' : ''}>
          <span className="rk">{medal(p.rank)}</span>
          <span className="nm">{p.nickname}</span>
          <span className="sc">{p.score}</span>
        </li>
      ))}
      {me && me.rank > limit && (
        <li className="me sep"><span className="rk">{me.rank}</span><span className="nm">{me.nickname}</span><span className="sc">{me.score}</span></li>
      )}
    </ol>
  );
}

export function Podium({ ranked }: { ranked: Ranked[] }) {
  const by = (r: number) => ranked.find((p) => p.rank === r);
  const slot = (p: Ranked | undefined, cls: string, label: string) => (
    <div className={`pod ${cls}`}>
      <div className="pod-name">{p?.nickname ?? '-'}</div>
      <div className="pod-score">{p?.score ?? 0}</div>
      <div className="pod-step">{label}</div>
    </div>
  );
  return <div className="podium">{slot(by(2), 'p2', '2위')}{slot(by(1), 'p1', '1위')}{slot(by(3), 'p3', '3위')}</div>;
}
