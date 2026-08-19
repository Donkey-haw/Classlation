# Classlation

로컬 네트워크에서 교사가 방을 열고 학생들이 각자 다른 정보를 받아 대화로 문제를 해결하는 교실 협업 웹 게임 프로젝트다.

`Classlation`은 가제이며 제품 이름이 정해지면 저장소와 폴더 이름도 변경할 수 있다.

## 현재 상태

- 상태: 첫 독립 게임 `클래스 라이어` 작동형 MVP 구현 완료, 실제 기기·수업 파일럿 준비 중
- LAN 가능성: 기존 `school-quiz-game`의 실제 사용으로 검증 완료
- 첫 제품 후보: `클래스 라이어`(의사소통 중심 교실용 라이어 게임)
- 작업 위치: `/Users/jonyeock/Desktop/Programming/Classlation`
- 상세 계획: `/Users/jonyeock/Documents/LifeOS/Domains/Development/Plans/Classlation-MVP-개발-계획.md`
- 원 기획: `/Users/jonyeock/Documents/LifeOS/Projects/교실 협업 게임(테셀레이션 프로젝트 기획).md`
- 게임 조사: `docs/research/2026-08-19-icebreaker-collaboration-game-landscape.md`
- 첫 게임 설계: `docs/features/classroom-liar-game.md`
- 실행 방법: `games/classroom-liar/README.md`

## 가장 쉬운 실행

1. Finder에서 `/Users/jonyeock/Desktop/Programming/Classlation`을 연다.
2. `Classlation 시작.command`를 더블클릭한다.
3. 교사 화면이 브라우저에 열리면 방을 만든다.
4. 게임을 사용하는 동안 시작할 때 열린 터미널 창을 그대로 둔다.
5. 끝낼 때 `Classlation 종료.command`를 더블클릭하거나 터미널에서 `Control + C`를 누른다.

첫 실행에는 필요한 파일 설치와 화면 빌드 때문에 잠시 시간이 걸릴 수 있다. 이미 실행 중인 상태에서 시작 파일을 다시 누르면 서버를 중복 실행하지 않고 기존 교사 화면만 연다.

## 현재 목표

LAN 접속 가능성은 `/Users/jonyeock/Desktop/Programming/anti/school-quiz-game`의 실제 사용으로 검증되었다. 첫 게임은 교사가 `분류명 + 주제어 목록`만 입력하고, 4~6명 팀의 모든 학생이 단서 발언과 질문을 한 번씩 수행하는 `클래스 라이어`다.

첫 수직 슬라이스를 실제 수업 결과에 맞춰 `방 생성 → QR 입장 → 입장 마감·팀 배정 → 팀 확인·자리 이동 → 비밀 역할 확인 → 기기를 내려놓고 대면 대화 → 비밀 투표 → 라이어의 구두 추리·정답 공개`로 개정했다. 운영 빌드는 웹 UI와 Socket.IO 서버를 한 Node 프로세스·한 포트에서 제공하며, 교사 1개·학생 5개 브라우저의 개정 전체 흐름 자동 검증을 통과했다.

더블클릭 실행·종료 런처까지 검증했다. 첫 수업에서 확인된 `과도한 절차 클릭`과 `시작 직후 팀 이동` 문제를 반영했으며, 다음 목표는 개정 흐름으로 두 번째 수업 파일럿을 진행하고 실제 기기 재접속과 32명 연결을 검증하는 것이다.

## 작업 구조 원칙

```text
games/
  classroom-liar/     첫 번째 독립 게임 후보
  expression-relay/   두 번째 독립 게임 후보
  consensus-lab/      세 번째 독립 게임 후보
docs/
  research/           게임·제품 조사
  decisions/          실제로 내린 결정
  classroom-tests/    실제 수업 관찰
```

각 게임은 자체 서버, UI, 규칙, 콘텐츠, 테스트를 가진 독립 앱으로 시작한다. 두세 게임에서 같은 코드와 운영 문제가 반복된 뒤에만 공통 모듈이나 허브를 추출한다. 현재 구현 코드는 `games/classroom-liar/`에만 있으며 공통 게임 코어나 허브는 만들지 않았다.
