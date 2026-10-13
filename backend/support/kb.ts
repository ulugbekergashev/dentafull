// ─── Bilim bazasi ────────────────────────────────────────────────────────────
// Yordam boti faqat shu yerdagi maqolalardan javob beradi. Ikki manba:
//
//   seed    — koddagi boshlang'ich to'plam (kbSeed*.ts). Har deployda bazaga
//             qayta yoziladi, ya'ni matnni tuzatish = kodni tuzatish.
//   learned — operator javobidan yoki paneldan qo'shilgan. Deploy tegmaydi.
//
// Qidiruv ataylab oddiy: maqolalar yuzga yaqin, sarlavhalar ro'yxati modelga
// to'liq beriladi va u kerakligini o'zi ochadi (open_article). Embedding yoki
// vektor baza kerak emas. `search` esa model chaqirilmaydigan joylar uchun
// (ilova ichidagi DentaAI) — so'zlar mosligi bo'yicha.

import { sanitizeText } from '../ai/guard';
import type { SeedArticle } from './kbTypes';
import type { SupportLang } from './productMap';
import { isGuideId, isPathId } from './productMap';
import { normalizeForSearch, safeJson, searchTokens } from './text';

export interface Article {
    id: string;
    module: string;
    roles: string[] | '*';
    titleUz: string;
    titleRu: string;
    bodyUz: string;
    bodyRu: string;
    keywords: string[];
    paths: string[];
    guideId: string | null;
    source: 'seed' | 'learned';
    active: boolean;
    uses: number;
    updatedAt?: Date;
}

const CACHE_MS = 60_000;
export const ARTICLE_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
export const BODY_MAX = 1500;

const fromRow = (r: any): Article => ({
    id: r.id,
    module: r.module,
    roles: !r.roles || r.roles === '*' ? '*' : String(r.roles).split(',').map((x: string) => x.trim()).filter(Boolean),
    titleUz: r.titleUz,
    titleRu: r.titleRu,
    bodyUz: r.bodyUz,
    bodyRu: r.bodyRu,
    keywords: safeJson<string[]>(r.keywords, []),
    paths: safeJson<string[]>(r.paths, []).filter(isPathId),
    guideId: r.guideId && isGuideId(r.guideId) ? r.guideId : null,
    source: r.source === 'learned' ? 'learned' : 'seed',
    active: r.active !== false,
    uses: r.uses || 0,
    updatedAt: r.updatedAt,
});

const contentOf = (a: {
    module: string; roles: any; titleUz: string; titleRu: string; bodyUz: string; bodyRu: string;
    keywords?: string[]; paths?: string[]; guideId?: string | null;
}) => ({
    module: String(a.module || 'general').slice(0, 40),
    roles: a.roles === '*' || !a.roles?.length ? '*' : (Array.isArray(a.roles) ? a.roles : [a.roles]).join(','),
    titleUz: String(a.titleUz || '').slice(0, 200),
    titleRu: String(a.titleRu || a.titleUz || '').slice(0, 200),
    bodyUz: String(a.bodyUz || '').slice(0, BODY_MAX),
    bodyRu: String(a.bodyRu || a.bodyUz || '').slice(0, BODY_MAX),
    keywords: JSON.stringify((a.keywords || []).map(k => String(k).slice(0, 80)).slice(0, 30)),
    paths: JSON.stringify((a.paths || []).filter(isPathId).slice(0, 4)),
    guideId: a.guideId && isGuideId(a.guideId) ? a.guideId : null,
});

/** Rol shu maqolani ko'ra oladimi. Ulanmagan odam (rol yo'q) faqat hamma uchun ochiq maqolalarni ko'radi. */
export const visibleTo = (a: Article, role: string | null | undefined): boolean =>
    a.roles === '*' || role === 'SUPER_ADMIN' || (!!role && a.roles.includes(role));

export const titleOf = (a: Article, lang: SupportLang): string => (lang === 'ru' ? a.titleRu : a.titleUz);
export const bodyOf = (a: Article, lang: SupportLang): string => (lang === 'ru' ? a.bodyRu : a.bodyUz);

