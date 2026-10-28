import fs from 'fs';
import path from 'path';

// Read index.html
const htmlPath = path.resolve('apaar-sync', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

// Mock a lightweight browser DOM environment
class Element {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.style = {};
    this.value = '';
    this._listeners = {};
    this.children = [];
  }
  addEventListener(event, fn) {
    this._listeners[event] = this._listeners[event] || [];
    this._listeners[event].push(fn);
  }
  removeEventListener(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }
  dispatchEvent(event) {
    const list = this._listeners[event.type] || [];
    for (const fn of list) fn(event);
  }
  querySelector(sel) {
    return new Element('div');
  }
}

const elementsById = {};
function getElementById(id) {
  if (!elementsById[id]) {
    elementsById[id] = new Element('div', id);
  }
  return elementsById[id];
}

const doc = {
  getElementById,
  querySelector: (s) => new Element('div'),
  body: new Element('body'),
  addEventListener: () => {},
  removeEventListener: () => {}
};

globalThis.document = doc;
globalThis.window = globalThis;
globalThis.window.document = doc;
globalThis.window.addEventListener = (ev, fn) => {
  if (ev === 'DOMContentLoaded') {
    globalThis.__onDomLoaded = fn;
  }
};
globalThis.window.scrollTo = () => {};
globalThis.QRCode = class { constructor() {} };
globalThis.jspdf = { jsPDF: class { constructor() { this.setFont = () => {}; this.setFontSize = () => {}; this.setTextColor = () => {}; this.text = () => {}; this.setDrawColor = () => {}; this.line = () => {}; this.addPage = () => {}; this.save = () => {}; } } };
globalThis.XLSX = { utils: { book_new: () => ({}), json_to_sheet: () => ({}), book_append_sheet: () => {} }, writeFile: () => {} };

import vm from 'vm';

// Extract JS from HTML between <script> ... </script>
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i);
if (!scriptMatch) {
  throw new Error('Script block not found in index.html');
}

// Convert top-level const/let/var to global properties or evaluate in global context
const scriptCode = scriptMatch[1]
  .replace(/\bconst DB\b/, 'globalThis.DB')
  .replace(/\bconst S\b/, 'globalThis.S')
  .replace(/\bconst L\b/, 'globalThis.L')
  .replace(/\bconst V\b/, 'globalThis.V');

vm.runInThisContext(scriptCode);

