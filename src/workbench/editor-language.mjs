const EXT_TO_LANGUAGE = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', java: 'java', go: 'go', rs: 'rust', c: 'c', cpp: 'cpp', h: 'cpp', cs: 'csharp',
  json: 'json', html: 'html', css: 'css', scss: 'scss', sh: 'shell', ps1: 'powershell',
  sql: 'sql', yaml: 'yaml', yml: 'yaml', md: 'markdown', xml: 'xml', php: 'php', rb: 'ruby'
};

export function getLanguage(filename) {
  return EXT_TO_LANGUAGE[filename?.split('.').pop()?.toLowerCase()] || 'plaintext';
}
