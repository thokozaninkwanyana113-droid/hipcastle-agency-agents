import { api } from './api.js';

/** Start a gateway payment for an invoice. PayFast/Ozow require a browser form POST to their site. */
export async function startPayment(invoiceId, gateway, navigate, { autopay = false } = {}) {
  const res = await api('/payments/checkout', { method: 'POST', body: { invoice_id: invoiceId, gateway, autopay } });
  if (res.redirect) return navigate(res.redirect);
  const form = document.createElement('form');
  form.method = res.form.method;
  form.action = res.form.action;
  for (const [k, v] of Object.entries(res.form.fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = k;
    input.value = v;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
