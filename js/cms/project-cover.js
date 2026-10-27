/* Shared, bounded cover metadata for public cards and the admin preview. */
export const COVER_COLUMNS = "cover_fit,cover_position_x,cover_position_y";

export function validCover(value) {
    return value && ["cover", "contain"].includes(value.cover_fit) &&
        [value.cover_position_x, value.cover_position_y].every(number =>
            Number.isInteger(number) && number >= 0 && number <= 100);
}

export function normalizeCover(value = {}) {
    const position = number => Number.isInteger(number) && number >= 0 && number <= 100 ? number : 50;
    return {
        cover_fit: value.cover_fit === "contain" ? "contain" : "cover",
        cover_position_x: position(value.cover_position_x),
        cover_position_y: position(value.cover_position_y)
    };
}

export function applyCover(image, value) {
    const cover = normalizeCover(value);
    image.style.objectFit = cover.cover_fit;
    image.style.objectPosition = `${cover.cover_position_x}% ${cover.cover_position_y}%`;
    image.dataset.coverFit = cover.cover_fit;
}

export function missingCoverSchema(error) {
    return ["42703", "PGRST204"].includes(error?.code) &&
        /\bcover_(?:fit|position_x|position_y)\b/.test(error?.message || "");
}

// Homepage cards and detail media keep separate fixed crop frames.
export const PROJECT_FRAME_RATIO = 16 / 10;
export const PROJECT_DETAIL_FRAME_RATIO = 16 / 9;
export function cropPosition(value = {}) {
    const bounded = n => Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
    return { x: bounded(value?.x), y: bounded(value?.y) };
}
export function applyImageCrop(image, value) {
    if (!image) return;
    const { x, y } = cropPosition(value);
    Object.assign(image.style, { width:"100%", height:"100%", objectFit:"cover", objectPosition:`${x}% ${y}%` });
}
