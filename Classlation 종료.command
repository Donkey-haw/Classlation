#!/bin/zsh

set -u

PROJECT_DIR="${0:A:h}"
PORT=4173
HEALTH_URL="http://localhost:$PORT/api/health"
PID_FILE="$PROJECT_DIR/.classlation-classroom-liar.pid"

pause_before_close() {
  if [[ "${CLASSLATION_NO_PAUSE:-0}" != "1" && -t 0 ]]; then
    echo
    read -k 1 "?이 창을 닫으려면 아무 키나 누르세요."
    echo
  fi
}

health_response() {
  curl -fsS --max-time 1 "$HEALTH_URL" 2>/dev/null || true
}

clear
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Classlation 종료"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

if [[ "$(health_response)" != *'"app":"classroom-liar"'* ]]; then
  echo "실행 중인 클래스 라이어가 없습니다."
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${PORT}번 포트는 다른 프로그램이 사용하고 있어 종료하지 않았습니다."
  fi
  rm -f "$PID_FILE"
  pause_before_close
  exit 0
fi

SERVER_PID=""
if [[ -f "$PID_FILE" ]]; then
  CANDIDATE_PID="$(<"$PID_FILE")"
  if [[ "$CANDIDATE_PID" == <-> ]] && lsof -nP -a -p "$CANDIDATE_PID" -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | grep -qx "$CANDIDATE_PID"; then
    SERVER_PID="$CANDIDATE_PID"
  fi
fi

if [[ -z "$SERVER_PID" ]]; then
  SERVER_PID="$(lsof -nP -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1)"
fi

if [[ -z "$SERVER_PID" || "$SERVER_PID" != <-> ]]; then
  echo "클래스 라이어 서버의 실행 번호를 확인하지 못했습니다."
  echo "시작할 때 열린 터미널에서 Control + C를 눌러 주세요."
  pause_before_close
  exit 1
fi

kill -TERM "$SERVER_PID" 2>/dev/null || true
for _ in {1..40}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "서버가 아직 종료 중입니다. 시작 터미널에서 Control + C를 눌러 주세요."
  pause_before_close
  exit 1
fi

rm -f "$PID_FILE"
echo "클래스 라이어를 종료했습니다."
pause_before_close
