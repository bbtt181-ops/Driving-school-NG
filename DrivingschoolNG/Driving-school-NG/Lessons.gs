// ============================================================
// Lessons.gs — Lesson CRUD, calendar queries, conflict check
// driving-school-NG
// ============================================================

const LESSON_HEADERS = [
  'מזהה', 'מזהה תלמיד', 'שם תלמיד', 'תאריך', 'שעת התחלה',
  'שעת סיום', 'סוג שיעור', 'סטטוס', 'מחיר', 'הערות',
  'תזכורת נשלחה', 'נוצר בתאריך', 'עודכן בתאריך'
];

var _LC = {
  id: 0, studentId: 1, studentName: 2, date: 3, startTime: 4,
  endTime: 5, lessonType: 6, status: 7, price: 8, notes: 9,
  reminderSent: 10, createdAt: 11, updatedAt: 12
};

// ─── Row → Object mapper ──────────────────────────────────────
function _rowToLesson(obj) {
  return {
    id:           String(obj['מזהה']          || ''),
    studentId:    String(obj['מזהה תלמיד']   || ''),
    studentName:  String(obj['שם תלמיד']      || ''),
    date:         String(obj['תאריך']         || ''),
    startTime:    String(obj['שעת התחלה']     || ''),
    endTime:      String(obj['שעת סיום']      || ''),
    lessonType:   String(obj['סוג שיעור']     || LESSON_TYPE_REGULAR),
    status:       String(obj['סטטוס']         || LESSON_PLANNED),
    price:        Number(obj['מחיר'])         || 0,
    notes:        String(obj['הערות']         || ''),
    reminderSent: obj['תזכורת נשלחה'] === true || obj['תזכורת נשלחה'] === 'TRUE',
    createdAt:    String(obj['נוצר בתאריך']  || ''),
    updatedAt:    String(obj['עודכן בתאריך'] || ''),
    __rowNum:     obj.__rowNum
  };
}

// ─── getLessons ──────────────────────────────────────────────
function getLessons(params) {
  params = params || {};
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var lessons = rows.map(_rowToLesson);

  if (params.studentId) {
    lessons = lessons.filter(function(l) { return l.studentId === params.studentId; });
  }
  if (params.date) {
    lessons = lessons.filter(function(l) { return l.date === params.date; });
  }
  if (params.status) {
    lessons = lessons.filter(function(l) { return l.status === params.status; });
  }
  if (params.month && params.year) {
    var m = String(params.month).padStart(2, '0');
    var y = String(params.year);
    lessons = lessons.filter(function(l) {
      // date format DD/MM/YYYY
      var parts = l.date.split('/');
      return parts.length === 3 && parts[1] === m && parts[2] === y;
    });
  } else if (params.year) {
    var y2 = String(params.year);
    lessons = lessons.filter(function(l) {
      var parts = l.date.split('/');
      return parts.length === 3 && parts[2] === y2;
    });
  }

  // Sort by date + startTime
  lessons.sort(function(a, b) {
    var da = parseDate(a.date), db = parseDate(b.date);
    if (!da || !db) return 0;
    if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
    return a.startTime.localeCompare(b.startTime);
  });

  var page     = Number(params.page)     || 1;
  var pageSize = Number(params.pageSize) || 50;
  return paginate(lessons, page, pageSize);
}

// ─── getLesson ───────────────────────────────────────────────
function getLesson(id) {
  if (!id) return null;
  var sheet = _sheet(SHEET_LESSONS);
  var rows  = sheetToObjects(sheet, LESSON_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['מזהה']) === String(id)) {
      return _rowToLesson(rows[i]);
    }
  }
  return null;
}

// ─── getLessonsByDate ────────────────────────────────────────
function getLessonsByDate(date) {
  if (!date) return [];
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var lessons = rows
    .map(_rowToLesson)
    .filter(function(l) { return l.date === date; });
  lessons.sort(function(a, b) { return a.startTime.localeCompare(b.startTime); });
  return lessons;
}

