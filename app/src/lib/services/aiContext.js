/**
 * AiContext — Context collection framework for the Lithium AI runtime.
 *
 * Any app can call these helpers to gather structured context from the
 * current environment (browser page, active note, file listings, selection)
 * and pass it to AiService via buildContext().
 *
 * This module provides high-level collectors; the low-level payload builder
 * lives in aiService.buildContext().
 */

import { buildContext, quickChat } from './aiService';

// ── Browser page context ─────────────────────────────────────────────────────
/** Build browser context from provided page info.
 *  Callers pass in url/title from their own imports. */
export function collectBrowserContext({ pageUrl, pageTitle } = {}) {
  if (!pageUrl) return {};
  return {
    pageUrl,
    pageTitle: pageTitle || '',
    pageContent: pageTitle ? `Page: ${pageTitle}\nURL: ${pageUrl}` : `URL: ${pageUrl}`,
  };
}

// ── Selection context ────────────────────────────────────────────────────────
/** Capture the current text selection from the document. */
export function collectSelectionContext() {
  try {
    const sel = window.getSelection?.();
    const text = sel?.toString()?.trim();
    if (text && text.length > 0) {
      return { selection: text.slice(0, 4000) }; // limit to 4k chars
    }
  } catch {}
  return {};
}

// ── Note context ─────────────────────────────────────────────────────────────
/** Collect context from the currently open note (if any). */
export function collectNoteContext(noteName, noteContent) {
  if (!noteContent) return {};
  return {
    noteName: noteName || 'untitled',
    noteContent: noteContent.slice(0, 8000),
  };
}

// ── File context ─────────────────────────────────────────────────────────────
/** Collect context from a file. */
export function collectFileContext(fileName, fileContent) {
  if (!fileContent) return {};
  return {
    fileName: fileName || 'unknown',
    fileContent: fileContent.slice(0, 8000),
  };
}

// ── File listing context ─────────────────────────────────────────────────────
/** Collect context from a directory listing. */
export function collectFileListingContext(files) {
  if (!files?.length) return {};
  return {
    fileListing: files.map(f => ({ name: f.name, type: f.type || 'file' })),
  };
}

// ── High-level AI actions ────────────────────────────────────────────────────
/** Summarize the current page or selection. */
export async function summarizeAction(context = {}) {
  const sources = { ...context };
  if (!sources.pageContent && !sources.selection && !sources.noteContent && !sources.fileContent) {
    return { error: 'No content to summarize. Open a page, select text, or have a note/file active.' };
  }
  const ctx = buildContext(sources);
  const result = await quickChat('Please summarize the following content concisely.', { context: ctx });
  return result;
}

/** Explain the current selection or page. */
export async function explainAction(context = {}) {
  const sources = { ...context };
  if (!sources.selection && !sources.pageContent) {
    return { error: 'No content to explain. Select text or open a page.' };
  }
  const ctx = buildContext(sources);
  const result = await quickChat('Please explain the following content in simple terms.', { context: ctx });
  return result;
}

/** Translate the current selection. */
export async function translateAction(context = {}, targetLang = 'English') {
  const sources = { ...context };
  if (!sources.selection) {
    return { error: 'No text selected to translate. Select text first.' };
  }
  const ctx = buildContext(sources);
  const result = await quickChat(`Translate the following text to ${targetLang}. Only output the translation, nothing else.`, { context: ctx });
  return result;
}

/** Ask a question about the current context. */
export async function askAboutContext(question, context = {}) {
  const ctx = buildContext(context);
  const result = await quickChat(question, { context: ctx });
  return result;
}
