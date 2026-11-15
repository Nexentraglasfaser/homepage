# FiberOffice Connect

React/TypeScript frontend for https://nexentra.de/fiberoffice/.
Authentication, tenant access, records, audits and uploads remain in Supabase. No customer exports or credentials belong in this public repository. config.json contains only the public Supabase URL and publishable key; database RLS is required.

## Build

Install dependencies with pnpm install --frozen-lockfile. Build with:

```
VITE_OPERATIONS=true VITE_STATIC_HOST=true pnpm exec vite build --base=/fiberoffice/ --outDir=../fiberoffice
```

Retain ../fiberoffice/config.json. Publish through the existing homepage GitHub Pages deployment. The homepage link points to /fiberoffice/. Source tests are maintained with the local FiberOffice project.
