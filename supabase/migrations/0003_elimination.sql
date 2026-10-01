-- 오답자 탈락 옵션 + 본인 퇴장
alter table public.rooms   add column if not exists elimination boolean not null default false;
alter table public.players add column if not exists eliminated  boolean not null default false;

drop function if exists public.admin_update_room(uuid, text, text, int);
create or replace function public.admin_update_room(p_token uuid, p_room text, p_name text, p_duration int, p_elimination boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  update rooms set
    name = coalesce(nullif(btrim(p_name), ''), name),
    duration_sec = coalesce(p_duration, duration_sec),
    elimination = coalesce(p_elimination, elimination),
    updated_at = now()
  where id = p_room;
end $$;

-- 탈락자는 제출 불가
create or replace function public.submit_answer(p_player uuid, p_token uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_room text; v_elim boolean;
  r rooms;
  v_now timestamptz := clock_timestamp();
begin
  select p.room_id, p.eliminated into v_room, v_elim from players p
  join player_tokens t on t.player_id = p.id
  where p.id = p_player and t.token = p_token;
  if v_room is null then raise exception 'INVALID_PLAYER'; end if;
  if v_elim then raise exception 'ELIMINATED'; end if;
  if p_choice not in ('O','X') then raise exception 'INVALID_CHOICE'; end if;

  select * into r from rooms where id = v_room;
  if r.status <> 'playing'
     or v_now < r.started_at - interval '300 milliseconds'
     or v_now > r.ends_at + interval '300 milliseconds' then
    raise exception 'LOCKED';
  end if;

  insert into answers(room_id, seq, player_id, choice, answered_at)
  values (v_room, r.current_index, p_player, p_choice, v_now)
  on conflict (room_id, seq, player_id)
  do update set choice = excluded.choice, answered_at = excluded.answered_at;

  return jsonb_build_object('ok', true, 'seq', r.current_index, 'choice', p_choice);
end $$;

-- 본인 퇴장
create or replace function public.leave_room(p_player uuid, p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from player_tokens where player_id = p_player and token = p_token) then
    raise exception 'INVALID_PLAYER';
  end if;
  delete from players where id = p_player;
end $$;

-- 게임 시작/초기화 시 탈락 해제
create or replace function public.admin_start_game(p_token uuid, p_room text, p_shuffle boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; v_ids uuid[];
begin
  perform _admin_check(p_token);
  r := _room_lock(p_room);
  select array_agg(id order by (case when p_shuffle then random() end), ord, created_at)
    into v_ids from questions where room_id = p_room and enabled;
  if v_ids is null then raise exception 'NO_QUESTIONS'; end if;

  delete from answers where room_id = p_room;
  update players set score = 0, correct = 0, streak = 0, best_streak = 0, last_correct = null, eliminated = false
  where room_id = p_room;
  update rooms set
    status = 'ready', question_ids = v_ids, current_index = 0,
    current_question = _q_public(v_ids[1], 0, array_length(v_ids, 1), false),
    started_at = null, ends_at = null, reveal = null, updated_at = now()
  where id = p_room;
end $$;

create or replace function public.admin_reset(p_token uuid, p_room text, p_remove_players boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  perform _room_lock(p_room);
  delete from answers where room_id = p_room;
  if p_remove_players then
    delete from players where room_id = p_room;
  else
    update players set score = 0, correct = 0, streak = 0, best_streak = 0, last_correct = null, eliminated = false
    where room_id = p_room;
  end if;
  update rooms set
    status = 'waiting', question_ids = '{}', current_index = -1, current_question = null,
    started_at = null, ends_at = null, reveal = null, updated_at = now()
  where id = p_room;
end $$;

-- 정답 공개: 탈락자는 점수 동결, 탈락 모드면 오답/미선택자 탈락
create or replace function public.admin_reveal(p_token uuid, p_room text, p_answer text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r rooms; q questions;
  v_seq int; v_ans text;
  v_o int; v_x int; v_total int; v_m int; v_f int;
  v_reveal jsonb;
begin
  perform _admin_check(p_token);
  r := _room_lock(p_room);
  if r.status <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  v_seq := r.current_index;
  select * into q from questions where id = r.question_ids[v_seq + 1];

  select count(*) filter (where choice = 'O'), count(*) filter (where choice = 'X')
    into v_o, v_x from answers where room_id = p_room and seq = v_seq;
  select count(*), count(*) filter (where gender = 'M'), count(*) filter (where gender = 'F')
    into v_total, v_m, v_f from players where room_id = p_room;

  v_ans := nullif(p_answer, '');
  if v_ans is null and q.auto_rule is not null then
    if q.auto_rule = 'male_majority' then
      v_ans := case when v_m > v_f then 'O' else 'X' end;
    elsif q.auto_rule like 'players_gte:%' then
      v_ans := case when v_total >= split_part(q.auto_rule, ':', 2)::int then 'O' else 'X' end;
    elsif q.auto_rule = 'majority_o' then
      v_ans := case when v_o > v_x then 'O' else 'X' end;
    end if;
  end if;
  v_ans := coalesce(v_ans, q.answer);
  if v_ans is null or v_ans not in ('O','X') then raise exception 'ANSWER_REQUIRED'; end if;

  update players p set
    last_correct = c.ok,
    streak       = case when c.ok then p.streak + 1 else 0 end,
    best_streak  = greatest(p.best_streak, case when c.ok then p.streak + 1 else 0 end),
    correct      = p.correct + case when c.ok then 1 else 0 end,
    score        = p.score + case when c.ok then 100 + case when p.streak >= 1 then 10 else 0 end else 0 end,
    eliminated   = (r.elimination and not c.ok)
  from (
    select p2.id, coalesce(a.choice = v_ans, false) as ok
    from players p2
    left join answers a on a.room_id = p2.room_id and a.seq = v_seq and a.player_id = p2.id
    where p2.room_id = p_room and not p2.eliminated
  ) c
  where p.id = c.id;

  v_reveal := jsonb_build_object(
    'answer', v_ans, 'explanation', q.explanation, 'text', q.text,
    'o', v_o, 'x', v_x, 'none', v_total - v_o - v_x, 'total', v_total,
    'eliminated', case when r.elimination then
      (select count(*) from players where room_id = p_room and eliminated) else 0 end);

  update rooms set
    status = 'revealed', reveal = v_reveal,
    ends_at = least(ends_at, clock_timestamp()), updated_at = now()
  where id = p_room;
  return v_reveal;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.server_now(), public.join_room(text, text, text), public.resume_player(uuid, uuid),
  public.submit_answer(uuid, uuid, text), public.leave_room(uuid, uuid),
  public.admin_login(text), public.admin_logout(uuid), public.admin_verify(uuid),
  public.admin_create_room(uuid, text, text),
  public.admin_update_room(uuid, text, text, int, boolean),
  public.admin_start_game(uuid, text, boolean), public.admin_start_question(uuid, text),
  public.admin_reveal(uuid, text, text), public.admin_next(uuid, text), public.admin_finish(uuid, text),
  public.admin_reset(uuid, text, boolean), public.admin_kick(uuid, uuid),
  public.admin_list_questions(uuid, text), public.admin_save_question(uuid, text, jsonb),
  public.admin_delete_question(uuid, uuid), public.admin_reorder_questions(uuid, text, uuid[]),
  public.admin_import_questions(uuid, text, jsonb, boolean)
to anon, authenticated;
