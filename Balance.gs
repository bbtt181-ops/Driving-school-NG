// ============================================================
// Balance.gs — Balance calculation engine
// driving-school-NG
// ============================================================

const BALANCE_HEADERS = [
  'מזהה תלמיד', 'שם תלמיד', 'סה"כ חיוב', 'סה"כ תשלומים', 'יתרה', 'תאריך עדכון'
];

var _BC = {
  studentId: 0, studentName: 1, totalCharge: 2,
  totalPaid: 3, balance: 4, lastUpdated: 5
};

// ─── computeBalance ──────────────────────────────────────────
// Reads שיעורים + תשלומים directly (always fresh)
function computeBalance(studentId) {
  if (!studentId) return null;

  // Fetch student name
  var student = getStudent(studentId);
  var studentName = student ? (student.firstName + ' ' + student.lastName) : '';

  // Sum lesson charges (הושלם + לא הגיע only)
  var lessonsSheet = _sheet(SHEET_LESSONS);
  var lessonRows   = sheetToObjects(lessonsSheet, LESSON_HEADERS);
  var totalCharge  = 0;
  lessonRows.forEach(function(r) {
    if (String(r['מזהה תלמיד']) === String(studentId)) {
      var status = String(r['סטטוס']);
      if (status === LESSON_DONE || status === LESSON_NOSHOW) {
        totalCharge += Number(r['מחיר']) || 0;
      }
    }
  });

  // Sum payments
  var paymentsSheet = _sheet(SHEET_PAYMENTS);
  var paymentRows   = sheetToObjects(paymentsSheet, PAYMENT_HEADERS);
  var totalPaid     = 0;
  paymentRows.forEach(function(r) {
    if (String(r['מזהה תלמיד']) === String(studentId)) {
      totalPaid += Number(r['סכום']) || 0;
    }
  });

  var balance = totalCharge - totalPaid;

  return {
    studentId:    studentId,
    studentName:  studentName,
    totalCharge:  totalCharge,
    totalPaid:    totalPaid,
    balance:      balance,
    lastUpdated:  nowISO()
  };
}

// ─── updateBalanceRow ─────────────────────────────────────────
// Upsert a student's row in יתרות
function updateBalanceRow(studentId) {
  if (!studentId) return;
  var bal   = computeBalance(studentId);
  if (!bal) return;

  var sheet  = _sheet(SHEET_BALANCES);
  var rowNum = findRow(sheet, _BC.studentId, studentId);

  if (rowNum > 0) {
    var updates = {};
    updates[_BC.studentName]  = bal.studentName;
    updates[_BC.totalCharge]  = bal.totalCharge;
    updates[_BC.totalPaid]    = bal.totalPaid;
    updates[_BC.balance]      = bal.balance;
    updates[_BC.lastUpdated]  = bal.lastUpdated;
    updateRow(sheet, rowNum, updates);
  } else {
    var obj = {};
    obj['מזהה תלמיד']      = studentId;
    obj['שם תלמיד']         = bal.studentName;
    obj['סה"כ חיוב']        = bal.totalCharge;
    obj['סה"כ תשלומים']    = bal.totalPaid;
    obj['יתרה']             = bal.balance;
    obj['תאריך עדכון']     = bal.lastUpdated;
    appendRow(sheet, BALANCE_HEADERS, obj);
  }
}

