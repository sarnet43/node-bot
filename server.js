const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// uploads 폴더를 정적 폴더로 공개
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.listen(PORT, () => {
  console.log(`파일 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
    