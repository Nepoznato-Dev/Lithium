/** Resolve public icon assets under Vite's configured base path. */
export function iconUrl(name, extension = 'png') {
  return `${import.meta.env.BASE_URL}icons/${name}.${extension}`;
}
