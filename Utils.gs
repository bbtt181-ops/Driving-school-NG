// ============================================================
// Utils.gs — Shared helpers
// driving-school-NG
// ============================================================

// ─── UUID ────────────────────────────────────────────────────

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ─── DATE HELPERS ────────────────────────────────────────────

function today() {
  return fmtDate(new Date());
}

function nowISO() {
  return new Date().toISOString();
}

function fmtDate(d) {
  if (!d) return '';
  var day   = String(d.getDate()).padStart(2, '0');
  var month = String(d.getMonth() + 1).padStart(2, '0');
  var year  = d.getFullYear();
  return day + '/' + month + '/' + year;
}

function parseDate(s) {
  // Expects "DD/MM/YYYY"
  if (!s || typeof s !== 'string') return null;
  var parts = s.split('/');
  if (parts.length !== 3) return null;
  var d = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m, d);
}

function parseISO(s) {
  if (!s) return null;
  return new Date(s);
}

// ─── PHONE HELPERS ───────────────────────────────────────────

function normalizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

function fmtPhone(phone) {
  return _formatPhoneWA(phone);
}

function _formatPhoneWA(phone) {
  var digits = normalizePhone(phone);
  // Remove leading 972
  if (digits.startsWith('972')) digits = digits.substring(3);
  // Remove leading 0
  if (digits.startsWith('0')) digits = digits.substring(1);
  return '972' + digits + '@c.us';
}

function validatePhone(phone) {
  var digits = normalizePhone(phone);
  return /^05\d{8}$/.test(digits);
}

// ─── ISRAELI ID VALIDATION (Luhn) ────────────────────────────

function validateTZ(tz) {
  if (!tz) return false;
  var s = String(tz).trim();
  // Pad to 9 digits
  while (s.length < 9) s = '0' + s;
  if (!/^\d{9}$/.test(s)) return false;
  var sum = 0;
  for (var i = 0; i < 9; i++) {
    var d = parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 2);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

// ─── AGE CALCULATION ─────────────────────────────────────────

function calcAge(dob) {
  if (!dob) return null;
  var birth = parseDate(dob);
  if (!birth) return null;
  var now = new Date();

  var years  = now.getFullYear() - birth.getFullYear();
  var months = now.getMonth() - birth.getMonth();

  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (now.getDate() < birth.getDate()) {
    months--;
    if (months < 0) months += 12;
  }

  var totalMonths = years * 12 + months;
  return { years: years, months: months, totalMonths: totalMonths };
}

function validateAge(dob) {
  // Must be >= 16.5 years (198 months)
  if (!dob) return true; // DOB optional — skip check if not provided
  var age = calcAge(dob);
  if (!age) return false;
  return age.totalMonths >= 198;
}

// ─── SHEET ↔ OBJECT CONVERSION ───────────────────────────────

function sheetToObjects(sheet, headers) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    // Skip empty rows (first cell empty)
    if (!row[0] && !row[1]) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = row[j];
      // Convert boolean-like strings
      if (val === 'TRUE' || val === true)  val = true;
      else if (val === 'FALSE' || val === false) val = false;
      obj[headers[j]] = (val === null || val === undefined) ? '' : val;
    }
    obj.__rowNum = i + 1; // 1-based row number in sheet
    rows.push(obj);
  }
  return rows;
}

function appendRow(sheet, headers, obj) {
  var row = headers.map(function(h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return v;
  });
  var lastRow = sheet.getLastRow() + 1;
  var range = sheet.getRange(lastRow, 1, 1, row.length);
  // Force text format on columns whose value starts with 0 (phone, ID, etc.)
  var formats = row.map(function(v) {
    return (typeof v === 'string' && /^0\d+$/.test(v)) ? '@' : 'General';
  });
  range.setNumberFormats([formats]);
  range.setValues([row]);
}

function findRow(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) {
      return i + 1; // 1-based
    }
  }
  return -1;
}

function updateRow(sheet, rowNum, updates) {
  // updates: { colIndex: value } — 0-based
  Object.keys(updates).forEach(function(colIdx) {
    var val = updates[colIdx];
    if (typeof val === 'boolean') val = val ? 'TRUE' : 'FALSE';
    sheet.getRange(rowNum, Number(colIdx) + 1).setValue(val);
  });
}

function deleteRow(sheet, rowNum) {
  sheet.deleteRow(rowNum);
}

function getCell(sheet, rowNum, colIndex) {
  return sheet.getRange(rowNum, colIndex + 1).getValue();
}

function setCell(sheet, rowNum, colIndex, value) {
  if (typeof value === 'boolean') value = value ? 'TRUE' : 'FALSE';
  sheet.getRange(rowNum, colIndex + 1).setValue(value);
}

// ─── CONFIG (הגדרות sheet) ────────────────────────────────────

function getConfig(key) {
  var sheet = _sheet(SHEET_SETTINGS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      return String(data[i][1]);
    }
  }
  return '';
}

function setConfig(key, value) {
  var sheet = _sheet(SHEET_SETTINGS);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(String(value));
      return;
    }
  }
  // Key not found — append new row
  sheet.appendRow([String(key), String(value)]);
}

function getAllConfig() {
  var sheet = _sheet(SHEET_SETTINGS);
  var data  = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) {
      config[String(data[i][0])] = String(data[i][1]);
    }
  }
  return config;
}

// ─── RECEIPT NUMBER ──────────────────────────────────────────

function nextReceiptNumber() {
  var sheet   = _sheet(SHEET_SETTINGS);
  var data    = sheet.getDataRange().getValues();
  var counterRow = -1;
  var prefixRow  = -1;

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === 'RECEIPT_COUNTER') counterRow = i + 1;
    if (data[i][0] === 'RECEIPT_PREFIX')  prefixRow  = i + 1;
  }

  var counter = counterRow > 0 ? (parseInt(sheet.getRange(counterRow, 2).getValue(), 10) || 0) : 0;
  var prefix  = prefixRow  > 0 ? String(sheet.getRange(prefixRow, 2).getValue()) : String(new Date().getFullYear());

  counter++;

  if (counterRow > 0) {
    sheet.getRange(counterRow, 2).setValue(counter);
  } else {
    sheet.appendRow(['RECEIPT_COUNTER', counter]);
  }

  return prefix + '-' + String(counter).padStart(3, '0');
}

// ─── PAGINATION ──────────────────────────────────────────────

function paginate(arr, page, pageSize) {
  page     = Math.max(1, parseInt(page, 10)     || 1);
  pageSize = Math.max(1, parseInt(pageSize, 10) || 20);
  var total = arr.length;
  var pages = Math.ceil(total / pageSize) || 1;
  var start = (page - 1) * pageSize;
  var end   = Math.min(start + pageSize, total);
  return {
    data:  arr.slice(start, end),
    total: total,
    page:  page,
    pages: pages
  };
}

// ─── MONTH NAME ──────────────────────────────────────────────

function monthName(month) {
  var names = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
               'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return names[month] || '';
}
