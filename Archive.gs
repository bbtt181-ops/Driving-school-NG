// ============================================================
// Archive.gs — Archive/restore students
// driving-school-NG
// ============================================================

const ARCHIVE_HEADERS = [
  'מזהה ארכיון', 'מזהה תלמיד מקורי', 'שם פרטי', 'שם משפחה',
  'תעודת זהות', 'טלפון', 'תאריך לידה', 'כתובת', 'סוג רכב',
  'סוג מחיר', 'סיבת ארכיון', 'תאריך ארכיון', 'תאריך הצטרפות מקורי',
  'סה"כ שיעורים', 'סה"כ שולם', 'יתרה סופית', 'הערות', 'נוצר בתאריך'
];

var _ARC = {
  archiveId: 0, originalStudentId: 1, firstName: 2, lastName: 3,
  idNumber: 4, phone: 5, birthDate: 6, address: 7, vehicleType: 8,
  pricingType: 9, archiveReason: 10, archiveDate: 11, originalJoinDate: 12,
  totalLessons: 13, totalPaid: 14, finalBalance: 15, notes: 16, createdAt: 17
};

// ─── Row → Object mapper ──────────────────────────────────────
function _rowToArchive(obj) {
  return {
    archiveId:         String(obj['מזהה ארכיון']           || ''),
    originalStudentId: String(obj['מזהה תלמיד מקורי']     || ''),
    firstName:         String(obj['שם פרטי']               || ''),
    lastName:          String(obj['שם משפחה']              || ''),
    idNumber:          String(obj['תעודת זהות']            || ''),
    phone:             String(obj['טלפון']                 || ''),
    birthDate:         String(obj['תאריך לידה']            || ''),
    address:           String(obj['כתובת']                 || ''),
    vehicleType:       String(obj['סוג רכב']               || ''),
    pricingType:       String(obj['סוג מחיר']              || ''),
    archiveReason:     String(obj['סיבת ארכיון']           || ''),
    archiveDate:       String(obj['תאריך ארכיון']          || ''),
    originalJoinDate:  String(obj['תאריך הצטרפות מקורי']  || ''),
    totalLessons:      Number(obj['סה"כ שיעורים'])         || 0,
    totalPaid:         Number(obj['סה"כ שולם'])            || 0,
    finalBalance:      Number(obj['יתרה סופית'])           || 0,
    notes:             String(obj['הערות']                 || ''),
    createdAt:         String(obj['נוצר בתאריך']           || ''),
    __rowNum:          obj.__rowNum
  };
}

// ─── getArchivedStudents ─────────────────────────────────────
function getArchivedStudents(params) {
  params = params || {};
  var sheet = _sheet(SHEET_ARCHIVE);
  var rows  = sheetToObjects(sheet, ARCHIVE_HEADERS);
  var list  = rows.map(_rowToArchive);

  // Filter by reason
  if (params.reason) {
    list = list.filter(function(a) { return a.archiveReason === params.reason; });
  }

  // Search
  var q = (params.search || '').trim().toLowerCase();
  if (q) {
    list = list.filter(function(a) {
      return (a.firstName + ' ' + a.lastName).toLowerCase().indexOf(q) >= 0
          || a.idNumber.indexOf(q) >= 0
          || normalizePhone(a.phone).indexOf(normalizePhone(q)) >= 0;
    });
  }

  // Sort by archive date desc
  list.sort(function(a, b) {
    var da = parseDate(a.archiveDate), db = parseDate(b.archiveDate);
    if (!da || !db) return 0;
    return db.getTime() - da.getTime();
  });

  var page     = Number(params.page)     || 1;
  var pageSize = Number(params.pageSize) || 20;
  return paginate(list, page, pageSize);
}

// ─── getArchivedStudent ──────────────────────────────────────
function getArchivedStudent(archiveId) {
  if (!archiveId) return null;
  var sheet = _sheet(SHEET_ARCHIVE);
  var rows  = sheetToObjects(sheet, ARCHIVE_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['מזהה ארכיון']) === String(archiveId)) {
      return _rowToArchive(rows[i]);
    }
  }
  return null;
}

