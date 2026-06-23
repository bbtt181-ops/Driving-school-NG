// ============================================================
// notes.gs — ניהול הערות כלליות של המערכת
// ============================================================

function getNotesData() {
  const vals = _sheet(SHEET_NOTES).getDataRange().getValues();
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (!r[0]) continue;
    out.push(_rowToNote(r));
  }
  return out;
}

function _rowToNote(r) {
  return {
    id       : String(r[0]),
    date     : String(r[1]),
    time     : String(r[2]),
    content  : String(r[3]),
    category : String(r[4] || '')
  };
}

// ── הוספת הערה ──
function addNote(data) {
  const sh = _sheet(SHEET_NOTES);
  const noteId = 'N_' + _tsNow();
  const now = new Date();
  const date = Utilities.formatDate(now, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const time = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm');

  sh.appendRow([
    noteId,
    date,
    time,
    String(data.content || ''),
    String(data.category || '')
  ]);
  SpreadsheetApp.flush();

  return { ok: true, noteId };
}

// ── עדכון הערה ──
function updateNoteById(id, data) {
  const sh   = _sheet(SHEET_NOTES);
  const vals = sh.getDataRange().getValues();
  let row = -1;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) { row = i + 1; break; }
  }
  if (row === -1) return { ok: false, msg: 'הערה לא נמצאה' };

  const setCell = (col, val) => { try { sh.getRange(row, col).setValue(val); } catch(e) {} };

  if (data.content !== undefined)  setCell(4, data.content);
  if (data.category !== undefined) setCell(5, data.category);

  SpreadsheetApp.flush();
  return { ok: true };
}

// ── מחיקת הערה ──
function deleteNoteById(id) {
  const sh   = _sheet(SHEET_NOTES);
  const vals = sh.getDataRange().getValues();
  for (let i = vals.length - 1; i >= 1; i--) {
    if (String(vals[i][0]) === String(id)) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, msg: 'הערה לא נמצאה' };
}
