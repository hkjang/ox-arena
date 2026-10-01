-- OX Arena schema
-- 모든 게임 로직은 SECURITY DEFINER RPC 로 서버(Postgres)에서 검증한다.
-- 클라이언트(anon)는 rooms / players / answers 를 읽기만 할 수 있다.

-- ───────────────────────── tables ─────────────────────────
create table if not exists public.rooms (
  id               text primary key check (id ~ '^[a-z0-9-]{1,32}$'),
  name             text not null default 'OX Arena',
  status           text not null default 'waiting'
                   check (status in ('waiting','ready','playing','revealed','finished')),
  duration_sec     int  not null default 7 check (duration_sec between 3 and 60),
  question_ids     uuid[] not null default '{}',
  current_index    int  not null default -1,
  current_question jsonb,          -- { id, index, total, text } (정답 없음)
  started_at       timestamptz,    -- 선택 시작 시각 (3초 카운트다운 후)
  ends_at          timestamptz,    -- 선택 마감 시각
  reveal           jsonb,          -- { answer, explanation, text, o, x, none, total }
  updated_at       timestamptz not null default now()
);

create table if not exists public.questions (
  id          uuid primary key default gen_random_uuid(),
  room_id     text not null references public.rooms(id) on delete cascade,
  ord         int  not null default 0,
  text        text not null check (char_length(text) between 1 and 300),
  answer      text check (answer in ('O','X')),
  explanation text,
  auto_rule   text,                -- male_majority | players_gte:N | majority_o
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists questions_room_idx on public.questions(room_id, ord);

create table if not exists public.players (
  id           uuid primary key default gen_random_uuid(),
  room_id      text not null references public.rooms(id) on delete cascade,
  nickname     text not null check (char_length(nickname) between 1 and 16),
  gender       text not null check (gender in ('M','F')),
  avatar       int  not null default 0,
  score        int  not null default 0,
  correct      int  not null default 0,
  streak       int  not null default 0,
  best_streak  int  not null default 0,
  last_correct boolean,
  joined_at    timestamptz not null default now()
);
create index if not exists players_room_idx on public.players(room_id);

create table if not exists public.player_tokens (
  player_id uuid primary key references public.players(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

create table if not exists public.answers (
  room_id     text not null references public.rooms(id) on delete cascade,
  seq         int  not null,
  player_id   uuid not null references public.players(id) on delete cascade,
  choice      text not null check (choice in ('O','X')),
  answered_at timestamptz not null default now(),
  primary key (room_id, seq, player_id)
);

create table if not exists public.admin_config (
  id            int primary key default 1 check (id = 1),
  password_hash text not null
);

create table if not exists public.admin_sessions (
  token      uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null
);

-- ───────────────────────── RLS ─────────────────────────
alter table public.rooms          enable row level security;
alter table public.questions      enable row level security;
alter table public.players        enable row level security;
alter table public.player_tokens  enable row level security;
alter table public.answers        enable row level security;
alter table public.admin_config   enable row level security;
alter table public.admin_sessions enable row level security;

revoke all on public.rooms, public.questions, public.players, public.player_tokens,
              public.answers, public.admin_config, public.admin_sessions
  from anon, authenticated;
grant select on public.rooms, public.players, public.answers to anon, authenticated;

drop policy if exists rooms_read on public.rooms;
create policy rooms_read on public.rooms for select to anon, authenticated using (true);
drop policy if exists players_read on public.players;
create policy players_read on public.players for select to anon, authenticated using (true);
drop policy if exists answers_read on public.answers;
create policy answers_read on public.answers for select to anon, authenticated using (true);

-- 방 상태 변경은 Realtime(postgres_changes) 으로 전파
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; end $$;

-- ───────────────────────── helpers ─────────────────────────
create or replace function public._admin_check(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or not exists (
    select 1 from admin_sessions where token = p_token and expires_at > now()
  ) then
    raise exception 'UNAUTHORIZED';
  end if;
end $$;

create or replace function public._q_public(p_qid uuid, p_index int, p_total int, p_with_text boolean)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', q.id, 'index', p_index, 'total', p_total,
    'text', case when p_with_text then q.text end)
  from questions q where q.id = p_qid
$$;

create or replace function public._room_lock(p_room text) returns public.rooms
language plpgsql security definer set search_path = public as $$
declare r rooms;
begin
  select * into r from rooms where id = p_room for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  return r;
end $$;

-- DB 소유자만 호출 가능: select public.set_admin_password('...');
create or replace function public.set_admin_password(p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if char_length(p_password) < 6 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  insert into admin_config(id, password_hash) values (1, crypt(p_password, gen_salt('bf')))
  on conflict (id) do update set password_hash = excluded.password_hash;
  delete from admin_sessions;
end $$;

-- ───────────────────────── public RPC ─────────────────────────
create or replace function public.server_now() returns bigint
language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create or replace function public.join_room(p_room text, p_nickname text, p_gender text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nick text := regexp_replace(btrim(coalesce(p_nickname, '')), '\s+', ' ', 'g');
  v_base text;
  v_i int := 2;
  v_player players;
  v_token uuid;
begin
  if not exists (select 1 from rooms where id = p_room) then raise exception 'ROOM_NOT_FOUND'; end if;
  if char_length(v_nick) < 1 or char_length(v_nick) > 12 then raise exception 'INVALID_NICKNAME'; end if;
  if p_gender not in ('M','F') then raise exception 'INVALID_GENDER'; end if;
  if (select count(*) from players where room_id = p_room) >= 500 then raise exception 'ROOM_FULL'; end if;

  v_base := v_nick;
  while exists (select 1 from players where room_id = p_room and nickname = v_nick) loop
    v_nick := v_base || v_i;
    v_i := v_i + 1;
  end loop;

  insert into players(room_id, nickname, gender, avatar)
  values (p_room, v_nick, p_gender, floor(random() * 16)::int)
  returning * into v_player;
  insert into player_tokens(player_id) values (v_player.id) returning token into v_token;

  return jsonb_build_object('player', to_jsonb(v_player), 'token', v_token);
end $$;

create or replace function public.resume_player(p_player uuid, p_token uuid)
returns jsonb language sql security definer set search_path = public as $$
  select to_jsonb(p) from players p
  join player_tokens t on t.player_id = p.id
  where p.id = p_player and t.token = p_token
$$;

create or replace function public.submit_answer(p_player uuid, p_token uuid, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_room text;
  r rooms;
  v_now timestamptz := clock_timestamp();
begin
  select p.room_id into v_room from players p
  join player_tokens t on t.player_id = p.id
  where p.id = p_player and t.token = p_token;
  if v_room is null then raise exception 'INVALID_PLAYER'; end if;
  if p_choice not in ('O','X') then raise exception 'INVALID_CHOICE'; end if;

  select * into r from rooms where id = v_room;
  -- 300ms 네트워크 유예
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

-- ───────────────────────── admin RPC ─────────────────────────
create or replace function public.admin_login(p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text; v_token uuid;
begin
  select password_hash into v_hash from admin_config where id = 1;
  if v_hash is null or crypt(coalesce(p_password, ''), v_hash) <> v_hash then
    perform pg_sleep(1);
    raise exception 'INVALID_PASSWORD';
  end if;
  delete from admin_sessions where expires_at < now();
  insert into admin_sessions(expires_at) values (now() + interval '24 hours')
  returning token into v_token;
  return v_token;
end $$;

create or replace function public.admin_logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from admin_sessions where token = p_token
$$;

create or replace function public.admin_verify(p_token uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from admin_sessions where token = p_token and expires_at > now())
$$;

create or replace function public.admin_create_room(p_token uuid, p_room text, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  insert into rooms(id, name) values (lower(p_room), coalesce(nullif(btrim(p_name), ''), 'OX Arena'));
  -- 기본 방(main)의 문제를 복사
  insert into questions(room_id, ord, text, answer, explanation, auto_rule, enabled)
  select lower(p_room), ord, text, answer, explanation, auto_rule, enabled
  from questions where room_id = 'main';
end $$;

create or replace function public.admin_update_room(p_token uuid, p_room text, p_name text, p_duration int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  update rooms set
    name = coalesce(nullif(btrim(p_name), ''), name),
    duration_sec = coalesce(p_duration, duration_sec),
    updated_at = now()
  where id = p_room;
end $$;

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
  update players set score = 0, correct = 0, streak = 0, best_streak = 0, last_correct = null
  where room_id = p_room;
  update rooms set
    status = 'ready', question_ids = v_ids, current_index = 0,
    current_question = _q_public(v_ids[1], 0, array_length(v_ids, 1), false),
    started_at = null, ends_at = null, reveal = null, updated_at = now()
  where id = p_room;
end $$;

create or replace function public.admin_start_question(p_token uuid, p_room text)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; v_start timestamptz;
begin
  perform _admin_check(p_token);
  r := _room_lock(p_room);
  if r.status <> 'ready' then raise exception 'NOT_READY'; end if;
  v_start := clock_timestamp() + interval '3 seconds';   -- 3,2,1 카운트다운
  update rooms set
    status = 'playing',
    current_question = _q_public(r.question_ids[r.current_index + 1], r.current_index,
                                 array_length(r.question_ids, 1), true),
    started_at = v_start,
    ends_at = v_start + make_interval(secs => r.duration_sec),
    reveal = null, updated_at = now()
  where id = p_room;
end $$;

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

  -- 우선순위: 관리자 지정 > 자동 규칙 > 저장된 정답
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
    score        = p.score + case when c.ok then 100 + case when p.streak >= 1 then 10 else 0 end else 0 end
  from (
    select p2.id, coalesce(a.choice = v_ans, false) as ok
    from players p2
    left join answers a on a.room_id = p2.room_id and a.seq = v_seq and a.player_id = p2.id
    where p2.room_id = p_room
  ) c
  where p.id = c.id;

  v_reveal := jsonb_build_object(
    'answer', v_ans, 'explanation', q.explanation, 'text', q.text,
    'o', v_o, 'x', v_x, 'none', v_total - v_o - v_x, 'total', v_total);

  update rooms set
    status = 'revealed', reveal = v_reveal,
    ends_at = least(ends_at, clock_timestamp()), updated_at = now()
  where id = p_room;
  return v_reveal;
end $$;

create or replace function public.admin_next(p_token uuid, p_room text)
returns void language plpgsql security definer set search_path = public as $$
declare r rooms; v_next int; v_total int;
begin
  perform _admin_check(p_token);
  r := _room_lock(p_room);
  if r.status not in ('ready','revealed') then raise exception 'INVALID_STATE'; end if;
  v_next := r.current_index + 1;
  v_total := coalesce(array_length(r.question_ids, 1), 0);
  if v_next >= v_total then
    update rooms set status = 'finished', started_at = null, ends_at = null, updated_at = now()
    where id = p_room;
  else
    update rooms set
      status = 'ready', current_index = v_next,
      current_question = _q_public(r.question_ids[v_next + 1], v_next, v_total, false),
      started_at = null, ends_at = null, reveal = null, updated_at = now()
    where id = p_room;
  end if;
end $$;

create or replace function public.admin_finish(p_token uuid, p_room text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  perform _room_lock(p_room);
  update rooms set status = 'finished', started_at = null, ends_at = null, updated_at = now()
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
    update players set score = 0, correct = 0, streak = 0, best_streak = 0, last_correct = null
    where room_id = p_room;
  end if;
  update rooms set
    status = 'waiting', question_ids = '{}', current_index = -1, current_question = null,
    started_at = null, ends_at = null, reveal = null, updated_at = now()
  where id = p_room;
end $$;

create or replace function public.admin_kick(p_token uuid, p_player uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  delete from players where id = p_player;
end $$;

create or replace function public.admin_list_questions(p_token uuid, p_room text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.ord, q.created_at)
    from questions q where q.room_id = p_room), '[]'::jsonb);
end $$;

create or replace function public.admin_save_question(p_token uuid, p_room text, p_q jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v questions;
begin
  perform _admin_check(p_token);
  if p_q ? 'id' and nullif(p_q->>'id', '') is not null then
    update questions set
      text        = coalesce(p_q->>'text', text),
      answer      = case when p_q ? 'answer' then nullif(p_q->>'answer', '') else answer end,
      explanation = case when p_q ? 'explanation' then nullif(p_q->>'explanation', '') else explanation end,
      auto_rule   = case when p_q ? 'auto_rule' then nullif(p_q->>'auto_rule', '') else auto_rule end,
      enabled     = coalesce((p_q->>'enabled')::boolean, enabled)
    where id = (p_q->>'id')::uuid and room_id = p_room
    returning * into v;
  else
    insert into questions(room_id, ord, text, answer, explanation, auto_rule, enabled)
    values (
      p_room,
      coalesce((select max(ord) + 1 from questions where room_id = p_room), 1),
      p_q->>'text',
      nullif(p_q->>'answer', ''),
      nullif(p_q->>'explanation', ''),
      nullif(p_q->>'auto_rule', ''),
      coalesce((p_q->>'enabled')::boolean, true))
    returning * into v;
  end if;
  return to_jsonb(v);
end $$;

create or replace function public.admin_delete_question(p_token uuid, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  delete from questions where id = p_id;
end $$;

create or replace function public.admin_reorder_questions(p_token uuid, p_room text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _admin_check(p_token);
  update questions q set ord = x.i
  from unnest(p_ids) with ordinality as x(id, i)
  where q.id = x.id and q.room_id = p_room;
end $$;

create or replace function public.admin_import_questions(p_token uuid, p_room text, p_items jsonb, p_replace boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_base int; v_count int;
begin
  perform _admin_check(p_token);
  if jsonb_typeof(p_items) <> 'array' then raise exception 'INVALID_ITEMS'; end if;
  if p_replace then delete from questions where room_id = p_room; end if;
  select coalesce(max(ord), 0) into v_base from questions where room_id = p_room;
  insert into questions(room_id, ord, text, answer, explanation, auto_rule, enabled)
  select p_room, v_base + i,
         e->>'text',
         nullif(upper(e->>'answer'), ''),
         nullif(e->>'explanation', ''),
         nullif(e->>'auto_rule', ''),
         coalesce((e->>'enabled')::boolean, true)
  from jsonb_array_elements(p_items) with ordinality as t(e, i)
  where nullif(btrim(e->>'text'), '') is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ───────────────────────── grants ─────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.server_now(),
  public.join_room(text, text, text),
  public.resume_player(uuid, uuid),
  public.submit_answer(uuid, uuid, text),
  public.admin_login(text),
  public.admin_logout(uuid),
  public.admin_verify(uuid),
  public.admin_create_room(uuid, text, text),
  public.admin_update_room(uuid, text, text, int),
  public.admin_start_game(uuid, text, boolean),
  public.admin_start_question(uuid, text),
  public.admin_reveal(uuid, text, text),
  public.admin_next(uuid, text),
  public.admin_finish(uuid, text),
  public.admin_reset(uuid, text, boolean),
  public.admin_kick(uuid, uuid),
  public.admin_list_questions(uuid, text),
  public.admin_save_question(uuid, text, jsonb),
  public.admin_delete_question(uuid, uuid),
  public.admin_reorder_questions(uuid, text, uuid[]),
  public.admin_import_questions(uuid, text, jsonb, boolean)
to anon, authenticated;
