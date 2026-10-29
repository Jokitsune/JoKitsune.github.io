/* ================================================
   SCHÉMA DU CONTENU (zod) — sans dépendance au DOM
   Importable depuis Node (build, tests, futur panneau admin) :
     import { validateContent, contentSchema } from './src/lib/schema.js';
   ================================================ */

import { z } from 'zod';

export const LANGS = /** @type {const} */ (['fr', 'en']);

/* -------- Primitives -------- */

// Texte affiché : « < » et « > » sont refusés (aucun HTML dans le contenu).
// Les retours à la ligne s'écrivent "\n" (rendus en <br> par le moteur de rendu).
export const textSchema = z
  .string()
  .max(2000, 'Texte trop long (2000 caractères max)')
  .regex(/^[^<>]*$/, 'Les caractères « < » et « > » sont interdits (pas de HTML dans le contenu)');

// Texte traduisible : soit une chaîne invariante (identique en FR/EN), soit { fr, en }.
export const localizedSchema = z.union([
  textSchema,
  z.strictObject({ fr: textSchema, en: textSchema })
]);

// URL sûre : http(s), mailto:, tel:, ancre (#...) ou chemin relatif sans schéma.
// Refuse javascript:, data:, vbscript:, etc.
const SAFE_URL = /^(?![\s\S]*[<>"'`])(https?:\/\/[^\s]+|mailto:[^\s]+|tel:[+0-9 ().-]+|#[A-Za-z0-9_-]*|(?![A-Za-z][A-Za-z0-9+.-]*:)[A-Za-z0-9_./-][^\s:]*)$/;
export const urlSchema = z
  .string()
  .min(1)
  .max(2000)
  .regex(SAFE_URL, 'URL non autorisée (http(s), mailto:, tel:, #ancre ou chemin relatif uniquement)');

export const idSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, 'Identifiant invalide (minuscules, chiffres, « - » ou « _ »)');

// Champs communs aux éléments de liste gérés par l'admin
const listItem = {
  id: idSchema,
  order: z.number().int(),
  visible: z.boolean()
};

/** Liste d'éléments dont les `id` doivent être uniques. */
export function listOf(item) {
  return z.array(item).superRefine((items, ctx) => {
    const seen = new Set();
    items.forEach((it, i) => {
      if (seen.has(it.id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: `Identifiant en double : « ${it.id} »` });
      }
      seen.add(it.id);
    });
  });
}

const $schema = { $schema: z.string().optional() };

/* -------- site.json -------- */

export const SOCIAL_NETWORKS = /** @type {const} */ (['github', 'linkedin', 'whatsapp', 'instagram']);

export const siteSchema = z.strictObject({
  ...$schema,
  defaultLang: z.enum(LANGS),
  formspreeId: z.string().regex(/^[A-Za-z0-9]{4,32}$/, 'Identifiant Formspree invalide'),
  meta: z.strictObject({
    title: localizedSchema,
    description: localizedSchema,
    keywords: localizedSchema,
    author: textSchema,
    robots: textSchema,
    url: urlSchema,
    ogType: textSchema,
    ogTitle: localizedSchema,
    ogDescription: localizedSchema,
    ogSiteName: localizedSchema
  }),
  identity: z.strictObject({
    firstName: textSchema,
    lastName: textSchema,
    brandInitial: textSchema
  }),
  hero: z.strictObject({
    greeting: localizedSchema,
    title: localizedSchema,
    bio: localizedSchema
  }),
  terminal: z.strictObject({
    title: textSchema,
    prompt: textSchema,
    path: textSchema,
    whoamiCommand: textSchema,
    fields: listOf(z.strictObject({
      ...listItem,
      key: textSchema,
      value: localizedSchema,
      highlight: z.boolean().optional()
    })),
    skillsCommand: textSchema,
    skills: listOf(z.strictObject({ ...listItem, label: localizedSchema })),
    finalCommand: localizedSchema
  }),
  cv: z.strictObject({
    url: urlSchema,
    downloadName: z.string().regex(/^[A-Za-z0-9_.-]+$/, 'Nom de fichier invalide')
  }),
  socials: listOf(z.strictObject({
    ...listItem,
    network: z.enum(SOCIAL_NETWORKS),
    url: urlSchema,
    title: textSchema,
    label: textSchema
  })),
  contact: z.strictObject({
    description: localizedSchema,
    items: listOf(z.strictObject({
      ...listItem,
      icon: textSchema,
      label: localizedSchema,
      value: localizedSchema,
      href: urlSchema.optional()
    }))
  }),
  audio: z.strictObject({
    title: textSchema,
    src: urlSchema,
    type: z.string().regex(/^audio\/[a-z0-9.+-]+$/),
    volume: z.number().min(0).max(1)
  }),
  footer: z.strictObject({
    rights: localizedSchema,
    prompt: textSchema
  })
});

/* -------- ui.json -------- */