// ─── getArchivedStudentHistory ───────────────────────────────
function getArchivedStudentHistory(originalStudentId) {
  if (!originalStudentId) return null;

  // Find the archive record
  var sheet = _sheet(SHEET_ARCHIVE);
  var rows  = sheetToObjects(sheet, ARCHIVE_HEADERS);
  var archiveRecord = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['מזהה תלמיד מקורי']) === String(originalStudentId)) {
      archiveRecord = _rowToArchive(rows[i]);
      break;
    }
  }

  // Read lessons and payments using original studentId
  var lessons  = getLessonsByStudent(originalStudentId, 1, 10000).data;
  var payments = getPaymentsByStudent(originalStudentId);
  var balance  = computeBalance(originalStudentId);

  return {
    student:  archiveRecord,
    lessons:  lessons,
    payments: payments,
    balance:  balance
  };
}

// ─── moveToArchive ───────────────────────────────────────────
function moveToArchive(studentId, reason, notes) {
  if (!studentId) return { success: false, error: 'נדרש מזהה תלמיד', code: 400 };
  reason = reason || 'אחר';

  if (ARCHIVE_REASONS.indexOf(reason) < 0) {
    return { success: false, error: 'סיבת ארכיון לא תקינה: ' + reason, code: 422 };
  }

  var student = getStudent(studentId);
  if (!student) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  // Compute stats at archive time
  var stats   = getLessonStats(studentId);
  var balance = computeBalance(studentId);
  var payments = getPaymentsByStudent(studentId);
  var totalPaid = payments.reduce(function(sum, p) { return sum + p.amount; }, 0);

  var archiveId = uuid();
  var now       = nowISO();

  var obj = {};
  obj['מזהה ארכיון']          = archiveId;
  obj['מזהה תלמיד מקורי']    = studentId;
  obj['שם פרטי']              = student.firstName;
  obj['שם משפחה']             = student.lastName;
  obj['תעודת זהות']           = student.idNumber;
  obj['טלפון']                = student.phone;
  obj['תאריך לידה']           = student.birthDate;
  obj['כתובת']                = student.address;
  obj['סוג רכב']              = student.vehicleType;
  obj['סוג מחיר']             = student.pricingType;
  obj['סיבת ארכיון']          = reason;
  obj['תאריך ארכיון']         = today();
  obj['תאריך הצטרפות מקורי'] = student.joinDate;
  obj['סה"כ שיעורים']         = stats.total;
  obj['סה"כ שולם']            = totalPaid;
  obj['יתרה סופית']           = balance ? balance.balance : 0;
  obj['הערות']                = String(notes || student.notes || '');
  obj['נוצר בתאריך']         = now;

  var archiveSheet = _sheet(SHEET_ARCHIVE);
  appendRow(archiveSheet, ARCHIVE_HEADERS, obj);

  return { success: true, archiveId: archiveId };
}

// ─── restoreFromArchive ──────────────────────────────────────
function restoreFromArchive(archiveId) {
  if (!archiveId) return { success: false, error: 'נדרש מזהה ארכיון', code: 400 };

  var archiveRecord = getArchivedStudent(archiveId);
  if (!archiveRecord) return { success: false, error: 'רשומת ארכיון לא נמצאה', code: 404 };

  // Restore student status in תלמידים
  var studentSheet = _sheet(SHEET_STUDENTS);
  var rowNum = findRow(studentSheet, _SC.id, archiveRecord.originalStudentId);

  if (rowNum > 0) {
    var updates = {};
    updates[_SC.status]    = STATUS_ACTIVE;
    updates[_SC.updatedAt] = nowISO();
    updateRow(studentSheet, rowNum, updates);
  }

  // Remove from ארכיון
  var archiveSheet = _sheet(SHEET_ARCHIVE);
  var arcRowNum    = findRow(archiveSheet, _ARC.archiveId, archiveId);
  if (arcRowNum > 0) {
    deleteRow(archiveSheet, arcRowNum);
  }

  return { success: true, studentId: archiveRecord.originalStudentId };
}
