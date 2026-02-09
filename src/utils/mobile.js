
/**
 * Mobile utility for gestures
 */

export function initSwipeGestures(element, onSwipeLeft, onSwipeRight) {
    let touchStartX = 0;
    let touchEndX = 0;

    element.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    element.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    }, { passive: true });

    function handleSwipe() {
        if (touchEndX < touchStartX - 70) {
            onSwipeLeft?.();
        }
        if (touchEndX > touchStartX + 70) {
            onSwipeRight?.();
        }
    }
}

export function initPullToRefresh(onRefresh) {
    let pullStartY = 0;

    window.addEventListener('touchstart', e => {
        if (window.scrollY === 0) {
            pullStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
        const pullDistance = e.touches[0].clientY - pullStartY;
        if (pullDistance > 150 && window.scrollY === 0) {
            // Trigger refresh logic
            onRefresh?.();
        }
    }, { passive: true });
}
