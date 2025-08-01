document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('cart:updated', function (e) {
    const el = document.getElementById('cartItemCount');
    if (el && e.detail && typeof e.detail.count === 'number') {
      el.textContent = e.detail.count;
    }
  });
});

