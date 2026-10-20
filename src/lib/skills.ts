// Skill taxonomy used to tag job descriptions and resumes without any API calls.
// Each entry: canonical name -> aliases (matched case-insensitively on word boundaries),
// plus optional case-sensitive patterns for short, ambiguous tokens like "Go" or "ML".

type SkillDef = { aliases: string[]; exact?: RegExp };

const SKILLS: Record<string, SkillDef> = {
  Python: { aliases: ["python"] },
  Java: { aliases: ["java"] },
  JavaScript: { aliases: ["javascript", "ecmascript", "es6"] },
  TypeScript: { aliases: ["typescript"] },
  "C++": { aliases: ["c++", "cpp"] },
  "C#": { aliases: ["c#", "csharp"] },
  ".NET": { aliases: [".net", "dotnet", "asp.net"] },
  Go: { aliases: ["golang"], exact: /\bGo\b(?![-\s]to\b)/ },
  Rust: { aliases: ["rust"] },
  Kotlin: { aliases: ["kotlin"] },
  Swift: { aliases: ["swift", "swiftui"] },
  Ruby: { aliases: ["ruby", "ruby on rails", "rails"] },
  PHP: { aliases: ["php", "laravel"] },
  Scala: { aliases: ["scala"] },
  SQL: { aliases: ["sql"] },
  HTML: { aliases: ["html", "html5"] },
  CSS: { aliases: ["css", "css3", "sass", "scss"] },
  React: { aliases: ["react", "react.js", "reactjs"] },
  "Next.js": { aliases: ["next.js", "nextjs"] },
  Vue: { aliases: ["vue", "vue.js", "vuejs", "nuxt"] },
  Angular: { aliases: ["angular", "angularjs"] },
  Svelte: { aliases: ["svelte", "sveltekit"] },
  Redux: { aliases: ["redux"] },
  "Tailwind CSS": { aliases: ["tailwind", "tailwindcss"] },
  "Node.js": { aliases: ["node.js", "nodejs", "node"] },
  Express: { aliases: ["express.js", "expressjs"] },
  Django: { aliases: ["django"] },
  Flask: { aliases: ["flask"] },
  FastAPI: { aliases: ["fastapi"] },
  "Spring Boot": { aliases: ["spring boot", "spring framework", "springboot"] },
  GraphQL: { aliases: ["graphql"] },
  "REST APIs": { aliases: ["rest api", "rest apis", "restful", "rest services"] },
  gRPC: { aliases: ["grpc", "protobuf"] },
  Microservices: { aliases: ["microservices", "microservice", "service-oriented"] },
  "System Design": { aliases: ["system design", "distributed systems", "distributed system", "scalable systems"] },
  "Data Structures & Algorithms": { aliases: ["data structures", "algorithms", "dsa", "competitive programming"] },
  PostgreSQL: { aliases: ["postgresql", "postgres"] },
  MySQL: { aliases: ["mysql"] },
  MongoDB: { aliases: ["mongodb", "mongo"] },
  Redis: { aliases: ["redis"] },
  DynamoDB: { aliases: ["dynamodb"] },
  Cassandra: { aliases: ["cassandra"] },
  Elasticsearch: { aliases: ["elasticsearch", "opensearch"] },
  Kafka: { aliases: ["kafka"] },
  RabbitMQ: { aliases: ["rabbitmq"] },
  AWS: { aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"] },
  GCP: { aliases: ["gcp", "google cloud"] },
  Azure: { aliases: ["azure"] },
  Docker: { aliases: ["docker", "containers", "containerization"] },
  Kubernetes: { aliases: ["kubernetes", "k8s", "eks", "gke"] },
  Terraform: { aliases: ["terraform", "infrastructure as code"] },
  Ansible: { aliases: ["ansible"] },
  Linux: { aliases: ["linux", "unix"] },
  Bash: { aliases: ["bash", "shell scripting", "shell scripts"] },
  Git: { aliases: ["git", "version control"] },
  "CI/CD": { aliases: ["ci/cd", "continuous integration", "continuous delivery", "github actions", "jenkins", "circleci"] },
  Nginx: { aliases: ["nginx"] },
  Prometheus: { aliases: ["prometheus"] },
  Grafana: { aliases: ["grafana"] },
  Observability: { aliases: ["observability", "monitoring", "opentelemetry"] },
  Spark: { aliases: ["apache spark", "pyspark", "spark"] },
  Hadoop: { aliases: ["hadoop", "hive"] },
  Airflow: { aliases: ["airflow"] },
  dbt: { aliases: ["dbt"] },
  Snowflake: { aliases: ["snowflake"] },
  BigQuery: { aliases: ["bigquery"] },
  "Data Pipelines": { aliases: ["etl", "elt", "data pipelines", "data pipeline", "data warehouse", "data warehousing"] },
  Pandas: { aliases: ["pandas"] },
  NumPy: { aliases: ["numpy"] },
  "scikit-learn": { aliases: ["scikit-learn", "sklearn"] },
  TensorFlow: { aliases: ["tensorflow", "keras"] },
  PyTorch: { aliases: ["pytorch", "torch"] },
  "Machine Learning": { aliases: ["machine learning"], exact: /\bML\b/ },
  "Deep Learning": { aliases: ["deep learning", "neural networks", "neural network"] },
  NLP: { aliases: ["nlp", "natural language processing"] },
  "Computer Vision": { aliases: ["computer vision", "opencv", "image processing"] },
  LLMs: { aliases: ["llm", "llms", "large language model", "large language models", "generative ai", "genai", "gen ai"] },
  RAG: { aliases: ["retrieval augmented generation", "retrieval-augmented generation", "vector database", "embeddings"], exact: /\bRAG\b/ },
  LangChain: { aliases: ["langchain", "langgraph", "llamaindex"] },
  "Hugging Face": { aliases: ["hugging face", "huggingface", "transformers"] },
  MLOps: { aliases: ["mlops", "model deployment", "model serving"] },
  Statistics: { aliases: ["statistics", "statistical", "probability", "hypothesis testing"] },
  "A/B Testing": { aliases: ["a/b testing", "a/b tests", "experimentation"] },
  Excel: { aliases: ["excel", "spreadsheets", "google sheets"] },
  Tableau: { aliases: ["tableau"] },
  "Power BI": { aliases: ["power bi", "powerbi"] },
  "Data Analysis": { aliases: ["data analysis", "data analytics", "analytics"] },
  Android: { aliases: ["android", "jetpack compose"] },
  iOS: { aliases: ["ios"] },
  Flutter: { aliases: ["flutter", "dart"] },
  "React Native": { aliases: ["react native"] },
  Firebase: { aliases: ["firebase"] },
  Testing: { aliases: ["unit testing", "unit tests", "test automation", "jest", "pytest", "junit", "cypress", "selenium", "playwright"] },
  Security: { aliases: ["cybersecurity", "application security", "appsec", "penetration testing", "owasp"] },
  Blockchain: { aliases: ["blockchain", "solidity", "web3", "smart contracts"] },
  Figma: { aliases: ["figma"] },
  "UI/UX": { aliases: ["ui/ux", "user experience", "ux design", "ui design", "wireframing", "prototyping"] },
  Agile: { aliases: ["agile", "scrum", "kanban", "jira"] },
  "Product Management": { aliases: ["product management", "product roadmap", "prds", "product requirements"] },
  Communication: { aliases: ["communication skills", "stakeholder management", "cross-functional"] },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

// Boundaries that treat "+", "#" and "." as part of a token so "C++" and ".NET" work
// and "Java" does not match inside "JavaScript".
const COMPILED: [string, RegExp[]][] = Object.entries(SKILLS).map(([name, def]) => {
  const patterns = def.aliases.map(
    (a) => new RegExp(`(?<![\\w+#])${escape(a)}(?![\\w+#]|\\.\\w)`, "i"),
  );
  if (def.exact) patterns.push(def.exact);
  return [name, patterns];
});

/** Canonical skill names mentioned in free text (job description, resume). */
export function extractSkills(text: string): string[] {
  if (!text) return [];
  return COMPILED.filter(([, patterns]) => patterns.some((p) => p.test(text))).map(([name]) => name);
}

/** Maps user-typed skills ("reactjs", "k8s") to canonical names; unknown skills pass through. */
export function normalizeSkills(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    const hit = Object.entries(SKILLS).find(
      ([name, def]) => name.toLowerCase() === key || def.aliases.includes(key),
    );
    out.add(hit ? hit[0] : s);
  }
  return [...out];
}
