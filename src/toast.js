/**
 * Displays transient toast notifications by updating the `#toast` element's content
 * and toggling its visibility class. Toasts automatically dismiss after a short delay.
 */
const toastElId = 'toast';

/**
 * Render a toast message and hide it after a timeout.
 * @param {string} message - Text shown inside the toast element.
 */
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
