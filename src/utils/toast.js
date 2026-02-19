
class ToastManager {
    constructor() {
        this.container = null;
    }

    init() {
        if (this.container) return;
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
      `;
        document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} glass-card`;

        // Inline styles for toast
        toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 10px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
        min-width: 250px;
    `;

        // Type specific styles
        if (type === 'success') toast.style.borderLeft = '4px solid #10B981';
        else if (type === 'error') toast.style.borderLeft = '4px solid #EF4444';
        else if (type === 'warning') toast.style.borderLeft = '4px solid #F59E0B';
        else toast.style.borderLeft = '4px solid #6366F1';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'toast-icon';
        iconSpan.style.fontSize = '1.2em';
        iconSpan.textContent = this.getIcon(type);

        const msgSpan = document.createElement('span');
        msgSpan.className = 'toast-message';
        msgSpan.textContent = message;

        toast.appendChild(iconSpan);
        toast.appendChild(msgSpan);

        this.container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });

        setTimeout(() => {
            toast.style.transform = 'translateX(120%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }
}

export const toast = new ToastManager();
