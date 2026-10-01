import { useEffect, useMemo, useRef, useState } from 'react';
import { rpc } from '../lib/supabase';
import { useRoom, useNow, derivePhase } from '../lib/useRoom';
import { clearSaved, join, resume } from '../lib/session';
import { errMsg, useRoomId } from '../lib/util';
import { rankPlayers } from '../lib/types';
import type { Choice } from '../lib/types';
import { Field } from '../components/Field';
import { Timer } from '../components/Timer';
import { Leaderboard, Podium } from '../components/Leaderboard';

export function Play() {
  const roomId = useRoomId();
  const [me, setMe] = useState<{ id: string; token: string } | null | undefined>(undefined);

  useEffect(() => {
    resume(roomId).then(setMe).catch(() => setMe(null));
  }, [roomId]);

  if (me === undefined) return <div className="screen center"><div className="spinner" /></div>;
  if (!me) return <JoinForm roomId={roomId} onJoined={(s) => setMe(s)} />;
  return <Game roomId={roomId} me={me} onLeave={() => { clearSaved(roomId); setMe(null); }} />;
}

function JoinForm({ roomId, onJoined }: { roomId: string; onJoined: (s: { id: string; token: string }) => void }) {
  const [nick, setNick] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gender) { setErr('성별을 선택해 주세요.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await join(roomId, nick, gender);
      onJoined({ id: r.player.id, token: r.token });
    } catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  };

  return (
    <form className="screen center join" onSubmit={submit}>
      <div className="logo">O<span>X</span></div>
      <h1>OX ARENA</h1>
      <label>닉네임
        <input value={nick} maxLength={12} onChange={(e) => setNick(e.target.value)} placeholder="예) 장형국" autoFocus />
      </label>
      <div className="seg">
        <button type="button" className={gender === 'M' ? 'on' : ''} onClick={() => setGender('M')}>남자</button>
        <button type="button" className={gender === 'F' ? 'on' : ''} onClick={() => setGender('F')}>여자</button>
      </div>
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy || !nick.trim()}>{busy ? '입장 중…' : '입장하기'}</button>
      <p className="hint">개인정보는 수집하지 않아요.</p>
    </form>
  );
}

function Game({ roomId, me, onLeave }: { roomId: string; me: { id: string; token: string }; onLeave: () => void }) {
  const { room, missing, players, choices, counts } = useRoom(roomId);
  const now = useNow(200);
  const ranked = useMemo(() => rankPlayers(players), [players]);
  const mine = ranked.find((p) => p.id === me.id);
  const phase = derivePhase(room, now);
  const [local, setLocal] = useState<Choice | null>(null);
  const [lockedMsg, setLockedMsg] = useState(false);
  const seq = room?.current_index ?? -1;
  const sentRef = useRef(0);

  // 내 플레이어가 삭제(강퇴)되면 재가입
  useEffect(() => { if (players.length && !mine && room) { const t = setTimeout(onLeave, 1500); return () => clearTimeout(t); } }, [players, mine, room, onLeave]);
  useEffect(() => { setLocal(null); setLockedMsg(false); }, [seq]);

  if (missing) return <div className="screen center"><p>존재하지 않는 방입니다.</p></div>;
  if (!room) return <div className="screen center"><div className="spinner" /></div>;

  const myChoice = local ?? choices[me.id] ?? null;
  const canChoose = phase === 'choosing' || (phase === 'countdown');

  const pick = async (c: Choice) => {
    if (phase !== 'choosing') return;
    setLocal(c);
    const id = ++sentRef.current;
    try {
      await rpc('submit_answer', { p_player: me.id, p_token: me.token, p_choice: c });
    } catch (e) {
      if (id === sentRef.current) { setLocal(null); if (errMsg(e) === 'LOCKED') setLockedMsg(true); }
    }
  };

  const q = room.current_question;
  const rv = room.reveal;
  const myCorrect = phase === 'revealed' && rv ? myChoice === rv.answer : null;

  return (
    <div className="screen game">
      <header>
        <span>{room.name}</span>
        <span>{q && room.status !== 'waiting' ? `문제 ${q.index + 1} / ${q.total}` : ''}</span>
      </header>

      <section className="question">
        {phase === 'waiting' && <><h2>곧 게임이 시작됩니다</h2><p className="hint">현재 {players.length}명 입장 · 화면을 켜 두세요</p></>}
        {phase === 'ready' && <><h2>다음 문제 준비 중…</h2><p className="hint">문제 {q ? q.index + 1 : 1}번</p></>}
        {(phase === 'countdown' || phase === 'choosing' || phase === 'locked') && <h2>{q?.text}</h2>}
        {phase === 'revealed' && rv && <h2>{rv.text}</h2>}
        {phase === 'finished' && <h2>게임 종료!</h2>}
        <Timer room={room} />
      </section>

      {phase === 'finished' ? (
        <section className="result">
          <Podium ranked={ranked} />
          {mine && <div className="myrank"><b>{mine.nickname}</b><span>{mine.correct}문제 정답 · 전체 {players.length}명 중 <em>{mine.rank}위</em></span></div>}
          <Leaderboard ranked={ranked} myId={me.id} limit={5} />
        </section>
      ) : phase === 'revealed' && rv ? (
        <section className="result">
          <div className={`verdict ${myCorrect ? 'ok' : 'no'}`}>{myChoice == null ? '선택 안 함' : myCorrect ? '정답! 🎉' : '오답 😢'}</div>
          <div className="answer">정답은 <b className={rv.answer}>{rv.answer}</b></div>
          {rv.explanation && <p className="explain">{rv.explanation}</p>}
          <div className="stat">O {rv.o}명 · X {rv.x}명 · 미선택 {rv.none}명{rv.total > 0 && ` · 정답률 ${Math.round(((rv.answer === 'O' ? rv.o : rv.x) / rv.total) * 100)}%`}</div>
          <Leaderboard ranked={ranked} myId={me.id} limit={3} />
        </section>
      ) : (
        <Field players={players} choices={choices} myId={me.id} topId={ranked[0]?.id} counts={phase === 'choosing' || phase === 'locked' ? counts : undefined} />
      )}

      {phase !== 'finished' && phase !== 'revealed' && (
        <div className="buttons">
          <button className={`btn-x ${myChoice === 'X' ? 'sel' : ''}`} disabled={!canChoose} onClick={() => pick('X')}>X</button>
          <button className={`btn-o ${myChoice === 'O' ? 'sel' : ''}`} disabled={!canChoose} onClick={() => pick('O')}>O</button>
        </div>
      )}
      {lockedMsg && <p className="err">마감되어 선택이 반영되지 않았어요.</p>}

      <footer>
        <span>{mine?.nickname}</span>
        <span>{mine?.score ?? 0}점{mine && mine.streak >= 2 ? ` · 🔥${mine.streak}연속` : ''}</span>
        <span>{mine ? `${mine.rank}위 / ${players.length}명` : ''}</span>
      </footer>
    </div>
  );
}
