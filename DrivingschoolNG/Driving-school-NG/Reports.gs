// ============================================================
// Reports.gs — Aggregated reports
// driving-school-NG
// ============================================================

// ─── getMonthlyReport ────────────────────────────────────────
function getMonthlyReport(year, month) {
  var m = String(month).padStart(2, '0');
  var y = String(year);

  // --- Income ---
  var incomeData = getMonthlyIncome(year, month);

  // --- Lessons ---
  var lessonSheet = _sheet(SHEET_LESSONS);
  var lessonRows  = sheetToObjects(lessonSheet, LESSON_HEADERS);
  var monthLessons = lessonRows.filter(function(r) {
    var parts = String(r['תאריך']).split('/');
    return parts.length === 3 && parts[1] === m && parts[2] === y;
  });

  var lessonStats = { done: 0, cancelled: 0, noShow: 0, planned: 0 };
  var studentLessonCount = {};

  monthLessons.forEach(function(r) {
    var status = String(r['סטטוס']);
    switch (status) {
      case LESSON_DONE:      lessonStats.done++;      break;
      case LESSON_CANCELLED: lessonStats.cancelled++; break;
      case LESSON_NOSHOW:    lessonStats.noShow++;    break;
      case LESSON_PLANNED:   lessonStats.planned++;   break;
    }
    var sid = String(r['מזהה תלמיד']);
    var sname = String(r['שם תלמיד']);
    if (!studentLessonCount[sid]) studentLessonCount[sid] = { name: sname, count: 0 };
    studentLessonCount[sid].count++;
  });

  // Top 5 students by lesson count
  var topStudents = Object.keys(studentLessonCount)
    .map(function(sid) {
      var s = getStudent(sid);
      return {
        id:           sid,
        name:         studentLessonCount[sid].name,
        phone:        s ? s.phone : '',
        lessonsCount: studentLessonCount[sid].count
      };
    })
    .sort(function(a, b) { return b.lessonsCount - a.lessonsCount; })
    .slice(0, 5);

  // --- New students this month ---
  var studentSheet = _sheet(SHEET_STUDENTS);
  var studentRows  = sheetToObjects(studentSheet, STUDENT_HEADERS);
  var newStudents  = studentRows.filter(function(r) {
    var joinParts = String(r['תאריך הצטרפות']).split('/');
    return joinParts.length === 3 && joinParts[1] === m && joinParts[2] === y;
  });

  return {
    year:        year,
    month:       month,
    monthName:   monthName(month),
    income:      incomeData,
    lessons:     lessonStats,
    students:    { newThisMonth: newStudents.length },
    topStudents: topStudents
  };
}

// ─── getYearlyOverview ───────────────────────────────────────
function getYearlyOverview(year) {
  var months = [];
  for (var m = 1; m <= 12; m++) {
    var income  = getMonthlyIncome(year, m);
    var y       = String(year);
    var mStr    = String(m).padStart(2, '0');
    var lessonSheet = _sheet(SHEET_LESSONS);
    var rows    = sheetToObjects(lessonSheet, LESSON_HEADERS);
    var count   = rows.filter(function(r) {
      var parts = String(r['תאריך']).split('/');
      return parts.length === 3 && parts[1] === mStr && parts[2] === y
          && String(r['סטטוס']) === LESSON_DONE;
    }).length;

    months.push({
      month:        m,
      monthName:    monthName(m),
      income:       income.total,
      lessonsCount: count
    });
  }
  return { year: year, months: months };
}

// ─── getDebtorsReport ────────────────────────────────────────
function getDebtorsReport() {
  var debtors = getDebtors(0);

  var total = debtors.reduce(function(sum, d) { return sum + d.balance; }, 0);

  var enriched = debtors.map(function(d) {
    var student = getStudent(d.studentId);
    return {
      id:          d.studentId,
      name:        d.studentName,
      phone:       d.phone || (student ? student.phone : ''),
      pricingType: student ? student.pricingType : '',
      balance:     d.balance
    };
  });

  return {
    generated: nowISO(),
    total:     total,
    count:     enriched.length,
    debtors:   enriched
  };
}

// ─── getCancellationsReport ──────────────────────────────────
function getCancellationsReport(year, month) {
  var m = String(month).padStart(2, '0');
  var y = String(year);

  var lessonSheet = _sheet(SHEET_LESSONS);
  var rows        = sheetToObjects(lessonSheet, LESSON_HEADERS);

  var monthLessons = rows.filter(function(r) {
    var parts = String(r['תאריך']).split('/');
    return parts.length === 3 && parts[1] === m && parts[2] === y;
  });

  var cancelled = [];
  var noShow    = [];

  monthLessons.forEach(function(r) {
    var status = String(r['סטטוס']);
    var entry  = {
      lessonDate:  String(r['תאריך']        || ''),
      studentName: String(r['שם תלמיד']     || ''),
      startTime:   String(r['שעת התחלה']    || ''),
      notes:       String(r['הערות']         || '')
    };
    if (status === LESSON_CANCELLED) cancelled.push(entry);
    if (status === LESSON_NOSHOW)    noShow.push(entry);
  });

  // Sort by date + time
  var sortFn = function(a, b) {
    var da = parseDate(a.lessonDate), db = parseDate(b.lessonDate);
    if (!da || !db) return 0;
    if (da.getTime() !== db.getTime()) return da.getTime() - db.getTime();
    return a.startTime.localeCompare(b.startTime);
  };
  cancelled.sort(sortFn);
  noShow.sort(sortFn);

  return {
    year:            year,
    month:           month,
    monthName:       monthName(month),
    cancelled:       cancelled,
    noShow:          noShow,
    totalCancelled:  cancelled.length,
    totalNoShow:     noShow.length
  };
}

// ─── getStudentHistoryReport ──────────────────────────────────
function getStudentHistoryReport(studentId) {
  var student = getStudent(studentId);
  if (!student) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var lessons  = getLessonsByStudent(studentId, 1, 10000).data;
  var payments = getPaymentsByStudent(studentId);
  var balance  = computeBalance(studentId);
  var stats    = getLessonStats(studentId);

  return {
    student:  student,
    lessons:  lessons,
    payments: payments,
    balance:  balance,
    stats:    stats
  };
}
