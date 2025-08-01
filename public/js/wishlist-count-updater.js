document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('wishlist:updated', function (e) {
    const el = document.getElementById('wishlistItemCount');
    if (el && e.detail && typeof e.detail.count === 'number') {
      el.textContent = e.detail.count;
    }
  });
});
