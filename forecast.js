(function (root) {
  'use strict';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const date = s => new Date(`${s}T12:00:00`);
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(date(s).getTime()) && iso(date(s)) === s;
  function addMonths(s, months) {
    const d = date(s);
    const target = new Date(d.getFullYear(), d.getMonth() + months, 1, 12);
    target.setDate(Math.min(d.getDate(), new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
    return iso(target);
  }
  function forecast(loan, today = iso(new Date())) {
    const remaining = loan.total * loan.amount - loan.paidAmount;
    const dated = loan.history.map((amount, i) => ({ amount, date: loan.paymentDates[i] })).filter(p => validDate(p.date));
    if (!remaining) return { end: dated.length ? dated.map(p => p.date).sort().at(-1) : null, completed: true };
    if (!validDate(loan.startDate)) return { end: null, completed: false };
    let rate = loan.amount;
    let observed = false;
    const months = new Set(dated.map(p => p.date.slice(0, 7)));
    if (months.size >= 2) {
      const first = date(dated.map(p => p.date).sort()[0]);
      const now = date(today);
      const elapsed = (now.getFullYear() - first.getFullYear()) * 12 + now.getMonth() - first.getMonth() + 1;
      rate = dated.reduce((sum, p) => sum + p.amount, 0) / elapsed;
      observed = true;
    }
    const start = date(loan.startDate);
    const now = date(today);
    let offset = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth());
    let next = addMonths(loan.startDate, offset);
    // Una proyección mensual: si ya hubo pagos este mes, continúa el mes próximo.
    if (next < today || (next.slice(0, 7) === today.slice(0, 7) && dated.some(p => p.date.slice(0, 7) === today.slice(0, 7)))) offset++;
    const count = Math.ceil(remaining / rate);
    const end = addMonths(loan.startDate, offset + count - 1);
    return { end: validDate(end) ? end : null, completed: false, rate, observed, count };
  }
  const api = { iso, validDate, addMonths, forecast };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoanDates = api;
})(globalThis);
