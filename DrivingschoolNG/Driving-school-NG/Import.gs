// ============================================================
// Import.gs — CSV parsing and bulk import
// driving-school-NG
// ============================================================

// ─── parseCSV ────────────────────────────────────────────────
// Parses CSV text, first row = headers
// Returns array of objects
function parseCSV(csvText) {
  if (!csvText) return [];
  var lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if (lines.length < 2) return [];

  var headers = _parseCsvLine(lines[0]);
  var result  = [];

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var values = _parseCsvLine(line);
    if (values.every(function(v) { return !v; })) continue; // skip blank rows
    var obj = {};
    headers.forEach(function(h, idx) {
      obj[h.trim()] = (values[idx] !== undefined) ? values[idx].trim() : '';
    });
    result.push(obj);
  }
  return result;
}

// Parse a single CSV line respecting quoted fields
function _parseCsvLine(line) {
  var result = [];
  var cur    = '';
  var inQuote = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        result.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

// ─── buildStudentMapping ─────────────────────────────────────
// Returns { TZ: studentId } mapping
function buildStudentMapping() {
  var sheet = _sheet(SHEET_STUDENTS);
  var rows  = sheetToObjects(sheet, STUDENT_HEADERS);
  var map   = {};
  rows.forEach(function(r) {
    var tz = String(r['תעודת זהות'] || '').trim();
    var id = String(r['מזהה'] || '').trim();
    if (tz && id) map[tz] = id;
  });
  return map;
}

// ─── importStudentsCSV ───────────────────────────────────────
function importStudentsCSV(csvText) {
  var rows     = parseCSV(csvText);
  var imported = 0;
  var skipped  = 0;
  var errors   = [];

  rows.forEach(function(row, idx) {
    var validation = validateStudentImportRow(row, idx + 2);
    if (!validation.valid) {
      errors.push({ rowIndex: idx + 2, errors: validation.errors, rawData: row });
      skipped++;
      return;
    }
    var result = createStudent(validation.data);
    if (result.success) {
      imported++;
    } else {
      errors.push({ rowIndex: idx + 2, errors: [result.error], rawData: row });
      skipped++;
    }
  });

  if (imported > 0) {
    try { recalculateAllBalances(); } catch(e) { Logger.log('recalc error: ' + e); }
  }

  return { imported: imported, errors: errors, skipped: skipped };
}

// ─── importLessonsCSV ────────────────────────────────────────
function importLessonsCSV(csvText, studentMapping) {
  if (!studentMapping) studentMapping = buildStudentMapping();
  var rows     = parseCSV(csvText);
  var imported = 0;
  var skipped  = 0;
  var errors   = [];

  rows.forEach(function(row, idx) {
    var validation = validateLessonImportRow(row, idx + 2, studentMapping);
    if (!validation.valid) {
      errors.push({ rowIndex: idx + 2, errors: validation.errors, rawData: row });
      skipped++;
      return;
    }
    var result = createLesson(validation.data);
    if (result.success) {
      imported++;
    } else {
      errors.push({ rowIndex: idx + 2, errors: [result.error], rawData: row });
      skipped++;
    }
  });

  if (imported > 0) {
    try { recalculateAllBalances(); } catch(e) { Logger.log('recalc error: ' + e); }
  }

  return { imported: imported, errors: errors, skipped: skipped };
}

// ─── importPaymentsCSV ───────────────────────────────────────
function importPaymentsCSV(csvText, studentMapping) {
  if (!studentMapping) studentMapping = buildStudentMapping();
  var rows     = parseCSV(csvText);
  var imported = 0;
  var skipped  = 0;
  var errors   = [];

  rows.forEach(function(row, idx) {
    var validation = validatePaymentImportRow(row, idx + 2, studentMapping);
    if (!validation.valid) {
      errors.push({ rowIndex: idx + 2, errors: validation.errors, rawData: row });
      skipped++;
      return;
    }
    var result = createPayment(validation.data);
    if (result.success) {
      imported++;
    } else {
      errors.push({ rowIndex: idx + 2, errors: [result.error], rawData: row });
      skipped++;
    }
  });

  return { imported: imported, errors: errors, skipped: skipped };
}

// ─── validateStudentImportRow ────────────────────────────────
function validateStudentImportRow(row, rowIndex) {
  var errors = [];

  var firstName  = String(row['שם פרטי']   || '').trim();
  var lastName   = String(row['שם משפחה']  || '').trim();
  var idNumber   = String(row['תעודת זהות'] || '').trim();
  var phone      = String(row['טלפון']     || '').trim();
  var birthDate  = String(row['תאריך לידה'] || '').trim();
  var address    = String(row['כתובת']     || '').trim();
  var vehicleType = String(row['סוג רכב']  || 'ידני').trim();
  var pricingType = String(row['סוג מחיר'] || PRICING_REGULAR).trim();
  var status     = String(row['סטטוס']     || STATUS_ACTIVE).trim();
  var notes      = String(row['הערות']     || '').trim();

  if (!firstName) errors.push('שורה ' + rowIndex + ': שם פרטי חסר');
  if (!lastName)  errors.push('שורה ' + rowIndex + ': שם משפחה חסר');

  if (!idNumber) {
    errors.push('שורה ' + rowIndex + ': תעודת זהות חסרה');
  } else if (!validateTZ(idNumber)) {
    errors.push('שורה ' + rowIndex + ': תעודת זהות לא תקינה (' + idNumber + ')');
  } else if (tzExists(idNumber, null)) {
    errors.push('שורה ' + rowIndex + ': תעודת זהות ' + idNumber + ' כבר קיימת');
  }

  if (!phone) {
    errors.push('שורה ' + rowIndex + ': טלפון חסר');
  } else if (!validatePhone(phone)) {
    errors.push('שורה ' + rowIndex + ': מספר טלפון לא תקין (' + phone + ')');
  }

  if (birthDate && !validateAge(birthDate)) {
    errors.push('שורה ' + rowIndex + ': גיל חייב להיות לפחות 16.5 שנים');
  }

  var validPricing = [PRICING_REGULAR, PRICING_PACKAGE_A, PRICING_PACKAGE_B, PRICING_INTERNAL, PRICING_TEST_ONLY];
  if (pricingType && validPricing.indexOf(pricingType) < 0) {
    errors.push('שורה ' + rowIndex + ': סוג מחיר לא תקין (' + pricingType + ')');
  }

  var data = {
    firstName:    firstName,
    lastName:     lastName,
    idNumber:     idNumber,
    phone:        phone,
    birthDate:    birthDate,
    address:      address,
    vehicleType:  vehicleType || 'ידני',
    pricingType:  pricingType || PRICING_REGULAR,
    status:       status || STATUS_ACTIVE,
    notes:        notes,
    whatsappOptIn: false
  };

  return { valid: errors.length === 0, errors: errors, data: data };
}

// ─── validateLessonImportRow ─────────────────────────────────
function validateLessonImportRow(row, rowIndex, studentMapping) {
  var errors = [];

  var studentTZ  = String(row['תעודת זהות תלמיד'] || '').trim();
  var date       = String(row['תאריך']            || '').trim();
  var startTime  = String(row['שעת התחלה']        || '').trim();
  var endTime    = String(row['שעת סיום']          || '').trim();
  var lessonType = String(row['סוג שיעור']        || LESSON_TYPE_REGULAR).trim();
  var status     = String(row['סטטוס']            || LESSON_DONE).trim();
  var priceRaw   = String(row['מחיר']             || '').trim();
  var notes      = String(row['הערות']            || '').trim();

  var studentId = null;
  if (!studentTZ) {
    errors.push('שורה ' + rowIndex + ': תעודת זהות תלמיד חסרה');
  } else {
    studentId = studentMapping[studentTZ] || null;
    if (!studentId) {
      errors.push('שורה ' + rowIndex + ': תלמיד עם ת.ז. ' + studentTZ + ' לא נמצא');
    }
  }

  if (!date) {
    errors.push('שורה ' + rowIndex + ': תאריך חסר');
  } else if (!parseDate(date)) {
    errors.push('שורה ' + rowIndex + ': פורמט תאריך לא תקין (' + date + ')');
  }

  if (!startTime) errors.push('שורה ' + rowIndex + ': שעת התחלה חסרה');
  if (!endTime)   errors.push('שורה ' + rowIndex + ': שעת סיום חסרה');
  if (startTime && endTime && startTime >= endTime) {
    errors.push('שורה ' + rowIndex + ': שעת סיום חייבת להיות אחרי שעת ההתחלה');
  }

  var validTypes = [LESSON_TYPE_REGULAR, LESSON_TYPE_INTERNAL, LESSON_TYPE_TEST, LESSON_TYPE_EXTRA];
  if (lessonType && validTypes.indexOf(lessonType) < 0) {
    errors.push('שורה ' + rowIndex + ': סוג שיעור לא תקין (' + lessonType + ')');
  }

  var price = priceRaw !== '' ? Number(priceRaw) : undefined;
  if (priceRaw !== '' && isNaN(price)) {
    errors.push('שורה ' + rowIndex + ': מחיר לא תקין (' + priceRaw + ')');
    price = undefined;
  }

  var data = {
    studentId:  studentId,
    date:       date,
    startTime:  startTime,
    endTime:    endTime,
    lessonType: lessonType || LESSON_TYPE_REGULAR,
    status:     status || LESSON_DONE,
    price:      price,
    notes:      notes
  };

  return { valid: errors.length === 0, errors: errors, data: data };
}

// ─── validatePaymentImportRow ─────────────────────────────────
function validatePaymentImportRow(row, rowIndex, studentMapping) {
  var errors = [];

  var studentTZ   = String(row['תעודת זהות תלמיד'] || '').trim();
  var paymentDate = String(row['תאריך תשלום']      || '').trim();
  var amountRaw   = String(row['סכום']             || '').trim();
  var method      = String(row['אמצעי תשלום']     || '').trim();
  var notes       = String(row['הערות']            || '').trim();

  var studentId = null;
  if (!studentTZ) {
    errors.push('שורה ' + rowIndex + ': תעודת זהות תלמיד חסרה');
  } else {
    studentId = studentMapping[studentTZ] || null;
    if (!studentId) {
      errors.push('שורה ' + rowIndex + ': תלמיד עם ת.ז. ' + studentTZ + ' לא נמצא');
    }
  }

  if (!paymentDate) {
    errors.push('שורה ' + rowIndex + ': תאריך תשלום חסר');
  } else if (!parseDate(paymentDate)) {
    errors.push('שורה ' + rowIndex + ': פורמט תאריך לא תקין (' + paymentDate + ')');
  }

  var amount = Number(amountRaw);
  if (!amountRaw || isNaN(amount) || amount <= 0) {
    errors.push('שורה ' + rowIndex + ': סכום לא תקין (' + amountRaw + ')');
  }

  if (!method) {
    errors.push('שורה ' + rowIndex + ': אמצעי תשלום חסר');
  } else if (PAYMENT_METHODS.indexOf(method) < 0) {
    errors.push('שורה ' + rowIndex + ': אמצעי תשלום לא תקין (' + method + '). תקפים: ' + PAYMENT_METHODS.join(', '));
  }

  var data = {
    studentId:   studentId,
    paymentDate: paymentDate,
    amount:      amount,
    method:      method,
    notes:       notes
  };

  return { valid: errors.length === 0, errors: errors, data: data };
}

// ─── Template generators ──────────────────────────────────────
function getStudentImportTemplate() {
  var headers = [
    'שם פרטי', 'שם משפחה', 'תעודת זהות', 'טלפון', 'תאריך לידה',
    'כתובת', 'סוג רכב', 'סוג מחיר', 'סטטוס', 'הערות'
  ];
  var example = [
    'ישראל', 'ישראלי', '123456782', '0501234567', '15/03/2003',
    'רחוב הרצל 1 תל אביב', 'ידני', 'רגיל', 'פעיל', ''
  ];
  return headers.join(',') + '\n' + example.join(',');
}

function getLessonImportTemplate() {
  var headers = [
    'תעודת זהות תלמיד', 'תאריך', 'שעת התחלה', 'שעת סיום',
    'סוג שיעור', 'סטטוס', 'מחיר', 'הערות'
  ];
  var example = [
    '123456782', '01/01/2025', '10:00', '11:00',
    'רגיל', 'הושלם', '160', ''
  ];
  return headers.join(',') + '\n' + example.join(',');
}

function getPaymentImportTemplate() {
  var headers = [
    'תעודת זהות תלמיד', 'תאריך תשלום', 'סכום', 'אמצעי תשלום', 'הערות'
  ];
  var example = [
    '123456782', '01/01/2025', '500', 'מזומן', ''
  ];
  return headers.join(',') + '\n' + example.join(',');
}
