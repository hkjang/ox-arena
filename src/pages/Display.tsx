import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom, useNow, derivePhase } from '../lib/useRoom';
import { joinUrl, useRoomId } from '../lib/util';
import { rankPlayers } from '../lib/types';
import { Field } from '../components/Field';
import { Timer } from '../components/Timer';
import { Leaderboard, Podium } from '../components/Leaderboard';

/** 행사장 TV / 빔프로젝터용 화면 */
export function Display() {
  const roomId = useRoomId();
  const { room, players, choices, counts } = useRoom(roomId);
  const now = useNow(room?.status === 'playing' ? 200 : null);
  const ranked = useMemo(() => rankPlayers(players), [players]);
  if (!room) return <div className="screen center dark"><div className="spinner" /></div>;
  const phase = derivePhase(room, now);
  const q = room.current_question;
  const rv = room.reveal;
  const url = joinUrl(roomId);

  return (
    <div className="display">
      <div className="d-main">
        <div className="d-head">
          <div className="d-title">OX ARENA <small>{room.name}</small></div>
          <div className="d-count">{q && room.status !== 'waiting' ? `Q ${q.index + 1} / ${q.total}` : ''}</div>
          <div className="d-count">👥 {room.elimination ? `생존 ${counts.alive} / ${players.length}명` : `${players.length}명`}</div>
        </div>

        <div className="d-question">
          {phase === 'waiting' && <h1>참가자를 기다리는 중… QR 코드로 입장하세요!</h1>}
          {phase === 'ready' && <h1>문제 {q ? q.index + 1 : 1}번 준비!</h1>}
          {['countdown', 'choosing', 'locked'].includes(phase) && <h1>{q?.text}</h1>}
          {phase === 'revealed' && rv && <h1>{rv.text}</h1>}
          {phase === 'finished' && <h1>🏆 최종 결과</h1>}
          <Timer room={room} big />
        </div>

        {phase === 'finished' ? <Podium ranked={ranked} /> : (
          <Field players={players} choices={choices} topId={ranked[0]?.id} big
            answer={phase === 'revealed' ? rv?.answer : null}
            counts={['choosing', 'locked', 'revealed'].includes(phase) ? counts : undefined} />
        )}

        {phase === 'revealed' && rv && (
          <div className="d-reveal">
            <div className="answer">정답 <b className={rv.answer}>{rv.answer}</b></div>
            <div>{rv.explanation}</div>
            <div className="stat">O {rv.o} · X {rv.x} · 정답률 {rv.total ? Math.round(((rv.answer === 'O' ? rv.o : rv.x) / rv.total) * 100) : 0}%</div>
          </div>
        )}
      </div>

      <aside className="d-side">
        <div className="qr"><QRCodeSVG value={url} size={180} bgColor="#ffffff" fgColor="#0f172a" marginSize={2} /></div>
        <p className="hint">휴대폰으로 스캔해서 참가</p>
        <h3>🏅 순위</h3>
        <Leaderboard ranked={ranked} limit={8} />
      </aside>
    </div>
  );
}
