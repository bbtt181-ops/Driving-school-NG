// ============================================================
// Search.gs — Cross-module unified search
// driving-school-NG
// ============================================================

// ─── globalSearch ────────────────────────────────────────────
// Returns top 5 per category, minimum 2 chars
function globalSearch(query) {
  if (!query || String(query).trim().length < 2) {
    return { students: [], lessons: [], payments: [], archived: [] };
  }
  var q = String(query).trim();
  return {
    students: searchStudents(q).slice(0, 5),
    lessons:  searchLessons(q).slice(0, 5),
    payments: searchPayments(q).slice(0, 5),
    archived: searchArchive(q).slice(0, 5)
  };
}

// ─── searchStudents ──────────────────────────────────────────
function searchStudents(query) {
  if (!query || query.length < 2) return [];
  var q = normalizeForSearch(query);

  var sheet = _sheet(SHEET_STUDENTS);
  var rows  = sheetToObjects(sheet, STUDENT_HEADERS);

  var scored = [];
  rows.forEach(function(r) {
    if (String(r['סטטוס']) === STATUS_ARCHIVE) return;
    var student = _rowToStudent(r);

    var fields = [
      student.firstName,
      student.lastName,
      student.firstName + ' ' + student.lastName,
      student.idNumber,
      normalizePhone(student.phone)
    ];

    var score = _maxScore(fields, q, query);
    if (score > 0) {
      scored.push({ score: score, item: student });
    }
  });

  return scored
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 10)
    .map(function(s) { return s.item; });
}

// ─── searchLessons ───────────────────────────────────────────
function searchLessons(query) {
  if (!query || query.length < 2) return [];
  var q = normalizeForSearch(query);

  var sheet = _sheet(SHEET_LESSONS);
  var rows  = sheetToObjects(sheet, LESSON_HEADERS);

  var scored = [];
  rows.forEach(function(r) {
    var lesson = _rowToLesson(r);
    var fields = [
      lesson.studentName,
      lesson.date,
      lesson.notes
    ];
    var score = _maxScore(fields, q, query);
    if (score > 0) {
      scored.push({ score: score, item: lesson });
    }
  });

  return scored
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 10)
    .map(function(s) { return s.item; });
}

// ─── searchPayments ──────────────────────────────────────────
function searchPayments(query) {
  if (!query || query.length < 2) return [];
  var q = normalizeForSearch(query);

  var sheet = _sheet(SHEET_PAYMENTS);
  var rows  = sheetToObjects(sheet, PAYMENT_HEADERS);

  var scored = [];
  rows.forEach(function(r) {
    var payment = _rowToPayment(r);
    var fields  = [
      payment.studentName,
      payment.receiptNumber,
      payment.notes
    ];
    var score = _maxScore(fields, q, query);
    if (score > 0) {
      scored.push({ score: score, item: payment });
    }
  });

  return scored
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 10)
    .map(function(s) { return s.item; });
}

// ─── searchArchive ───────────────────────────────────────────
function searchArchive(query) {
  if (!query || query.length < 2) return [];
  var q = normalizeForSearch(query);

  var sheet = _sheet(SHEET_ARCHIVE);
  var rows  = sheetToObjects(sheet, ARCHIVE_HEADERS);

  var scored = [];
  rows.forEach(function(r) {
    var arc    = _rowToArchive(r);
    var fields = [
      arc.firstName,
      arc.lastName,
      arc.firstName + ' ' + arc.lastName,
      arc.idNumber,
      normalizePhone(arc.phone)
    ];
    var score = _maxScore(fields, q, query);
    if (score > 0) {
      scored.push({ score: score, item: arc });
    }
  });

  return scored
    .sort(function(a, b) { return b.score - a.score; })
    .slice(0, 10)
    .map(function(s) { return s.item; });
}

// ─── scoreMatch ──────────────────────────────────────────────
// Returns: 1.0 exact, 0.8 starts-with, 0.5 contains, 0 no match
function scoreMatch(field, query) {
  if (!field || !query) return 0;
  var nf = normalizeForSearch(String(field));
  var nq = normalizeForSearch(String(query));
  if (!nq) return 0;
  if (nf === nq) return 1.0;
  if (nf.startsWith(nq)) return 0.8;
  if (nf.indexOf(nq) >= 0) return 0.5;
  return 0;
}

// ─── normalizeForSearch ───────────────────────────────────────
function normalizeForSearch(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/[-\s]/g, '');
}

// ─── Private: get max score across fields ────────────────────
function _maxScore(fields, normalizedQuery, rawQuery) {
  var best = 0;
  fields.forEach(function(f) {
    var s = scoreMatch(String(f || ''), rawQuery);
    if (s > best) best = s;
  });
  return best;
}