export const createKb = (db: any) => {
    let cache: { at: number; rows: Article[] } | null = null;

    const all = async (): Promise<Article[]> => {
        if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
        try {
            const rows = (await db.supportArticle.findMany({ where: { active: true } })).map(fromRow);
            cache = { at: Date.now(), rows };
            return rows;
        } catch (e: any) {
            console.warn('[support:kb] o\'qib bo\'lmadi:', e?.message);
            return cache?.rows || [];
        }
    };

    return {
        all,
        invalidate() { cache = null; },

        /**
         * Koddagi to'plamni bazaga yozadi (server ishga tushganda).
         * Matn kodda — manba kod; `active` va `uses` bazadagicha qoladi: panelda
         * o'chirilgan maqola deploydan keyin o'zi yoqilib qolmasin.
         * To'plamdan olib tashlangan seed maqola o'chiriladi (learned'ga tegilmaydi).
         */
        async syncSeed(seed: SeedArticle[]): Promise<{ upserted: number; retired: number }> {
            let upserted = 0;
            const ids = new Set<string>();
            for (const a of seed) {
                if (!ARTICLE_ID_RE.test(a.id) || ids.has(a.id)) continue;
                ids.add(a.id);
                const content = contentOf(a);
                await db.supportArticle.upsert({
                    where: { id: a.id },
                    create: { id: a.id, ...content, source: 'seed', active: true, uses: 0 },
                    update: { ...content, source: 'seed' },
                });
                upserted++;
            }
            const stale = (await db.supportArticle.findMany({ where: { source: 'seed' }, select: { id: true } }))
                .map((r: any) => r.id).filter((id: string) => !ids.has(id));
            if (stale.length) await db.supportArticle.deleteMany({ where: { id: { in: stale } } });
            cache = null;
            return { upserted, retired: stale.length };
        },

        /** Modelga beriladigan mundarija: "id — sarlavha", bo'limlar bo'yicha */
        async indexFor(role: string | null | undefined, lang: SupportLang): Promise<string> {
            const byModule = new Map<string, string[]>();
            for (const a of await all()) {
                if (!visibleTo(a, role)) continue;
                const list = byModule.get(a.module) || [];
                // Sarlavha modelning system prompt'iga tushadi: operator javobidan yasalgan maqola
                // sarlavhasida ko'rsatma bo'lishi mumkin — tozalanadi
                list.push(`${a.id} — ${sanitizeText(titleOf(a, lang))}`);
                byModule.set(a.module, list);
            }
            return [...byModule.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([module, lines]) => `[${module}]\n${lines.sort().join('\n')}`)
                .join('\n\n');
        },

        /** Maqolani ochadi. Rolga ko'rinmaydigan yoki yo'q maqola — null. */
        async open(id: string, role: string | null | undefined): Promise<Article | null> {
            const a = (await all()).find(x => x.id === String(id || '').trim());
            if (!a || !visibleTo(a, role)) return null;
            // Qaysi maqola ko'p ishlatilishi — bilim bazasini qayerda kuchaytirishni ko'rsatadi
            void db.supportArticle.update({ where: { id: a.id }, data: { uses: { increment: 1 } } }).catch(() => { });
            return a;
        },

        /** So'zlar mosligi bo'yicha qidiruv (model chaqirilmaydigan joylar uchun) */
        async search(query: string, role: string | null | undefined, limit = 3): Promise<Article[]> {
            const tokens = searchTokens(query);
            if (!tokens.length) return [];
            const scored: { a: Article; score: number }[] = [];
            for (const a of await all()) {
                if (!visibleTo(a, role)) continue;
                const title = normalizeForSearch(`${a.titleUz} ${a.titleRu}`);
                const keys = normalizeForSearch(a.keywords.join(' '));
                const body = normalizeForSearch(`${a.bodyUz} ${a.bodyRu}`);
                let score = 0;
                for (const t of tokens) {
                    // So'z o'zagi bo'yicha: "tolovni" ham "tolov" ga mos kelsin
                    const stem = t.length > 5 ? t.slice(0, 5) : t;
                    if (title.includes(stem)) score += 3;
                    if (keys.includes(stem)) score += 3;
                    else if (body.includes(stem)) score += 1;
                }
                if (score >= 3) scored.push({ a, score });
            }
            return scored.sort((x, y) => y.score - x.score).slice(0, limit).map(x => x.a);
        },

        /** Paneldan yoki operator javobidan saqlash */
        async save(id: string, input: any, source: 'seed' | 'learned' = 'learned'): Promise<Article> {
            if (!ARTICLE_ID_RE.test(id)) throw new Error("Maqola nomi noto'g'ri: faqat kichik lotin harflari, raqam, nuqta va chiziqcha");
            const content = contentOf(input);
            if (!content.titleUz || !content.bodyUz) throw new Error("Sarlavha va matn bo'sh bo'lmasligi kerak");
            const row = await db.supportArticle.upsert({
                where: { id },
                create: { id, ...content, source, active: input.active !== false, uses: 0 },
                update: { ...content, ...(input.active === undefined ? {} : { active: !!input.active }) },
            });
            cache = null;
            return fromRow(row);
        },

        async setActive(id: string, active: boolean): Promise<void> {
            await db.supportArticle.update({ where: { id }, data: { active } });
            cache = null;
        },

        /** Panel uchun: o'chirilganlari bilan birga */
        async list(q?: { query?: string; module?: string }): Promise<Article[]> {
            const rows: Article[] = (await db.supportArticle.findMany({
                where: q?.module ? { module: q.module } : undefined,
                orderBy: [{ module: 'asc' }, { id: 'asc' }],
            })).map(fromRow);
            const needle = normalizeForSearch(q?.query || '');
            if (!needle) return rows;
            return rows.filter(a => normalizeForSearch(`${a.id} ${a.titleUz} ${a.titleRu} ${a.keywords.join(' ')}`).includes(needle));
        },
    };
};

export type Kb = ReturnType<typeof createKb>;
