/* ================================================
   LIBELLÉS FRANÇAIS DE L'ADMIN (fichiers et champs)
   ================================================ */

export const FILE_LABELS = {
  site: { title: 'Site', hint: 'Identité, méta SEO, héros, terminal, CV, réseaux, contact, audio, pied de page' },
  ui: { title: 'Interface', hint: 'Écran de boot, navigation, boutons, titres de sections, formulaire, accessibilité' },
  skills: { title: 'Compétences', hint: 'Catégories et étiquettes' },
  projects: { title: 'Projets', hint: 'Cartes projets, stack et liens' },
  timeline: { title: 'Parcours', hint: 'Frise chronologique — triée automatiquement par date (la plus récente en premier) ; sans date de fin = en cours' },
  cards: { title: 'Certifications', hint: 'Carrousel de la section Certifications : intitulé, organisme, logo (onglet Fichiers) et lien de vérification' }
};

const FIELD_LABELS = {
  defaultLang: 'Langue par défaut',
  formspreeId: 'Identifiant Formspree',
  meta: 'Métadonnées (SEO)',
  title: 'Titre',
  description: 'Description',
  keywords: 'Mots-clés',
  author: 'Auteur',
  robots: 'Directive robots',
  url: 'URL',
  ogType: 'Type Open Graph',
  ogTitle: 'Titre Open Graph',
  ogDescription: 'Description Open Graph',
  ogSiteName: 'Nom du site Open Graph',
  identity: 'Identité',
  firstName: 'Prénom',
  lastName: 'Nom',
  brandInitial: 'Initiale (logo)',
  hero: 'Section d’accueil',
  greeting: 'Salutation',
  bio: 'Biographie',
  terminal: 'Terminal',
  prompt: 'Invite',
  path: 'Chemin',
  whoamiCommand: 'Commande whoami',
  fields: 'Champs',
  key: 'Clé',
  value: 'Valeur',
  highlight: 'Mis en évidence',
  skillsCommand: 'Commande compétences',
  skills: 'Compétences',
  label: 'Libellé',
  finalCommand: 'Commande finale',
  cv: 'CV',
  downloadName: 'Nom du fichier téléchargé',
  socials: 'Réseaux sociaux',
  network: 'Réseau',
  contact: 'Contact',
  items: 'Éléments',
  icon: 'Icône',
  href: 'Lien',
  audio: 'Lecteur audio',
  src: 'Source',
  type: 'Type MIME',
  volume: 'Volume (0 à 1)',
  footer: 'Pied de page',
  rights: 'Mention de droits',
  boot: 'Écran de démarrage',
  skip: 'Bouton « passer »',
  lines: 'Lignes',
  delay: 'Délai (s)',
  variant: 'Variante',
  text: 'Texte',
  nav: 'Navigation',
  status: 'Statut',
  links: 'Liens',
  ctaContact: 'Bouton contact',
  ctaFormation: 'Bouton formation',
  ctaCv: 'Bouton CV',
  ctaSocial: 'Bouton réseaux',
  sections: 'Sections',
  projects: 'Projets',
  formation: 'Formation',
  certifications: 'Certifications',
  timeline: 'Frise « Parcours »',
  kinds: 'Catégories',
  kind: 'Catégorie',
  experience: 'Expérience',
  benevolat: 'Bénévolat',
  present: 'Mention « en cours »',
  to: 'Liaison entre deux dates',
  start: 'Début (AAAA-MM)',
  end: 'Fin (AAAA-MM)',
  form: 'Formulaire de contact',
  nameLabel: 'Libellé nom',
  namePlaceholder: 'Exemple nom',
  emailLabel: 'Libellé e-mail',
  emailPlaceholder: 'Exemple e-mail',
  messageLabel: 'Libellé message',
  messagePlaceholder: 'Exemple message',
  submit: 'Bouton d’envoi',
  success: 'Message de succès',
  error: 'Message d’erreur',
  sending: 'Envoi en cours',
  sent: 'Envoyé',
  idle: 'Au repos',
  a11y: 'Libellés d’accessibilité',
  categories: 'Catégories',
  tags: 'Étiquettes',
  stack: 'Technologies',
  date: 'Date',
  role: 'Intitulé',
  org: 'Organisme',
  bullets: 'Puces',
  cards: 'Certifications',
  logo: 'Logo (chemin du fichier)',
  logoAlt: 'Texte alternatif du logo',
  verifyUrl: 'Lien de vérification (https)',
  verifyPlatform: 'Plateforme de vérification',
  verify: 'Bouton « Vérifier »',
  newTab: 'Mention « nouvel onglet » (lecteurs d’écran)',
  prev: 'Bouton « précédent » (lecteurs d’écran)',
  next: 'Bouton « suivant » (lecteurs d’écran)',
  pause: 'Bouton « arrêter la rotation »',
  play: 'Bouton « lancer la rotation »',
  carousel: 'Type de composant « carrousel »',
  slide: 'Type d’élément « certification »',
  dots: 'Groupe de points (lecteurs d’écran)',
  position: 'Position ({n} et {total})',
  id: 'Identifiant',
  visible: 'Visible sur le site',
  fr: 'FR',
  en: 'EN'
};

/** Aides affichées sous certains champs (reliées par aria-describedby). */
const FIELD_HINTS = {
  logo: 'Collez ici le chemin copié depuis l’onglet Fichiers (bouton « Copier le chemin »), ex. /images/uploads/ibm-6bdf7f8ccdb3.svg. Formats : SVG, PNG, JPG ou WebP. Sans logo, les initiales de l’organisme s’affichent.',
  logoAlt: 'Facultatif : l’intitulé et l’organisme sont déjà écrits à côté du logo.',
  verifyUrl: 'Adresse https:// de la page publique du certificat (Credly, Coursera…). Sans lien, aucun bouton « Vérifier ».',
  verifyPlatform: 'Nom affiché en petit sous le bouton, ex. Credly, Coursera.',
  position: 'Doit contenir {n} (numéro) et {total} (nombre de certifications), ex. « {n} sur {total} ».'
};

/** Aide d'un champ (undefined si aucune). */
export function fieldHint(key) {
  return FIELD_HINTS[key];
}

/** Libellés des valeurs d'énumération affichées dans les listes déroulantes. */
const ENUM_LABELS = {
  formation: 'Formation',
  experience: 'Expérience',
  benevolat: 'Bénévolat'
};

/** Libellé d'une valeur d'énumération (repli : la valeur brute). */
export function enumLabel(value) {
  return ENUM_LABELS[value] ?? String(value);
}

/** Libellé d'un champ (repli : la clé brute). */
export function fieldLabel(key) {
  return FIELD_LABELS[key] ?? String(key);
}
