import { createClassroomLiarServer } from "./app";

const port = Number(process.env.PORT || 4173);
const { httpServer } = createClassroomLiarServer();

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Classroom Liar server: http://localhost:${port}`);
  console.log("같은 와이파이의 학생은 교사 화면에 표시되는 주소로 접속하세요.");
});
