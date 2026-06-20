// ============================================================
// Code.gs — Entry point, HTTP router, spreadsheet setup
// driving-school-NG
// ============================================================

// ─── SCHOOL CONFIG ───────────────────────────────────────────
const SS_ID            = '1-K9_F_e6HUfnfZm_583W7eiDK1_Gms26hBtZtFOZVBA';
const SCHOOL_NAME      = 'ברוך Next Generation';
const INSTRUCTOR_NAME  = 'תור ברוך';

// ─── GREEN API ────────────────────────────────────────────────
const GREEN_API_INSTANCE = '28cddab33ebc4d36a9489bbdc645b0975c5bc45b7a6549bbaa';
const GREEN_API_TOKEN    = '7107644824';
const GREEN_API_BASE     = 'https://api.green-api.com/waInstance' + GREEN_API_INSTANCE;

// ─── PRICING ──────────────────────────────────────────────────
const PRICE_REGULAR_DEFAULT = 160;
const PRICE_INTERNAL        = 50;
const PRICE_TEST            = 230;
const PRICE_INTERNAL_TEST   = 50;
const REGISTRATION_FEE      = 150;
const PRICE_PACKAGE_A       = 5200;
const PRICE_PACKAGE_B       = 6000;
const PACKAGE_LESSONS       = 28;
const PACKAGE_A_FREE_TESTS  = 1;
const PACKAGE_B_FREE_TESTS  = 2;

// ─── SHEET NAMES ─────────────────────────────────────────────
const SHEET_STUDENTS = 'תלמידים';
const SHEET_LESSONS  = 'שיעורים';
const SHEET_PAYMENTS = 'תשלומים';
const SHEET_BALANCES = 'יתרות';
const SHEET_ARCHIVE  = 'ארכיון';
const SHEET_SETTINGS = 'הגדרות';

// ─── STATUS VALUES ────────────────────────────────────────────
const STATUS_ACTIVE   = 'פעיל';
const STATUS_INACTIVE = 'לא פעיל';
const STATUS_ARCHIVE  = 'ארכיון';

const LESSON_PLANNED   = 'מתוכנן';
const LESSON_DONE      = 'הושלם';
const LESSON_CANCELLED = 'בוטל';
const LESSON_NOSHOW    = 'לא הגיע';

const LESSON_TYPE_REGULAR  = 'רגיל';
const LESSON_TYPE_INTERNAL = 'פנימי';
const LESSON_TYPE_TEST     = 'מבחן';
const LESSON_TYPE_EXTRA         = 'שיעור נוסף';
const LESSON_TYPE_INTERNAL_TEST = 'מבחן פנימי';

const PRICING_REGULAR   = 'רגיל';
const PRICING_PACKAGE_A = 'חבילה א';
const PRICING_PACKAGE_B = 'חבילה ב';
const PRICING_INTERNAL  = 'פנימי';
const PRICING_TEST_ONLY = 'מבחן בלבד';

const PAYMENT_METHODS = ['מזומן', 'העברה', "צ'ק", 'אשראי', 'ביט', 'פייבוקס', 'דמי הרשמה'];
const ARCHIVE_REASONS = ['סיים', 'נשר', 'עבר מבחן', 'אחר'];

