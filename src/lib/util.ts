import { useSearchParams } from 'react-router-dom';

export function useRoomId() {
  const [sp] = useSearchParams();
  return (sp.get('room') || 'main').toLowerCase();
}

export function joinUrl(room: string) {
  const base = location.href.split('#')[0];
  return `${base}#/?room=${room}`;
}

export function errMsg(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  const map: Record<string, string> = {
    INVALID_NICKNAME: '닉네임은 1~12자로 입력해 주세요.',
    INVALID_GENDER: '성별을 선택해 주세요.',
    ROOM_NOT_FOUND: '존재하지 않는 방입니다.',
    ROOM_FULL: '방이 가득 찼습니다.',
    INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
    UNAUTHORIZED: '로그인이 만료되었습니다.',
    NO_QUESTIONS: '활성화된 문제가 없습니다.',
    NOT_READY: '문제를 시작할 수 있는 상태가 아닙니다.',
    NOT_PLAYING: '진행 중인 문제가 아닙니다.',
    ANSWER_REQUIRED: '정답을 선택해 주세요.',
    INVALID_STATE: '지금은 할 수 없는 동작입니다.',
  };
  return map[m] ?? m;
}