// ─── getLessonsByWeek ────────────────────────────────────────
function getLessonsByWeek(startDate) {
  // startDate = Monday (DD/MM/YYYY)
  var start = parseDate(startDate);
  if (!start) return {};
  var result = {};
  for (var i = 0; i < 7; i++) {
    var d = new Date(start);
    d.setDate(d.getDate() + i);
    var key = fmtDate(d);
    result[key] = [];
  }
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var lessons = rows.map(_rowToLesson);
  lessons.forEach(function(l) {
    if (result.hasOwnProperty(l.date)) {
      result[l.date].push(l);
    }
  });
  Object.keys(result).forEach(function(key) {
    result[key].sort(function(a, b) { return a.startTime.localeCompare(b.startTime); });
  });
  return result;
}

// ─── getLessonsByMonth ───────────────────────────────────────
function getLessonsByMonth(year, month) {
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var m       = String(month).padStart(2, '0');
  var y       = String(year);
  var lessons = rows.map(_rowToLesson).filter(function(l) {
    var parts = l.date.split('/');
    return parts.length === 3 && parts[1] === m && parts[2] === y;
  });
  var result = {};
  lessons.forEach(function(l) {
    if (!result[l.date]) result[l.date] = [];
    result[l.date].push(l);
  });
  Object.keys(result).forEach(function(key) {
    result[key].sort(function(a, b) { return a.startTime.localeCompare(b.startTime); });
  });
  return result;
}

// ─── getLessonsByStudent ─────────────────────────────────────
function getLessonsByStudent(studentId, page, pageSize) {
  if (!studentId) return { data: [], total: 0, page: 1, pages: 1, stats: {} };
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var lessons = rows.map(_rowToLesson).filter(function(l) {
    return l.studentId === studentId;
  });

  // Sort by date desc
  lessons.sort(function(a, b) {
    var da = parseDate(a.date), db = parseDate(b.date);
    if (!da || !db) return 0;
    return db.getTime() - da.getTime();
  });

  var stats = getLessonStats(studentId);
  var paged = paginate(lessons, page || 1, pageSize || 20);
  paged.stats = stats;
  return paged;
}

// ─── createLesson ────────────────────────────────────────────
function createLesson(input) {
  var errors = _validateLessonInput(input);
  if (errors.length > 0) {
    return { success: false, error: errors.join(' | '), code: 422 };
  }

  // Check for scheduling conflict
  if (hasConflict(input.date, input.startTime, input.endTime, null)) {
    return { success: false, error: 'קיים שיעור אחר בזמן זה', code: 409 };
  }

  var student = getStudent(input.studentId);
  if (!student) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var sheet = _sheet(SHEET_LESSONS);
  var id    = uuid();
  var now   = nowISO();

  var price = (input.price !== undefined && input.price !== '' && input.price !== null)
    ? Number(input.price)
    : calcLessonPrice(input.studentId, input.lessonType);

  var obj = {};
  obj['מזהה']          = id;
  obj['מזהה תלמיד']   = input.studentId;
  obj['שם תלמיד']      = student.firstName + ' ' + student.lastName;
  obj['תאריך']         = input.date;
  obj['שעת התחלה']     = input.startTime;
  obj['שעת סיום']      = input.endTime;
  obj['סוג שיעור']     = input.lessonType || LESSON_TYPE_REGULAR;
  obj['סטטוס']         = input.status || LESSON_PLANNED;
  obj['מחיר']          = price;
  obj['הערות']         = String(input.notes || '');
  obj['תזכורת נשלחה'] = 'FALSE';
  obj['נוצר בתאריך']  = now;
  obj['עודכן בתאריך'] = now;

  appendRow(sheet, LESSON_HEADERS, obj);

  var lesson = getLesson(id);
  return { success: true, id: id, lesson: lesson };
}

