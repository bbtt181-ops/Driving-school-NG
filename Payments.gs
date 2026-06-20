// ============================================================
// Payments.gs — Payment CRUD, receipt number generation
// driving-school-NG
// ============================================================

const PAYMENT_HEADERS = [
  'מזהה', 'מזהה תלמיד', 'שם תלמיד', 'תאריך תשלום',
  'סכום', 'אמצעי תשלום', 'מספר קבלה', 'הערות', 'נוצר בתאריך'
];

var _PC = {
  id: 0, studentId: 1, studentName: 2, paymentDate: 3,
  amount: 4, method: 5, receiptNumber: 6, notes: 7, createdAt: 8
};

// ─── Row → Object mapper ──────────────────────────────────────
function _rowToPayment(obj) {
  return {
    id:            String(obj['מזהה']          || ''),
    studentId:     String(obj['מזהה תלמיד']   || ''),
    studentName:   String(obj['שם תלמיד']      || ''),
    paymentDate:   String(obj['תאריך תשלום']  || ''),
    amount:        Number(obj['סכום'])         || 0,
    method:        String(obj['אמצעי תשלום']  || ''),
    receiptNumber: String(obj['מספר קבלה']    || ''),
    notes:         String(obj['הערות']         || ''),
    createdAt:     String(obj['נוצר בתאריך']  || ''),
    __rowNum:      obj.__rowNum
  };
}

// ─── getPayments ─────────────────────────────────────────────
function getPayments(params) {
  params = params || {};
  var sheet    = _sheet(SHEET_PAYMENTS);
  var rows     = sheetToObjects(sheet, PAYMENT_HEADERS);
  var payments = rows.map(_rowToPayment);

  if (params.studentId) {
    payments = payments.filter(function(p) { return p.studentId === params.studentId; });
  }
  if (params.method) {
    payments = payments.filter(function(p) { return p.method === params.method; });
  }
  if (params.month && params.year) {
    var m = String(params.month).padStart(2, '0');
    var y = String(params.year);
    payments = payments.filter(function(p) {
      var parts = p.paymentDate.split('/');
      return parts.length === 3 && parts[1] === m && parts[2] === y;
    });
  } else if (params.year) {
    var y2 = String(params.year);
    payments = payments.filter(function(p) {
      var parts = p.paymentDate.split('/');
      return parts.length === 3 && parts[2] === y2;
    });
  }

  // Sort by date desc
  payments.sort(function(a, b) {
    var da = parseDate(a.paymentDate), db = parseDate(b.paymentDate);
    if (!da || !db) return 0;
    return db.getTime() - da.getTime();
  });

  var page     = Number(params.page)     || 1;
  var pageSize = Number(params.pageSize) || 50;
  return paginate(payments, page, pageSize);
}

// ─── getPaymentsByStudent ─────────────────────────────────────
function getPaymentsByStudent(studentId) {
  if (!studentId) return [];
  var sheet    = _sheet(SHEET_PAYMENTS);
  var rows     = sheetToObjects(sheet, PAYMENT_HEADERS);
  var payments = rows.map(_rowToPayment).filter(function(p) {
    return p.studentId === studentId;
  });
  payments.sort(function(a, b) {
    var da = parseDate(a.paymentDate), db = parseDate(b.paymentDate);
    if (!da || !db) return 0;
    return db.getTime() - da.getTime();
  });
  return payments;
}

