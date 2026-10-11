/**
 * Loads the review-comment layer on the dev server only. In production builds
 * import.meta.env.DEV is false, so the layer is never fetched or bundled in.
 */
if (import.meta.env.DEV) {
    import('./commentLayer.js').then(({ mountCommentLayer }) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', mountCommentLayer, { once: true });
        } else {
            mountCommentLayer();
        }
    });
}
