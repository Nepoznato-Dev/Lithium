export const TEMPLATES = {
  blank: { name: 'Blank note', content: '' },
  daily: { name: 'Daily note', content: `---\ntags: [daily]\ndate: {{date}}\n---\n\n# {{date}}\n\n## Tasks\n- [ ] \n\n## Notes\n\n## Log\n` },
  meeting: { name: 'Meeting note', content: `---\ntags: [meeting]\ndate: {{date}}\n---\n\n# Meeting: \n\n**Date:** {{date}}\n**Attendees:** \n\n## Agenda\n\n## Discussion\n\n## Action Items\n- [ ] \n\n## Notes\n` },
  project: { name: 'Project note', content: `---\ntags: [project]\nstatus: active\n---\n\n# Project: \n\n## Overview\n\n## Goals\n- \n\n## Tasks\n- [ ] \n\n## Resources\n- \n\n## Notes\n` },
  zettel: { name: 'Zettelkasten', content: `---\ntags: []\ncreated: {{date}}\n---\n\n# \n\n## Idea\n\n## Context\n\n## Related\n- [[]]\n` },
};

export function fillTemplate(tpl) {
  const today = new Date().toISOString().slice(0, 10);
  return tpl.replace(/\{\{date\}\}/g, today);
}
