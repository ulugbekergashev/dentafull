// Sotuvchilar vazifalari: turlar va rasmni yuklashdan oldin siqish.
// Superadmin → "Vazifalar" bo'limi (components/superadmin/DevTasksPanel.tsx).

export type DevTaskProduct = 'denta7' | 'dentalocal';
export type DevTaskStatus = 'New' | 'InProgress' | 'Done';

export interface DevTask {
    id: string;
    product: DevTaskProduct;
    text: string;
    clinicName: string | null;
    photos: string[];
    status: DevTaskStatus;
    authorId: string | null;
    authorName: string;
    createdAt: string;
    updatedAt: string;
}

export interface NewDevTask {
    product: DevTaskProduct;
    text: string;
    clinicName: string;
    photos: string[];
}

export const DEV_TASK_PRODUCTS: { id: DevTaskProduct; label: string }[] = [
    { id: 'denta7', label: 'Denta7' },
    { id: 'dentalocal', label: 'DentaLocal' },
];
export const DEV_TASK_STATUSES: DevTaskStatus[] = ['New', 'InProgress', 'Done'];
export const DEV_TASK_TEXT_MAX = 4000;
export const DEV_TASK_PHOTOS_MAX = 6;

/** Rasm o'qiladigan bo'lsin, lekin og'ir bo'lmasin: uzun tomoni 1600px, JPEG 85% */
const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.85;
/** Bundan kichik JPEG/PNG/WebP rasm o'zgartirilmaydi */
const PHOTO_KEEP_BYTES = 600 * 1024;

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Rasmni o'qib bo'lmadi")); };
    img.src = url;
});

/** Telefon rasmi (4-12 MB) → ~200-500 KB, matn va ekran tafsilotlari o'qiladi */
export async function compressPhoto(file: File): Promise<File> {
    if (!file.type.startsWith('image/')) throw new Error('Faqat rasm yuklash mumkin');
    const img = await loadImage(file);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest <= PHOTO_MAX_SIDE && file.size <= PHOTO_KEEP_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const scale = Math.min(1, PHOTO_MAX_SIDE / longest);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
}
