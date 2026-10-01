# OX Arena

참가자들의 O/X 선택이 행사장 대형화면 속 캐릭터 이동으로 실시간 표현되는 멀티플레이어 OX 파티 게임.
**GitHub Pages(React) + Supabase(Postgres RPC + Realtime)** 구성. 별도 서버 없음.

| 화면 | 주소 |
|---|---|
| 참가자(모바일) | `/#/?room=main` |
| 행사장 대형화면 | `/#/display?room=main` |
| 관리자 | `/#/admin?room=main` |

## 규칙
선택 7초(방 설정으로 변경) · 선택 변경 가능 · 정답 +100 / 연속정답 +10 · 오답 탈락 없음 · 동점 공동순위.
시간 판정은 모두 DB 서버 시각(`started_at`/`ends_at`) 기준이며, 마감 후 제출은 서버가 거부합니다.

## 보안 모델
- 클라이언트는 publishable key 만 사용. 테이블은 RLS로 `rooms/players/answers` 읽기 전용.
- 모든 쓰기는 `SECURITY DEFINER` RPC. 정답(`questions.answer`)은 클라이언트가 읽을 수 없고 공개 시점에만 `rooms.reveal` 로 전달.
- 관리자 비밀번호는 bcrypt 해시로 DB에만 저장, 로그인 시 24시간 세션 토큰 발급.

## 직접 배포(Fork)
1. Supabase 프로젝트 생성 → SQL Editor 에서 `supabase/migrations/*.sql`, `supabase/seed.sql` 순서대로 실행
2. `select set_admin_password('원하는비밀번호');` 실행
3. 저장소 Settings → Variables 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`(publishable) 설정 (또는 `src/lib/supabase.ts` 기본값 수정)
4. Settings → Pages → Source: GitHub Actions

## 개발
```
npm i && npm run dev
```
