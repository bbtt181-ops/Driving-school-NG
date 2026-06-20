// ============================================================
// Students.gs — Student CRUD and business logic
// driving-school-NG
// ============================================================

const STUDENT_HEADERS = [
  'מזהה', 'שם פרטי', 'שם משפחה', 'תעודת זהות', 'טלפון',
  'תאריך לידה', 'כתובת', 'סוג רכב', 'סוג מחיר', 'סטטוס',
  'תאריך הצטרפות', 'הערות', 'תזכורת WhatsApp', 'עודכן בתאריך'
];

// Column index map (0-based)
var _SC = {
  id: 0, firstName: 1, lastName: 2, idNumber: 3, phone: 4,
  birthDate: 5, address: 6, vehicleType: 7, pricingType: 8,
  status: 9, joinDate: 10, notes: 11, whatsappOptIn: 12, updatedAt: 13
};

// ─── Row → Object mapper ──────────────────────────────────────
function _rowToStudent(obj) {
  var firstName = String(obj['שם פרטי']  || '');
  var lastName  = String(obj['שם משפחה'] || '');
  var pricing   = String(obj['סוג מחיר'] || PRICING_REGULAR);
  return {
    id:            String(obj['מזהה']           || ''),
    firstName:     firstName,
    lastName:      lastName,
    name:          (firstName + ' ' + lastName).trim(),
    idNumber:      String(obj['תעודת זהות']     || ''),
    tz:            String(obj['תעודת זהות']     || ''),
    phone:         String(obj['טלפון']          || ''),
    birthDate:     String(obj['תאריך לידה']     || ''),
    address:       String(obj['כתובת']          || ''),
    vehicleType:   String(obj['סוג רכב']        || ''),
    pricingType:   pricing,
    pricing:       pricing,
    status:        String(obj['סטטוס']          || STATUS_ACTIVE),
    joinDate:      String(obj['תאריך הצטרפות'] || ''),
    notes:         String(obj['הערות']          || ''),
    whatsappOptIn: obj['תזכורת WhatsApp'] === true || obj['תזכורת WhatsApp'] === 'TRUE',
    updatedAt:     String(obj['עודכן בתאריך']  || ''),
    __rowNum:      obj.__rowNum
  };
}

// ─── getStudents ─────────────────────────────────────────────
function getStudents(params) {
  params = params || {};
  var sheet    = _sheet(SHEET_STUDENTS);
  var rows     = sheetToObjects(sheet, STUDENT_HEADERS);
  var students = rows.map(_rowToStudent);

  // Filter by status (default: exclude ארכיון)
  var statusFilter = params.status || '';
  if (statusFilter && statusFilter !== 'all') {
    students = students.filter(function(s) { return s.status === statusFilter; });
  } else if (!statusFilter) {
    students = students.filter(function(s) { return s.status !== STATUS_ARCHIVE; });
  }

  // Search filter
  var q = (params.search || '').trim().toLowerCase();
  if (q) {
    students = students.filter(function(s) {
      return (s.firstName + ' ' + s.lastName).toLowerCase().indexOf(q) >= 0
          || s.idNumber.indexOf(q) >= 0
          || normalizePhone(s.phone).indexOf(normalizePhone(q)) >= 0
          || s.phone.indexOf(q) >= 0;
    });
  }

  // Sort by name
  students.sort(function(a, b) {
    var na = (a.firstName + ' ' + a.lastName);
    var nb = (b.firstName + ' ' + b.lastName);
    return na.localeCompare(nb, 'he');
  });

  var page     = Number(params.page)     || 1;
  var pageSize = Number(params.pageSize) || 50;
  return paginate(students, page, pageSize);
}

// ─── getStudent ──────────────────────────────────────────────
function getStudent(id) {
  if (!id) return null;
  var sheet = _sheet(SHEET_STUDENTS);
  var rows  = sheetToObjects(sheet, STUDENT_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['מזהה']) === String(id)) {
      return _rowToStudent(rows[i]);
    }
  }
  return null;
}

// ─── createStudent ───────────────────────────────────────────
function createStudent(input) {
  var validation = validateStudent(input, false);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(' | '), code: 422 };
  }

  var sheet = _sheet(SHEET_STUDENTS);
  var id    = uuid();
  var now   = nowISO();

  var obj = {};
  obj['מזהה']           = id;
  obj['שם פרטי']        = String(input.firstName  || '').trim();
  obj['שם משפחה']       = String(input.lastName   || '').trim();
  obj['תעודת זהות']     = String(input.idNumber || '').trim().replace(/^(\d{1,8})$/, function(s){ while(s.length<9) s='0'+s; return s; });
  obj['טלפון']          = normalizePhone(input.phone);
  obj['תאריך לידה']     = String(input.birthDate  || '');
  obj['כתובת']          = String(input.address    || '');
  obj['סוג רכב']        = String(input.vehicleType || 'ידני');
  obj['סוג מחיר']       = String(input.pricingType || PRICING_REGULAR);
  obj['סטטוס']          = String(input.status     || STATUS_ACTIVE);
  obj['תאריך הצטרפות'] = today();
  obj['הערות']          = String(input.notes      || '');
  obj['תזכורת WhatsApp'] = input.whatsappOptIn ? 'TRUE' : 'FALSE';
  obj['עודכן בתאריך']  = now;

  appendRow(sheet, STUDENT_HEADERS, obj);

  var student = getStudent(id);
  return { success: true, id: id, student: student };
}

