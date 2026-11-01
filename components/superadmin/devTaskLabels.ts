// "Vazifalar" bo'limi matnlari — o'zbekcha va ruscha (sotuvchilar ikkala tilda ishlaydi)
import type { DevTaskStatus } from '../../utils/devTasks';

const uz = {
    title: 'Vazifalar',
    subSales: "Klinikalardan eshitgan so'rov yoki xatoni yozing — dasturchi ko'radi.",
    subAdmin: 'Sotuvchilar yozgan vazifalar. Holatini shu yerda o\'zgartiring.',
    add: 'Yangi vazifa',
    text: 'Nima qilish kerak',
    textPlaceholder: "Masalan: kalendarda qabulni boshqa kunga sudrab bo'lmayapti…",
    clinic: 'Klinika (ixtiyoriy)',
    clinicPlaceholder: 'Klinika nomi',
    photos: 'Rasmlar',
    addPhoto: "Rasm qo'shish",
    photoHint: (max: number) => `Ko'pi bilan ${max} ta. Rasm avtomatik kichraytiriladi.`,
    uploading: 'Yuklanmoqda…',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    empty: "Bu bo'limda hali vazifa yo'q.",
    loading: 'Yuklanmoqda…',
    loadError: "Vazifalarni yuklab bo'lmadi",
    remove: "O'chirish",
    confirmRemove: "Vazifani o'chirasizmi?",
    all: 'Hammasi',
    open: 'Ochiq',
    author: 'Yozdi',
    status: { New: 'Yangi', InProgress: 'Jarayonda', Done: 'Bajarildi' } as Record<DevTaskStatus, string>,
};

const ru: typeof uz = {
    title: 'Задачи',
    subSales: 'Опишите просьбу или ошибку, о которой сказала клиника, — разработчик увидит.',
    subAdmin: 'Задачи от продавцов. Статус меняется здесь.',
    add: 'Новая задача',
    text: 'Что нужно сделать',
    textPlaceholder: 'Например: в календаре нельзя перетащить приём на другой день…',
    clinic: 'Клиника (необязательно)',
    clinicPlaceholder: 'Название клиники',
    photos: 'Фото',
    addPhoto: 'Добавить фото',
    photoHint: (max: number) => `Не больше ${max}. Фото уменьшается автоматически.`,
    uploading: 'Загрузка…',
    save: 'Сохранить',
    cancel: 'Отмена',
    empty: 'В этом разделе пока нет задач.',
    loading: 'Загрузка…',
    loadError: 'Не удалось загрузить задачи',
    remove: 'Удалить',
    confirmRemove: 'Удалить задачу?',
    all: 'Все',
    open: 'Открытые',
    author: 'Автор',
    status: { New: 'Новая', InProgress: 'В работе', Done: 'Готово' },
};

export type DevTaskLabels = typeof uz;
export const devTaskLabels = (language: string): DevTaskLabels => (language === 'ru' ? ru : uz);
