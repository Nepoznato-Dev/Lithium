/**
 * Preview handler for text/* entries.
 * Renders first 50KB in a <pre> block via the extension registry.
 */

const MAX_PREVIEW_BYTES = 50 * 1024; // 50 KB

/**
 * Extension descriptor for the registry.
 */
export const textPreviewExtension = {
  id: 'text-preview',
  name: 'Text Preview',

  /** Check if this entry is a text file. */
  canHandle(entry) {
    return entry?.type === 'text';
  },

  /**
   * Return a preview handler with render() method.
   * @param {object} entry — the file entry
   * @param {function} readContent — async (entry) => string
   */
  getPreviewHandler(entry, { readContent } = {}) {
    if (!readContent) return null;
    return {
      type: 'text',
      async render() {
        const text = await readContent(entry);
        const truncated = text.length > MAX_PREVIEW_BYTES
          ? text.slice(0, MAX_PREVIEW_BYTES) + '\n\n… (truncated)'
          : text;
        return { text: truncated };
      },
    };
  },

  /**
   * Return properties specific to text files.
   */
  getProperties(entry) {
    return {
      lineCount: entry.content ? (entry.content.match(/\n/g) || []).length + 1 : null,
      charCount: entry.content ? entry.content.length : null,
    };
  },
};
