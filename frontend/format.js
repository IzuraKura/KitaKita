// format.js
const MAX_UTANG_LIMIT = 2000;

function peso(value, decimals = 2) {
  const num = Number(value) || 0;
  return "₱" + num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function commas(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}

function confirmModal({
    title = 'Confirm Action',
    message = 'Are you sure you want to proceed?',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false
} = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const okBtn = document.getElementById('confirm-modal-ok');
        const cancelBtn = document.getElementById('confirm-modal-cancel');
        const closeBtn = document.getElementById('confirm-modal-close');

        if (!modal || !titleEl || !msgEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(message));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;

        okBtn.classList.remove('btn-primary', 'btn-danger');
        okBtn.classList.add(danger ? 'btn-danger' : 'btn-primary');

        let settled = false;

        const cleanup = (result) => {
            if (settled) return;
            settled = true;
            modal.classList.remove('active');
            okBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn?.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdropClick);
            document.removeEventListener('keydown', onKeyDown);
            resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdropClick = (e) => {
            if (e.target === modal) cleanup(false);
        };
        const onKeyDown = (e) => {
            if (e.key === 'Escape') cleanup(false);
        };

        okBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn?.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdropClick);
        document.addEventListener('keydown', onKeyDown);

        modal.classList.add('active');
        okBtn.focus();
    });
}

window.confirmModal = confirmModal;