// ============================================================
// doGet — serves index.html and handles GET API actions
// ============================================================
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;

  if (!action) {
    // Serve the web app
    const html = HtmlService.createHtmlOutputFromFile('index')
      .setTitle(SCHOOL_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return html;
  }

  // GET API dispatcher
  try {
    const p = e.parameter || {};
    let result;

    switch (action) {
      case 'getStudents':
        result = getStudents(p);
        break;
      case 'getStudent':
        result = getStudent(p.id);
        break;
      case 'searchStudents':
        result = searchStudents(p.query);
        break;
      case 'getLessons':
        result = getLessons(p);
        break;
      case 'getLesson':
        result = getLesson(p.id);
        break;
      case 'getLessonsByDate':
        result = getLessonsByDate(p.date);
        break;
      case 'getLessonsByWeek':
        result = getLessonsByWeek(p.startDate);
        break;
      case 'getLessonsByMonth':
        result = getLessonsByMonth(Number(p.year), Number(p.month));
        break;
      case 'getLessonsByStudent':
        result = getLessonsByStudent(p.studentId, Number(p.page) || 1, Number(p.pageSize) || 20);
        break;
      case 'getPayments':
        result = getPayments(p);
        break;
      case 'getPaymentsByStudent':
        result = getPaymentsByStudent(p.studentId);
        break;
      case 'getBalance':
        result = getBalance(p.studentId);
        break;
      case 'getDebtors':
        result = getDebtors(p.minDebt ? Number(p.minDebt) : 0);
        break;
      case 'getMonthlyReport':
        result = getMonthlyReport(Number(p.year), Number(p.month));
        break;
      case 'getDebtorsReport':
        result = getDebtorsReport();
        break;
      case 'getCancellationsReport':
        result = getCancellationsReport(Number(p.year), Number(p.month));
        break;
      case 'getYearlyOverview':
        result = getYearlyOverview(Number(p.year));
        break;
      case 'getStudentHistoryReport':
        result = getStudentHistoryReport(p.studentId);
        break;
      case 'getArchivedStudents':
        result = getArchivedStudents(p);
        break;
      case 'getArchivedStudent':
        result = getArchivedStudent(p.id);
        break;
      case 'getArchivedStudentHistory':
        result = getArchivedStudentHistory(p.studentId);
        break;
      case 'getImportTemplate':
        result = _getImportTemplate(p.type);
        break;
      case 'globalSearch':
        result = globalSearch(p.query);
        break;
      case 'dashboard': return _respond(_ok(getDashboardData()));
      case 'getAllConfig':
      case 'checkWhatsAppStatus':
        result = checkWhatsAppStatus();
        break;
      case 'getConfig':
        result = { key: p.key, value: getConfig(p.key) };
        break;
      case 'getAllConfig':
        result = getAllConfig();
        break;

      default:
        return _respond(_err('פעולת GET לא ידועה: ' + action, 400));
    }

    return _respond(_ok(result));
  } catch (err) {
    Logger.log('doGet error [' + action + ']: ' + err.message + '\n' + err.stack);
    return _respond(_err('שגיאת שרת: ' + err.message, 500));
  }
}

// Helper dispatcher for import templates
function _getImportTemplate(type) {
  switch (type) {
    case 'students': return getStudentImportTemplate();
    case 'lessons':  return getLessonImportTemplate();
    case 'payments': return getPaymentImportTemplate();
    default: throw new Error('סוג תבנית לא ידוע: ' + type);
  }
}

// ============================================================
// doPost — JSON dispatcher for all write actions
// ============================================================
function doPost(e) {
  try {
    const body   = _parseBody(e);
    const action = body.action;

    const handlers = {
      // Students
      createStudent:          () => createStudent(body),
      updateStudent:          () => updateStudent(body),
      deleteStudent:          () => deleteStudent(body.id),
      archiveStudent:         () => archiveStudent(body.id, body.reason, body.notes),

      // Lessons
      createLesson:           () => createLesson(body),
      updateLesson:           () => updateLesson(body),
      deleteLesson:           () => deleteLesson(body.id),
      confirmLessons:         () => confirmLessons(body.ids),

      // Payments
      createPayment:          () => createPayment(body),
      updatePayment:          () => updatePayment(body),
      deletePayment:          () => deletePayment(body.id),

      // Balance
      recalculateAllBalances: () => recalculateAllBalances(),

      // Archive
      moveToArchive:          () => moveToArchive(body.studentId, body.reason, body.notes),
      restoreFromArchive:     () => restoreFromArchive(body.archivedId),

      // Import
      importStudentsCSV:      () => importStudentsCSV(body.csvText),
      importLessonsCSV:       () => importLessonsCSV(body.csvText, body.studentMapping),
      importPaymentsCSV:      () => importPaymentsCSV(body.csvText, body.studentMapping),

      // WhatsApp
      sendWhatsApp:           () => sendWhatsApp(body.phone, body.message),
      sendLessonReminder:     () => sendLessonReminder(body.lessonId),
      sendPaymentConfirmation:() => sendPaymentConfirmation(body.paymentId),
      sendLessonConfirmation: () => sendLessonConfirmation(body.lessonId),
      sendLessonCancellation: () => sendLessonCancellation(body.lessonId),
      sendWelcomeMessage:     () => sendWelcomeMessage(body.studentId),

      // Config
      setConfig:              () => { setConfig(body.key, body.value); return { success: true }; },
      setAllConfig:           () => {
        (body.configs || []).forEach(c => setConfig(c.key, c.value));
        return { success: true };
      },
    };

    if (!handlers[action]) {
      return _respond(_err('פעולה לא ידועה: ' + action, 400));
    }

    const result = handlers[action]();
    return _respond(_ok(result));
  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
    return _respond(_err('שגיאת שרת: ' + err.message, 500));
  }
}


