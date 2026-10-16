(() => {
  'use strict';
  const KEY = 'cuota.loans.v1';
  const $ = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 2 }).format(cents / 100);
  const { iso, validDate, forecast } = LoanDates;
  const today = () => iso(new Date());
  const showDate = value => new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  const validDates = l => (l.startDate === null || validDate(l.startDate)) && Array.isArray(l.paymentDates) && l.paymentDates.length === l.history.length && l.paymentDates.every(d => d === null || (validDate(d) && (!l.startDate || d >= l.startDate)));
  let loans = [];
  let selectedId = null;
  let toastTimer;
  const balance = l => l.total * l.amount - l.paidAmount;
  const validLoan = l => l && l.version === 2 && typeof l.id === 'string' && typeof l.name === 'string' && l.name.trim() && Number.isInteger(l.total) && l.total > 0 && l.total <= 1200 && Number.isInteger(l.amount) && l.amount > 0 && l.amount <= 10000000000 && Number.isSafeInteger(l.paidAmount) && l.paidAmount >= 0 && balance(l) >= 0 && Array.isArray(l.history) && l.history.every(n => Number.isSafeInteger(n) && n > 0) && l.history.reduce((a, b) => a + b, 0) <= l.paidAmount;
  function readLoans(raw) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Invalid data');
    const normalized = parsed.map(l => {
      if (l && l.version === undefined && Number.isInteger(l.paid) && l.paid >= 0 && l.paid <= l.total && Array.isArray(l.history) && l.history.every(n => Number.isInteger(n) && n > 0) && l.history.reduce((a, b) => a + b, 0) <= l.paid) {
        const { paid, ...rest } = l;
        return { ...rest, version: 2, paidAmount: paid * l.amount, history: l.history.map(n => n * l.amount) };
      }
      return l;
    });
    for (const l of normalized) {
      if (l && l.startDate === undefined) l.startDate = null;
      if (l && l.paymentDates === undefined && Array.isArray(l.history)) l.paymentDates = l.history.map(() => null);
    }
    if (!normalized.every(l => validLoan(l) && validDates(l))) throw new Error('Invalid data');
    return normalized;
  }
  function remainingText(cents, amount) {
    if (cents === 0) return '¡Préstamo completado!';
    const count = Math.ceil(cents / amount);
    const last = cents % amount;
    return `Te ${count === 1 ? 'queda 1 cuota estimada' : `quedan ${count} cuotas estimadas`}${last ? `; la última de ${money(last)}` : ''}.`;
  }
  try {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) {
      loans = readLoans(stored);
    }
  } catch {
    $('loan-form').querySelector('button').disabled = true;
    $('form-error').textContent = 'No se pudieron leer los datos guardados. No se sobrescribirán. Revisá el almacenamiento o los permisos del navegador.';
  }
  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 4000);
  }
  function commit(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { notify('No se pudo guardar. Revisá el espacio y los permisos del navegador.'); return false; }
    loans = next;
    render();
    return true;
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function card(loan) {
    const remaining = balance(loan);
    const percent = remaining === 0 ? 100 : Math.min(99, Math.round(loan.paidAmount / (loan.total * loan.amount) * 100));
    const el = node('article', `loan-card${remaining === 0 ? ' completed' : ''}`);
    const top = node('div', 'loan-top');
    top.append(node('span', 'loan-icon', remaining ? '↗' : '✓'));
    const heading = node('div');
    heading.append(node('h3', '', loan.name), node('span', 'badge', remaining ? 'En curso' : 'Préstamo completado'));
    const actions = node('div', 'loan-actions');
    if (loan.history.length) {
      const undo = node('button', 'icon-button', '↶');
      undo.title = 'Deshacer último pago'; undo.setAttribute('aria-label', `Deshacer último pago de ${loan.name}`);
      undo.onclick = () => {
        const last = loan.history[loan.history.length - 1];
        if (confirm(`¿Deshacer el último pago de ${money(last)} de «${loan.name}»?`)) {
          if (commit(loans.map(l => l.id === loan.id ? { ...l, paidAmount: l.paidAmount - last, history: l.history.slice(0, -1), paymentDates: l.paymentDates.slice(0, -1) } : l))) notify('Se deshizo el último pago.');
        }
      };
      actions.append(undo);
    }
    const remove = node('button', 'icon-button', '×');
    remove.title = 'Eliminar préstamo'; remove.setAttribute('aria-label', `Eliminar ${loan.name}`);
    remove.onclick = () => { if (confirm(`¿Eliminar «${loan.name}» y sus pagos? Esta acción no se puede deshacer.`) && commit(loans.filter(l => l.id !== loan.id))) notify('Préstamo eliminado.'); };
    actions.append(remove); top.append(heading, actions);
    const amounts = node('div', 'loan-amounts');
    const pending = node('div'); pending.append(node('small', '', 'SALDO PENDIENTE'), node('strong', '', money(remaining)));
    const monthly = node('div'); monthly.append(node('small', '', 'CUOTA DE REFERENCIA'), node('strong', '', money(loan.amount)));
    amounts.append(pending, monthly);
    const label = node('div', 'progress-label'); label.append(node('span', '', `${money(loan.paidAmount)} pagados de ${money(loan.total * loan.amount)}`), node('strong', '', `${percent}%`));
    const progress = node('div', 'progress'); progress.setAttribute('role', 'progressbar'); progress.setAttribute('aria-label', `Progreso de ${loan.name}`); progress.setAttribute('aria-valuenow', percent); progress.setAttribute('aria-valuemin', '0'); progress.setAttribute('aria-valuemax', '100');
    const bar = node('span'); bar.style.width = `${percent}%`; progress.append(bar);
    const bottom = node('div', 'loan-bottom'); bottom.append(node('small', '', remaining ? remainingText(remaining, loan.amount) : '¡Un pendiente menos! Lo lograste.'));
    if (remaining) {
      const pay = node('button', 'pay-button', '＋ Registrar pago');
      pay.onclick = () => openPayment(loan.id); bottom.append(pay);
    }
    const dates = node('div', 'loan-dates');
    const startBox = node('div');
    const startLabel = node('label', '', 'Inicio de pagos');
    const startInput = node('input'); startInput.type = 'date'; startInput.value = loan.startDate || '';
    startInput.setAttribute('aria-label', `Inicio de pagos de ${loan.name}`);
    const knownDates = loan.paymentDates.filter(Boolean).sort();
    if (knownDates.length || loan.paidAmount) startInput.max = knownDates[0] || today();
    startLabel.append(startInput); startBox.append(startLabel);
    startInput.onchange = () => {
      const value = startInput.value;
      if (!validDate(value) || !startInput.checkValidity()) { startInput.reportValidity(); startInput.value = loan.startDate || ''; return; }
      if (commit(loans.map(l => l.id === loan.id ? { ...l, startDate: value } : l))) notify('Fecha de inicio actualizada.');
      else startInput.value = loan.startDate || '';
    };
    const result = forecast(loan);
    const endBox = node('div'); endBox.append(node('small', '', result.completed ? 'Finalización registrada' : 'Finalización estimada'), node('strong', '', result.end ? showDate(result.end) : result.completed ? 'Sin fecha registrada' : loan.startDate ? 'Fuera de rango' : 'Ingresá el inicio'));
    dates.append(startBox, endBox);
    const explanation = node('p', 'forecast-note', result.completed ? 'Los pagos anteriores sin fecha no se usan para estimar el ritmo.' : result.observed ? `Si mantenés tu promedio de ${money(Math.round(result.rate))}/mes. Incluye meses sin pagos desde el primer pago fechado; proyecta un pago mensual.` : 'Se usa la cuota de referencia hasta registrar pagos en dos meses distintos. Luego se usa el promedio mensual, incluyendo meses sin pagos.');
    el.append(top, amounts, label, progress, dates, explanation, bottom); return el;
  }
  function render() {
    const total = loans.reduce((sum, l) => sum + l.amount * l.total, 0);
    const pending = loans.reduce((sum, l) => sum + balance(l), 0);
    const active = loans.filter(l => balance(l) > 0);
    const percent = total ? (pending === 0 ? 100 : Math.min(99, Math.round((total - pending) / total * 100))) : 0;
    $('total-pending').textContent = money(pending);
    $('monthly-total').textContent = money(active.reduce((sum, l) => sum + Math.min(l.amount, balance(l)), 0));
    $('overall-percent').textContent = `${percent}%`;
    $('overall-bar').style.width = `${percent}%`;
    $('overall-caption').textContent = total ? `${money(total - pending)} pagados de ${money(total)}` : 'Tu próximo paso empieza acá';
    $('loan-count').textContent = loans.length;
    const visible = loans.filter(l => $('filter').value === 'all' || ($('filter').value === 'active' ? balance(l) > 0 : balance(l) === 0));
    $('loan-list').replaceChildren(...visible.map(card));
    if (!visible.length) {
      const empty = node('div', 'empty-state');
      empty.append(node('span', 'empty-icon', '↗'), node('h3', '', loans.length ? 'Sin préstamos en esta vista' : 'Empezá a ver tu progreso'), node('p', '', loans.length ? 'Elegí otro filtro para ver tus préstamos.' : 'Agregá tu primer préstamo. Acá vas a ver cuánto pagaste y cuánto te falta para terminar.'));
      $('loan-list').append(empty);
    }
  }
  function updateEstimate() {
    const count = Number($('installments').value);
    const cents = Math.round(Number($('amount').value) * 100);
    $('estimate').textContent = money(Number.isFinite(count * cents) && count > 0 && cents > 0 ? count * cents : 0);
    $('already-paid').max = count > 0 ? count : 1200;
  }
  $('loan-form').addEventListener('input', updateEstimate);
  $('loan-form').addEventListener('submit', event => {
    event.preventDefault();
    const name = $('loan-name').value.trim();
    const total = Number($('installments').value);
    const amount = Math.round(Number($('amount').value) * 100);
    const paid = Number($('already-paid').value);
    const loan = { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, total, amount, version: 2, paidAmount: paid * amount, history: [], paymentDates: [], startDate: $('start-date').value };
    if (!Number.isInteger(paid) || !validLoan(loan) || !validDates(loan) || (paid > 0 && loan.startDate > today())) { $('form-error').textContent = 'Revisá el nombre, monto, cuotas y fecha de inicio. Si ya pagaste cuotas, el inicio no puede ser futuro.'; return; }
    if (commit([...loans, loan])) {
      $('loan-form').reset(); $('form-error').textContent = ''; $('filter').value = 'all'; updateEstimate(); render(); notify('Préstamo agregado. ¡Ya empezaste!');
    }
  });
  function openPayment(id) {
    selectedId = id;
    const loan = loans.find(l => l.id === id);
    $('payment-name').textContent = loan.name;
    $('payment-date').value = today();
    $('payment-date').min = loan.startDate || '';
    $('payment-date').max = today();
    $('payment-mode').value = 'amount';
    configurePayment();
    $('payment-error').textContent = '';
    updatePayment(); $('payment-dialog').showModal(); $('payment-count').focus();
  }
  function configurePayment() {
    const loan = loans.find(l => l.id === selectedId);
    if (!loan) return;
    const byAmount = $('payment-mode').value === 'amount';
    $('payment-label').textContent = byAmount ? '¿Qué monto pagaste? ($)' : '¿Cuántas cuotas pagaste?';
    $('payment-count').min = byAmount ? '0.01' : '1';
    $('payment-count').step = byAmount ? '0.01' : '1';
    $('payment-count').max = byAmount ? (balance(loan) / 100).toFixed(2) : Math.floor(balance(loan) / loan.amount);
    $('payment-count').value = byAmount ? (Math.min(balance(loan), loan.amount) / 100).toFixed(2) : '1';
    $('payment-error').textContent = '';
    updatePayment();
  }
  function paymentCents(loan) {
    const value = Number($('payment-count').value);
    if (!Number.isFinite(value) || value <= 0) return NaN;
    if ($('payment-mode').value === 'amount') {
      const cents = Math.round(value * 100);
      return Math.abs(value * 100 - cents) < 0.0001 ? cents : NaN;
    }
    return Number.isInteger(value) ? value * loan.amount : NaN;
  }
  function updatePayment() {
    const loan = loans.find(l => l.id === selectedId);
    if (!loan) return;
    const cents = paymentCents(loan);
    const left = balance(loan) - cents;
    let estimate = '';
    const paymentDate = $('payment-date').value;
    if (Number.isSafeInteger(cents) && cents > 0 && left >= 0 && validDate(paymentDate) && paymentDate <= today() && (!loan.startDate || paymentDate >= loan.startDate)) {
      const projected = forecast({ ...loan, paidAmount: loan.paidAmount + cents, history: [...loan.history, cents], paymentDates: [...loan.paymentDates, paymentDate] });
      if (projected.end) estimate = ` Finalización ${projected.completed ? 'registrada' : 'estimada'}: ${showDate(projected.end)}.`;
    }
    $('payment-info').textContent = Number.isSafeInteger(cents) && cents > 0 && left >= 0 ? `Pago: ${money(cents)}. Saldo después del pago: ${money(left)}. ${remainingText(left, loan.amount)}${estimate}` : `Ingresá un pago válido de hasta ${money(balance(loan))}. Para saldar una cuota parcial, elegí «Por monto».`;
  }
  $('payment-mode').addEventListener('change', configurePayment);
  $('payment-count').addEventListener('input', updatePayment);
  $('payment-date').addEventListener('input', updatePayment);
  $('close-dialog').onclick = () => $('payment-dialog').close();
  $('payment-form').onsubmit = event => {
    event.preventDefault();
    const loan = loans.find(l => l.id === selectedId);
    const cents = loan ? paymentCents(loan) : NaN;
    const paymentDate = $('payment-date').value;
    if (!validDate(paymentDate) || paymentDate > today() || (loan?.startDate && paymentDate < loan.startDate)) { $('payment-error').textContent = 'La fecha debe estar entre el inicio del préstamo y hoy.'; return; }
    if (!loan || !Number.isSafeInteger(cents) || cents <= 0 || cents > balance(loan)) { $('payment-error').textContent = 'El pago debe ser positivo, con hasta dos decimales, y no superar el saldo pendiente.'; return; }
    if (commit(loans.map(l => l.id === selectedId ? { ...l, paidAmount: l.paidAmount + cents, history: [...l.history, cents], paymentDates: [...l.paymentDates, paymentDate] } : l))) {
      $('payment-dialog').close(); notify(cents === balance(loan) ? '¡Felicitaciones! Completaste este préstamo.' : 'Pago registrado. ¡Cada vez falta menos!');
    }
  };
  $('filter').onchange = render;
  $('export').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), currency: 'UYU', amountsIn: 'cents', loans }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'cuota-respaldo.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Respaldo exportado en formato JSON.');
  };
  window.addEventListener('storage', event => {
    if (event.key === KEY) {
      try { loans = readLoans(event.newValue === null ? '[]' : event.newValue); $('payment-dialog').close(); render(); } catch { /* Preserve current valid state. */ }
    }
  });
  render();
})();
