export interface LearningReference {
  title: string;
  url: string;
}

const REFERENCES: Record<string, LearningReference> = {
  security: {
    title: 'MDN web security',
    url: 'https://developer.mozilla.org/en-US/docs/Web/Security',
  },
  cryptography: {
    title: 'Web cryptography concepts',
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API',
  },
  networks: {
    title: 'How the Internet works',
    url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Web_mechanics/How_does_the_Internet_work',
  },
  'ci/cd': {
    title: 'GitHub Actions and continuous integration',
    url: 'https://docs.github.com/en/actions/get-started/understand-github-actions',
  },
  microservices: {
    title: 'Microservices architecture',
    url: 'https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/microservices',
  },
  cloud: {
    title: 'Google Cloud architecture framework',
    url: 'https://cloud.google.com/architecture/framework',
  },
  database: {
    title: 'PostgreSQL database tutorial',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
  },
  javascript: {
    title: 'MDN JavaScript guide',
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide',
  },
  typescript: {
    title: 'TypeScript handbook',
    url: 'https://www.typescriptlang.org/docs/handbook/intro.html',
  },
  python: {
    title: 'Python tutorial',
    url: 'https://docs.python.org/3/tutorial/',
  },
  go: { title: 'A Tour of Go', url: 'https://go.dev/tour/welcome/1' },
  rust: {
    title: 'The Rust Programming Language',
    url: 'https://doc.rust-lang.org/book/',
  },
  java: { title: 'Learn Java', url: 'https://dev.java/learn/' },
  react: { title: 'React learning guide', url: 'https://react.dev/learn' },
  angular: { title: 'Angular overview', url: 'https://angular.dev/overview' },
  css: {
    title: 'MDN CSS guide',
    url: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
  },
  html: {
    title: 'MDN HTML guide',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
  },
  http: {
    title: 'MDN HTTP overview',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview',
  },
  jwt: {
    title: 'JSON Web Token specification',
    url: 'https://www.rfc-editor.org/rfc/rfc7519.html',
  },
  oauth: {
    title: 'OAuth 2.0 framework',
    url: 'https://www.rfc-editor.org/rfc/rfc6749.html',
  },
  postgresql: {
    title: 'PostgreSQL tutorial',
    url: 'https://www.postgresql.org/docs/current/tutorial.html',
  },
  sql: {
    title: 'PostgreSQL SQL language',
    url: 'https://www.postgresql.org/docs/current/sql.html',
  },
  redis: { title: 'Redis documentation', url: 'https://redis.io/docs/latest/' },
  docker: {
    title: 'Docker overview',
    url: 'https://docs.docker.com/get-started/docker-overview/',
  },
  kubernetes: {
    title: 'Kubernetes concepts',
    url: 'https://kubernetes.io/docs/concepts/',
  },
  'node.js': {
    title: 'Node.js introduction',
    url: 'https://nodejs.org/en/learn/getting-started/introduction-to-nodejs',
  },
  'tcp/ip': {
    title: 'Internet protocol suite',
    url: 'https://www.rfc-editor.org/rfc/rfc1122.html',
  },
  dns: {
    title: 'DNS concepts',
    url: 'https://www.rfc-editor.org/rfc/rfc1034.html',
  },
};

const ALIASES: Record<string, string> = {
  'web security': 'security',
  'web-security': 'security',
  networking: 'networks',
  nodejs: 'node.js',
  node: 'node.js',
  postgres: 'postgresql',
  databases: 'database',
  'continuous integration': 'ci/cd',
};

export function learningReferences(topics: string[]): LearningReference[] {
  const references = topics
    .map((topic) => {
      const key = topic.trim().toLowerCase();
      const canonical = Object.hasOwn(ALIASES, key) ? ALIASES[key] : key;
      return Object.hasOwn(REFERENCES, canonical)
        ? REFERENCES[canonical]
        : undefined;
    })
    .filter((reference): reference is LearningReference => Boolean(reference));
  return [
    ...new Map(
      references.map((reference) => [reference.url, reference]),
    ).values(),
  ].slice(0, 3);
}
