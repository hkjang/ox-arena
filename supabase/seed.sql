insert into public.rooms(id, name) values ('main', 'OX Arena') on conflict do nothing;
delete from public.questions where room_id = 'main';
insert into public.questions(room_id, ord, text, answer, explanation, auto_rule) values
('main', 1, '대한민국의 수도는 서울이다', 'O', null, null),
('main', 2, '한라산은 대한민국에서 가장 높은 산이다', 'O', '해발 1,947m 로 남한 최고봉입니다.', null),
('main', 3, '펭귄은 북극에 산다', 'X', '펭귄은 주로 남반구에 살아요. 북극에는 없습니다.', null),
('main', 4, '성인의 뼈는 보통 200개가 넘는다', 'O', '성인 뼈는 약 206개입니다.', null),
('main', 5, '지구에서 가장 큰 대양은 태평양이다', 'O', null, null),
('main', 6, '문어의 심장은 3개다', 'O', '아가미 심장 2개 + 몸 심장 1개!', null),
('main', 7, '금붕어의 기억력은 정확히 3초뿐이다', 'X', '금붕어는 몇 달간 기억하기도 합니다.', null),
('main', 8, '번개는 같은 곳에 두 번 떨어질 수 있다', 'O', '높은 건물에는 한 해에도 여러 번 칩니다.', null),
('main', 9, '박쥐는 포유류다', 'O', null, null),
('main', 10, '세계에서 면적이 가장 큰 나라는 러시아다', 'O', null, null),
('main', 11, '우리는 졸업한 지 10년이 넘었다', null, '관리자가 정답 공개 시 선택', null),
('main', 12, '우리 학교에는 매점이 있었다', null, '관리자가 정답 공개 시 선택', null),
('main', 13, '우리 반 담임선생님은 남자였다', null, '관리자가 정답 공개 시 선택', null),
('main', 14, '우리 반은 졸업여행을 제주도로 갔다', null, '관리자가 정답 공개 시 선택', null),
('main', 15, '학창시절 휴대폰을 가지고 다녔다', null, '관리자가 정답 공개 시 선택', null),
('main', 16, '오늘 참석자 중 결혼한 사람이 절반 이상이다', null, '관리자가 정답 공개 시 선택', null),
('main', 17, '오늘 참가자 중 남자가 더 많다', null, '실시간 접속자 성별로 자동 판정', 'male_majority'),
('main', 18, '오늘 모임에 30명 이상 참석했다', null, '실시간 접속자 수로 자동 판정', 'players_gte:30'),
('main', 19, '이번 문제에서 O를 고른 사람이 더 많을 것이다', null, '실제 투표 결과로 자동 판정', 'majority_o'),
('main', 20, '오늘 2차가 있다', null, '관리자가 정답 공개 시 선택', null);
