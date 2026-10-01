import { createClient } from '@supabase/supabase-js';

// publishable key 는 공개되어도 안전하다 (모든 쓰기는 RLS + RPC 로 보호됨)
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://tlvwqfusipckijixubzo.supabase.co';
const KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_u4PIByH6jy9LwCTIsQdcmA_5Fu4bs2H';

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 40 } },
});

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
