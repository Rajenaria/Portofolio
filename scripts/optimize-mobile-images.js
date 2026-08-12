/**
 * Development utility: generates lightweight mobile WebP versions of the
 * large images in Image/ used by the site's <picture> mobile sources.
 *
 * Run with:
 *   node scripts/optimize-mobile-images.js
 *
 * - Never modifies or deletes original files.
 * - Skips a file if its -mobile.webp output already exists and is newer
 *   than the source (re-run any time; only stale/missing outputs rebuild).
 * - Does not resize images already narrower than the target width.
 * - Output quality starts at 82 and steps down (min 65) if the result is
 *   still above the target size budget for that category.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const IMAGE_DIR = path.join(__dirname, "..", "Image");

// category: maxWidth (px) = upper bound for the resized mobile image,
// targetKB = soft file-size budget used to step quality down if needed.
const CATEGORIES = {
    "hero-profile": { maxWidth: 900, targetKB: 400 },
    "project-thumbnail": { maxWidth: 1000, targetKB: 300 },
    documentation: { maxWidth: 1100, targetKB: 400 },
    background: { maxWidth: 1280, targetKB: 500 },
};

// Explicit manifest rather than "convert everything in Image/": small
// icons/logos and unreferenced files are intentionally left out (see the
// optimization report for the full list and reasoning).
const MANIFEST = [
    { src: "hadow.png", out: "hadow-mobile.webp", category: "hero-profile" },
    { src: "Profil 1.png", out: "profil-1-mobile.webp", category: "hero-profile" },

    { src: "web.png", out: "web-mobile.webp", category: "project-thumbnail" },
    { src: "ticket.png", out: "ticket-mobile.webp", category: "project-thumbnail" },
    { src: "project 3.png", out: "project-3-mobile.webp", category: "project-thumbnail" },

    { src: "aslab 1.jpeg", out: "aslab-1-mobile.webp", category: "documentation" },
    { src: "aslab 2.jpeg", out: "aslab-2-mobile.webp", category: "documentation" },
    { src: "himpunan 1.jpeg", out: "himpunan-1-mobile.webp", category: "documentation" },
    { src: "himpunan 4.jpeg", out: "himpunan-4-mobile.webp", category: "documentation" },
    { src: "marketing 1.jpeg", out: "marketing-1-mobile.webp", category: "documentation" },
    { src: "madrd 4.png", out: "madrd-4-mobile.webp", category: "documentation" },
    { src: "madrid 5.png", out: "madrid-5-mobile.webp", category: "documentation" },

    { src: "background.png", out: "background-mobile.webp", category: "background" },
];

function formatKB(bytes) {
    return (bytes / 1024).toFixed(0) + " KB";
}

async function encodeUnderBudget(srcPath, outPath, maxWidth, targetKB) {
    let quality = 82;
    let buffer;

    while (true) {
        buffer = await sharp(srcPath)
            .resize({ width: maxWidth, withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();

        const kb = buffer.length / 1024;
        if (kb <= targetKB || quality <= 65) break;
        quality -= 5;
    }

    fs.writeFileSync(outPath, buffer);
    return { size: buffer.length, quality };
}

async function main() {
    let totalBefore = 0;
    let totalAfter = 0;
    let processed = 0;
    let skipped = 0;

    console.log("Optimizing mobile images in", IMAGE_DIR, "\n");

    for (const entry of MANIFEST) {
        const srcPath = path.join(IMAGE_DIR, entry.src);
        const outPath = path.join(IMAGE_DIR, entry.out);
        const { maxWidth, targetKB } = CATEGORIES[entry.category];

        if (!fs.existsSync(srcPath)) {
            console.warn(`  [SKIP] missing source: ${entry.src}`);
            continue;
        }

        const srcStat = fs.statSync(srcPath);

        if (fs.existsSync(outPath)) {
            const outStat = fs.statSync(outPath);
            if (outStat.mtimeMs >= srcStat.mtimeMs) {
                console.log(`  [UP-TO-DATE] ${entry.out}`);
                skipped++;
                totalBefore += srcStat.size;
                totalAfter += outStat.size;
                continue;
            }
        }

        const { size, quality } = await encodeUnderBudget(
            srcPath,
            outPath,
            maxWidth,
            targetKB
        );

        totalBefore += srcStat.size;
        totalAfter += size;
        processed++;

        console.log(
            `  [OK] ${entry.src} (${formatKB(srcStat.size)}) -> ${entry.out} ` +
                `(${formatKB(size)}, q${quality}, max ${maxWidth}px)`
        );
    }

    console.log("\nDone.");
    console.log(`  Generated/updated: ${processed}`);
    console.log(`  Already up-to-date: ${skipped}`);
    console.log(
        `  Original total: ${formatKB(totalBefore)} -> Mobile total: ${formatKB(
            totalAfter
        )} (saved ${formatKB(totalBefore - totalAfter)})`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
