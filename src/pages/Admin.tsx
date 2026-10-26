import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { rpc } from '../lib/supabase';
import { getAdminToken, setAdminToken } from '../lib/session';
import { useRoom, useNow, derivePhase } from '../lib/useRoom';
import { errMsg, joinUrl, useRoomId } from '../lib/util';
import { rankPlayers } from '../lib/types';
import type { Choice, Question } from '../lib/types';
import { Timer } from '../components/Timer';
import { Leaderboard } from '../components/Leaderboard';

export function Admin() {
  const [token, setToken] = useState<string | null>(getAdminToken());
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!token) { setChecked(true); return; }
    rpc<boolean>('admin_verify', { p_token: token }).then((ok) => {
      if (!ok) { setAdminToken(null); setToken(null); }
    }).catch(() => {}).finally(() => setChecked(true));
  }, [token]);

  if (!checked) return <div className="screen center"><div className="spinner" /></div>;
  if (!token) return <Login onLogin={(t) => { setAdminToken(t); setToken(t); }} />;
  return <Panel token={token} onLogout={() => { rpc('admin_logout', { p_token: token }).catch(() => {}); setAdminToken(null); setToken(null); }} />;
}

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { onLogin(await rpc<string>('admin_login', { p_password: pw })); }
    catch (e2) { setErr(errMsg(e2)); setBusy(false); }
  };
  return (
    <form className="screen center join" onSubmit={submit}>
      <h1>OX ARENA ADMIN</h1>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="관리자 비밀번호" autoFocus />
      {err && <p className="err">{err}</p>}
      <button className="primary" disabled={busy || !pw}>로그인</button>
    </form>
  );
}

type Tab = 'control' | 'questions' | 'players';

