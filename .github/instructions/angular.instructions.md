---
applyTo: "frontend/src/**/*.ts,frontend/src/**/*.html,frontend/src/**/*.scss"
---

# Angular Guidelines

- Use functional components with signals when possible
- Inject services via `inject()` function, not constructor injection
- Use strict TypeScript — no `any`, no implicit returns
- Shared components in `shared/components/`, services in `core/`
- Feature modules lazy loaded in `features/`
- Check `shared/components/` before creating new UI elements
- Every new component must have a Storybook story
