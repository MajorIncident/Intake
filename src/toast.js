const toastElId = 'toast';

export function showToast(message) {
  const toast = document.getElementById(toastElId);
  if (!toast) {
    console.warn('Toast element not found');
    return;
  }
  toast.textContent = message;
  toast.className = 'toast show';
  window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}
