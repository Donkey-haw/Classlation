#!/bin/zsh

set -u

PROJECT_DIR="${0:A:h}"
PORT=4173
GAME_URL="http://localhost:$PORT"
HEALTH_URL="$GAME_URL/api/health"
PID_FILE="$PROJECT_DIR/.classlation-active.pid"
APP_FILE="$PROJECT_DIR/.classlation-active-app"
LOG_FILE="${TMPDIR:-/tmp}/classlation-launcher-$$.log"
SERVER_PID=""

pause_before_close() {
  if [[ "${CLASSLATION_NO_PAUSE:-0}" != "1" && -t 0 ]]; then
    echo
    read -k 1 "?이 창을 닫으려면 아무 키나 누르세요."
    echo
  fi
}

show_log_tail() {
  if [[ -s "$LOG_FILE" ]]; then
    echo
    echo "마지막 실행 기록:"
    tail -n 24 "$LOG_FILE"
  fi
}

fail() {
  echo
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "실행하지 못했습니다"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$1"
  show_log_tail
  pause_before_close
  exit 1
}

health_response() { curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null || true; }
running_app() {
  local response="$(health_response)"
  if [[ "$response" == *'"app":"classroom-liar"'* ]]; then echo "classroom-liar"
  elif [[ "$response" == *'"app":"magnifier-mystery"'* ]]; then echo "magnifier-mystery"
  elif [[ "$response" == *'"app":"classroom-charades"'* ]]; then echo "classroom-charades"
  fi
}

configure_game() {
  case "$1" in
    1|classroom-liar|liar)
      GAME_ID="classroom-liar"; GAME_NAME="클래스 라이어"; GAME_DIR="$PROJECT_DIR/games/classroom-liar"
      GAME_GUIDE="학생용 QR과 접속 주소는 교사 화면에서 확인하세요." ;;
    2|magnifier-mystery|magnifier)
      GAME_ID="magnifier-mystery"; GAME_NAME="돋보기 추리왕"; GAME_DIR="$PROJECT_DIR/games/magnifier-mystery"
      GAME_GUIDE="교실 TV에 이 화면을 띄우고 진행하세요. 학생 기기 접속은 필요하지 않습니다." ;;
    3|classroom-charades|charades)
      GAME_ID="classroom-charades"; GAME_NAME="몸으로 말해요"; GAME_DIR="$PROJECT_DIR/games/classroom-charades"
      GAME_GUIDE="교실 TV에 이 화면을 띄우고 진행하세요. 학생 기기 접속은 필요하지 않습니다." ;;
    *) fail "선택한 게임을 찾지 못했습니다: $1" ;;
  esac
}

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -f "$PID_FILE" ]] && [[ "$(<"$PID_FILE")" == "$SERVER_PID" ]]; then rm -f "$PID_FILE" "$APP_FILE"; fi
}

trap cleanup EXIT HUP TERM
trap 'echo; echo "종료 요청을 받았습니다."; exit 130' INT

clear
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Classlation 게임 선택"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "1. 클래스 라이어     학생 기기 접속 · 팀별 대면 대화"
echo "2. 돋보기 추리왕     교실 TV · 사진 일부 추리"
echo "3. 몸으로 말해요     교실 TV · 두 팀 동시 진행"
echo

if [[ -n "${CLASSLATION_GAME:-}" ]]; then
  GAME_CHOICE="$CLASSLATION_GAME"
elif [[ -t 0 ]]; then
  read "?실행할 게임 번호 [1]: " GAME_CHOICE
  GAME_CHOICE="${GAME_CHOICE:-1}"
else
  GAME_CHOICE="1"
fi
configure_game "$GAME_CHOICE"

if [[ ! -d "$GAME_DIR" || ! -f "$GAME_DIR/package.json" ]]; then fail "$GAME_NAME 폴더를 찾지 못했습니다.\n예상 위치: $GAME_DIR"; fi

ACTIVE_APP="$(running_app)"
if [[ -n "$ACTIVE_APP" ]]; then
  if [[ "$ACTIVE_APP" == "$GAME_ID" ]]; then
    echo "$GAME_NAME 게임이 이미 실행 중입니다."
    if [[ "${CLASSLATION_NO_OPEN:-0}" != "1" ]]; then open "$GAME_URL"; fi
    pause_before_close
    exit 0
  fi
  fail "다른 Classlation 게임이 실행 중입니다.\n먼저 'Classlation 종료.command'를 실행한 뒤 다시 시작해 주세요."
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then fail "${PORT}번 포트를 다른 프로그램이 사용 중입니다.\n그 프로그램을 종료한 뒤 다시 실행해 주세요."; fi
if ! command -v node >/dev/null 2>&1; then fail "Node.js를 찾지 못했습니다. Node.js 24가 설치되어 있는지 확인해 주세요."; fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [[ "$NODE_MAJOR" != "24" ]]; then fail "Node.js 24가 필요하지만 현재 버전은 $(node --version 2>/dev/null || echo '확인 불가')입니다."; fi

typeset -a PNPM_COMMAND
if command -v pnpm >/dev/null 2>&1; then PNPM_COMMAND=(pnpm)
elif command -v corepack >/dev/null 2>&1; then PNPM_COMMAND=(corepack pnpm)
else fail "pnpm을 찾지 못했습니다. Node.js의 Corepack 또는 pnpm 설치를 확인해 주세요."
fi

cd "$GAME_DIR" || fail "게임 폴더로 이동하지 못했습니다."
echo
echo "선택: $GAME_NAME"
echo "1/3 실행 준비를 확인하고 있습니다..."
if ! "${PNPM_COMMAND[@]}" install --frozen-lockfile >"$LOG_FILE" 2>&1; then fail "필요한 파일을 준비하지 못했습니다. 인터넷 연결과 pnpm 설정을 확인해 주세요."; fi
echo "2/3 최신 화면을 만들고 있습니다..."
if ! "${PNPM_COMMAND[@]}" build >>"$LOG_FILE" 2>&1; then fail "화면 빌드에 실패했습니다. 아래 실행 기록을 확인해 주세요."; fi
echo "3/3 게임을 시작하고 있습니다..."
node --import tsx src/server/index.ts >>"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"
echo "$GAME_ID" > "$APP_FILE"

READY=0
for _ in {1..60}; do
  if [[ "$(running_app)" == "$GAME_ID" ]]; then READY=1; break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.25
done
if [[ "$READY" != "1" ]]; then fail "게임이 제한 시간 안에 준비되지 않았습니다."; fi
if [[ "${CLASSLATION_NO_OPEN:-0}" != "1" ]]; then open "$GAME_URL"; fi

clear
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$GAME_NAME 실행 중"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "교사 화면: $GAME_URL"
echo "$GAME_GUIDE"
echo
echo "종료 방법"
echo "• 이 창에서 Control + C"
echo "• Classlation 종료.command 더블클릭"
echo
echo "이 터미널 창은 게임을 사용하는 동안 열어 두세요."

wait "$SERVER_PID"
SERVER_STATUS=$?
SERVER_PID=""
rm -f "$PID_FILE" "$APP_FILE"
echo
if [[ "$SERVER_STATUS" -eq 0 || "$SERVER_STATUS" -eq 143 ]]; then echo "$GAME_NAME 게임이 종료되었습니다."
else echo "$GAME_NAME 게임이 예기치 않게 종료되었습니다."; show_log_tail
fi
pause_before_close
