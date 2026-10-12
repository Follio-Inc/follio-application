/**
 * The shared skill vocabulary. Every skill has one id, the names people
 * write for it, and the broader skills it belongs to. Resume and job
 * terms both resolve through this list, so "DBMS" on one side and
 * "Database Management Systems" on the other are the same skill, and
 * PostgreSQL on a resume answers a posting that asks for SQL.
 *
 * `strict` names only count in running text with the same capitals
 * ("Excel", not "excel at"). `entryOnly` names never count in running text,
 * only as a whole skill entry or a job requirement ("Go", "R", "C").
 * A `generic` group is too broad to make its members related to each other:
 * Python and Java are both languages, but one is not partly the other.
 */

export type SkillKind = 'tool' | 'practice' | 'domain';

export interface CatalogEntry {
  id: string;
  label: string;
  kind: SkillKind;
  aka?: readonly string[];
  strict?: readonly string[];
  entryOnly?: readonly string[];
  under?: readonly string[];
  generic?: boolean;
}

type Options = Omit<CatalogEntry, 'id' | 'label' | 'kind'>;

const tool = (id: string, label: string, options: Options = {}): CatalogEntry => ({
  id,
  label,
  kind: 'tool',
  ...options,
});
const practice = (id: string, label: string, options: Options = {}): CatalogEntry => ({
  id,
  label,
  kind: 'practice',
  ...options,
});
const domain = (id: string, label: string, options: Options = {}): CatalogEntry => ({
  id,
  label,
  kind: 'domain',
  ...options,
});

