# ADR 0003: Do not connect the student interview site to Gemini API

- Status: accepted
- Date: 2026-08-27

## Context

새 학습 도구는 초등학교 6학년 학생이 세계 하천 지형의 AI 가상 주민을 직접 인터뷰하도록 설계한다. 학생 질문과 AI 답변이 외부 모델로 전송되며, API 키·비용·학생 데이터·유해하거나 부정확한 응답을 함께 다뤄야 한다.

2026-08-27 확인 기준 [Gemini API 추가 약관](https://ai.google.dev/gemini-api/terms)은 Gemini API를 사용하는 사이트나 앱이 18세 미만을 대상으로 하거나 18세 미만이 접근할 가능성이 있는 경우를 금지한다. [Google Cloud 서비스별 약관](https://cloud.google.com/terms/service-terms)의 생성형 AI 서비스에도 같은 제한이 있으므로 Vertex AI는 우회 경로가 아니다.

## Decision

- 학생이 접속하는 Classlation 웹사이트에는 Gemini Developer API 또는 Vertex AI 생성형 AI를 연결하지 않는다.
- 학습 도구는 `learning-tools/river-resident-interview/` 아래에서 게임과 분리하고, 모델 공급자를 교체할 수 있는 경계로 설계한다.
- 교사만 사용하는 개발용 행동 실험과 학생용 실행 경로를 분리한다.
- 학생 대상 구현은 해당 연령대 사용을 명시적으로 허용하는 공급자나 로컬 모델이 확정된 뒤 연결한다.
- Google의 약관 변경 또는 서면 허가가 확인되기 전에는 Gemini API 키를 프로젝트에 설정하지 않는다.

## Why

시스템 프롬프트, 보호자 안내, 교사 감독, 서버 측 안전 필터는 모델 행동을 더 안전하게 만들 수 있지만 공급자의 연령 제한을 해소하지는 못한다. 약관을 어긴 채 구현하면 계정 정지, 비용, 학교와 학생의 신뢰 문제로 이어질 수 있다.

## Alternatives considered

- **Gemini Developer API를 그대로 사용:** 원하는 독립 UI를 만들 수 있지만 현재 연령 제한과 직접 충돌한다.
- **Vertex AI로 변경:** 데이터 통제 기능은 더 강하지만 현재 Google Cloud 생성형 AI 약관에도 같은 연령 제한이 있다.
- **Google Workspace for Education의 Gemini 앱·공유 Gem:** 미성년 학생을 위한 Google의 교육 환경을 이용할 수 있지만 Classlation의 독립 UI, 서버 검증, 대화 상태 통제를 그대로 구현할 수 없다.
- **교사 MacBook의 로컬 모델:** 외부 전송과 공급자 연령 제한을 피할 수 있지만 한국어 품질, 설치 크기, 학급 동시 요청 성능을 먼저 검증해야 한다.
- **다른 AI API:** 가능성은 있지만 학생 사용 약관, 개인정보, 데이터 보존, 비용을 새로 검토해야 한다.

## Consequences

- 수업 흐름과 지역 자료 설계는 즉시 진행할 수 있지만 학생용 AI 답변 생성은 공급자 결정 전까지 막힌다.
- AI 없는 응답 시뮬레이션으로 UI와 수업 동선을 먼저 검증할 수 있다.
- 모델 공급자를 나중에 바꿔도 지역 자료, 입력 정책, 출력 검증, 평가 질문 세트는 재사용할 수 있다.
- 독립 사이트를 고집하면 로컬 모델의 운영 부담을 감수할 수 있다.

## Revisit when

- Google이 Gemini API 또는 Google Cloud 생성형 AI의 18세 미만 교육용 사용을 명시적으로 허용한다.
- Google로부터 이 사용 사례에 대한 서면 허가를 받는다.
- 학교 관리자가 Google Workspace for Education의 Gemini 앱과 공유 Gem 사용을 승인하고, 독립 사이트 요구를 낮춘다.
- 학생 대상 사용을 허용하는 다른 공급자나 충분히 작동하는 로컬 모델이 검증된다.
