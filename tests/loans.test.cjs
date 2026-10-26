'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dates = require('../forecast.js');
function reader() {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').replace(/\r\n/g, '\n');
  const marker = '  try {\n    const stored = localStorage.getItem(KEY);';
  assert.equal(source.split(marker).length, 2, 'Storage bootstrap changed; update isolated harness');
  const context = vm.createContext({ LoanDates: dates });
  vm.runInContext(source.slice(0, source.indexOf(marker)) + '\n globalThis.api = {readLoans, balance};\n})();', context);
  return context.api;
}
const loan = () => ({ version: 2, id: 'synthetic-1', name: 'Préstamo ficticio', total: 12, amount: 10000, paidAmount: 20000, history: [10000, 10000], startDate: '2024-01-31', paymentDates: ['2024-01-31', '2024-02-29'] });
test('monthly dates clamp correctly in leap years and preserve the reference day', () => {
  assert.equal(dates.addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(dates.addMonths('2024-01-31', 2), '2024-03-31');
  assert.equal(dates.addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(dates.validDate('2025-02-29'), false);
});
test('legacy whole-installment payments migrate to cents without changing the balance', () => {
  const sample = loan(); delete sample.version; delete sample.paidAmount;
  sample.paid = 2; sample.history = [1, 1];
  const api = reader();
  const result = api.readLoans(JSON.stringify([sample]))[0];
  assert.equal(result.paidAmount, 20000);
  assert.equal(result.history[0], 10000);
  assert.equal(api.balance(result), 100000);
});
test('stored loans round-trip and malformed/overpaid/inconsistent data is rejected', () => {
  const api = reader();
  assert.equal(api.readLoans(JSON.stringify([loan()]))[0].paidAmount, 20000);
  assert.throws(() => api.readLoans('{broken'));
  for (const alter of [x => { x.paidAmount = 120001; }, x => { x.history = [30000]; }, x => { x.paymentDates = []; }, x => { x.paymentDates[0] = '2023-12-01'; }, x => { x.amount = -1; }]) {
    const invalid = loan(); alter(invalid); assert.throws(() => api.readLoans(JSON.stringify([invalid])));
  }
});
test('forecast includes unpaid months when estimating observed payment rate', () => {
  const sample = { ...loan(), total: 6, startDate: '2024-01-15', paymentDates: ['2024-01-15', '2024-03-15'] };
  const result = dates.forecast(sample, '2024-03-20');
  assert.equal(result.observed, true);
  assert.equal(result.count, 6);
  assert.equal(result.end, '2024-09-15');
});
test('completed loans use the latest recorded date; undated history has no invented date', () => {
  const sample = { ...loan(), total: 2 };
  assert.deepEqual(dates.forecast(sample, '2024-03-01'), { end: '2024-02-29', completed: true });
  assert.deepEqual(dates.forecast({ ...sample, paymentDates: [null, null] }, '2024-03-01'), { end: null, completed: true });
  assert.equal(dates.forecast({ ...loan(), startDate: null }, '2024-03-01').end, null);
});