export const SKILL_CATALOG: readonly CatalogEntry[] = [
  // Broad groups
  practice('software-engineering', 'Software engineering', {
    aka: ['software development', 'software engineering', 'programming', 'coding'],
    generic: true,
  }),
  practice('programming-languages', 'Programming languages', {
    aka: ['programming language', 'programming languages'],
    under: ['software-engineering'],
    generic: true,
  }),
  practice('web-development', 'Web development', {
    aka: ['web development', 'web applications', 'web apps', 'web engineering'],
    under: ['software-engineering'],
    generic: true,
  }),
  practice('frontend-development', 'Frontend development', {
    aka: ['frontend', 'front end', 'front end development', 'frontend engineering', 'client side'],
    under: ['web-development'],
  }),
  practice('backend-development', 'Backend development', {
    aka: ['backend', 'back end', 'back end development', 'backend engineering', 'server side'],
    under: ['software-engineering'],
  }),
  practice('full-stack-development', 'Full-stack development', {
    aka: ['full stack', 'fullstack', 'full stack development'],
    under: ['frontend-development', 'backend-development'],
  }),
  practice('frontend-frameworks', 'Frontend frameworks', {
    aka: ['frontend framework', 'javascript frameworks', 'javascript framework', 'spa frameworks'],
    under: ['frontend-development'],
  }),
  practice('backend-frameworks', 'Backend frameworks', {
    aka: ['backend framework', 'web frameworks', 'web framework'],
    under: ['backend-development'],
  }),
  practice('mobile-development', 'Mobile development', {
    aka: ['mobile', 'mobile apps', 'mobile applications', 'mobile app development'],
    under: ['software-engineering'],
  }),
  practice('databases', 'Databases', {
    aka: ['database', 'databases', 'data stores', 'data storage'],
    generic: true,
  }),
  practice('database-management-systems', 'Database management systems', {
    aka: [
      'dbms',
      'database management system',
      'database management',
      'database systems',
      'database administration',
      'dba',
    ],
    under: ['databases'],
  }),
  practice('relational-databases', 'Relational databases', {
    aka: ['rdbms', 'relational database', 'relational database management system', 'sql databases'],
    under: ['database-management-systems'],
  }),
  practice('nosql-databases', 'NoSQL databases', {
    aka: ['nosql', 'nosql database', 'non relational databases', 'document databases'],
    under: ['database-management-systems'],
  }),
  practice('database-design', 'Database design', {
    aka: ['data modeling', 'data modelling', 'schema design', 'database modeling'],
    under: ['databases'],
  }),
  practice('cloud-computing', 'Cloud computing', {
    aka: ['cloud', 'cloud platforms', 'cloud platform', 'cloud services', 'cloud infrastructure'],
  }),
  practice('devops', 'DevOps', { aka: ['devops', 'dev ops'] }),
  practice('containers', 'Containers', {
    aka: ['containerization', 'containerisation', 'containerized', 'containerised'],
    under: ['devops'],
  }),
  practice('container-orchestration', 'Container orchestration', {
    aka: ['container orchestration'],
    under: ['containers'],
  }),
  practice('ci-cd', 'CI/CD', {
    aka: [
      'ci cd',
      'cicd',
      'continuous integration',
      'continuous delivery',
      'continuous deployment',
      'build pipelines',
      'deployment pipelines',
    ],
    under: ['devops'],
  }),
  practice('infrastructure-as-code', 'Infrastructure as code', {
    aka: ['iac', 'infrastructure as code'],
    under: ['devops'],
  }),
  practice('observability', 'Observability', {
    aka: ['monitoring', 'observability', 'logging and monitoring', 'alerting', 'apm'],
    under: ['devops'],
  }),
  practice('site-reliability-engineering', 'Site reliability engineering', {
    aka: ['sre', 'site reliability', 'reliability engineering'],
    under: ['devops'],
  }),
  practice('version-control', 'Version control', {
    aka: ['source control', 'version control systems', 'vcs'],
    under: ['software-engineering'],
  }),
  practice('apis', 'APIs', {
    aka: ['api', 'apis', 'api design', 'api development', 'web services', 'web apis'],
    under: ['backend-development'],
  }),
  practice('messaging', 'Messaging and event streaming', {
    aka: ['message queues', 'message queue', 'message brokers', 'event streaming', 'pub sub'],
    under: ['distributed-systems'],
  }),
  practice('distributed-systems', 'Distributed systems', {
    aka: [
      'distributed systems',
      'distributed computing',
      'large scale systems',
      'scalable systems',
    ],
    under: ['backend-development'],
  }),
  practice('system-design', 'System design', {
    aka: ['system design', 'systems design', 'software architecture', 'architecture design'],
    under: ['software-engineering'],
  }),
  practice('microservices', 'Microservices', {
    aka: [
      'microservices',
      'micro services',
      'microservice architecture',
      'service oriented architecture',
      'soa',
    ],
    under: ['distributed-systems'],
  }),
  practice('event-driven-architecture', 'Event-driven architecture', {
    aka: ['event driven', 'event driven architecture', 'event sourcing'],
    under: ['distributed-systems'],
  }),
  practice('caching', 'Caching', {
    aka: ['cache', 'caching layer', 'in memory caching'],
    under: ['backend-development'],
  }),
  practice('data-engineering', 'Data engineering', {
    aka: ['data engineering', 'data infrastructure', 'data platform'],
  }),
  practice('data-pipelines', 'Data pipelines', {
    aka: [
      'etl',
      'elt',
      'data pipeline',
      'data pipelines',
      'etl pipelines',
      'data ingestion',
      'data integration',
    ],
    under: ['data-engineering'],
  }),
  practice('data-warehousing', 'Data warehousing', {
    aka: [
      'data warehouse',
      'data warehouses',
      'data warehousing',
      'data lake',
      'data lakes',
      'lakehouse',
    ],
    under: ['data-engineering'],
  }),
  practice('big-data', 'Big data', {
    aka: ['big data', 'large scale data'],
    under: ['data-engineering'],
  }),
  practice('data-analysis', 'Data analysis', {
    aka: [
      'data analysis',
      'data analytics',
      'analytics',
      'data driven analysis',
      'quantitative analysis',
    ],
  }),
  practice('data-visualization', 'Data visualization', {
    aka: [
      'data visualization',
      'data visualisation',
      'dashboards',
      'dashboarding',
      'reporting dashboards',
    ],
    under: ['data-analysis'],
  }),
  practice('business-intelligence', 'Business intelligence', {
    aka: ['bi', 'business intelligence', 'bi tools'],
    under: ['data-analysis'],
  }),
  practice('statistics', 'Statistics', {
    aka: ['statistical analysis', 'statistical modeling', 'statistical modelling', 'statistics'],
    under: ['data-analysis'],
  }),
  practice('experimentation', 'A/B testing', {
    aka: ['a b testing', 'ab testing', 'experimentation', 'split testing', 'multivariate testing'],
    under: ['data-analysis'],
  }),
  practice('artificial-intelligence', 'Artificial intelligence', {
    aka: ['ai', 'artificial intelligence'],
  }),
  practice('machine-learning', 'Machine learning', {
    aka: ['ml', 'machine learning', 'ml models', 'predictive modeling', 'predictive modelling'],
    under: ['artificial-intelligence'],
  }),
  practice('deep-learning', 'Deep learning', {
    aka: ['deep learning', 'neural networks', 'neural network'],
    under: ['machine-learning'],
  }),
  practice('natural-language-processing', 'Natural language processing', {
    aka: ['nlp', 'natural language processing', 'text mining'],
    under: ['machine-learning'],
  }),
  practice('computer-vision', 'Computer vision', {
    aka: ['computer vision', 'image recognition', 'image processing'],
    under: ['machine-learning'],
  }),
  practice('generative-ai', 'Generative AI and LLMs', {
    aka: [
      'llm',
      'llms',
      'large language models',
      'large language model',
      'generative ai',
      'genai',
      'gen ai',
    ],
    under: ['artificial-intelligence'],
  }),
  practice('prompt-engineering', 'Prompt engineering', {
    aka: ['prompt engineering', 'prompting'],
    under: ['generative-ai'],
  }),
  practice('mlops', 'MLOps', {
    aka: ['mlops', 'ml ops', 'ml infrastructure', 'model deployment'],
    under: ['machine-learning', 'devops'],
  }),
  practice('recommender-systems', 'Recommender systems', {
    aka: ['recommendation systems', 'recommender systems', 'recommendations'],
    under: ['machine-learning'],
  }),
  practice('software-testing', 'Software testing', {
    aka: [
      'testing',
      'qa',
      'quality assurance',
      'software testing',
      'test automation',
      'automated testing',
    ],
    under: ['software-engineering'],
  }),
  practice('unit-testing', 'Unit testing', {
    aka: ['unit tests', 'unit testing'],
    under: ['software-testing'],
  }),
  practice('end-to-end-testing', 'End-to-end testing', {
    aka: ['e2e testing', 'end to end testing', 'integration testing', 'e2e tests'],
    under: ['software-testing'],
  }),
  practice('tdd', 'Test-driven development', {
    aka: ['tdd', 'test driven development', 'bdd'],
    under: ['software-testing'],
  }),
  practice('security', 'Security', {
    aka: [
      'security',
      'cybersecurity',
      'cyber security',
      'information security',
      'infosec',
      'application security',
      'appsec',
    ],
  }),
  practice('identity-and-access', 'Identity and access management', {
    aka: [
      'iam',
      'identity and access management',
      'authentication',
      'authorization',
      'sso',
      'single sign on',
    ],
    under: ['security'],
  }),
  practice('penetration-testing', 'Penetration testing', {
    aka: ['pen testing', 'penetration testing', 'pentesting', 'vulnerability assessment'],
    under: ['security'],
  }),
  practice('networking', 'Networking', {
    aka: ['computer networks', 'computer networking', 'networking', 'tcp ip', 'network protocols'],
  }),
  practice('operating-systems', 'Operating systems', {
    aka: ['operating systems', 'os internals'],
  }),
  practice('data-structures-algorithms', 'Data structures and algorithms', {
    aka: ['data structures', 'algorithms', 'dsa', 'data structures and algorithms'],
    under: ['software-engineering'],
  }),
  practice('object-oriented-programming', 'Object-oriented programming', {
    aka: ['oop', 'object oriented programming', 'object oriented design', 'ood'],
    under: ['software-engineering'],
  }),
  practice('performance-optimization', 'Performance optimization', {
    aka: [
      'performance optimization',
      'performance tuning',
      'latency optimization',
      'performance engineering',
    ],
    under: ['software-engineering'],
  }),
  practice('accessibility', 'Accessibility', {
    aka: ['a11y', 'accessibility', 'wcag'],
    under: ['frontend-development'],
  }),
  practice('responsive-design', 'Responsive design', {
    aka: ['responsive design', 'responsive web design'],
    under: ['frontend-development'],
  }),
  practice('shell-scripting', 'Shell scripting', {
    aka: ['shell scripting', 'scripting'],
    under: ['programming-languages'],
  }),

  // Languages
  tool('python', 'Python', { aka: ['python', 'python3'], under: ['programming-languages'] }),
  tool('java', 'Java', {
    aka: ['java', 'java se', 'java ee', 'j2ee'],
    under: ['programming-languages'],
  }),
  tool('javascript', 'JavaScript', {
    aka: ['javascript', 'js', 'ecmascript', 'es6'],
    under: ['programming-languages'],
  }),
  tool('typescript', 'TypeScript', {
    aka: ['typescript', 'ts'],
    under: ['programming-languages', 'javascript'],
  }),
  tool('c', 'C', {
    entryOnly: ['c'],
    aka: ['c language', 'c programming', 'ansi c'],
    under: ['programming-languages'],
  }),
  tool('cpp', 'C++', {
    aka: ['cplusplus', 'cpp', 'c plus plus'],
    under: ['programming-languages'],
  }),
  tool('csharp', 'C#', { aka: ['csharp', 'c sharp'], under: ['programming-languages'] }),
  tool('go', 'Go', {
    entryOnly: ['go'],
    aka: ['golang', 'go language', 'go lang'],
    under: ['programming-languages'],
  }),
  tool('rust', 'Rust', { aka: ['rust', 'rustlang'], under: ['programming-languages'] }),
  tool('ruby', 'Ruby', { aka: ['ruby'], under: ['programming-languages'] }),
  tool('php', 'PHP', { aka: ['php'], under: ['programming-languages'] }),
  tool('kotlin', 'Kotlin', { aka: ['kotlin'], under: ['programming-languages'] }),
  tool('swift', 'Swift', {
    strict: ['Swift'],
    aka: ['swift language', 'swiftui'],
    under: ['programming-languages', 'ios'],
  }),
  tool('objective-c', 'Objective-C', {
    aka: ['objective c', 'objc'],
    under: ['programming-languages', 'ios'],
  }),
  tool('scala', 'Scala', { aka: ['scala'], under: ['programming-languages'] }),
  tool('r', 'R', {
    entryOnly: ['r'],
    aka: ['r programming', 'r language', 'rstudio'],
    under: ['programming-languages', 'statistics'],
  }),
  tool('matlab', 'MATLAB', { aka: ['matlab'], under: ['programming-languages'] }),
  tool('perl', 'Perl', { aka: ['perl'], under: ['programming-languages'] }),
  tool('elixir', 'Elixir', { aka: ['elixir'], under: ['programming-languages'] }),
  tool('haskell', 'Haskell', { aka: ['haskell'], under: ['programming-languages'] }),
  tool('dart', 'Dart', { aka: ['dart'], under: ['programming-languages'] }),
  tool('bash', 'Bash', { aka: ['bash', 'zsh', 'bash scripting'], under: ['shell-scripting'] }),
  tool('powershell', 'PowerShell', { aka: ['powershell'], under: ['shell-scripting'] }),
  tool('sql', 'SQL', {
    aka: ['sql', 'structured query language', 'sql queries', 'sql querying'],
    under: ['relational-databases', 'programming-languages'],
  }),
  tool('t-sql', 'T-SQL', { aka: ['t sql', 'tsql', 'transact sql'], under: ['sql', 'sql-server'] }),
  tool('pl-sql', 'PL/SQL', { aka: ['pl sql', 'plsql'], under: ['sql', 'oracle-database'] }),
  tool('html', 'HTML', { aka: ['html', 'html5'], under: ['frontend-development'] }),
  tool('css', 'CSS', { aka: ['css', 'css3'], under: ['frontend-development'] }),
  tool('sass', 'Sass', { aka: ['sass', 'scss'], under: ['css'] }),

  // Frontend
  tool('react', 'React', {
    aka: ['react', 'reactjs', 'react js'],
    under: ['frontend-frameworks', 'javascript'],
  }),
  tool('nextjs', 'Next.js', { aka: ['nextjs', 'next js'], under: ['react'] }),
  tool('redux', 'Redux', { aka: ['redux', 'redux toolkit'], under: ['react'] }),
  tool('angular', 'Angular', {
    aka: ['angular', 'angularjs', 'angular js'],
    under: ['frontend-frameworks', 'typescript'],
  }),
  tool('vue', 'Vue.js', {
    aka: ['vue', 'vuejs', 'vue js'],
    under: ['frontend-frameworks', 'javascript'],
  }),
  tool('nuxt', 'Nuxt', { aka: ['nuxt', 'nuxtjs'], under: ['vue'] }),
  tool('svelte', 'Svelte', {
    aka: ['svelte', 'sveltekit'],
    under: ['frontend-frameworks', 'javascript'],
  }),
  tool('jquery', 'jQuery', { aka: ['jquery'], under: ['javascript'] }),
  tool('tailwind', 'Tailwind CSS', {
    aka: ['tailwind', 'tailwindcss', 'tailwind css'],
    under: ['css'],
  }),
  tool('bootstrap', 'Bootstrap', { aka: ['bootstrap'], under: ['css'] }),
  tool('webpack', 'Webpack', {
    aka: ['webpack', 'vite', 'rollup', 'esbuild', 'babel'],
    under: ['frontend-development'],
  }),
  tool('react-native', 'React Native', {
    aka: ['react native'],
    under: ['mobile-development', 'react'],
  }),
  tool('flutter', 'Flutter', { aka: ['flutter'], under: ['mobile-development', 'dart'] }),
  tool('ios', 'iOS', {
    aka: ['ios', 'ios development', 'xcode', 'cocoa touch'],
    under: ['mobile-development'],
  }),
  tool('android', 'Android', {
    aka: ['android', 'android sdk', 'android development', 'jetpack compose'],
    under: ['mobile-development'],
  }),

  // Backend
  tool('nodejs', 'Node.js', {
    strict: ['Node'],
    aka: ['nodejs', 'node js'],
    under: ['backend-development', 'javascript'],
  }),
  tool('express', 'Express', {
    strict: ['Express'],
    aka: ['expressjs', 'express js'],
    under: ['nodejs', 'backend-frameworks'],
  }),
  tool('nestjs', 'NestJS', { aka: ['nestjs', 'nest js'], under: ['nodejs', 'backend-frameworks'] }),
  tool('django', 'Django', {
    aka: ['django', 'django rest framework', 'drf'],
    under: ['python', 'backend-frameworks'],
  }),
  tool('flask', 'Flask', { aka: ['flask'], under: ['python', 'backend-frameworks'] }),
  tool('fastapi', 'FastAPI', {
    aka: ['fastapi', 'fast api'],
    under: ['python', 'backend-frameworks'],
  }),
  tool('spring', 'Spring', {
    strict: ['Spring'],
    aka: ['spring boot', 'springboot', 'spring framework', 'spring mvc'],
    under: ['java', 'backend-frameworks'],
  }),
  tool('rails', 'Ruby on Rails', {
    aka: ['rails', 'ruby on rails', 'ror'],
    under: ['ruby', 'backend-frameworks'],
  }),
  tool('laravel', 'Laravel', { aka: ['laravel'], under: ['php', 'backend-frameworks'] }),
  tool('dotnet', '.NET', {
    aka: ['dotnet', 'dotnet core', 'dotnet framework', 'aspnet', 'asp net', 'aspnet core'],
    under: ['csharp', 'backend-frameworks'],
  }),
  tool('rest', 'REST APIs', {
    strict: ['REST'],
    aka: ['restful', 'rest api', 'rest apis', 'restful apis', 'restful services'],
    under: ['apis'],
  }),
  tool('graphql', 'GraphQL', { aka: ['graphql', 'apollo'], under: ['apis'] }),
  tool('grpc', 'gRPC', { aka: ['grpc', 'protobuf', 'protocol buffers'], under: ['apis'] }),
  tool('kafka', 'Kafka', { aka: ['kafka', 'apache kafka', 'confluent'], under: ['messaging'] }),
  tool('rabbitmq', 'RabbitMQ', { aka: ['rabbitmq', 'rabbit mq', 'amqp'], under: ['messaging'] }),
  tool('sqs', 'Amazon SQS', { aka: ['sqs', 'amazon sqs'], under: ['messaging', 'aws'] }),

  // Databases
  tool('postgresql', 'PostgreSQL', {
    aka: ['postgresql', 'postgres', 'psql', 'postgre sql'],
    under: ['relational-databases', 'sql'],
  }),
  tool('mysql', 'MySQL', {
    aka: ['mysql', 'my sql', 'aurora mysql'],
    under: ['relational-databases', 'sql'],
  }),
  tool('mariadb', 'MariaDB', { aka: ['mariadb'], under: ['relational-databases', 'sql'] }),
  tool('sql-server', 'SQL Server', {
    aka: ['sql server', 'mssql', 'ms sql', 'microsoft sql server', 'ms sql server'],
    under: ['relational-databases', 'sql'],
  }),
  tool('oracle-database', 'Oracle Database', {
    aka: ['oracle database', 'oracle db', 'oracle'],
    under: ['relational-databases', 'sql'],
  }),
  tool('sqlite', 'SQLite', { aka: ['sqlite'], under: ['relational-databases', 'sql'] }),
  tool('mongodb', 'MongoDB', { aka: ['mongodb', 'mongo', 'mongoose'], under: ['nosql-databases'] }),
  tool('cassandra', 'Cassandra', {
    aka: ['cassandra', 'apache cassandra', 'scylladb'],
    under: ['nosql-databases'],
  }),
  tool('dynamodb', 'DynamoDB', {
    aka: ['dynamodb', 'dynamo db', 'amazon dynamodb'],
    under: ['nosql-databases', 'aws'],
  }),
  tool('redis', 'Redis', { aka: ['redis', 'memcached'], under: ['nosql-databases', 'caching'] }),
  tool('firestore', 'Firebase', {
    aka: ['firebase', 'firestore'],
    under: ['nosql-databases', 'gcp'],
  }),
  tool('neo4j', 'Neo4j', {
    aka: ['neo4j', 'graph database', 'graph databases'],
    under: ['nosql-databases'],
  }),
  tool('elasticsearch', 'Elasticsearch', {
    aka: ['elasticsearch', 'elastic search', 'opensearch', 'solr'],
    under: ['nosql-databases'],
  }),
  tool('snowflake', 'Snowflake', { aka: ['snowflake'], under: ['data-warehousing'] }),
  tool('bigquery', 'BigQuery', {
    aka: ['bigquery', 'big query'],
    under: ['data-warehousing', 'gcp'],
  }),
  tool('redshift', 'Amazon Redshift', {
    aka: ['redshift', 'amazon redshift'],
    under: ['data-warehousing', 'aws'],
  }),
  tool('databricks', 'Databricks', {
    aka: ['databricks', 'delta lake'],
    under: ['data-warehousing', 'spark'],
  }),

  // Cloud and DevOps
  tool('aws', 'AWS', { aka: ['aws', 'amazon web services'], under: ['cloud-computing'] }),
  tool('gcp', 'Google Cloud', {
    aka: ['gcp', 'google cloud', 'google cloud platform'],
    under: ['cloud-computing'],
  }),
  tool('azure', 'Azure', { aka: ['azure', 'microsoft azure'], under: ['cloud-computing'] }),
  tool('ec2', 'Amazon EC2', { aka: ['ec2', 'amazon ec2'], under: ['aws'] }),
  tool('s3', 'Amazon S3', { aka: ['s3', 'amazon s3'], under: ['aws'] }),
  tool('aws-lambda', 'AWS Lambda', {
    aka: ['aws lambda', 'lambda functions'],
    under: ['aws', 'serverless'],
  }),
  tool('ecs', 'Amazon ECS', {
    aka: ['ecs', 'fargate', 'amazon ecs'],
    under: ['aws', 'container-orchestration'],
  }),
  tool('eks', 'Amazon EKS', { aka: ['eks', 'amazon eks'], under: ['aws', 'kubernetes'] }),
  tool('rds', 'Amazon RDS', {
    aka: ['rds', 'amazon rds', 'aurora'],
    under: ['aws', 'relational-databases'],
  }),
  practice('serverless', 'Serverless', {
    aka: ['serverless', 'cloud functions', 'faas'],
    under: ['cloud-computing'],
  }),
  tool('docker', 'Docker', {
    aka: ['docker', 'docker compose', 'dockerfile'],
    under: ['containers'],
  }),
  tool('kubernetes', 'Kubernetes', {
    aka: ['kubernetes', 'k8s', 'kube', 'kubectl'],
    under: ['container-orchestration'],
  }),
  tool('helm', 'Helm', { aka: ['helm', 'helm charts'], under: ['kubernetes'] }),
  tool('openshift', 'OpenShift', { aka: ['openshift'], under: ['container-orchestration'] }),
  tool('terraform', 'Terraform', {
    aka: ['terraform', 'opentofu'],
    under: ['infrastructure-as-code'],
  }),
  tool('cloudformation', 'CloudFormation', {
    aka: ['cloudformation', 'aws cloudformation'],
    under: ['infrastructure-as-code', 'aws'],
  }),
  tool('ansible', 'Ansible', { aka: ['ansible'], under: ['infrastructure-as-code'] }),
  tool('pulumi', 'Pulumi', { aka: ['pulumi'], under: ['infrastructure-as-code'] }),
  tool('jenkins', 'Jenkins', { aka: ['jenkins'], under: ['ci-cd'] }),
  tool('github-actions', 'GitHub Actions', {
    aka: ['github actions', 'gh actions'],
    under: ['ci-cd'],
  }),
  tool('gitlab-ci', 'GitLab CI', {
    aka: ['gitlab ci', 'gitlab ci cd', 'gitlab pipelines'],
    under: ['ci-cd'],
  }),
  tool('circleci', 'CircleCI', {
    aka: ['circleci', 'circle ci', 'travis ci', 'buildkite'],
    under: ['ci-cd'],
  }),
  tool('argocd', 'Argo CD', {
    aka: ['argocd', 'argo cd', 'gitops'],
    under: ['ci-cd', 'kubernetes'],
  }),
  tool('prometheus', 'Prometheus', { aka: ['prometheus'], under: ['observability'] }),
  tool('grafana', 'Grafana', { aka: ['grafana'], under: ['observability'] }),
  tool('datadog', 'Datadog', { aka: ['datadog'], under: ['observability'] }),
  tool('new-relic', 'New Relic', { aka: ['new relic', 'newrelic'], under: ['observability'] }),
  tool('splunk', 'Splunk', {
    aka: ['splunk', 'elk', 'elk stack', 'kibana', 'logstash'],
    under: ['observability'],
  }),
  tool('sentry', 'Sentry', { aka: ['sentry'], under: ['observability'] }),
  tool('opentelemetry', 'OpenTelemetry', {
    aka: ['opentelemetry', 'otel', 'distributed tracing', 'jaeger'],
    under: ['observability'],
  }),
  tool('linux', 'Linux', {
    aka: ['linux', 'unix', 'ubuntu', 'centos', 'rhel', 'debian'],
    under: ['operating-systems'],
  }),
  tool('git', 'Git', { aka: ['git'], under: ['version-control'] }),
  tool('github', 'GitHub', { aka: ['github'], under: ['version-control'] }),
  tool('gitlab', 'GitLab', { aka: ['gitlab'], under: ['version-control'] }),
  tool('bitbucket', 'Bitbucket', { aka: ['bitbucket'], under: ['version-control'] }),
  tool('nginx', 'Nginx', {
    aka: ['nginx', 'apache http server', 'load balancers', 'load balancing'],
    under: ['backend-development'],
  }),

  // Data and ML tools
  tool('spark', 'Apache Spark', {
    aka: ['spark', 'apache spark', 'pyspark', 'spark sql'],
    under: ['big-data'],
  }),
  tool('hadoop', 'Hadoop', { aka: ['hadoop', 'hdfs', 'hive', 'mapreduce'], under: ['big-data'] }),
  tool('airflow', 'Airflow', {
    aka: ['airflow', 'apache airflow', 'dagster', 'prefect'],
    under: ['data-pipelines'],
  }),
  tool('dbt', 'dbt', { aka: ['dbt', 'data build tool'], under: ['data-pipelines', 'sql'] }),
  tool('pandas', 'pandas', { aka: ['pandas'], under: ['python', 'data-analysis'] }),
  tool('numpy', 'NumPy', { aka: ['numpy', 'scipy'], under: ['python', 'data-analysis'] }),
  tool('jupyter', 'Jupyter', { aka: ['jupyter', 'jupyter notebooks'], under: ['data-analysis'] }),
  tool('excel', 'Excel', {
    strict: ['Excel'],
    aka: [
      'microsoft excel',
      'ms excel',
      'excel spreadsheets',
      'spreadsheets',
      'vlookup',
      'pivot tables',
    ],
    under: ['data-analysis'],
  }),
  tool('google-sheets', 'Google Sheets', { aka: ['google sheets'], under: ['data-analysis'] }),
  tool('tableau', 'Tableau', {
    aka: ['tableau'],
    under: ['data-visualization', 'business-intelligence'],
  }),
  tool('power-bi', 'Power BI', {
    aka: ['power bi', 'powerbi', 'dax'],
    under: ['data-visualization', 'business-intelligence'],
  }),
  tool('looker', 'Looker', {
    aka: ['looker', 'looker studio', 'data studio', 'metabase', 'superset', 'mode analytics'],
    under: ['data-visualization', 'business-intelligence'],
  }),
  tool('tensorflow', 'TensorFlow', {
    aka: ['tensorflow', 'keras'],
    under: ['deep-learning', 'python'],
  }),
  tool('pytorch', 'PyTorch', { aka: ['pytorch', 'torch'], under: ['deep-learning', 'python'] }),
  tool('scikit-learn', 'scikit-learn', {
    aka: ['scikit learn', 'sklearn'],
    under: ['machine-learning', 'python'],
  }),
  tool('hugging-face', 'Hugging Face', {
    aka: ['hugging face', 'huggingface'],
    under: ['natural-language-processing', 'generative-ai'],
  }),
  tool('langchain', 'LangChain', {
    aka: [
      'langchain',
      'llamaindex',
      'rag',
      'retrieval augmented generation',
      'vector databases',
      'vector database',
      'pinecone',
    ],
    under: ['generative-ai'],
  }),
  tool('openai-api', 'OpenAI API', {
    aka: ['openai', 'openai api', 'gpt', 'chatgpt', 'anthropic api'],
    under: ['generative-ai'],
  }),

  // Testing tools
  tool('jest', 'Jest', {
    aka: ['jest', 'vitest', 'mocha', 'jasmine'],
    under: ['unit-testing', 'javascript'],
  }),
  tool('pytest', 'pytest', { aka: ['pytest', 'unittest'], under: ['unit-testing', 'python'] }),
  tool('junit', 'JUnit', { aka: ['junit', 'testng', 'mockito'], under: ['unit-testing', 'java'] }),
  tool('selenium', 'Selenium', { aka: ['selenium', 'webdriver'], under: ['end-to-end-testing'] }),
  tool('cypress', 'Cypress', { aka: ['cypress'], under: ['end-to-end-testing'] }),
  tool('playwright', 'Playwright', {
    aka: ['playwright', 'puppeteer'],
    under: ['end-to-end-testing'],
  }),
  tool('oauth', 'OAuth', {
    aka: ['oauth', 'oauth2', 'openid connect', 'oidc', 'jwt', 'saml'],
    under: ['identity-and-access'],
  }),

  // Product, design, and ways of working
  practice('agile', 'Agile', { aka: ['agile', 'agile methodologies', 'agile development'] }),
  practice('scrum', 'Scrum', {
    aka: ['scrum', 'sprint planning', 'scrum master'],
    under: ['agile'],
  }),
  practice('kanban', 'Kanban', { aka: ['kanban'], under: ['agile'] }),
  tool('jira', 'Jira', { aka: ['jira'], under: ['project-management-tools'] }),
  tool('confluence', 'Confluence', { aka: ['confluence'], under: ['project-management-tools'] }),
  tool('asana', 'Asana', { aka: ['asana'], under: ['project-management-tools'] }),
  tool('trello', 'Trello', { aka: ['trello'], under: ['project-management-tools'] }),
  practice('project-management-tools', 'Project management tools', {
    aka: ['project management tools', 'project tracking tools'],
    under: ['project-management'],
  }),
  practice('project-management', 'Project management', {
    aka: ['project management', 'program management', 'pmp', 'project planning'],
  }),
  practice('product-management', 'Product management', {
    aka: [
      'product management',
      'product strategy',
      'product roadmap',
      'roadmapping',
      'product discovery',
    ],
  }),
  practice('stakeholder-management', 'Stakeholder management', {
    aka: ['stakeholder management', 'stakeholder communication', 'cross functional collaboration'],
  }),
  practice('user-research', 'User research', {
    aka: ['user research', 'ux research', 'usability testing', 'user interviews'],
    under: ['ux-design'],
  }),
  practice('ux-design', 'UX design', {
    aka: ['ux', 'ux design', 'user experience', 'user experience design', 'interaction design'],
  }),
  practice('ui-design', 'UI design', {
    aka: ['ui', 'ui design', 'user interface design', 'visual design'],
    under: ['ux-design'],
  }),
  practice('design-systems', 'Design systems', {
    aka: ['design system', 'design systems', 'component libraries', 'component library'],
    under: ['ui-design'],
  }),
  practice('prototyping', 'Prototyping', {
    aka: ['prototyping', 'wireframing', 'wireframes', 'mockups'],
    under: ['ux-design'],
  }),
  tool('figma', 'Figma', { aka: ['figma', 'figjam'], under: ['ui-design'] }),
  tool('sketch', 'Sketch', { strict: ['Sketch'], aka: ['sketch app'], under: ['ui-design'] }),
  tool('adobe-creative-suite', 'Adobe Creative Suite', {
    aka: [
      'adobe creative suite',
      'adobe creative cloud',
      'photoshop',
      'illustrator',
      'indesign',
      'adobe xd',
      'after effects',
      'premiere pro',
    ],
    under: ['ui-design'],
  }),

  // Marketing and sales
  practice('digital-marketing', 'Digital marketing', {
    aka: ['digital marketing', 'online marketing', 'performance marketing'],
  }),
  practice('seo', 'SEO', {
    aka: ['seo', 'search engine optimization', 'search engine optimisation'],
    under: ['digital-marketing'],
  }),
  practice('sem', 'Paid search', {
    aka: [
      'sem',
      'ppc',
      'paid search',
      'search engine marketing',
      'google ads',
      'adwords',
      'paid media',
      'paid social',
    ],
    under: ['digital-marketing'],
  }),
  practice('content-marketing', 'Content marketing', {
    aka: ['content marketing', 'content strategy', 'copywriting'],
    under: ['digital-marketing'],
  }),
  practice('email-marketing', 'Email marketing', {
    aka: ['email marketing', 'email campaigns', 'lifecycle marketing', 'crm marketing'],
    under: ['digital-marketing'],
  }),
  practice('social-media-marketing', 'Social media marketing', {
    aka: ['social media', 'social media marketing', 'community management'],
    under: ['digital-marketing'],
  }),
  practice('growth-marketing', 'Growth marketing', {
    aka: ['growth marketing', 'user acquisition', 'demand generation'],
    under: ['digital-marketing'],
  }),
  practice('marketing-analytics', 'Marketing analytics', {
    aka: ['marketing analytics', 'attribution', 'campaign analytics'],
    under: ['digital-marketing', 'data-analysis'],
  }),
  tool('google-analytics', 'Google Analytics', {
    aka: ['google analytics', 'ga4', 'google tag manager', 'gtm', 'mixpanel', 'amplitude'],
    under: ['marketing-analytics'],
  }),
  tool('hubspot', 'HubSpot', {
    aka: ['hubspot', 'marketo', 'mailchimp', 'braze', 'pardot'],
    under: ['marketing-automation'],
  }),
  practice('marketing-automation', 'Marketing automation', {
    aka: ['marketing automation'],
    under: ['digital-marketing'],
  }),
  tool('salesforce', 'Salesforce', {
    aka: ['salesforce', 'sfdc', 'salesforce crm'],
    under: ['crm'],
  }),
  practice('crm', 'CRM', { aka: ['crm', 'customer relationship management'] }),
  practice('sales', 'Sales', {
    aka: ['sales', 'b2b sales', 'enterprise sales', 'quota attainment', 'pipeline management'],
  }),
  practice('business-development', 'Business development', {
    aka: ['business development', 'bizdev', 'partnerships', 'lead generation'],
    under: ['sales'],
  }),
  practice('account-management', 'Account management', {
    aka: ['account management', 'key accounts', 'client management'],
    under: ['sales'],
  }),
  practice('customer-success', 'Customer success', {
    aka: ['customer success', 'customer support', 'customer experience', 'client success'],
  }),

  // Finance and operations
  practice('financial-modeling', 'Financial modeling', {
    aka: ['financial modeling', 'financial modelling', 'dcf', 'valuation'],
    under: ['financial-analysis'],
  }),
  practice('financial-analysis', 'Financial analysis', {
    aka: ['financial analysis', 'financial reporting', 'variance analysis'],
  }),
  practice('fpa', 'FP&A', {
    aka: ['fp a', 'fpa', 'financial planning and analysis', 'budgeting', 'forecasting'],
    under: ['financial-analysis'],
  }),
  practice('accounting', 'Accounting', {
    aka: [
      'accounting',
      'bookkeeping',
      'gaap',
      'ifrs',
      'accounts payable',
      'accounts receivable',
      'reconciliation',
    ],
  }),
  tool('quickbooks', 'QuickBooks', {
    aka: ['quickbooks', 'xero', 'netsuite'],
    under: ['accounting'],
  }),
  tool('sap', 'SAP', { aka: ['sap', 'sap erp', 'erp', 'oracle erp'] }),
  practice('supply-chain', 'Supply chain', {
    aka: ['supply chain', 'logistics', 'procurement', 'inventory management'],
  }),
  practice('operations-management', 'Operations', {
    aka: [
      'operations management',
      'business operations',
      'process improvement',
      'lean six sigma',
      'six sigma',
    ],
  }),

  // Domains
  domain('fintech', 'Fintech', {
    aka: ['fintech', 'financial services', 'financial technology', 'banking'],
  }),
  domain('payments', 'Payments', {
    aka: ['payments', 'payment processing', 'payment systems', 'payment infrastructure', 'billing'],
    under: ['fintech'],
  }),
  domain('healthcare', 'Healthcare', {
    aka: ['healthcare', 'health care', 'healthtech', 'health tech', 'clinical', 'hipaa'],
  }),
  domain('ecommerce', 'E-commerce', {
    aka: ['e commerce', 'ecommerce', 'online retail', 'marketplace', 'marketplaces'],
  }),
  domain('saas', 'SaaS', { aka: ['saas', 'b2b saas', 'software as a service'] }),
  domain('edtech', 'Edtech', { aka: ['edtech', 'education technology', 'e learning'] }),
  domain('adtech', 'Adtech', {
    aka: ['adtech', 'ad tech', 'advertising technology', 'programmatic advertising'],
  }),
  domain('gaming', 'Gaming', { aka: ['gaming', 'game development', 'unity', 'unreal engine'] }),
  domain('insurance', 'Insurance', { aka: ['insurance', 'insurtech'] }),
];
