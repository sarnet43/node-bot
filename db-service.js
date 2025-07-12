const db = require('./db');

// 학생 등록
async function registerStudent({ userId, name, grade, classNum, number }) {
  const sql = `
    INSERT INTO students (user_id, name, grade, class, number)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE name = VALUES(name), grade = VALUES(grade), class = VALUES(class), number = VALUES(number)
  `;
  await db.query(sql, [userId, name, grade, classNum, number]);
}

// 출결 등록 (fileUrl 추가)
async function recordAttendance({ userId, status, reason, fileUrl = null }) {
  const sql = `
    INSERT INTO attendance (user_id, date, status, reason, file_url)
    VALUES (?, CURDATE(), ?, ?, ?)
  `;
  await db.query(sql, [userId, status, reason, fileUrl]);
}

// 오늘 출결 확인
async function getTodayAttendance() {
  const sql = `
    SELECT s.grade, s.class, s.number, s.name, a.status, a.reason, a.file_url
    FROM attendance a
    JOIN students s ON a.user_id = s.user_id
    WHERE a.date = CURDATE()
  `;
  const [rows] = await db.query(sql);
  return rows;
}

// 월별 출결 통계
async function getMonthlyStats() {
  const sql = `
    SELECT 
      s.grade, s.class, s.number, s.name,
      SUM(CASE WHEN a.status = '지각' THEN 1 ELSE 0 END) AS late,
      SUM(CASE WHEN a.status = '결석' THEN 1 ELSE 0 END) AS absent
    FROM attendance a
    JOIN students s ON a.user_id = s.user_id
    WHERE DATE_FORMAT(a.date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')
    GROUP BY s.grade, s.class, s.number, s.name
    ORDER BY s.grade, s.class, s.number
  `;
  const [rows] = await db.query(sql);
  return rows;
}

// 개인 출결 기록 조회
async function getMyAttendance(userId, statusFilter) {
  let sql = `
    SELECT date, status, reason, file_url
    FROM attendance
    WHERE user_id = ?
  `;
  const params = [userId];

  if (statusFilter && statusFilter !== '전체') {
    sql += ' AND status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY date DESC';

  const [rows] = await db.query(sql, params);
  return rows;
}

// 학생 한 명 정보 가져오기
async function getStudent(userId) {
  const sql = `SELECT * FROM students WHERE user_id = ?`;
  const [rows] = await db.query(sql, [userId]);
  return rows[0] || null;
}

module.exports = {
  registerStudent,
  recordAttendance,
  getTodayAttendance,
  getMonthlyStats,
  getMyAttendance,
  getStudent
};
