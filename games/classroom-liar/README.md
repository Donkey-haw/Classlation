# 클래스 라이어

같은 Wi-Fi 안에서 교사 MacBook이 방을 열고 학생이 휴대폰 브라우저로 참여하는 독립형 교실 라이어 게임이다. 앱은 팀 배정·비밀 정보·익명 투표만 맡고, 학생은 기기를 내려놓은 채 단서와 질문을 직접 주고받는다.

## 처음 실행

가장 쉬운 방법은 프로젝트 최상단의 `Classlation 시작.command`를 더블클릭하는 것이다. 필요한 파일 준비, 빌드, 서버 시작, 교사 브라우저 열기를 자동으로 처리한다. 종료는 `Classlation 종료.command`를 더블클릭한다.

Node.js 24와 pnpm이 필요하다. 수동으로 실행하려면 다음 명령을 사용한다.

```bash
cd /Users/jonyeock/Desktop/Programming/Classlation/games/classroom-liar
pnpm install
pnpm build
pnpm start
```

교사는 브라우저에서 `http://localhost:4173`을 연다. 방을 만들면 화면에 6자리 코드, QR 코드, 같은 Wi-Fi에서 접속할 수 있는 주소가 표시된다. 학생은 QR을 스캔하거나 주소를 입력한다.

수동 실행 종료는 터미널에서 `Control + C`를 누른다.

## 개발 실행

```bash
pnpm dev
```

- 교사 개발 화면: `http://localhost:5173`
- 학생 개발 화면: `http://localhost:5173/join`
- Vite가 `/api`와 `/socket.io`를 로컬 서버로 전달한다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm test:e2e
```

`test:e2e`는 실행 중인 서버를 대상으로 교사 브라우저 1개와 학생 모바일 크기 브라우저 5개를 열어 `입장 → 팀 확인·자리 이동 → 역할 확인 → 대면 대화 → 투표 → 구두 추측·정답 공개` 전체 라운드를 진행한다. 늦은 입장 차단과 교사·학생 새로고침 복구도 함께 확인한다.

## 현재 범위

- 포함: 즉석 주제어 입력, 방·QR 입장, 게임 전 팀 편성·자리 이동, 역할·주제어 은닉, 대면 대화 안내, 비밀 투표, 결선, 라이어의 구두 추리·정답 공개, 다음 라운드, 새로고침 복구
- 저장: 실행 중인 서버 메모리와 기기의 임시 재접속 키만 사용
- 외부 전송: 없음
- 미완료 검증: 개정 흐름의 실제 iPhone/Android 재확인, 32명 동시 접속, 두 번째 수업 파일럿

macOS 방화벽이 Node의 수신 연결을 묻는다면 수업용 로컬 접속을 위해 허용해야 한다.
