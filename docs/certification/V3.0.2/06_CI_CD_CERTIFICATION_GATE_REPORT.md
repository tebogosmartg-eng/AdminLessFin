# 6. CI/CD Certification Gate Report

**Workflow:** `.github/workflows/statutory-certification.yml`

## Gate Steps

1. `npm ci`
2. `npm run build` (TypeScript)
3. `npm run lint`
4. `npm run certify:statutory` (verification + certification + historical + benchmark)

## Failure Conditions

Deployment fails if any statutory calculation differs from certified expected value or benchmark is unstable.

## Local Command

```bash
npm run certify:statutory
```

**Status:** IMPLEMENTED