// ─── recalculateAllBalances ───────────────────────────────────
// Rebuild entire יתרות sheet from scratch
function recalculateAllBalances() {
  // Collect all unique studentIds from שיעורים and תשלומים
  var studentIds = {};

  var lessonRows = sheetToObjects(_sheet(SHEET_LESSONS), LESSON_HEADERS);
  lessonRows.forEach(function(r) {
    var sid = String(r['מזהה תלמיד']);
    if (sid) studentIds[sid] = true;
  });

  var paymentRows = sheetToObjects(_sheet(SHEET_PAYMENTS), PAYMENT_HEADERS);
  paymentRows.forEach(function(r) {
    var sid = String(r['מזהה תלמיד']);
    if (sid) studentIds[sid] = true;
  });

  // Also include all active/inactive students
  var studentRows = sheetToObjects(_sheet(SHEET_STUDENTS), STUDENT_HEADERS);
  studentRows.forEach(function(r) {
    var sid = String(r['מזהה']);
    if (sid) studentIds[sid] = true;
  });

  var ids = Object.keys(studentIds).filter(Boolean);

  // Clear and rebuild יתרות sheet
  var balSheet = _sheet(SHEET_BALANCES);
  // Clear all data rows (keep header)
  var lastRow = balSheet.getLastRow();
  if (lastRow > 1) {
    balSheet.deleteRows(2, lastRow - 1);
  }

  var rows = [];
  ids.forEach(function(sid) {
    var bal = computeBalance(sid);
    if (!bal) return;
    rows.push([
      sid,
      bal.studentName,
      bal.totalCharge,
      bal.totalPaid,
      bal.balance,
      bal.lastUpdated
    ]);
  });

  if (rows.length > 0) {
    balSheet.getRange(2, 1, rows.length, BALANCE_HEADERS.length).setValues(rows);
  }

  return { updated: rows.length };
}

// ─── getBalance ──────────────────────────────────────────────
// Reads from יתרות cache, falls back to computeBalance
function getBalance(studentId) {
  if (!studentId) return null;

  var sheet  = _sheet(SHEET_BALANCES);
  var rowNum = findRow(sheet, _BC.studentId, studentId);

  if (rowNum > 0) {
    var vals = sheet.getRange(rowNum, 1, 1, BALANCE_HEADERS.length).getValues()[0];
    return {
      studentId:   String(vals[0] || ''),
      studentName: String(vals[1] || ''),
      totalCharge: Number(vals[2]) || 0,
      totalPaid:   Number(vals[3]) || 0,
      balance:     Number(vals[4]) || 0,
      lastUpdated: String(vals[5] || '')
    };
  }

  // Not cached — compute fresh and cache it
  var bal = computeBalance(studentId);
  if (bal) updateBalanceRow(studentId);
  return bal;
}

// ─── getDebtors ──────────────────────────────────────────────
// Returns all students with balance > minDebt, sorted desc
function getDebtors(minDebt) {
  minDebt = typeof minDebt === 'number' ? minDebt : 0;

  var sheet = _sheet(SHEET_BALANCES);
  var rows  = sheetToObjects(sheet, BALANCE_HEADERS);

  // Map to balance objects
  var debtors = rows
    .map(function(r) {
      return {
        studentId:   String(r['מזהה תלמיד']   || ''),
        studentName: String(r['שם תלמיד']       || ''),
        totalCharge: Number(r['סה"כ חיוב'])     || 0,
        totalPaid:   Number(r['סה"כ תשלומים']) || 0,
        balance:     Number(r['יתרה'])           || 0,
        lastUpdated: String(r['תאריך עדכון']   || '')
      };
    })
    .filter(function(b) { return b.balance > minDebt; });

  // Enrich with student phone
  var studentSheet = _sheet(SHEET_STUDENTS);
  var studentRows  = sheetToObjects(studentSheet, STUDENT_HEADERS);
  var phoneMap = {};
  studentRows.forEach(function(r) {
    phoneMap[String(r['מזהה'])] = String(r['טלפון'] || '');
  });

  debtors.forEach(function(d) {
    d.phone = phoneMap[d.studentId] || '';
  });

  // Sort by balance descending
  debtors.sort(function(a, b) { return b.balance - a.balance; });

  return debtors;
}

// ─── getCredits ──────────────────────────────────────────────
// Returns students with balance < 0 (credit), sorted asc
function getCredits() {
  var sheet = _sheet(SHEET_BALANCES);
  var rows  = sheetToObjects(sheet, BALANCE_HEADERS);

  return rows
    .map(function(r) {
      return {
        studentId:   String(r['מזהה תלמיד']   || ''),
        studentName: String(r['שם תלמיד']       || ''),
        totalCharge: Number(r['סה"כ חיוב'])     || 0,
        totalPaid:   Number(r['סה"כ תשלומים']) || 0,
        balance:     Number(r['יתרה'])           || 0,
        lastUpdated: String(r['תאריך עדכון']   || '')
      };
    })
    .filter(function(b) { return b.balance < 0; })
    .sort(function(a, b) { return a.balance - b.balance; });
}
