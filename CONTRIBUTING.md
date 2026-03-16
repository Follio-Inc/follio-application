# Contributing to Follio

Thank you for your interest in contributing to Follio! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Git Workflow](#git-workflow)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Code Style](#code-style)

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build something great together.

## Git Workflow

We follow a **Git Flow** branching strategy:

```
main (production)
  │
  └── develop (integration)
        │
        ├── feature/xxx (new features)
        ├── bugfix/xxx (bug fixes)
        ├── hotfix/xxx (urgent production fixes)
        └── release/x.x.x (release preparation)
```

### Branch Descriptions

| Branch      | Purpose                 | Base Branch | Merges Into        |
| ----------- | ----------------------- | ----------- | ------------------ |
| `main`      | Production-ready code   | -           | -                  |
| `develop`   | Integration branch      | `main`      | `main`             |
| `feature/*` | New features            | `develop`   | `develop`          |
| `bugfix/*`  | Bug fixes               | `develop`   | `develop`          |
| `hotfix/*`  | Urgent production fixes | `main`      | `main` & `develop` |
| `release/*` | Release preparation     | `develop`   | `main` & `develop` |

### Workflow Steps

1. **Start new work**: Create a branch from `develop`

   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. **Make changes**: Commit your work with meaningful messages

3. **Stay updated**: Regularly rebase with develop

   ```bash
   git fetch origin
   git rebase origin/develop
   ```

4. **Push and create PR**: Push your branch and open a PR to `develop`

   ```bash
   git push -u origin feature/your-feature-name
   ```

5. **Review and merge**: After approval, squash and merge

## Branch Naming

Use descriptive, kebab-case names:

```
feature/add-user-authentication
feature/implement-pdf-export
bugfix/fix-login-redirect
bugfix/resolve-mobile-layout
hotfix/critical-security-patch
release/1.2.0
```

### Prefixes

| Prefix      | Use Case                  |
| ----------- | ------------------------- |
| `feature/`  | New functionality         |
| `bugfix/`   | Bug fixes for develop     |
| `hotfix/`   | Critical production fixes |
| `release/`  | Release preparation       |
| `docs/`     | Documentation only        |
| `refactor/` | Code refactoring          |
| `test/`     | Test additions/changes    |
| `chore/`    | Maintenance tasks         |

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | New feature                                             |
| `fix`      | Bug fix                                                 |
| `docs`     | Documentation changes                                   |
| `style`    | Formatting, missing semicolons, etc.                    |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or updating tests                                |
| `chore`    | Maintenance tasks                                       |
| `ci`       | CI/CD changes                                           |
| `build`    | Build system changes                                    |

### Examples

```bash
feat(auth): add social login with GitHub
fix(export): resolve PDF generation timeout
docs(readme): update installation instructions
refactor(api): simplify profile route handlers
test(merge): add tests for conflict resolution
```

## Pull Request Process

1. **Create a PR** from your feature branch to `develop`
2. **Fill out the template** completely
3. **Ensure all checks pass**:
   - Linting
   - Type checking
   - Tests
   - Build
4. **Request review** from maintainers
5. **Address feedback** and update your PR
6. **Squash and merge** once approved

### PR Title Format

Follow the same format as commit messages:

```
feat(component): add new feature description
```

### PR Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No commented-out code
- [ ] TypeScript types are correct
- [ ] Mobile responsive (if UI changes)

## Development Setup

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/follio-app.git
   cd follio-app
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. **Set up the database**

   ```bash
   npm run db:generate
   npm run db:push
   npm run db:seed
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage
npm run test:run -- --coverage

# Run specific test file
npm run test -- merge.service.test.ts

# Run tests in watch mode
npm run test
```

### Writing Tests

- Place tests in `__tests__/` directory or co-locate with source files as `*.test.ts`
- Use descriptive test names
- Follow the Arrange-Act-Assert pattern
- Mock external dependencies

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('FeatureName', () => {
  it('should do something specific', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = someFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

## Code Style

### General

- Use TypeScript for all new code
- Use functional components with hooks for React
- Prefer named exports over default exports
- Use meaningful variable and function names

### Formatting

We use Prettier for code formatting:

```bash
npm run format
```

### Linting

We use ESLint for code quality:

```bash
npm run lint
```

### File Organization

```
app/                  # Next.js app router pages
components/           # Reusable React components
  ui/                # Shadcn UI components
lib/                 # Utility functions
services/            # Business logic
types/               # TypeScript types
__tests__/           # Test files
```

## Questions?

If you have questions, feel free to:

- Open a GitHub issue
- Start a discussion
- Reach out to maintainers

Thank you for contributing! 🎉
