export function buildHatvpSlug(firstName: string, lastName: string): string {
  return `${lastName}-${firstName}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function buildHatvpUrl(firstName: string, lastName: string): string {
  return `https://www.hatvp.fr/fiche-nominative/?declarant=${buildHatvpSlug(firstName, lastName)}`;
}