// ─── updateStudent ───────────────────────────────────────────
function updateStudent(input) {
  if (!input.id) return { success: false, error: 'נדרש מזהה תלמיד', code: 400 };

  var validation = validateStudent(input, true);
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(' | '), code: 422 };
  }

  var sheet  = _sheet(SHEET_STUDENTS);
  var rowNum = findRow(sheet, _SC.id, input.id);
  if (rowNum < 0) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var updates = {};
  var fieldMap = {
    firstName:     _SC.firstName,
    lastName:      _SC.lastName,
    idNumber:      _SC.idNumber,
    phone:         _SC.phone,
    birthDate:     _SC.birthDate,
    address:       _SC.address,
    vehicleType:   _SC.vehicleType,
    pricingType:   _SC.pricingType,
    status:        _SC.status,
    notes:         _SC.notes,
    whatsappOptIn: _SC.whatsappOptIn
  };

  Object.keys(fieldMap).forEach(function(field) {
    if (input[field] !== undefined) {
      var val = input[field];
      if (field === 'phone') val = normalizePhone(val);
      updates[fieldMap[field]] = val;
    }
  });

  updates[_SC.updatedAt] = nowISO();
  updateRow(sheet, rowNum, updates);

  var student = getStudent(input.id);
  return { success: true, student: student };
}

// ─── deleteStudent (soft) ────────────────────────────────────
function deleteStudent(id) {
  if (!id) return { success: false, error: 'נדרש מזהה', code: 400 };
  var sheet  = _sheet(SHEET_STUDENTS);
  var rowNum = findRow(sheet, _SC.id, id);
  if (rowNum < 0) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var updates = {};
  updates[_SC.status]    = STATUS_INACTIVE;
  updates[_SC.updatedAt] = nowISO();
  updateRow(sheet, rowNum, updates);

  return { success: true };
}

// ─── archiveStudent ──────────────────────────────────────────
function archiveStudent(id, reason, notes) {
  if (!id) return { success: false, error: 'נדרש מזהה', code: 400 };
  reason = reason || 'אחר';

  var result = moveToArchive(id, reason, notes);
  if (!result.success) return result;

  var sheet  = _sheet(SHEET_STUDENTS);
  var rowNum = findRow(sheet, _SC.id, id);
  if (rowNum > 0) {
    var updates = {};
    updates[_SC.status]    = STATUS_ARCHIVE;
    updates[_SC.updatedAt] = nowISO();
    updateRow(sheet, rowNum, updates);
  }

  return { success: true, archiveId: result.archiveId };
}

// ─── getStudentHistory ───────────────────────────────────────
function getStudentHistory(id) {
  var student  = getStudent(id);
  if (!student) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var lessons  = getLessonsByStudent(id, 1, 1000).data;
  var payments = getPaymentsByStudent(id);
  var balance  = computeBalance(id);

  return {
    student:  student,
    lessons:  lessons,
    payments: payments,
    balance:  balance
  };
}

// ─── validateStudent ─────────────────────────────────────────
function validateStudent(data, isUpdate) {
  var errors = [];

  if (!isUpdate) {
    if (!data.firstName || !String(data.firstName).trim()) {
      errors.push('שם פרטי הוא שדה חובה');
    }
    if (!data.lastName || !String(data.lastName).trim()) {
      errors.push('שם משפחה הוא שדה חובה');
    }
    if (data.idNumber) {
      if (!validateTZ(data.idNumber)) {
        errors.push('תעודת זהות לא תקינה');
      } else if (tzExists(data.idNumber, isUpdate ? data.id : null)) {
        errors.push('תעודת זהות כבר קיימת במערכת');
      }
    }
    if (!data.phone) {
      errors.push('טלפון הוא שדה חובה');
    } else if (!validatePhone(data.phone)) {
      errors.push('מספר טלפון לא תקין (05XXXXXXXX)');
    }
  } else {
    // On update — validate only provided fields
    if (data.idNumber !== undefined) {
      if (!validateTZ(data.idNumber)) {
        errors.push('תעודת זהות לא תקינה');
      } else if (tzExists(data.idNumber, data.id)) {
        errors.push('תעודת זהות כבר קיימת במערכת');
      }
    }
    if (data.phone !== undefined && data.phone !== '') {
      if (!validatePhone(data.phone)) {
        errors.push('מספר טלפון לא תקין (05XXXXXXXX)');
      }
    }
  }

  // Age validation (if DOB provided)
  if (data.birthDate && String(data.birthDate).trim()) {
    if (!validateAge(data.birthDate)) {
      errors.push('גיל התלמיד חייב להיות לפחות 16.5 שנים');
    }
  }

  // pricingType validation
  var validPricing = [PRICING_REGULAR, PRICING_PACKAGE_A, PRICING_PACKAGE_B,
                      PRICING_INTERNAL, PRICING_TEST_ONLY];
  if (data.pricingType && validPricing.indexOf(data.pricingType) < 0) {
    errors.push('סוג מחיר לא תקין: ' + data.pricingType);
  }

  return { valid: errors.length === 0, errors: errors };
}

// ─── tzExists ────────────────────────────────────────────────
function tzExists(tz, excludeId) {
  var sheet = _sheet(SHEET_STUDENTS);
  var rows  = sheetToObjects(sheet, STUDENT_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['תעודת זהות']) === String(tz)) {
      if (excludeId && String(rows[i]['מזהה']) === String(excludeId)) continue;
      return true;
    }
  }
  return false;
}