function getDashboardData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get active students
    const studentsSheet = ss.getSheetByName('תלמידים') || ss.getSheetByName('Students');
    let activeStudents = 0;
    let topDebtors = [];
    let totalDebt = 0;

    if (studentsSheet) {
      const sData = studentsSheet.getDataRange().getValues();
      const headers = sData[0].map(h => String(h).trim());
      const nameIdx = headers.indexOf('שם') !== -1 ? headers.indexOf('שם') : 0;
      const statusIdx = headers.findIndex(h => h.includes('סטטוס') || h.includes('status') || h.includes('Status'));
      const balanceIdx = headers.findIndex(h => h.includes('יתרה') || h.includes('חוב') || h.includes('balance') || h.includes('Balance'));

      for (let i = 1; i < sData.length; i++) {
        const row = sData[i];
        if (!row[nameIdx]) continue;
        const status = statusIdx >= 0 ? String(row[statusIdx]) : '';
        const isActive = statusIdx < 0 || status.includes('פעיל') || status === 'active' || status === '';
        if (isActive) activeStudents++;

        if (balanceIdx >= 0) {
          const bal = parseFloat(row[balanceIdx]) || 0;
          totalDebt += bal > 0 ? bal : 0;
          if (bal > 1000) {
            topDebtors.push({ name: String(row[nameIdx]), balance: bal });
          }
        }
      }
      topDebtors.sort((a, b) => b.balance - a.balance);
      topDebtors = topDebtors.slice(0, 5);
    }

    // Get today's lessons and upcoming tests
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in14Days = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    let todayLessons = 0;
    let upcomingTests = [];
    let nearTestCount = 0;

    const lessonsSheet = ss.getSheetByName('יומן') || ss.getSheetByName('שיעורים') || ss.getSheetByName('Lessons');
    if (lessonsSheet) {
      const lData = lessonsSheet.getDataRange().getValues();
      const lHeaders = lData[0].map(h => String(h).trim());
      const dateIdx = lHeaders.findIndex(h => h.includes('תאריך') || h.includes('date') || h.includes('Date'));
      const typeIdx = lHeaders.findIndex(h => h.includes('סוג') || h.includes('type') || h.includes('Type'));
      const studentIdx = lHeaders.findIndex(h => h.includes('תלמיד') || h.includes('שם') || h.includes('student'));
      const timeIdx = lHeaders.findIndex(h => h.includes('שעה') || h.includes('time') || h.includes('Time'));

      for (let i = 1; i < lData.length; i++) {
        const row = lData[i];
        if (!row[dateIdx >= 0 ? dateIdx : 0]) continue;
        const lessonDate = new Date(row[dateIdx >= 0 ? dateIdx : 0]);
        lessonDate.setHours(0, 0, 0, 0);

        if (lessonDate.getTime() === today.getTime()) {
          todayLessons++;
        }

        const lessonType = typeIdx >= 0 ? String(row[typeIdx]) : '';
        if (lessonType.includes('טסט') || lessonType.includes('test') || lessonType.includes('Test')) {
          if (lessonDate >= today && lessonDate <= in14Days) {
            nearTestCount++;
            const daysUntil = Math.round((lessonDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
            const studentName = studentIdx >= 0 ? String(row[studentIdx]) : '';
            const startTime = timeIdx >= 0 ? String(row[timeIdx]) : '';
            upcomingTests.push({
              studentName,
              date: Utilities.formatDate(lessonDate, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
              startTime,
              daysUntil
            });
          }
        }
      }
      upcomingTests.sort((a, b) => a.daysUntil - b.daysUntil);
    }

    // Monthly income
    let monthlyIncome = 0;
    const paymentsSheet = ss.getSheetByName('תשלומים') || ss.getSheetByName('Payments');
    if (paymentsSheet) {
      const pData = paymentsSheet.getDataRange().getValues();
      const pHeaders = pData[0].map(h => String(h).trim());
      const pDateIdx = pHeaders.findIndex(h => h.includes('תאריך') || h.includes('date'));
      const pAmountIdx = pHeaders.findIndex(h => h.includes('סכום') || h.includes('amount') || h.includes('Amount'));
      const thisMonth = today.getMonth();
      const thisYear = today.getFullYear();

      for (let i = 1; i < pData.length; i++) {
        const row = pData[i];
        if (!row[pDateIdx >= 0 ? pDateIdx : 0]) continue;
        const pDate = new Date(row[pDateIdx >= 0 ? pDateIdx : 0]);
        if (pDate.getMonth() === thisMonth && pDate.getFullYear() === thisYear) {
          const amt = parseFloat(row[pAmountIdx >= 0 ? pAmountIdx : 0]) || 0;
          monthlyIncome += amt;
        }
      }
    }

    return {
      activeStudents,
      todayLessons,
      topDebtors,
      totalDebt,
      monthlyIncome,
      nearTestCount,
      upcomingTests
    };
  } catch (e) {
    Logger.log('getDashboardData error: ' + e.toString());
    return {
      activeStudents: 0,
      todayLessons: 0,
      topDebtors: [],
      totalDebt: 0,
      monthlyIncome: 0,
      nearTestCount: 0,
      upcomingTests: []
    };
  }
}

// ============================================================
// setupSpreadsheet — one-time setup (run from GAS editor)
// ============================================================
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SS_ID);

  const sheets = [
    {
      name: SHEET_STUDENTS,
      headers: STUDENT_HEADERS,
      widths: [120, 80, 80, 100, 110, 100, 160, 80, 80, 80, 100, 200, 120, 140]
    },
    {
      name: SHEET_LESSONS,
      headers: LESSON_HEADERS,
      widths: [120, 120, 120, 90, 80, 80, 90, 80, 80, 200, 100, 140, 140]
    },
    {
      name: SHEET_PAYMENTS,
      headers: PAYMENT_HEADERS,
      widths: [120, 120, 120, 100, 80, 90, 100, 200, 140]
    },
    {
      name: SHEET_BALANCES,
      headers: BALANCE_HEADERS,
      widths: [120, 120, 100, 100, 100, 140]
    },
    {
      name: SHEET_ARCHIVE,
      headers: ARCHIVE_HEADERS,
      widths: [120, 120, 80, 80, 100, 110, 100, 160, 80, 80, 100, 100, 100, 80, 80, 80, 200, 140]
    },
    {
      name: SHEET_SETTINGS,
      headers: ['מפתח', 'ערך'],
      widths: [200, 300]
    }
  ];

  sheets.forEach(function(cfg) {
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet) sheet = ss.insertSheet(cfg.name);

    sheet.clearContents();
    sheet.getRange(1, 1, 1, cfg.headers.length).setValues([cfg.headers]);
    sheet.setRightToLeft(true);

    var headerRange = sheet.getRange(1, 1, 1, cfg.headers.length);
    headerRange.setBackground('#1e3a5f');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    headerRange.setHorizontalAlignment('center');

    sheet.setFrozenRows(1);

    cfg.widths.forEach(function(w, i) {
      sheet.setColumnWidth(i + 1, w);
    });
  });

  // Seed הגדרות with defaults
  var defaults = [
    ['SCHOOL_NAME',                SCHOOL_NAME],
    ['INSTRUCTOR_NAME',            INSTRUCTOR_NAME],
    ['INSTRUCTOR_PHONE',           ''],
    ['GREEN_API_INSTANCE_ID',      GREEN_API_INSTANCE],
    ['GREEN_API_TOKEN',            GREEN_API_TOKEN],
    ['WHATSAPP_ENABLED',           'TRUE'],
    ['PRICE_REGULAR_MIN',          '160'],
    ['PRICE_REGULAR_MAX',          '190'],
    ['PRICE_PACKAGE_A',            String(PRICE_PACKAGE_A)],
    ['PRICE_PACKAGE_B',            String(PRICE_PACKAGE_B)],
    ['PRICE_PACKAGE_LESSONS',      String(PACKAGE_LESSONS)],
    ['PRICE_PACKAGE_A_FREE_TESTS', String(PACKAGE_A_FREE_TESTS)],
    ['PRICE_PACKAGE_B_FREE_TESTS', String(PACKAGE_B_FREE_TESTS)],
    ['PRICE_INTERNAL',             String(PRICE_INTERNAL)],
    ['PRICE_INTERNAL_FREE',        'FALSE'],
    ['PRICE_TEST',                 String(PRICE_TEST)],
    ['PRICE_TEST_FREE',            'FALSE'],
    ['REMINDER_HOURS_BEFORE',      '24'],
    ['RECEIPT_COUNTER',            '0'],
    ['RECEIPT_PREFIX',             String(new Date().getFullYear())],
    ['DEPLOYED_URL',               ''],
  ];

  var settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  settingsSheet.getRange(2, 1, defaults.length, 2).setValues(defaults);

  Logger.log('Spreadsheet setup complete: ' + SCHOOL_NAME);
}

// ============================================================
// Private helpers
// ============================================================

function _ss() {
  return SpreadsheetApp.openById(SS_ID);
}

function _sheet(name) {
  return _ss().getSheetByName(name);
}

function _ok(data) {
  return { success: true, data: data };
}

function _err(message, code) {
  return { success: false, error: message, code: code || 400 };
}

function _parseBody(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      return JSON.parse(e.postData.contents);
    }
    return {};
  } catch (ex) {
    throw new Error('גוף הבקשה אינו JSON תקני: ' + ex.message);
  }
}

function _respond(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