// ─── updateLesson ────────────────────────────────────────────
function updateLesson(input) {
  if (!input.id) return { success: false, error: 'נדרש מזהה שיעור', code: 400 };

  var sheet  = _sheet(SHEET_LESSONS);
  var rowNum = findRow(sheet, _LC.id, input.id);
  if (rowNum < 0) return { success: false, error: 'שיעור לא נמצא', code: 404 };

  // Detect status change before update
  var existingLesson = getLesson(input.id);
  var oldStatus = existingLesson ? existingLesson.status : null;

  var updates = {};
  var fieldMap = {
    studentId:   _LC.studentId,
    date:        _LC.date,
    startTime:   _LC.startTime,
    endTime:     _LC.endTime,
    lessonType:  _LC.lessonType,
    status:      _LC.status,
    price:       _LC.price,
    notes:       _LC.notes,
    reminderSent:_LC.reminderSent
  };

  Object.keys(fieldMap).forEach(function(field) {
    if (input[field] !== undefined) {
      updates[fieldMap[field]] = input[field];
    }
  });

  updates[_LC.updatedAt] = nowISO();
  updateRow(sheet, rowNum, updates);

  // If status changed to הושלם or לא הגיע → update balance
  var newStatus = input.status;
  if (newStatus && newStatus !== oldStatus) {
    if (newStatus === LESSON_DONE || newStatus === LESSON_NOSHOW ||
        oldStatus === LESSON_DONE || oldStatus === LESSON_NOSHOW) {
      var studentId = input.studentId || (existingLesson && existingLesson.studentId);
      if (studentId) updateBalanceRow(studentId);
    }
    // If status changed to בוטל → send cancellation
    if (newStatus === LESSON_CANCELLED && existingLesson) {
      try { sendLessonCancellation(input.id); } catch(e) { Logger.log('WA cancel err: ' + e); }
    }
  }

  var lesson = getLesson(input.id);
  return { success: true, lesson: lesson };
}

// ─── deleteLesson ────────────────────────────────────────────
function deleteLesson(id) {
  if (!id) return { success: false, error: 'נדרש מזהה', code: 400 };
  var sheet  = _sheet(SHEET_LESSONS);
  var rowNum = findRow(sheet, _LC.id, id);
  if (rowNum < 0) return { success: false, error: 'שיעור לא נמצא', code: 404 };

  var lesson = getLesson(id);
  deleteRow(sheet, rowNum);

  // Recalculate balance if lesson was charged
  if (lesson && (lesson.status === LESSON_DONE || lesson.status === LESSON_NOSHOW)) {
    updateBalanceRow(lesson.studentId);
  }

  return { success: true };
}

// ─── calcLessonPrice ─────────────────────────────────────────
function calcLessonPrice(studentId, lessonType) {
  var student = getStudent(studentId);
  if (!student) return 0;

  var testFree     = getConfig('PRICE_TEST_FREE')     === 'TRUE';
  var internalFree = getConfig('PRICE_INTERNAL_FREE') === 'TRUE';
  var priceTest     = Number(getConfig('PRICE_TEST'))     || PRICE_TEST;
  var priceInternal = Number(getConfig('PRICE_INTERNAL')) || PRICE_INTERNAL;
  var priceRegMin   = Number(getConfig('PRICE_REGULAR_MIN')) || PRICE_REGULAR_DEFAULT;

  // Test type always billed as test regardless of pricingType
  if (lessonType === LESSON_TYPE_TEST) {
    return testFree ? 0 : priceTest;
  }

  switch (student.pricingType) {
    case PRICING_PACKAGE_A:
    case PRICING_PACKAGE_B:
      // Package lessons are ₪0 — package charged as lump sum payment
      return 0;
    case PRICING_INTERNAL:
      return internalFree ? 0 : priceInternal;
    case PRICING_TEST_ONLY:
      return testFree ? 0 : priceTest;
    case PRICING_REGULAR:
    default:
      return priceRegMin;
  }
}

