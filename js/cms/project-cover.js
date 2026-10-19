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