function Panel({ token, onLogout }: { token: string; onLogout: () => void }) {
  const roomId = useRoomId();
  const { room, missing, players, counts } = useRoom(roomId);
  const now = useNow(200);
  const [tab, setTab] = useState<Tab>('control');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const ranked = useMemo(() => rankPlayers(players), [players]);

  const act = useCallback(async (fn: string, args: Record<string, unknown> = {}) => {
    setBusy(true); setMsg('');
    try { return await rpc(fn, { p_token: token, p_room: roomId, ...args }); }
    catch (e) {
      const m = errMsg(e);
      setMsg(m);
      if (m.includes('만료')) onLogout();
    } finally { setBusy(false); }
  }, [token, roomId, onLogout]);

  if (missing) return <CreateRoom roomId={roomId} act={act} />;
  if (!room) return <div className="screen center"><div className="spinner" /></div>;

  const phase = derivePhase(room, now);
  const q = room.current_question;
  const needAnswer = phase === 'locked' || phase === 'choosing';
  const link = (path: string) => `${location.href.split('#')[0]}#${path}?room=${roomId}`;

  return (
    <div className="admin">
      <header>
        <b>OX ARENA ADMIN</b>
        <span>방: {roomId}</span>
        <a href={link('/display')} target="_blank" rel="noreferrer">대형화면 ↗</a>
        <button onClick={onLogout}>로그아웃</button>
      </header>

      <nav className="tabs">
        {(['control', 'questions', 'players'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{{ control: '게임 진행', questions: '질문 관리', players: '참가자' }[t]}</button>
        ))}
      </nav>
      {msg && <p className="err">{msg}</p>}

      {tab === 'control' && (
        <div className="card-grid">
          <section className="card">
            <div className="kv"><span>상태</span><b>{phase}</b></div>
            <div className="kv"><span>접속자</span><b>{players.length}명</b></div>
            <div className="kv"><span>현재 문제</span><b>{q && room.status !== 'waiting' ? `${q.index + 1} / ${q.total}` : '-'}</b></div>
            {q?.text && <p className="qtext">{q.text}</p>}
            <Timer room={room} />
            <div className="kv big"><span className="O">O : {counts.o}명</span><span className="X">X : {counts.x}명</span><span>미선택 {counts.none}</span>{room.elimination && <span>생존 {counts.alive}</span>}</div>
            <label className="chk"><input type="checkbox" checked={room.elimination} disabled={busy} onChange={(e) => {
              const on = e.target.checked;
              if (!on && players.some((p) => p.eliminated) && !confirm('탈락한 참가자가 모두 부활해 다음 문제부터 다시 선택할 수 있습니다. 계속할까요?')) return;
              act('admin_update_room', { p_name: null, p_duration: null, p_elimination: on });
            }} /> 오답자 탈락 (체크 해제 시 틀려도 다음 문제 계속 선택 가능)</label>

            <div className="ctl">
              {(room.status === 'waiting' || room.status === 'finished') && (
                <>
                  <label className="chk"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} /> 문제 랜덤 섞기</label>
                  <button className="primary" disabled={busy} onClick={() => {
                    if (room.status === 'finished' && !confirm('이전 점수가 초기화됩니다. 다시 시작할까요?')) return;
                    act('admin_start_game', { p_shuffle: shuffle });
                  }}>게임 시작</button>
                </>
              )}
              {room.status === 'ready' && <button className="primary" disabled={busy} onClick={() => act('admin_start_question')}>문제 시작 ({room.duration_sec}초)</button>}
              {needAnswer && (
                <>
                  <button className="primary" disabled={busy || phase === 'choosing'} onClick={() => act('admin_reveal')}>정답 공개</button>
                  <div className="override">
                    <span>정답 직접 지정해서 공개:</span>
                    {(['O', 'X'] as Choice[]).map((c) => (
                      <button key={c} className={`btn-${c.toLowerCase()}`} disabled={busy || phase === 'choosing'} onClick={() => act('admin_reveal', { p_answer: c })}>{c}</button>
                    ))}
                  </div>
                </>
              )}
              {room.status === 'revealed' && (
                <button className="primary" disabled={busy} onClick={() => act('admin_next')}>
                  {q && q.index + 1 >= q.total ? '최종 결과 보기' : '다음 문제'}
                </button>
              )}
              {room.status !== 'waiting' && room.status !== 'finished' && (
                <button disabled={busy} onClick={() => confirm('게임을 종료하고 최종 결과를 표시할까요?') && act('admin_finish')}>게임 종료</button>
              )}
              <button className="danger" disabled={busy} onClick={() => {
                const rm = confirm('참가자도 모두 삭제할까요?\n[확인] 참가자 삭제 · [취소] 점수만 초기화');
                if (confirm(rm ? '정말 모두 삭제하고 초기화할까요?' : '점수를 초기화하고 대기 상태로 돌아갈까요?')) act('admin_reset', { p_remove_players: rm });
              }}>초기화</button>
            </div>
            {room.reveal && room.status === 'revealed' && <p className="hint">정답: <b>{room.reveal.answer}</b> · O {room.reveal.o} / X {room.reveal.x}</p>}
          </section>

          <section className="card">
            <h3>설정</h3>
            <RoomSettings room={room} act={act} />
            <h3>참가 QR</h3>
            <div className="qr"><QRCodeSVG value={joinUrl(roomId)} size={160} marginSize={2} bgColor="#fff" /></div>
            <input readOnly value={joinUrl(roomId)} onFocus={(e) => e.currentTarget.select()} />
          </section>

          <section className="card"><h3>순위</h3><Leaderboard ranked={ranked} limit={10} /></section>
        </div>
      )}

      {tab === 'questions' && <Questions token={token} roomId={roomId} />}

      {tab === 'players' && (
        <section className="card">
          <h3>참가자 {players.length}명 (남 {players.filter((p) => p.gender === 'M').length} / 여 {players.filter((p) => p.gender === 'F').length})</h3>
          <table className="tbl">
            <thead><tr><th>순위</th><th>닉네임</th><th>성별</th><th>점수</th><th>상태</th><th /></tr></thead>
            <tbody>
              {ranked.map((p) => (
                <tr key={p.id}><td>{p.rank}</td><td>{p.nickname}</td><td>{p.gender === 'M' ? '남' : '여'}</td><td>{p.score}</td><td>{p.eliminated ? '💀 탈락' : '생존'}</td>
                  <td><button onClick={() => confirm(`${p.nickname} 님을 내보낼까요?`) && rpc('admin_kick', { p_token: token, p_player: p.id }).catch((e) => setMsg(errMsg(e)))}>내보내기</button></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function RoomSettings({ room, act }: { room: { name: string; duration_sec: number }; act: (fn: string, a?: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(room.name);
  const [dur, setDur] = useState(room.duration_sec);
  return (
    <div className="form">
      <label>방 이름<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>선택 시간(초)<input type="number" min={3} max={60} value={dur} onChange={(e) => setDur(Number(e.target.value))} /></label>
      <button onClick={() => act('admin_update_room', { p_name: name, p_duration: dur, p_elimination: null })}>저장</button>
    </div>
  );
}

function CreateRoom({ roomId, act }: { roomId: string; act: (fn: string, a?: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState('');
  return (
    <div className="screen center join">
      <h1>방 &quot;{roomId}&quot; 없음</h1>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="방 이름 (예: 2026 동창회)" />
      <button className="primary" onClick={() => act('admin_create_room', { p_name: name })}>이 방 만들기</button>
    </div>
  );
}

function Questions({ token, roomId }: { token: string; roomId: string }) {
  const [list, setList] = useState<Question[]>([]);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState({ text: '', answer: 'O', explanation: '' });

  const load = useCallback(async () => {
    try { setList(await rpc<Question[]>('admin_list_questions', { p_token: token, p_room: roomId })); }
    catch (e) { setErr(errMsg(e)); }
  }, [token, roomId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: string, args: Record<string, unknown>) => {
    try { await rpc(fn, { p_token: token, ...args }); await load(); setErr(''); } catch (e) { setErr(errMsg(e)); }
  };
  const save = (q: Partial<Question>) => run('admin_save_question', { p_room: roomId, p_q: q });
  const move = (i: number, d: number) => {
    const ids = list.map((q) => q.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run('admin_reorder_questions', { p_room: roomId, p_ids: ids });
  };
  const shuffleAll = () => {
    const ids = list.map((q) => q.id);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    run('admin_reorder_questions', { p_room: roomId, p_ids: ids });
  };

  const exportJson = () => {
    const data = list.map(({ text, answer, explanation, auto_rule, enabled }) => ({ text, answer, explanation, auto_rule, enabled }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `questions-${roomId}.json`; a.click();
  };
  const importFile = async (f: File) => {
    const raw = await f.text();
    let items: unknown[];
    try {
      if (f.name.endsWith('.json')) items = JSON.parse(raw);
      else items = parseCsv(raw);
    } catch { setErr('파일 형식이 올바르지 않습니다.'); return; }
    const replace = confirm(`${items.length}개 문제를 불러옵니다.\n[확인] 기존 문제 모두 교체 · [취소] 뒤에 추가`);
    run('admin_import_questions', { p_room: roomId, p_items: items, p_replace: replace });
  };

  return (
    <section className="card">
      <div className="row wrap">
        <b>질문 {list.length}개 (활성 {list.filter((q) => q.enabled).length})</b>
        <button onClick={shuffleAll}>🔀 섞기</button>
        <button onClick={exportJson}>JSON 내보내기</button>
        <label className="filebtn">JSON/CSV 가져오기<input type="file" accept=".json,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} /></label>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="qrow add">
        <input placeholder="새 질문" value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
        <select value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })}><option>O</option><option>X</option><option value="">공개 시 지정</option></select>
        <input placeholder="설명(선택)" value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
        <button className="primary" disabled={!draft.text.trim()} onClick={async () => { await save(draft as Partial<Question>); setDraft({ text: '', answer: 'O', explanation: '' }); }}>추가</button>
      </div>

      {list.map((q, i) => <QRow key={q.id + q.text + q.answer + q.explanation + q.enabled + q.auto_rule} q={q} i={i} onSave={save} onMove={move} onDelete={() => confirm('삭제할까요?') && run('admin_delete_question', { p_id: q.id })} />)}
    </section>
  );
}

function QRow({ q, i, onSave, onMove, onDelete }: { q: Question; i: number; onSave: (q: Partial<Question>) => void; onMove: (i: number, d: number) => void; onDelete: () => void }) {
  const [text, setText] = useState(q.text);
  const [exp, setExp] = useState(q.explanation ?? '');
  const dirty = text !== q.text || exp !== (q.explanation ?? '');
  return (
    <div className={`qrow ${q.enabled ? '' : 'off'}`}>
      <span className="no">{i + 1}</span>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <select value={q.auto_rule ? 'auto' : q.answer ?? ''} disabled={!!q.auto_rule} onChange={(e) => onSave({ id: q.id, answer: (e.target.value || null) as Choice | null })}>
        {q.auto_rule && <option value="auto">자동</option>}<option value="O">O</option><option value="X">X</option><option value="">공개 시 지정</option>
      </select>
      <input value={exp} placeholder="설명" onChange={(e) => setExp(e.target.value)} />
      <div className="row">
        {dirty && <button className="primary" onClick={() => onSave({ id: q.id, text, explanation: exp })}>저장</button>}
        <button onClick={() => onSave({ id: q.id, enabled: !q.enabled })}>{q.enabled ? '활성' : '비활성'}</button>
        <button onClick={() => onMove(i, -1)}>↑</button><button onClick={() => onMove(i, 1)}>↓</button>
        <button className="danger" onClick={onDelete}>삭제</button>
      </div>
    </div>
  );
}

/** text,answer,explanation 헤더 CSV (따옴표 지원) */
function parseCsv(raw: string) {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false;
  const s = raw.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHead = head.includes('text') || head.includes('question');
  const idx = (n: string[], d: number) => { const k = n.map((x) => head.indexOf(x)).find((v) => v >= 0); return hasHead ? (k ?? -1) : d; };
  const [ti, ai, ei] = [idx(['text', 'question'], 0), idx(['answer'], 1), idx(['explanation'], 2)];
  return rows.slice(hasHead ? 1 : 0).map((r) => ({ text: r[ti]?.trim(), answer: (r[ai] ?? '').trim().toUpperCase(), explanation: ei >= 0 ? r[ei]?.trim() : '' }));
}

