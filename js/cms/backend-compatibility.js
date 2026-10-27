/*
 * TASK33.3: the category conflict now returns PT409 without retrying.
 * Owner/MFA regression checks and original-data preservation passed.
 * Enable the main local CMS after the controlled acceptance checks.
 * This release guard does not replace server authorization or RLS.
 */
export const CMS_UPGRADE_READY = true;

export const CMS_UPGRADE_NOTICE =
  "Pengelolaan Projects dan Certificates dinonaktifkan sementara sampai " +
  "kompatibilitas backend diverifikasi dan migrasinya disetujui. " +
  "Perubahan data, kategori, media, serta Save/Publish/Trash/Restore belum tersedia.";

export function requireCmsUpgrade() {
  if (!CMS_UPGRADE_READY) {
    throw new Error(CMS_UPGRADE_NOTICE);
  }
}
