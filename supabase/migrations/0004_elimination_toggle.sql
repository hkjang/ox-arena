-- 탈락 모드를 끄면 이미 탈락한 참가자도 즉시 부활(다음 문제부터 다시 풀 수 있음)
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
  if p_elimination = false then
    update players set eliminated = false where room_id = p_room and eliminated;
  end if;
end $$;
