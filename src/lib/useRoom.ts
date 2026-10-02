import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, rpc } from './supabase';
import type { Choice, Player, Room } from './types';
import { computeCounts, derivePhase } from './phase';

// 단계·집계 계산은 phase.ts 로 분리했다. 기존 호출부가 그대로 쓰도록 재수출한다.
export { computeCounts, derivePhase };
export type { Phase } from './phase';

/** 서버 시계 오프셋(ms): serverNow = Date.now() + offset */
let offset = 0;
export async function syncClock() {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const s = Number(await rpc<number>('server_now'));
    const t1 = Date.now();
    samples.push(s - (t0 + t1) / 2);
  }
  samples.sort((a, b) => a - b);
  offset = samples[1];
}
export const serverNow = () => Date.now() + offset;

export function useNow(intervalMs = 100) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useRoom(roomId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [missing, setMissing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const seqRef = useRef<number>(-2);

  const loadChoices = useCallback(async (seq: number) => {
    if (seq < 0) { setChoices({}); return; }
    const { data } = await supabase.from('answers').select('player_id,choice').eq('room_id', roomId).eq('seq', seq);
    if (seqRef.current !== seq) return;
    const m: Record<string, Choice> = {};
    for (const a of data ?? []) m[a.player_id] = a.choice as Choice;
    setChoices(m);
  }, [roomId]);

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase.from('players').select('*').eq('room_id', roomId);
    if (data) setPlayers(data as Player[]);
  }, [roomId]);

  const applyRoom = useCallback((r: Room) => {
    setRoom(r);
    if (seqRef.current !== r.current_index) {
      seqRef.current = r.current_index;
      setChoices({});
      loadChoices(r.current_index);
    }
    if (r.status === 'revealed' || r.status === 'waiting' || r.status === 'ready') loadPlayers();
  }, [loadChoices, loadPlayers]);

  const loadRoom = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('*').eq('id', roomId).maybeSingle();
    if (!data) { setMissing(true); return; }
    setMissing(false);
    applyRoom(data as Room);
  }, [roomId, applyRoom]);

  useEffect(() => {
    let alive = true;
    seqRef.current = -2;
    syncClock().catch(() => {});
    loadRoom(); loadPlayers();

    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (p) => { if (alive && p.new) applyRoom(p.new as Room); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        (p) => {
          if (!alive) return;
          if (p.eventType === 'DELETE') setPlayers((l) => l.filter((x) => x.id !== (p.old as Player).id));
          else setPlayers((l) => {
            const n = p.new as Player;
            return l.some((x) => x.id === n.id) ? l.map((x) => (x.id === n.id ? n : x)) : [...l, n];
          });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_id=eq.${roomId}` },
        (p) => {
          if (!alive) return;
          if (p.eventType === 'DELETE') { loadChoices(seqRef.current); return; }
          const a = p.new as { seq: number; player_id: string; choice: Choice };
          if (a.seq === seqRef.current) setChoices((c) => ({ ...c, [a.player_id]: a.choice }));
        })
      .subscribe();

    // 실시간 연결이 끊겨도 복구되도록 느린 폴링을 병행
    const poll = setInterval(() => { loadRoom(); loadPlayers(); loadChoices(seqRef.current); }, 4000);
    const vis = () => { if (document.visibilityState === 'visible') { loadRoom(); loadPlayers(); } };
    document.addEventListener('visibilitychange', vis);
    return () => {
      alive = false;
      clearInterval(poll);
      document.removeEventListener('visibilitychange', vis);
      supabase.removeChannel(ch);
    };
  }, [roomId, applyRoom, loadRoom, loadPlayers, loadChoices]);

  const counts = useMemo(() => computeCounts(choices, players), [choices, players]);

  return { room, missing, players, choices, counts, reload: loadRoom };
}
