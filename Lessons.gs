// ============================================================
// lessons.gs — ניהול שיעורים, טסטים, אוטומציה לילית
// ============================================================

// Lesson duration in minutes
const LESSON_DURATIONS = {
  'בודד': 40,
  'וחצי': 60,
  'כפול': 80,
  'משולש': 120,
  'פנימי': 50,
  'טסט': 120
};

// __ חישוב שעת סיום של שיעור __
function calcEndTime(startTime, lessonType) {
  if (!startTime || !lessonType) return '';
  const duration = LESSON_DURATIONS[String(lessonType)] || 40;
  const parts = String(startTime).split(':');
  if (parts.length < 2) return '';
  let hours = parseInt(parts[0], 10);
  let mins = parseInt(parts[1], 10) + duration;
  hours += Math.floor(mins / 60);
  mins = mins % 60;
  return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

// ── קריאת שיעורים ──

function getLessonsData() {
  const vals = _sheet(SHEET_LESSONS).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (!r[0]) continue;
    out.push(_rowToLesson(r));
  }
  return out;
}

function getLessonsByStudent(internalId) {
  const sid  = String(internalId);
  const all  = getLessonsData();
  return all.filter(l => l.studentId === sid || l.studentId2 === sid);
}

function _rowToLesson(r) {
  return {
    eventId    : String(r[0]),
    studentId  : String(r[1]),
    studentName: String(r[2]),
    date       : String(r[3]),
    time       : String(r[4]),
    endTime    : String(r[5] || ''),
    type       : String(r[6]),
    price      : Number(r[7]) || 0,
    status     : String(r[8]),
    note       : String(r[9]),
    studentId2 : String(r[10] || '')
  };
}

// ── הוספת שיעור ──

function addLessonFromUI(data) {
  const sh = _sheet(SHEET_LESSONS);

  const lessonType = String(data.type || 'בודד');
  const price      = _calcLessonPrice(data);
  const eventId    = 'L_' + _tsNow();
  const endTime    = calcEndTime(String(data.time || ''), lessonType);

  sh.appendRow([
    eventId,
    String(data.studentId),
    String(data.studentName),
    String(data.date),
    String(data.time),
    endTime,
    lessonType,
    price,
    STATUS_PLANNED,
    String(data.note || ''),
    String(data.studentId2 || '')
  ]);
  SpreadsheetApp.flush();

  return { ok: true, eventId, price };
}

function _calcLessonPrice(data) {
  const type = String(data.type || '');

  if (type === 'טסט') {
    // בחבילה: הטסטים הראשונים חינם
    if (data.priceType === 'packageA' || data.priceType === 'packageB') {
      const freeTests = data.priceType === 'packageA' ? PACKAGE_A.tests : PACKAGE_B.tests;
      const usedTests = _countTestsByStudent(String(data.studentId));
      return usedTests < freeTests ? 0 : PRICE_TEST;
    }
    return PRICE_TEST;
  }

  if (type === 'פנימי') {
    if (data.priceType === 'packageA' || data.priceType === 'packageB') return PRICE_INTERNAL_PACKAGE;
    return PRICE_INTERNAL_REGULAR;
  }

  // שיעור רגיל בחבילה — אחרי 28 לפי מחיר נוסף
  if (data.priceType === 'packageA' || data.priceType === 'packageB') {
    const limit = data.priceType === 'packageA' ? PACKAGE_A.lessons : PACKAGE_B.lessons;
    const done  = _countRegularLessonsByStudent(String(data.studentId));
    if (done < limit) return Number(data.price) || 0; // מחיר חבילה
    return Number(data.extraPrice) || 160; // שיעור נוסף — סולם רגיל
  }

  return Number(data.price) || 0;
}

function _countTestsByStudent(sid) {
  const vals = _sheet(SHEET_LESSONS).getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][1]) === sid && String(vals[i][6]) === 'טסט') count++;
  }
  return count;
}

function _countRegularLessonsByStudent(sid) {
  const vals = _sheet(SHEET_LESSONS).getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][1]) !== sid) continue;
    const type   = String(vals[i][6]);
    const status = String(vals[i][8]);
    if (type !== 'טסט' && type !== 'פנימי' && status === STATUS_DONE) count++;
  }
  return count;
}

// ── עדכון שיעור ──

