// ============================================================
// WhatsApp.gs — Green API integration, message templates
// driving-school-NG
// ============================================================

// ─── sendWhatsApp ────────────────────────────────────────────
function sendWhatsApp(phone, message) {
  try {
    if (getConfig('WHATSAPP_ENABLED') !== 'TRUE') {
      return { success: false, skipped: 'WhatsApp מושבת בהגדרות' };
    }
    if (!phone || !message) {
      return { success: false, error: 'טלפון והודעה הם שדות חובה' };
    }
    var chatId = _formatPhone(phone);
    var result = _callGreenAPI('sendMessage', { chatId: chatId, message: message });
    return { success: true, messageId: result.idMessage || '' };
  } catch (e) {
    Logger.log('WhatsApp sendWhatsApp error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── sendLessonReminder ──────────────────────────────────────
function sendLessonReminder(lessonId) {
  try {
    var lesson = getLesson(lessonId);
    if (!lesson) return { success: false, error: 'שיעור לא נמצא', skipped: false };

    var student = getStudent(lesson.studentId);
    if (!student) return { success: false, error: 'תלמיד לא נמצא', skipped: false };
    if (!student.whatsappOptIn) return { success: false, skipped: 'תלמיד לא הסכים לקבל הודעות' };

    var schoolName     = getConfig('SCHOOL_NAME')     || SCHOOL_NAME;
    var instructorName = getConfig('INSTRUCTOR_NAME') || INSTRUCTOR_NAME;

    var template = 'שלום {שם_פרטי} ⏰\n\nתזכורת: מחר יש לך שיעור!\n📅 תאריך: {תאריך}\n🕐 שעה: {שעת_התחלה}\n🚗 סוג: {סוג_שיעור}\n\nלביטול יש לפנות אלינו בהקדם.\n{שם_מדריך}';
    var message = formatTemplate(template, {
      'שם_פרטי':    student.firstName,
      'תאריך':      lesson.date,
      'שעת_התחלה': lesson.startTime,
      'סוג_שיעור':  lesson.lessonType,
      'שם_מדריך':   instructorName
    });

    var result = sendWhatsApp(student.phone, message);
    if (result.success) {
      // Mark reminderSent = TRUE
      var sheet  = _sheet(SHEET_LESSONS);
      var rowNum = findRow(sheet, 0, lessonId); // col 0 = מזהה
      if (rowNum > 0) {
        setCell(sheet, rowNum, _LC.reminderSent, true);
        setCell(sheet, rowNum, _LC.updatedAt, nowISO());
      }
    }
    return result;
  } catch (e) {
    Logger.log('sendLessonReminder error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── sendPaymentConfirmation ─────────────────────────────────
function sendPaymentConfirmation(paymentId) {
  try {
    var payment = _getPaymentById(paymentId);
    if (!payment) return { success: false, error: 'תשלום לא נמצא' };

    var student = getStudent(payment.studentId);
    if (!student) return { success: false, error: 'תלמיד לא נמצא' };
    if (!student.whatsappOptIn) return { success: false, skipped: 'תלמיד לא הסכים לקבל הודעות' };

    var instructorName = getConfig('INSTRUCTOR_NAME') || INSTRUCTOR_NAME;

    var template = 'שלום {שם_פרטי} 💳\n\nקבלנו את תשלומך:\n💰 סכום: ₪{סכום}\n📋 מספר קבלה: {מספר_קבלה}\n📅 תאריך: {תאריך_תשלום}\n💳 אמצעי: {אמצעי_תשלום}\n\nתודה!\n{שם_מדריך}';
    var message = formatTemplate(template, {
      'שם_פרטי':      student.firstName,
      'סכום':          String(payment.amount),
      'מספר_קבלה':    payment.receiptNumber,
      'תאריך_תשלום': payment.paymentDate,
      'אמצעי_תשלום': payment.method,
      'שם_מדריך':     instructorName
    });

    return sendWhatsApp(student.phone, message);
  } catch (e) {
    Logger.log('sendPaymentConfirmation error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── sendLessonConfirmation ──────────────────────────────────
function sendLessonConfirmation(lessonId) {
  try {
    var lesson = getLesson(lessonId);
    if (!lesson) return { success: false, error: 'שיעור לא נמצא' };

    var student = getStudent(lesson.studentId);
    if (!student) return { success: false, error: 'תלמיד לא נמצא' };
    if (!student.whatsappOptIn) return { success: false, skipped: 'תלמיד לא הסכים לקבל הודעות' };

    var instructorName = getConfig('INSTRUCTOR_NAME') || INSTRUCTOR_NAME;

    var template = 'שלום {שם_פרטי} ✅\n\nשיעורך אושר:\n📅 תאריך: {תאריך}\n🕐 שעה: {שעת_התחלה}–{שעת_סיום}\n🚗 סוג: {סוג_שיעור}\n\n{שם_מדריך}';
    var message = formatTemplate(template, {
      'שם_פרטי':    student.firstName,
      'תאריך':      lesson.date,
      'שעת_התחלה': lesson.startTime,
      'שעת_סיום':  lesson.endTime,
      'סוג_שיעור':  lesson.lessonType,
      'שם_מדריך':   instructorName
    });

    return sendWhatsApp(student.phone, message);
  } catch (e) {
    Logger.log('sendLessonConfirmation error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── sendLessonCancellation ──────────────────────────────────
function sendLessonCancellation(lessonId) {
  try {
    var lesson = getLesson(lessonId);
    if (!lesson) return { success: false, error: 'שיעור לא נמצא' };

    var student = getStudent(lesson.studentId);
    if (!student) return { success: false, error: 'תלמיד לא נמצא' };
    if (!student.whatsappOptIn) return { success: false, skipped: 'תלמיד לא הסכים לקבל הודעות' };

    var instructorName = getConfig('INSTRUCTOR_NAME') || INSTRUCTOR_NAME;

    var template = 'שלום {שם_פרטי} ❌\n\nשיעורך ב-{תאריך} בשעה {שעת_התחלה} בוטל.\n\nלתיאום שיעור חלופי פנה/י אלינו.\n{שם_מדריך}';
    var message = formatTemplate(template, {
      'שם_פרטי':    student.firstName,
      'תאריך':      lesson.date,
      'שעת_התחלה': lesson.startTime,
      'שם_מדריך':   instructorName
    });

    return sendWhatsApp(student.phone, message);
  } catch (e) {
    Logger.log('sendLessonCancellation error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── sendWelcomeMessage ──────────────────────────────────────
function sendWelcomeMessage(studentId) {
  try {
    var student = getStudent(studentId);
    if (!student) return { success: false, error: 'תלמיד לא נמצא' };
    if (!student.whatsappOptIn) return { success: false, skipped: 'תלמיד לא הסכים לקבל הודעות' };

    var schoolName     = getConfig('SCHOOL_NAME')     || SCHOOL_NAME;
    var instructorName = getConfig('INSTRUCTOR_NAME') || INSTRUCTOR_NAME;

    var template = 'שלום {שם_פרטי} 👋\n\nברוך הבא לבית הספר לנהיגה {שם_בית_ספר}!\n\nאנחנו שמחים לקבל אותך.\nבכל שאלה תוכל/י לפנות אלינו.\n\n{שם_מדריך}';
    var message = formatTemplate(template, {
      'שם_פרטי':      student.firstName,
      'שם_בית_ספר': schoolName,
      'שם_מדריך':     instructorName
    });

    return sendWhatsApp(student.phone, message);
  } catch (e) {
    Logger.log('sendWelcomeMessage error: ' + e.message);
    return { success: false, error: e.message };
  }
}

// ─── scheduleReminders ───────────────────────────────────────
// Daily trigger — sends reminders for tomorrow's lessons
function scheduleReminders() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var tomorrowStr = fmtDate(tomorrow);

  Logger.log('scheduleReminders: checking lessons for ' + tomorrowStr);

  var lessons = getLessonsByDate(tomorrowStr);
  var sent    = 0;
  var skipped = 0;

  lessons.forEach(function(lesson) {
    if (lesson.status !== LESSON_PLANNED) return;
    if (lesson.reminderSent) { skipped++; return; }

    var result = sendLessonReminder(lesson.id);
    if (result.success) {
      sent++;
    } else {
      Logger.log('Reminder skipped for lesson ' + lesson.id + ': ' + (result.skipped || result.error));
      skipped++;
    }
  });

  Logger.log('scheduleReminders complete: sent=' + sent + ', skipped=' + skipped);
}

// ─── setupDailyTrigger ───────────────────────────────────────
// Run once from GAS editor to create the time-driven trigger
function setupDailyTrigger() {
  // Delete existing triggers for scheduleReminders
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'scheduleReminders') {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Create new daily trigger at 08:00
  ScriptApp.newTrigger('scheduleReminders')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  Logger.log('Daily reminder trigger set for 08:00');
}

// ─── checkWhatsAppStatus ─────────────────────────────────────
function checkWhatsAppStatus() {
  try {
    var instanceId = getConfig('GREEN_API_INSTANCE_ID') || GREEN_API_INSTANCE;
    var token      = getConfig('GREEN_API_TOKEN')       || GREEN_API_TOKEN;
    var url        = 'https://api.green-api.com/waInstance' + instanceId + '/getStateInstance/' + token;

    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code     = response.getResponseCode();
    var json     = JSON.parse(response.getContentText());

    if (code !== 200) {
      return { connected: false, status: 'שגיאת HTTP ' + code };
    }
    return {
      connected: json.stateInstance === 'authorized',
      status:    json.stateInstance || 'unknown'
    };
  } catch (e) {
    Logger.log('checkWhatsAppStatus error: ' + e.message);
    return { connected: false, status: 'שגיאה: ' + e.message };
  }
}

// ─── formatTemplate ──────────────────────────────────────────
function formatTemplate(template, vars) {
  var result = template;
  Object.keys(vars).forEach(function(key) {
    result = result.split('{' + key + '}').join(String(vars[key] || ''));
  });
  return result;
}

// ─── _formatPhone ─────────────────────────────────────────────
function _formatPhone(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('972')) digits = digits.substring(3);
  if (digits.startsWith('0'))   digits = digits.substring(1);
  return '972' + digits + '@c.us';
}

// ─── _callGreenAPI ───────────────────────────────────────────
function _callGreenAPI(endpoint, body) {
  var instanceId = getConfig('GREEN_API_INSTANCE_ID') || GREEN_API_INSTANCE;
  var token      = getConfig('GREEN_API_TOKEN')       || GREEN_API_TOKEN;
  var url        = 'https://api.green-api.com/waInstance' + instanceId + '/' + endpoint + '/' + token;

  var options = {
    method:          'post',
    contentType:     'application/json',
    payload:         JSON.stringify(body),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var code     = response.getResponseCode();
  var text     = response.getContentText();

  var json;
  try { json = JSON.parse(text); } catch(e) { json = { error: text }; }

  if (code !== 200) {
    throw new Error('Green API error ' + code + ': ' + JSON.stringify(json));
  }

  return json; // { idMessage: "..." }
}
