# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- DevOps infrastructure setup
  - GitHub Actions CI/CD pipeline
  - PR and issue templates
  - Contributing guidelines
  - Logging system
  - Error handling utilities

### Changed

- None

### Deprecated

- None

### Removed

- None

### Fixed

- None

### Security

- None

---

## [0.1.0] - 2024-12-20

### Added

- Initial release
- Profile management with multiple views (Resume, Portfolio, Timeline, Recruiter)
- GitHub import integration
- Resume parsing and import
- Smart merge with conflict resolution
- Export functionality (JSON, Text, PDF)
- User authentication with Clerk
- PostgreSQL database with Prisma ORM

---

## Version History

| Version | Date       | Description     |
| ------- | ---------- | --------------- |
| 0.1.0   | 2024-12-20 | Initial release |

---

## Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backward compatible manner
- **PATCH** version for backward compatible bug fixes

## Release Process

1. Update version in `package.json`
2. Update this CHANGELOG
3. Create PR to `main`
4. After merge, GitHub Actions creates a release automatically