// ─── hasConflict ─────────────────────────────────────────────
function hasConflict(date, startTime, endTime, excludeId) {
  var lessons = getLessonsByDate(date);
  return lessons.some(function(l) {
    if (excludeId && l.id === excludeId) return false;
    if (l.status === LESSON_CANCELLED) return false;
    // Overlap check: l.startTime < endTime AND l.endTime > startTime
    return l.startTime < endTime && l.endTime > startTime;
  });
}

// ─── getPendingLessons ───────────────────────────────────────
function getPendingLessons() {
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var todayD  = parseDate(today());
  return rows.map(_rowToLesson).filter(function(l) {
    if (l.status !== LESSON_PLANNED) return false;
    var d = parseDate(l.date);
    return d && d < todayD;
  });
}

// ─── confirmLessons ──────────────────────────────────────────
function confirmLessons(ids) {
  if (!ids || !ids.length) return { updated: 0 };
  var sheet   = _sheet(SHEET_LESSONS);
  var updated = 0;
  var affected = {}; // studentId → true

  ids.forEach(function(id) {
    var rowNum = findRow(sheet, _LC.id, id);
    if (rowNum > 0) {
      var updates = {};
      updates[_LC.status]    = LESSON_DONE;
      updates[_LC.updatedAt] = nowISO();
      updateRow(sheet, rowNum, updates);
      updated++;
      var lesson = getLesson(id);
      if (lesson) affected[lesson.studentId] = true;
    }
  });

  // Update balances
  Object.keys(affected).forEach(function(sid) {
    updateBalanceRow(sid);
  });

  return { updated: updated };
}

// ─── getLessonStats ──────────────────────────────────────────
function getLessonStats(studentId) {
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  var lessons = rows.map(_rowToLesson).filter(function(l) {
    return l.studentId === studentId;
  });

  var stats = {
    total:     lessons.length,
    done:      0,
    cancelled: 0,
    noShow:    0,
    planned:   0,
    byType:    {}
  };

  lessons.forEach(function(l) {
    switch (l.status) {
      case LESSON_DONE:      stats.done++;      break;
      case LESSON_CANCELLED: stats.cancelled++; break;
      case LESSON_NOSHOW:    stats.noShow++;    break;
      case LESSON_PLANNED:   stats.planned++;   break;
    }
    stats.byType[l.lessonType] = (stats.byType[l.lessonType] || 0) + 1;
  });

  return stats;
}

// ─── countExternalTests ──────────────────────────────────────
function countExternalTests(studentId) {
  var sheet   = _sheet(SHEET_LESSONS);
  var rows    = sheetToObjects(sheet, LESSON_HEADERS);
  return rows.filter(function(r) {
    return String(r['מזהה תלמיד']) === String(studentId)
        && String(r['סוג שיעור'])  === LESSON_TYPE_TEST;
  }).length;
}

// ─── Private validation ──────────────────────────────────────
function _validateLessonInput(input) {
  var errors = [];
  if (!input.studentId)  errors.push('מזהה תלמיד הוא שדה חובה');
  if (!input.date)       errors.push('תאריך הוא שדה חובה');
  if (!input.startTime)  errors.push('שעת התחלה היא שדה חובה');
  if (!input.endTime)    errors.push('שעת סיום היא שדה חובה');
  if (input.startTime && input.endTime && input.startTime >= input.endTime) {
    errors.push('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
  }
  var validTypes = [LESSON_TYPE_REGULAR, LESSON_TYPE_INTERNAL, LESSON_TYPE_TEST, LESSON_TYPE_EXTRA];
  if (input.lessonType && validTypes.indexOf(input.lessonType) < 0) {
    errors.push('סוג שיעור לא תקין: ' + input.lessonType);
  }
  return errors;
}
