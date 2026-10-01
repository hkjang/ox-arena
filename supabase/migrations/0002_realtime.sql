do $$ begin alter publication supabase_realtime add table public.players; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.answers; exception when duplicate_object then null; end $$;
alter table public.players replica identity full;
alter table public.answers replica identity full;
