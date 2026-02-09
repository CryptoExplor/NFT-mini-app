
import { toast } from '../utils/toast.js';

/**
 * Share a collection
 */
export async function shareCollection(collection) {
    const shareData = {
        title: collection.name,
        text: collection.description,
        url: `${window.location.origin}/mint/${collection.slug}`
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            // Fallback to copy link
            await navigator.clipboard.writeText(shareData.url);
            toast.show('Link copied to clipboard!', 'success');
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('Share failed:', e);
            await navigator.clipboard.writeText(shareData.url);
            toast.show('Link copied to clipboard!', 'success');
        }
    }
}
