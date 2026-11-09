import type { Language } from './learning.types';

const INTERESTS: Record<string, { ja: string; en: string }> = {
  frontend: { ja: 'フロントエンド', en: 'Frontend' },
  backend: { ja: 'バックエンド', en: 'Backend' },
  database: { ja: 'データベース', en: 'Databases' },
  security: { ja: 'セキュリティ', en: 'Security' },
  networking: { ja: 'ネットワーク', en: 'Networking' },
  cloud: { ja: 'クラウド', en: 'Cloud' },
  general: { ja: '基礎', en: 'Fundamentals' },
};

const NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  react: 'React',
  vue: 'Vue',
  angular: 'Angular',
  css: 'CSS',
  html: 'HTML',
  dom: 'DOM',
  http: 'HTTP',
  https: 'HTTPS',
  jwt: 'JWT',
  sql: 'SQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  redis: 'Redis',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  dns: 'DNS',
  'tcp/ip': 'TCP/IP',
  tcp: 'TCP',
  udp: 'UDP',
  tls: 'TLS',
  api: 'API',
  apis: 'APIs',
  'rest apis': 'REST APIs',
  rest: 'REST',
  graphql: 'GraphQL',
  'ci/cd': 'CI/CD',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  oauth: 'OAuth',
  python: 'Python',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  xss: 'XSS',
  csrf: 'CSRF',
  cors: 'CORS',
  aws: 'AWS',
  gcp: 'GCP',
};

export function topicLabel(topic: string, language: Language): string {
  const key = topic.trim().toLowerCase();
  if (INTERESTS[key]) return INTERESTS[key][language];
  if (NAMES[key]) return NAMES[key];
  return key.replace(/(^|[\s-])\p{Ll}/gu, (match) => match.toUpperCase());
}