// ─── createPayment ───────────────────────────────────────────
function createPayment(input) {
  var errors = [];
  if (!input.studentId)    errors.push('מזהה תלמיד הוא שדה חובה');
  if (!input.paymentDate)  errors.push('תאריך תשלום הוא שדה חובה');
  if (!input.amount || Number(input.amount) <= 0) errors.push('סכום חייב להיות גדול מ-0');
  if (!input.method)       errors.push('אמצעי תשלום הוא שדה חובה');
  if (PAYMENT_METHODS.indexOf(input.method) < 0) {
    errors.push('אמצעי תשלום לא תקין: ' + input.method);
  }
  if (errors.length > 0) {
    return { success: false, error: errors.join(' | '), code: 422 };
  }

  var student = getStudent(input.studentId);
  if (!student) return { success: false, error: 'תלמיד לא נמצא', code: 404 };

  var sheet         = _sheet(SHEET_PAYMENTS);
  var id            = uuid();
  var now           = nowISO();
  var receiptNumber = nextReceiptNumber();

  var obj = {};
  obj['מזהה']         = id;
  obj['מזהה תלמיד']  = input.studentId;
  obj['שם תלמיד']     = student.firstName + ' ' + student.lastName;
  obj['תאריך תשלום'] = input.paymentDate;
  obj['סכום']         = Number(input.amount);
  obj['אמצעי תשלום'] = input.method;
  obj['מספר קבלה']   = receiptNumber;
  obj['הערות']        = String(input.notes || '');
  obj['נוצר בתאריך'] = now;

  appendRow(sheet, PAYMENT_HEADERS, obj);

  // Update balance
  updateBalanceRow(input.studentId);

  var payment = _getPaymentById(id);
  return { success: true, id: id, payment: payment, receiptNumber: receiptNumber };
}

// ─── updatePayment ───────────────────────────────────────────
function updatePayment(input) {
  if (!input.id) return { success: false, error: 'נדרש מזהה תשלום', code: 400 };

  var sheet  = _sheet(SHEET_PAYMENTS);
  var rowNum = findRow(sheet, _PC.id, input.id);
  if (rowNum < 0) return { success: false, error: 'תשלום לא נמצא', code: 404 };

  // Only notes and method can be updated
  var updates = {};
  if (input.method !== undefined) {
    if (PAYMENT_METHODS.indexOf(input.method) < 0) {
      return { success: false, error: 'אמצעי תשלום לא תקין', code: 422 };
    }
    updates[_PC.method] = input.method;
  }
  if (input.notes !== undefined) {
    updates[_PC.notes] = input.notes;
  }

  if (Object.keys(updates).length > 0) {
    updateRow(sheet, rowNum, updates);
  }

  var payment = _getPaymentById(input.id);
  return { success: true, payment: payment };
}

// ─── deletePayment ───────────────────────────────────────────
function deletePayment(id) {
  if (!id) return { success: false, error: 'נדרש מזהה', code: 400 };
  var sheet  = _sheet(SHEET_PAYMENTS);
  var rowNum = findRow(sheet, _PC.id, id);
  if (rowNum < 0) return { success: false, error: 'תשלום לא נמצא', code: 404 };

  var payment = _getPaymentById(id);
  deleteRow(sheet, rowNum);

  if (payment) {
    updateBalanceRow(payment.studentId);
  }

  return { success: true };
}

// ─── getMonthlyIncome ────────────────────────────────────────
function getMonthlyIncome(year, month) {
  var m = String(month).padStart(2, '0');
  var y = String(year);
  var sheet    = _sheet(SHEET_PAYMENTS);
  var rows     = sheetToObjects(sheet, PAYMENT_HEADERS);
  var payments = rows.map(_rowToPayment).filter(function(p) {
    var parts = p.paymentDate.split('/');
    return parts.length === 3 && parts[1] === m && parts[2] === y;
  });

  var total    = 0;
  var byMethod = {};
  PAYMENT_METHODS.forEach(function(mth) { byMethod[mth] = 0; });

  payments.forEach(function(p) {
    total += p.amount;
    byMethod[p.method] = (byMethod[p.method] || 0) + p.amount;
  });

  return { year: year, month: month, total: total, count: payments.length, byMethod: byMethod };
}

// ─── receiptExists ───────────────────────────────────────────
function receiptExists(receiptNumber) {
  var sheet = _sheet(SHEET_PAYMENTS);
  var rows  = sheetToObjects(sheet, PAYMENT_HEADERS);
  return rows.some(function(r) {
    return String(r['מספר קבלה']) === String(receiptNumber);
  });
}

// ─── Private helper ──────────────────────────────────────────
function _getPaymentById(id) {
  var sheet = _sheet(SHEET_PAYMENTS);
  var rows  = sheetToObjects(sheet, PAYMENT_HEADERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['מזהה']) === String(id)) {
      return _rowToPayment(rows[i]);
    }
  }
  return null;
}
