import { describe, expect, it } from 'vitest';
import { errMsg } from './util';

describe('errMsg', () => {
  it('알려진 에러 코드를 한국어 문구로 바꾼다', () => {
    expect(errMsg(new Error('ROOM_FULL'))).toBe('방이 가득 찼습니다.');
  });

  it('Error 가 아닌 값도 문자열로 바꿔 매핑한다', () => {
    expect(errMsg('UNAUTHORIZED')).toBe('로그인이 만료되었습니다.');
  });

  it('매핑에 없는 메시지는 그대로 통과시킨다', () => {
    expect(errMsg(new Error('network timeout'))).toBe('network timeout');
  });

  it('코드가 아닌 값도 문자열화해 반환한다', () => {
    expect(errMsg(null)).toBe('null');
  });
});
