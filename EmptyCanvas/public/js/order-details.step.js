document.addEventListener('DOMContentLoaded', async () => {
  const orderReason = document.getElementById('orderReason');
  const form = document.getElementById('detailsForm');

  // Prefill
  try {
    const d = await fetch('/api/order-draft', { credentials: 'same-origin' }).then(r => r.json());
    if (d.reason) orderReason.value = d.reason;
  } catch {}

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation(); // مهم: لا تخلّي الضغط يوصل للوثيقة فيقلب السايدبار
    const reason = (orderReason.value || '').trim();
    if (!reason) return alert('Please enter the order reason.');
    try {
      const res = await fetch('/api/order-draft/details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason })
      });
      if (!res.ok) throw new Error('Failed to save details.');
      window.location.href = '/orders/new/products';
    } catch (err) {
      alert(err.message);
    }
  });

  if (window.feather) feather.replace();
});