function updateLessonById(id, data) {
  const sh   = _sheet(SHEET_LESSONS);
  const vals = sh.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { row = i + 1; break; }
  }
  if (row === -1) return { ok: false, msg: 'שיעור לא נמצא' };

  const setCell = (col, val) => { try { sh.getRange(row, col).setValue(val); } catch(e) {} };

  if (data.date)        setCell(4, data.date);
  if (data.time)        setCell(5, data.time);
  if (data.time || data.type) {
    const startTime = data.time || String(vals[row - 1][4]);
    const lessonType = data.type || String(vals[row - 1][6]);
    const endTime = calcEndTime(startTime, lessonType);
    setCell(6, endTime);
  }
  if (data.type)        setCell(7, data.type);
  if (data.price !== undefined) setCell(8, Number(data.price) || 0);
  if (data.status)      setCell(9, data.status);
  if (data.note !== undefined)  setCell(10, data.note);
  if (data.studentId2 !== undefined) setCell(11, data.studentId2);

  SpreadsheetApp.flush();
  return { ok: true };
}

// ── מחיקת שיעור ──

function deleteLessonById(id) {
  const sh   = _sheet(SHEET_LESSONS);
  const vals = sh.getDataRange().getValues();
  for (let i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'שיעור לא נמצא' };
}

// ── טסטים ──

function getTestsByStudent(internalId) {
  const sid  = String(internalId);
  const vals = _sheet(SHEET_LESSONS).getDataRange().getValues();
  const out  = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[1]) !== sid) continue;
    if (String(r[6]) !== 'טסט') continue;
    out.push({
      eventId : String(r[0]),
      date    : String(r[3]),
      price   : Number(r[7]) || 0,
      status  : String(r[8]),  // ממתין / עבר / נכשל
      note    : String(r[9])
    });
  }
  return out;
}

function updateTestResult(eventId, result) {
  // result: 'עבר' / 'נכשל'
  const sh   = _sheet(SHEET_LESSONS);
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(eventId)) {
      sh.getRange(i + 1, 9).setValue(result);
      SpreadsheetApp.flush();

      if (result === TEST_PASSED) {
        const sid = String(vals[i][1]);
        return { ok: true, passed: true, studentId: sid };
      }
      return { ok: true, passed: false };
    }
  }
  return { ok: false, msg: 'טסט לא נמצא' };
}

function canAddTest(internalId) {
  const count = _countTestsByStudent(String(internalId));
  return { canAdd: count < MAX_TESTS, count, max: MAX_TESTS };
}

// ── שיעורים ממתינים לאישור ──

function getPendingLessons() {
  const today = _dateVal(_today());
  const vals  = _sheet(SHEET_LESSONS).getDataRange().getValues();
  const out   = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[8]) !== STATUS_PLANNED) continue;
    if (_dateVal(String(r[3])) >= today) continue; // רק עבר
    out.push(_rowToLesson(r));
  }
  return out;
}

// ── אוטומציה לילית ──

function autoConfirmLessons() {
  const today = _dateVal(_today());
  const sh    = _sheet(SHEET_LESSONS);
  const vals  = sh.getDataRange().getValues();
  let count   = 0;
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (String(r[8]) !== STATUS_PLANNED) continue;
    if (_dateVal(String(r[3])) >= today) continue;
    sh.getRange(i + 1, 9).setValue(STATUS_DONE);
    count++;
  }
  if (count > 0) SpreadsheetApp.flush();
  Logger.log(`✅ אושרו אוטומטית ${count} שיעורים`);
  return count;
}

function setupDailyTrigger() {
  // הרץ פעם אחת בלבד
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'autoConfirmLessons') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('autoConfirmLessons')
    .timeBased().atHour(0).everyDays(1).create();
  Logger.log('✅ טריגר לילי הוגדר');
}

// ── אישור ידני של שיעורים ──

function confirmLessonsBatch(eventIds) {
  const sh   = _sheet(SHEET_LESSONS);
  const vals = sh.getDataRange().getValues();
  const idSet = new Set(eventIds.map(String));
  let count = 0;
  for (let i = 1; i < vals.length; i++) {
    if (idSet.has(String(vals[i][0]))) {
      sh.getRange(i + 1, 9).setValue(STATUS_DONE);
      count++;
    }
  }
  if (count > 0) SpreadsheetApp.flush();
  return { ok: true, count };
}