export const uiSchema = z.strictObject({
  ...$schema,
  boot: z.strictObject({
    skip: localizedSchema,
    lines: listOf(z.strictObject({
      ...listItem,
      delay: z.number().min(0).max(30),
      variant: z.enum(['default', 'warn', 'error', 'highlight']),
      text: localizedSchema,
      value: textSchema.optional()
    }))
  }),
  nav: z.strictObject({
    status: textSchema,
    links: listOf(z.strictObject({ ...listItem, href: urlSchema, label: localizedSchema }))
  }),
  hero: z.strictObject({
    ctaContact: localizedSchema,
    ctaFormation: localizedSchema,
    ctaCv: localizedSchema,
    ctaSocial: localizedSchema
  }),
  sections: z.strictObject(Object.fromEntries(
    ['skills', 'projects', 'formation', 'contact'].map(k => [k, z.strictObject({ label: localizedSchema, title: localizedSchema })])
  )),
  form: z.strictObject({
    nameLabel: localizedSchema,
    namePlaceholder: localizedSchema,
    emailLabel: localizedSchema,
    emailPlaceholder: localizedSchema,
    messageLabel: localizedSchema,
    messagePlaceholder: localizedSchema,
    submit: localizedSchema,
    success: localizedSchema,
    error: localizedSchema,
    status: z.strictObject({ sending: textSchema, sent: textSchema, idle: textSchema })
  }),
  a11y: z.record(z.string().regex(/^[A-Za-z0-9]+$/), textSchema)
});

/* -------- skills.json -------- */

export const skillsSchema = z.strictObject({
  ...$schema,
  categories: listOf(z.strictObject({
    ...listItem,
    icon: textSchema,
    title: localizedSchema,
    tags: z.array(localizedSchema)
  }))
});

/* -------- projects.json -------- */

export const projectsSchema = z.strictObject({
  ...$schema,
  projects: listOf(z.strictObject({
    ...listItem,
    title: localizedSchema,
    description: localizedSchema,
    stack: z.array(localizedSchema),
    links: z.array(z.strictObject({ label: localizedSchema, url: urlSchema }))
  }))
});

/* -------- timeline.json -------- */

export const timelineSchema = z.strictObject({
  ...$schema,
  items: listOf(z.strictObject({
    ...listItem,
    date: localizedSchema,
    role: localizedSchema,
    org: localizedSchema,
    description: localizedSchema.optional(),
    bullets: z.array(localizedSchema).optional()
  }).refine(it => (it.description === undefined) !== (it.bullets === undefined), {
    message: 'Renseigner soit « description », soit « bullets » (exactement un des deux)'
  }))
});

/* -------- cards.json -------- */

export const CARD_COLORS = /** @type {const} */ (['green', 'cyan', 'yellow']);

export const cardsSchema = z.strictObject({
  ...$schema,
  cards: listOf(z.strictObject({
    ...listItem,
    color: z.enum(CARD_COLORS),
    icon: textSchema,
    badge: localizedSchema,
    title: localizedSchema,
    org: localizedSchema,
    date: localizedSchema,
    progress: z.strictObject({
      label: localizedSchema,
      value: localizedSchema,
      percent: z.number().min(0).max(100)
    }),
    tags: z.array(localizedSchema)
  }))
});

/* -------- Ensemble du contenu -------- */

/** Schéma de chaque fichier de content/, indexé par nom de fichier (sans .json). */
export const fileSchemas = {
  site: siteSchema,
  ui: uiSchema,
  skills: skillsSchema,
  projects: projectsSchema,
  timeline: timelineSchema,
  cards: cardsSchema
};

export const CONTENT_FILES = Object.keys(fileSchemas);

export const contentSchema = z.strictObject(fileSchemas);

/**
 * @typedef {{ file: string, path: string, message: string }} ContentIssue
 * @typedef {{ success: true, data: any, errors: [] } | { success: false, data: null, errors: ContentIssue[] }} ValidationResult
 */

function toIssues(error, file) {
  return error.issues.map(issue => {
    const path = [...issue.path];
    const f = file ?? String(path.shift() ?? '');
    return { file: f, path: path.join('.'), message: issue.message };
  });
}

/**
 * Valide un seul fichier de contenu.
 * @param {string} file nom du fichier sans extension (site, ui, skills, projects, timeline, cards)
 * @param {unknown} data contenu JSON parsé
 * @returns {ValidationResult}
 */
export function validateFile(file, data) {
  const schema = fileSchemas[file];
  if (!schema) {
    return { success: false, data: null, errors: [{ file, path: '', message: `Fichier de contenu inconnu : ${file}` }] };
  }
  const res = schema.safeParse(data);
  return res.success
    ? { success: true, data: res.data, errors: [] }
    : { success: false, data: null, errors: toIssues(res.error, file) };
}

/**
 * Valide l'ensemble du contenu { site, ui, skills, projects, timeline, cards }.
 * @param {unknown} content
 * @returns {ValidationResult}
 */
export function validateContent(content) {
  const res = contentSchema.safeParse(content);
  return res.success
    ? { success: true, data: res.data, errors: [] }
    : { success: false, data: null, errors: toIssues(res.error) };
}

/** Formate des erreurs de validation en texte lisible. */
export function formatIssues(errors) {
  return errors.map(e => `  - content/${e.file}.json${e.path ? ` › ${e.path}` : ''} : ${e.message}`).join('\n');
}

/**
 * Exporte le schéma au format JSON Schema (draft 2020-12), par fichier.
 * Utile pour l'autocomplétion dans l'éditeur et la génération de formulaires admin.
 * @returns {Record<string, object>}
 */
export function toJSONSchemas() {
  return Object.fromEntries(
    Object.entries(fileSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })])
  );
}
