---
applyTo: "**/*.spec.ts,tests/e2e/**"
---

# Testing Guidelines

- Unit tests: arrange-act-assert pattern
- Test behavior, not implementation details
- Mock external dependencies (Supabase client)
- E2E: page object pattern for maintainability
- E2E: test happy path + main error scenarios
- Descriptive test names: "deve criar tarefa quando formulário válido"
