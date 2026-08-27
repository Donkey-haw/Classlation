# Classlation

교실에서 대면 의사소통과 교사 화면을 함께 활용하는 독립형 웹 게임 프로젝트다. 게임에 따라 학생 기기를 연결하거나, 교실 TV 한 화면만 사용한다.

`Classlation`은 가제이며 제품 이름이 정해지면 저장소와 폴더 이름도 변경할 수 있다.

## 현재 상태

- 상태: 독립 게임 3개 작동형 구현 완료
- LAN 가능성: 기존 `school-quiz-game`의 실제 사용으로 검증 완료
- 구현 게임: `클래스 라이어`, `돋보기 추리왕`, `몸으로 말해요`
- 작업 위치: `/Users/jonyeock/Desktop/Programming/Classlation`
- 상세 계획: `/Users/jonyeock/Documents/LifeOS/Domains/Development/Plans/Classlation-MVP-개발-계획.md`
- 원 기획: `/Users/jonyeock/Documents/LifeOS/Projects/교실 협업 게임(테셀레이션 프로젝트 기획).md`
- 게임 조사: `docs/research/2026-08-19-icebreaker-collaboration-game-landscape.md`
- 첫 게임 설계: `docs/features/classroom-liar-game.md`
- 실행 방법: `games/classroom-liar/README.md`

## 가장 쉬운 실행

1. Finder에서 `/Users/jonyeock/Desktop/Programming/Classlation`을 연다.
2. `Classlation 시작.command`를 더블클릭한다.
3. 터미널에 표시되는 1~3번 게임 중 하나를 고른다.
4. 브라우저에 열린 교사 화면을 교실 TV에 띄운다.
5. 게임을 사용하는 동안 시작할 때 열린 터미널 창을 그대로 둔다.
6. 끝낼 때 `Classlation 종료.command`를 더블클릭하거나 터미널에서 `Control + C`를 누른다.

첫 실행에는 필요한 파일 설치와 화면 빌드 때문에 잠시 시간이 걸릴 수 있다. 한 번에 한 게임만 실행하며, 다른 게임으로 바꾸려면 먼저 종료 파일을 실행한다.

## 게임별 운영 방식

| 게임 | 화면 | 학생 기기 | 핵심 흐름 |
|---|---|---:|---|
| 클래스 라이어 | 교사 TV + 학생 화면 | 사용 | 팀 배정과 비밀 역할만 온라인으로 전달하고 대화는 대면으로 진행 |
| 돋보기 추리왕 | 교사 TV | 미사용 | 교사가 등록한 사진의 일부·초성·정답을 차례로 공개 |
| 몸으로 말해요 | 교사 TV | 미사용 | 두 팀 주제를 함께 공개하고 서로 다른 주제로 동시에 진행 |

## 현재 목표

세 게임을 실제 수업에서 독립적으로 사용하며 운영 문제와 반복되는 규격을 찾는다. `클래스 라이어`는 실제 기기 재접속과 라운드별 팀 재편성을 계속 검증하고, 새로 이관한 두 TV용 게임은 조작 거리·글자 크기·라운드 전환 속도를 관찰한다.

공통 게임 엔진이나 범용 허브는 아직 만들지 않는다. Classlation 전체 브랜드와 개인 브랜드 에셋을 먼저 정확히 정의한 뒤 세 게임의 시각 디자인을 한 번에 감사하고 조정한다.

## 작업 구조 원칙

```text
games/
  classroom-liar/       학생 기기를 사용하는 대면 라이어 게임
  magnifier-mystery/    교실 TV용 사진 추리 게임
  classroom-charades/   교실 TV용 두 팀 동시 몸짓 게임
docs/
  features/           게임별 규칙과 이관 범위
  research/           게임·제품 조사
  decisions/          실제로 내린 결정
  classroom-tests/    실제 수업 관찰
```

각 게임은 자체 서버, UI, 규칙, 콘텐츠, 테스트를 가진 독립 앱이다. 최상단 실행 파일은 게임 선택과 실행만 담당하며 공통 게임 코어나 플랫폼 구조는 만들지 않았다. Classlation 전체 브랜드와 디자인 에셋이 정해지면 세 게임의 시각 체계를 한 번에 조정한다.