async function runTests() {
  console.log('--- TEST 1: Task 1 - Hash value check in DB.users ---');
  const targetHash = '6d5a97e86b8cadd4b693eaae313ea19475077bf719e92bb19c9b803fa73db35c';
  const adminUser = DB.users.find(u => u.email === 'registrar@apex.edu');
  const aicteUser = DB.users.find(u => u.email === 'officer@aicte.gov.in');
  if (adminUser.pwdHash !== targetHash) throw new Error(`Admin pwdHash is ${adminUser.pwdHash}, expected ${targetHash}`);
  if (aicteUser.pwdHash !== targetHash) throw new Error(`AICTE pwdHash is ${aicteUser.pwdHash}, expected ${targetHash}`);
  console.log('✓ DB.users contains expected pwdHash for both users');

  console.log('\n--- TEST 2: Task 2 - Startup self-check ---');
  if (!globalThis.__onDomLoaded) throw new Error('DOMContentLoaded listener not registered');
  await globalThis.__onDomLoaded();
  console.log('✓ Startup self-check executed without errors');

  // Corrupt one hash deliberately and verify auto-fix
  adminUser.pwdHash = 'corrupted_hash';
  await globalThis.__onDomLoaded();
  if (adminUser.pwdHash !== targetHash) throw new Error(`Auto-fix failed! Admin pwdHash is ${adminUser.pwdHash}`);
  console.log('✓ Startup self-check successfully detected mismatch and auto-fixed in-memory hash');

  console.log('\n--- TEST 3: College Admin Login with Fill Demo ---');
  L.tab = 'college_admin';
  fillDemoCredentials();
  if (L.email !== 'registrar@apex.edu' || L.password !== 'Demo@123') throw new Error('Fill demo credentials incorrect');
  await handleLoginSubmit({ preventDefault: () => {} });
  if (L.error) throw new Error(`Login failed with error: ${L.error}`);
  if (!S.token || !S.user || S.user.role !== 'college_admin') throw new Error('Admin login state invalid');
  console.log(`✓ College Admin logged in as ${S.user.name}`);

  // Test rendering all College Admin drawer menu items
  const adminPages = ['home', 'departments', 'faculty', 'admission', 'students', 'approvals', 'audit_log', 'reports'];
  for (const page of adminPages) {
    S.page = page;
    await render();
    const appHtml = elementsById['app'] ? elementsById['app'].innerHTML : '';
    if (!appHtml || appHtml.length < 50) throw new Error(`Rendering failed for admin page: ${page}`);
    console.log(`  ✓ Admin page rendered: ${page} (${appHtml.length} chars)`);
  }

  console.log('\n--- TEST 4: AICTE Regulator Login with Fill Demo ---');
  signOut();
  L.tab = 'aicte_regulator';
  fillDemoCredentials();
  if (L.email !== 'officer@aicte.gov.in' || L.password !== 'Demo@123') throw new Error('Fill demo credentials incorrect');
  await handleLoginSubmit({ preventDefault: () => {} });
  if (L.error) throw new Error(`Login failed with error: ${L.error}`);
  if (!S.token || !S.user || S.user.role !== 'aicte_regulator') throw new Error('AICTE login state invalid');
  console.log(`✓ AICTE Regulator logged in as ${S.user.name}`);

  // Test rendering all AICTE drawer menu items
  const aictePages = ['home', 'institutions', 'compliance', 'verification'];
  for (const page of aictePages) {
    S.page = page;
    await render();
    const appHtml = elementsById['app'] ? elementsById['app'].innerHTML : '';
    if (!appHtml || appHtml.length < 50) throw new Error(`Rendering failed for AICTE page: ${page}`);
    console.log(`  ✓ AICTE page rendered: ${page} (${appHtml.length} chars)`);
  }

  console.log('\n--- TEST 5: README Cross-Role Walkthrough ---');
  // 1. Student logs in
  signOut();
  L.tab = 'student';
  L.studentStep = 1;
  fillDemoCredentials();
  await handleLoginSubmit({ preventDefault: () => {} }); // step 1 sends OTP
  if (L.studentStep !== 2) throw new Error('Student step 1 failed to advance to step 2');
  fillDemoCredentials(); // fills demo OTP 123456
  await handleLoginSubmit({ preventDefault: () => {} }); // step 2 logs in
  if (!S.user || S.user.role !== 'student') throw new Error('Student login failed');
  console.log('✓ Step 1: Student logged in successfully');

  // Student submits transfer
  const select = getElementById('transfer-inst-select');
  select.value = 'Indian Institute of Technology Bombay';
  const reasonEl = getElementById('transfer-reason');
  reasonEl.value = 'Academic exchange programme';
  const mockCheckbox = new Element('input');
  mockCheckbox.value = DB.terms[0].courses[0].code;
  mockCheckbox.checked = true;
  mockCheckbox.getAttribute = (attr) => attr === 'data-cr' ? '4' : null;
  doc.querySelectorAll = (sel) => [mockCheckbox];

  handleStudentTransferSubmit({ preventDefault: () => {} });
  const req = DB.transfers[0];
  if (!req || req.status !== 'Pending') {
    throw new Error('Transfer request creation failed');
  }
  console.log(`✓ Step 2: Student submitted transfer request ${req.id} (Status: ${req.status})`);

  // 2. Admin logs in and approves
  signOut();
  L.tab = 'college_admin';
  fillDemoCredentials();
  await handleLoginSubmit({ preventDefault: () => {} });
  S.page = 'approvals';
  await render();
  approveTransferRequest(req.id);
  const updatedReq = DB.transfers.find(r => r.id === req.id);
  if (!updatedReq || updatedReq.status !== 'Approved') {
    throw new Error(`Admin approval failed: status is ${updatedReq?.status}`);
  }
  console.log(`✓ Step 3: College Admin approved transfer request ${req.id} (Status: ${updatedReq.status})`);

  // 3. Student logs in and verifies 'Approved'
  signOut();
  L.tab = 'student';
  L.studentStep = 1;
  fillDemoCredentials();
  await handleLoginSubmit({ preventDefault: () => {} });
  fillDemoCredentials();
  await handleLoginSubmit({ preventDefault: () => {} });
  S.page = 'credit_actions';
  await render();
  const studentCreditHtml = renderStudentCreditActions();
  if (!studentCreditHtml.includes('Approved')) {
    throw new Error('Student credit actions does not show Approved status');
  }
  console.log('✓ Step 4: Student sees transfer request marked "Approved"');

  // 4. AICTE sees the audit entry
  signOut();
  L.tab = 'aicte_regulator';
  fillDemoCredentials();
  await handleLoginSubmit({ preventDefault: () => {} });
  S.page = 'compliance';
  await render();
  const auditEntry = DB.auditLogs.find(a => a.apaar === req.studentApaar && a.action.includes('Transfer'));
  if (!auditEntry) {
    throw new Error('Audit log entry for transfer approval not found in DB.auditLogs');
  }
  console.log(`✓ Step 5: AICTE Regulator sees audit log entry: "${auditEntry.action}" for ${auditEntry.apaar}`);

  console.log('\n--- TEST 6: crypto.subtle undefined error display ---');
  // Sign out first so no active session remains
  signOut();
  // Simulate double-click file:// where crypto.subtle is undefined
  const origCrypto = globalThis.crypto;
  try {
    delete globalThis.crypto;
    globalThis.crypto = {}; // no .subtle
    L.error = '';
    await globalThis.__onDomLoaded();
    if (L.error !== 'Open via http://localhost:8080, not by double-clicking the file.') {
      throw new Error(`Expected error message, got: ${L.error}`);
    }
    console.log('✓ When crypto.subtle is undefined, startup sets clear warning:');
    console.log(`  "${L.error}"`);
  } finally {
    globalThis.crypto = origCrypto;
  }

  console.log('\n========================================');
  console.log('ALL 6 TESTS PASSED FLAWLESSLY!');
  console.log('========================================');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
